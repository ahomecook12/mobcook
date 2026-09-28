import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { CURRENCY_SYMBOL, STORE, STORE_LOCALE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number | string;
  shipping_cost: number | string;
  total: number | string;
  shipping_name: string;
  shipping_city: string | null;
  created_at: string;
};

type FilterKey =
  | "all"
  | "pending_payment"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

type Filter = {
  key: FilterKey;
  label: string;
};

const FILTERS: Filter[] = [
  { key: "all", label: "All orders" },
  { key: "pending_payment", label: "Pending payment" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export default function AdminOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedFilter, setSelectedFilter] =
    useState<FilterKey>("all");

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, []),
  );

  async function loadOrders() {
    try {
      setErrorMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // -------------------------------------------------------
      // Check admin role
      // -------------------------------------------------------

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (profile?.role !== "admin") {
        router.replace("/");
        return;
      }

      setIsAdmin(true);

      // -------------------------------------------------------
      // Load orders
      // -------------------------------------------------------

      const { data, error } = await supabase
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
            shipping_name,
            shipping_city,
            created_at
          `,
        )
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setOrders((data ?? []) as Order[]);
    } catch (error) {
      console.log("Unable to load admin orders:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load orders.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadOrders();
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(STORE_LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatPaymentMethod(method: string) {
    return method === "twint" ? "TWINT" : "Bank Transfer";
  }

  function formatTotal(total: number | string) {
    return `${CURRENCY_SYMBOL} ${Number(total).toFixed(2)}`;
  }

  // ---------------------------------------------------------
  // FILTER COUNTS
  // ---------------------------------------------------------

  const counts = {
    all: orders.length,

    pending_payment: orders.filter(
      (order) => order.payment_status === "pending",
    ).length,

    processing: orders.filter(
      (order) => order.status === "processing",
    ).length,

    shipped: orders.filter(
      (order) => order.status === "shipped",
    ).length,

    delivered: orders.filter(
      (order) => order.status === "delivered",
    ).length,

    cancelled: orders.filter(
      (order) => order.status === "cancelled",
    ).length,
  };

  // ---------------------------------------------------------
  // FILTERED ORDERS
  // ---------------------------------------------------------

  const filteredOrders = orders.filter((order) => {
    switch (selectedFilter) {
      case "pending_payment":
        return order.payment_status === "pending";

      case "processing":
        return order.status === "processing";

      case "shipped":
        return order.status === "shipped";

      case "delivered":
        return order.status === "delivered";

      case "cancelled":
        return order.status === "cancelled";

      case "all":
      default:
        return true;
    }
  });

  function getFilterCount(key: FilterKey) {
    return counts[key];
  }

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={["bottom"]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />

          <Text style={styles.loadingText}>
            Loading orders...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* =====================================================
            HEADER
           ===================================================== */}

        <View style={styles.header}>
          <Text style={styles.title}>Admin Orders</Text>

          <Text style={styles.subtitle}>
            Manage customer orders and payments.
          </Text>
        </View>

        {/* =====================================================
            ORDER FILTERS
           ===================================================== */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {FILTERS.map((filter) => {
            const selected =
              selectedFilter === filter.key;

            return (
              <Pressable
                key={filter.key}
                onPress={() =>
                  setSelectedFilter(filter.key)
                }
                style={[
                  styles.filterPill,
                  selected && styles.filterPillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    selected && styles.filterLabelSelected,
                  ]}
                >
                  {filter.label}
                </Text>

                <View
                  style={[
                    styles.filterCount,
                    selected &&
                      styles.filterCountSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      selected &&
                        styles.filterCountTextSelected,
                    ]}
                  >
                    {getFilterCount(filter.key)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* =====================================================
            ERROR
           ===================================================== */}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Unable to load orders
            </Text>

            <Text style={styles.errorText}>
              {errorMessage}
            </Text>

            <Pressable
              onPress={loadOrders}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* =====================================================
            FILTERED ORDER COUNT
           ===================================================== */}

        {!errorMessage ? (
          <Text style={styles.resultText}>
            {filteredOrders.length}{" "}
            {filteredOrders.length === 1
              ? "order"
              : "orders"}
          </Text>
        ) : null}

        {/* =====================================================
            ORDERS
           ===================================================== */}

        {!errorMessage && filteredOrders.length > 0 ? (
          <View style={styles.ordersContainer}>
            {filteredOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() =>
                  router.push({
                    pathname: "/admin/order/[id]",
                    params: { id: order.id },
                  })
                }
                style={({ pressed }) => [
                  styles.orderCard,
                  pressed && styles.orderCardPressed,
                ]}
              >
                {/* ---------------------------------------------
                    TOP ROW
                   --------------------------------------------- */}

                <View style={styles.topRow}>
                  <View style={styles.orderNumberContainer}>
                    <Text style={styles.orderNumber}>
                      {order.order_number}
                    </Text>

                    <Text style={styles.customerName}>
                      {order.shipping_name}
                      {order.shipping_city
                        ? ` · ${order.shipping_city}`
                        : ""}
                    </Text>
                  </View>

                  <Text style={styles.total}>
                    {formatTotal(order.total)}
                  </Text>
                </View>

                {/* ---------------------------------------------
                    DATE
                   --------------------------------------------- */}

                <Text style={styles.date}>
                  {formatDate(order.created_at)}
                </Text>

                {/* ---------------------------------------------
                    STATUS ROW
                   --------------------------------------------- */}

                <View style={styles.badgesRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {order.status}
                    </Text>
                  </View>

                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {formatPaymentMethod(
                        order.payment_method,
                      )}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      order.payment_status === "paid" &&
                        styles.paidBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        order.payment_status === "paid" &&
                          styles.paidBadgeText,
                      ]}
                    >
                      {order.payment_status}
                    </Text>
                  </View>
                </View>

                {/* ---------------------------------------------
                    VIEW ORDER
                   --------------------------------------------- */}

                <View style={styles.viewOrderRow}>
                  <Text style={styles.viewOrder}>
                    View order
                  </Text>

                  <Text style={styles.arrow}>→</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : !errorMessage ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              No{" "}
              {selectedFilter === "all"
                ? ""
                : FILTERS.find(
                    (filter) =>
                      filter.key === selectedFilter,
                  )?.label.toLowerCase() + " "}
              orders
            </Text>

            <Text style={styles.emptyText}>
              There are no orders in this category.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
   ========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  container: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6f6c66",
  },

  header: {
    marginBottom: 16,
  },

  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#292824",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#77736c",
  },

  /* =======================================================
     FILTER PILLS
     ======================================================= */

  filtersContainer: {
    paddingVertical: 4,
    paddingRight: 20,
    gap: 8,
  },

  filterPill: {
    minHeight: 40,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf8",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  filterPillSelected: {
    backgroundColor: "#292824",
    borderColor: "#292824",
  },

  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5f5b54",
  },

  filterLabelSelected: {
    color: "#ffffff",
  },

  filterCount: {
    minWidth: 23,
    height: 23,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#eeeae2",
    alignItems: "center",
    justifyContent: "center",
  },

  filterCountSelected: {
    backgroundColor: "#ffffff",
  },

  filterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#625e57",
  },

  filterCountTextSelected: {
    color: "#292824",
  },

  resultText: {
    marginTop: 17,
    marginBottom: 12,
    fontSize: 12,
    color: "#8a867e",
  },

  /* =======================================================
     ORDERS
     ======================================================= */

  ordersContainer: {
    gap: 14,
  },

  orderCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf8",
    padding: 17,
  },

  orderCardPressed: {
    opacity: 0.75,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  orderNumberContainer: {
    flex: 1,
  },

  orderNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#292824",
  },

  customerName: {
    marginTop: 5,
    fontSize: 13,
    color: "#77736c",
  },

  total: {
    fontSize: 15,
    fontWeight: "700",
    color: "#292824",
  },

  date: {
    marginTop: 7,
    fontSize: 11,
    color: "#8a867e",
  },

  badgesRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#eeeae2",
  },

  badgeText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#55514a",
  },

  paidBadge: {
    backgroundColor: "#e7eee5",
  },

  paidBadgeText: {
    color: "#456044",
  },

  viewOrderRow: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#e7e3dc",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 5,
  },

  viewOrder: {
    fontSize: 12,
    fontWeight: "600",
    color: "#75613d",
  },

  arrow: {
    fontSize: 15,
    color: "#75613d",
  },

  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d0ccc4",
    borderRadius: 18,
    padding: 35,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#292824",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    color: "#77736c",
    textAlign: "center",
  },

  /* =======================================================
     ERROR
     ======================================================= */

  errorBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d9b9b5",
    backgroundColor: "#fff7f6",
    padding: 18,
    marginTop: 14,
    marginBottom: 14,
  },

  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#8c3029",
  },

  errorText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#7a5551",
  },

  retryButton: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#292824",
  },

  retryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
});