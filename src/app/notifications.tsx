import { notifyNotificationsChanged, supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import AddToCalendarDialog from "@/components/notifications/AddToCalendarDialog";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { STORE_LOCALE } from "@/constants/store";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  order_id: string | null;
  product_id: string | null;
  read_at: string | null;
  created_at: string;
};

type OrderInfo = {
  id: string;
  order_number: string;
  created_at: string;
  preferred_fulfillment_at: string | null;
};

export default function NotificationsScreen() {

  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, OrderInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setNotifications([]);
        setOrdersById({});
        return;
      }

      /* =====================================================
         LOAD NOTIFICATIONS
      ===================================================== */

      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, type, title, message, order_id, product_id, read_at, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        })
        .limit(50);

      if (error) {
        console.error("Unable to load notifications:", error.message);

        return;
      }

      const loadedNotifications = data ?? [];

      setNotifications(loadedNotifications);

      /* =====================================================
         LOAD ORDERS NEEDED BY ADMIN NOTIFICATIONS

         IMPORTANT:

         Previously this loaded order information only for:

           admin_order_placed

         We now load it for every admin order notification
         that contains an order_id.

         This allows customer order-change notifications to
         offer the same Add to Calendar action.
      ===================================================== */

      const orderIds = Array.from(
        new Set(
          loadedNotifications
            .filter(
              (notification) =>
                notification.type.startsWith("admin_") && notification.order_id,
            )
            .map((notification) => notification.order_id as string),
        ),
      );

      if (orderIds.length > 0) {
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select(
            `
              id,
              order_number,
              created_at,
              preferred_fulfillment_at
            `,
          )
          .in("id", orderIds);

        if (ordersError) {
          console.error(
            "Unable to load notification orders:",
            ordersError.message,
          );
        } else {
          const orderMap: Record<string, OrderInfo> = {};

          for (const order of orders ?? []) {
            orderMap[order.id] = order;
          }

          setOrdersById(orderMap);
        }
      } else {
        setOrdersById({});
      }
    } catch (error) {
      console.error("Unable to load notifications:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /* =========================================================
     INITIAL LOAD + REALTIME
  ========================================================= */

  useEffect(() => {
    void loadNotifications();

    let cancelled = false;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        return;
      }

      const channelName = `mobile-notifications-${user.id}`;

      /*
       * Remove an existing channel with the same name first.
       */

      const existingChannel = supabase
        .getChannels()
        .find((existing) => existing.topic === `realtime:${channelName}`);

      if (existingChannel) {
        await supabase.removeChannel(existingChannel);
      }

      if (cancelled) {
        return;
      }

      channel = supabase.channel(channelName).on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;

          setNotifications((current) => {
            if (
              current.some(
                (notification) => notification.id === newNotification.id,
              )
            ) {
              return current;
            }

            return [newNotification, ...current];
          });

          /*
           * IMPORTANT:
           *
           * A realtime notification can arrive before
           * ordersById contains its order.
           *
           * Refresh notification/order metadata so the
           * calendar button appears immediately for new
           * admin order-change notifications too.
           */

          if (
            newNotification.order_id &&
            newNotification.type.startsWith("admin_")
          ) {
            void loadNotifications();
          }
        },
      );

      await channel.subscribe();
    };

    void setupRealtime();

    return () => {
      cancelled = true;

      if (channel) {
        void supabase.removeChannel(channel);

        channel = null;
      }
    };
  }, [loadNotifications]);

  /* =========================================================
     MARK ALL AS READ
  ========================================================= */

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(
      (notification) => !notification.read_at,
    );

    if (unreadNotifications.length === 0) {
      return;
    }

    setMarkingAllRead(true);

    const readAt = new Date().toISOString();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { error } = await supabase
        .from("notifications")
        .update({
          read_at: readAt,
        })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) {
        throw error;
      }

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,

          read_at: notification.read_at ?? readAt,
        })),
      );

      notifyNotificationsChanged();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);

      Alert.alert(
        "Unable to update notifications",
        "Could not mark all notifications as read.",
      );
    } finally {
      setMarkingAllRead(false);
    }
  };

  /* =========================================================
     MARK ONE AS READ
  ========================================================= */

  const markAsRead = async (notification: Notification) => {
    if (notification.read_at) {
      return;
    }

    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: readAt,
      })
      .eq("id", notification.id);

    if (error) {
      console.error("Failed to mark notification as read:", error);

      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              read_at: readAt,
            }
          : item,
      ),
    );

    notifyNotificationsChanged();
  };

  /* =========================================================
     OPEN NOTIFICATION
  ========================================================= */

  const handleNotificationPress = async (notification: Notification) => {
    await markAsRead(notification);

    if (notification.order_id) {
      if (notification.type.startsWith("admin_")) {
        router.push({
          pathname: "/admin/order/[id]",

          params: {
            id: notification.order_id,
          },
        });
      } else {
        router.push({
          pathname: "/orders/[id]",

          params: {
            id: notification.order_id,
          },
        });
      }

      return;
    }
  };

  /* =========================================================
     REFRESH
  ========================================================= */

  const onRefresh = () => {
    setRefreshing(true);

    void loadNotifications();
  };

  /* =========================================================
     DATE
  ========================================================= */

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(STORE_LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  /* =========================================================
     RENDER NOTIFICATION
  ========================================================= */

  const renderNotification = ({ item }: { item: Notification }) => {
    const unread = !item.read_at;

    const hasOrder = Boolean(item.order_id);

    /*
     * Calendar is available for ANY admin notification
     * connected to an order.
     *
     * Examples:
     *
     * admin_order_placed
     * admin_order_updated
     * future admin order notification types
     */

    const isAdminOrderNotification = item.type.startsWith("admin_");

    const calendarOrder = item.order_id ? ordersById[item.order_id] : undefined;

    return (
      <Pressable
        onPress={() => void handleNotificationPress(item)}
        style={({ pressed }) => [
          styles.notification,

          unread && styles.unreadNotification,

          pressed && styles.pressed,
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name={
              item.order_id ? "bag-handle-outline" : "notifications-outline"
            }
            size={22}
            color="#8B6B35"
          />
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, unread && styles.unreadTitle]}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            {unread && <View style={styles.unreadDot} />}
          </View>

          <Text style={styles.message}>{item.message}</Text>

          <Text style={styles.date}>{formatDate(item.created_at)}</Text>

          {hasOrder && <Text style={styles.tapHint}>Tap to view order</Text>}

          {/* ================================================
              CALENDAR

              For admin order notifications:

              1. Prefer the CURRENT fulfillment date/time.
              2. If the order has no fulfillment date,
                 fall back to order creation time.

              This means when the customer changes the
              fulfillment date, opening Add to Calendar from
              the new notification starts with that new date.
          ================================================= */}

          {isAdminOrderNotification && hasOrder && calendarOrder && (
            <AddToCalendarDialog
              orderId={calendarOrder.id}
              orderNumber={calendarOrder.order_number}
              orderCreatedAt={
                calendarOrder.preferred_fulfillment_at ??
                calendarOrder.created_at
              }
            />
          )}
        </View>
      </Pressable>
    );
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* ===================================================
          HEADER
      =================================================== */}

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Notifications</Text>

          {notifications.some((item) => !item.read_at) && (
            <Pressable
              onPress={() => void markAllAsRead()}
              disabled={markingAllRead}
              style={({ pressed }) => [
                styles.markAllButton,

                pressed && styles.pressed,

                markingAllRead && styles.disabledButton,
              ]}
            >
              {markingAllRead ? (
                <ActivityIndicator size="small" color="#8B6B35" />
              ) : (
                <Text style={styles.markAllText}>Mark all as read</Text>
              )}
            </Pressable>
          )}
        </View>

        {notifications.length > 0 && (
          <Text style={styles.headerCount}>
            {notifications.filter((item) => !item.read_at).length} unread
          </Text>
        )}
      </View>

      {/* ===================================================
          CONTENT
      =================================================== */}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8B6B35" />

          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={42} color="#999" />

          <Text style={styles.emptyTitle}>No notifications yet</Text>

          <Text style={styles.emptyText}>
            Your order updates will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8B6B35"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F0DF",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E4D8BE",
    backgroundColor: "#F7F0DF",
  },

  headerTitle: {
    fontSize: 25,
    fontWeight: "700",
    color: "#241F19",
  },

  headerCount: {
    marginTop: 4,
    fontSize: 13,
    color: "#8B6B35",
  },

  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  markAllButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B6B35",
  },

  disabledButton: {
    opacity: 0.5,
  },

  list: {
    padding: 16,
    paddingBottom: 30,
  },

  notification: {
    flexDirection: "row",
    backgroundColor: "#FFFDF8",
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E8DDC6",
  },

  unreadNotification: {
    backgroundColor: "#FFF9EA",
    borderColor: "#D9C28C",
  },

  pressed: {
    opacity: 0.7,
  },

  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFE3C8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  content: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#2B2721",
  },

  unreadTitle: {
    fontWeight: "800",
  },

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#8B6B35",
    marginTop: 5,
    marginLeft: 8,
  },

  message: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: "#665F54",
  },

  date: {
    marginTop: 7,
    fontSize: 11,
    color: "#999083",
  },

  tapHint: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: "600",
    color: "#8B6B35",
  },

  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9C28C",
    backgroundColor: "#FFF9EA",
  },

  calendarButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B6B35",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#756D60",
  },

  emptyTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: "700",
    color: "#3A342C",
  },

  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: "#81786A",
    textAlign: "center",
  },
});
