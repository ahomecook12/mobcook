import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CURRENCY_SYMBOL, STORE, STORE_LOCALE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  created_at: string;
};

export default function OrdersScreen() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogMode, setCatalogMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, []),
  );

  async function loadOrders() {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: siteSettings, error: siteSettingsError } = await supabase
        .from("site_settings")
        .select("catalog_mode")
        .eq("id", true)
        .maybeSingle();

      if (siteSettingsError) {
        throw siteSettingsError;
      }

      setCatalogMode(siteSettings?.catalog_mode === true);

      const { data, error: ordersError } = await supabase
        .from("orders")
        .select(
          `
            id,
            order_number,
            status,
            payment_method,
            payment_status,
            subtotal,
            shipping_cost,
            total,
            created_at
          `,
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (ordersError) {
        throw ordersError;
      }

      const formattedOrders: Order[] = (data ?? []).map((order) => ({
        ...order,
        subtotal: Number(order.subtotal ?? 0),
        shipping_cost: Number(order.shipping_cost ?? 0),
        total: Number(order.total ?? 0),
      }));

      setOrders(formattedOrders);
    } catch (err) {
      console.error("❌ Load orders error:", err);

      setError("Unable to load your orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString(STORE_LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function paymentLabel(method: string) {
    return method === "twint" ? "TWINT" : "Bank Transfer";
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>Loading your orders...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* Header */}

        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Text style={styles.title}>My Orders</Text>

          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.subtitle}>
          View your order history and order details.
        </Text>

        {/* Error */}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>

            <Pressable style={styles.retryButton} onPress={loadOrders}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* No orders */}

        {!error && orders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🛍️</Text>

            <Text style={styles.emptyTitle}>No orders yet</Text>

            <Text style={styles.emptyText}>
              You haven't placed any orders yet.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace("/explore")}
            >
              <Text style={styles.primaryButtonText}>Start shopping</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Orders */}

        <View style={styles.orderList}>
          {orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderTop}>
                <View style={styles.orderHeaderInfo}>
                  <Text style={styles.orderNumber}>{order.order_number}</Text>

                  <Text style={styles.date}>
                    {formatDate(order.created_at)}
                  </Text>
                </View>

                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{order.status}</Text>
                </View>
              </View>

              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {paymentLabel(order.payment_method)}
                  </Text>
                </View>

                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{order.payment_status}</Text>
                </View>
              </View>

              <View style={styles.orderBottom}>
                <View>
                   {!catalogMode && (
      <>
        <Text style={styles.totalLabel}>Total</Text>

        <Text style={styles.total}>
          {CURRENCY_SYMBOL} {order.total.toFixed(2)}
        </Text>
      </>
    )}
                </View>

                <Pressable
                  style={styles.viewButton}
                  onPress={() => router.push(`./orders/${order.id}`)}
                >
                  <Text style={styles.viewButtonText}>View order</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: STORE.colors.background,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#777",
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 50,
  },

  headerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },

  title: {
    fontSize: 25,
    fontWeight: "700",
    color: "#222",
  },

  headerSpacer: {
    width: 45,
  },

  subtitle: {
    marginTop: 4,
    marginBottom: 22,
    fontSize: 13,
    lineHeight: 19,
    color: "#777",
    textAlign: "center",
  },

  orderList: {
    gap: 12,
  },

  orderCard: {
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 14,
    padding: 15,
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  orderTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  orderHeaderInfo: {
    flex: 1,
  },

  orderNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
  },

  date: {
    marginTop: 4,
    fontSize: 12,
    color: "#777",
  },

  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#eee",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#555",
  },

  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 14,
  },

  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#eee",
  },

  badgeText: {
    fontSize: 10,
    color: "#555",
  },

  orderBottom: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#e4e0d9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  totalLabel: {
    fontSize: 11,
    color: "#777",
  },

  total: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
    color: "#222",
  },

  viewButton: {
    borderWidth: 1,
    borderColor: "#d0cbc2",
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  viewButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#222",
  },

  emptyCard: {
    marginTop: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 14,
    padding: 30,
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  emptyIcon: {
    fontSize: 42,
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 21,
    fontWeight: "700",
    color: "#222",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    color: "#777",
    textAlign: "center",
  },

  primaryButton: {
    marginTop: 20,
    borderRadius: 11,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#111",
  },

  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },

  errorCard: {
    borderWidth: 1,
    borderColor: "#e3c7c4",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff6f5",
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#9b3028",
  },

  retryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111",
  },

  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
