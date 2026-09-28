import DateTimePicker from "@react-native-community/datetimepicker";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STORE, STORE_LOCALE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

const WEB_API_URL = process.env.EXPO_PUBLIC_WEB_API_URL;

const CURRENCY_SYMBOL = "₹";

/* =========================================================
   TYPES
========================================================= */

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  weight_grams: number | null;
  size: string | null;
  height: number | null;
  width: number | null;
  depth: number | null;
};

type PaymentMethodSnapshot = {
  id?: string | null;
  method_type?: string | null;
  display_name?: string | null;
  account_name?: string | null;
  phone_number?: string | null;
  payment_url?: string | null;
  instructions?: string | null;
  qr_code_url?: string | null;
};

type PaymentMethodOption = {
  id: string;
  display_name: string;
  method_type?: string | null;
  account_name?: string | null;
  phone_number?: string | null;
  payment_url?: string | null;
  instructions?: string | null;
  qr_code_url?: string | null;
};

type OrderHistoryItem = {
  id: string;
  description?: string | null;
  created_at?: string | null;
  change_type?: string | null;
  changed_by_type?: string | null;
};

type Order = {
  id: string;
  order_number: string;

  status: string;

  payment_method: string | null;
  payment_method_id: string | null;
  payment_method_snapshot: PaymentMethodSnapshot | null;
  payment_status: string;

  subtotal: number | string;
  shipping_cost: number | string;
  total: number | string;

  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_postal_code: string;
  shipping_country: string;

  customer_note: string | null;

  preferred_fulfillment_at: string | null;

  porter_status: string;
  porter_details: string | null;

  customer_change_unread: boolean | null;
  customer_change_at: string | null;
  customer_change_summary: string | null;

  payment_verified_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;

  created_at: string;
  updated_at: string;

  order_items: OrderItem[];
};

type DeliveryStatus = "booked" | "requested";

const statusOptions = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

type OrderStatus = (typeof statusOptions)[number];

/* =========================================================
   PAGE
========================================================= */

export default function AdminOrderDetailPage() {
  const router = useRouter();

  const params = useLocalSearchParams<{ id: string }>();

  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;

  /* =======================================================
     DATA
  ======================================================= */

  const [order, setOrder] = useState<Order | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>(
    [],
  );

  const [historyItems, setHistoryItems] = useState<OrderHistoryItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* =======================================================
     ADMIN ACTION STATES
  ======================================================= */

  const [updatingPayment, setUpdatingPayment] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  /* =======================================================
     EDIT STATES
  ======================================================= */

  const [editMode, setEditMode] = useState(false);

  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState("");

  const [saveSuccess, setSaveSuccess] = useState("");

  const [shippingName, setShippingName] = useState("");

  const [shippingPhone, setShippingPhone] = useState("");

  const [shippingAddress, setShippingAddress] = useState("");

  const [shippingCity, setShippingCity] = useState("");

  const [shippingPostalCode, setShippingPostalCode] = useState("");

  const [shippingCountry, setShippingCountry] = useState("");

  const [customerNote, setCustomerNote] = useState("");

  const [preferredFulfillmentAt, setPreferredFulfillmentAt] =
    useState<Date | null>(null);

  const [showFulfillmentDatePicker, setShowFulfillmentDatePicker] =
    useState(false);

  const [showFulfillmentTimePicker, setShowFulfillmentTimePicker] =
    useState(false);

  const [deliveryStatus, setDeliveryStatus] =
    useState<DeliveryStatus>("booked");

  const [deliveryDetails, setDeliveryDetails] = useState("");

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");

  /* =======================================================
     HISTORY MODAL
  ======================================================= */

  const [historyOpen, setHistoryOpen] = useState(false);

  /* =======================================================
     LOAD
  ======================================================= */

  useFocusEffect(
    useCallback(() => {
      loadOrder();
    }, [orderId]),
  );

  async function loadOrder() {
    if (!orderId) {
      setErrorMessage("Order ID is missing.");
      setLoading(false);
      return;
    }

    try {
      setErrorMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      /* ---------------------------------------------------
         VERIFY ADMIN
      --------------------------------------------------- */

      const { data: profile, error: profileError } = await supabase
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

      /* ---------------------------------------------------
         LOAD EVERYTHING
      --------------------------------------------------- */

      const [orderResult, historyResult, paymentMethodsResult] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              `
              id,
              order_number,
              status,

              payment_method,
              payment_method_id,
              payment_method_snapshot,
              payment_status,

              subtotal,
              shipping_cost,
              total,

              shipping_name,
              shipping_phone,
              shipping_address,
              shipping_city,
              shipping_postal_code,
              shipping_country,

              customer_note,

              payment_verified_at,
              shipped_at,
              delivered_at,

              created_at,
              updated_at,

              preferred_fulfillment_at,
              porter_status,
              porter_details,

              customer_change_unread,
              customer_change_at,
              customer_change_summary,

              order_items (
                id,
                product_name,
                quantity,
                unit_price,
                total_price,
                weight_grams,
                size,
                height,
                width,
                depth
              )
            `,
            )
            .eq("id", orderId)
            .maybeSingle(),

          supabase
            .from("order_change_history")
            .select(
              `
              id,
              description,
              created_at,
              change_type,
              changed_by_type
            `,
            )
            .eq("order_id", orderId)
            .order("created_at", {
              ascending: false,
            }),

          supabase
            .from("payment_methods")
            .select(
              `
              id,
              display_name,
              method_type,
              account_name,
              phone_number,
              payment_url,
              instructions,
              qr_code_url
            `,
            )
            .eq("active", true)
            .order("display_name"),
        ]);

      if (orderResult.error) {
        throw new Error(orderResult.error.message);
      }

      if (!orderResult.data) {
        throw new Error("Order not found.");
      }

      setOrder(orderResult.data as Order);

      setHistoryItems((historyResult.data ?? []) as OrderHistoryItem[]);

      setPaymentMethods(
        (paymentMethodsResult.data ?? []) as PaymentMethodOption[],
      );
    } catch (error) {
      console.log("Unable to load admin order:", error);

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load order.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);

    await loadOrder();
  }

  /* =======================================================
     FORMATTERS
  ======================================================= */

  function formatDate(value: string | null) {
    if (!value) {
      return "Not yet";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not set";
    }

    return date.toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function formatLongDate(value: string) {
    return new Date(value).toLocaleDateString(STORE_LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatMoney(value: number | string) {
    return `${CURRENCY_SYMBOL} ${Number(value).toFixed(2)}`;
  }

  function formatFulfillmentDate(value: string | null) {
    if (!value) {
      return "Not set";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not set";
    }

    return date.toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function formatEditableDate(value: Date | null) {
    if (!value) {
      return "Not set";
    }

    return value.toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /* =======================================================
     PAYMENT DISPLAY
  ======================================================= */

  function getCurrentPaymentOption() {
    if (!order) {
      return undefined;
    }

    return paymentMethods.find(
      (method) => method.id === order.payment_method_id,
    );
  }

  function getSelectedPaymentOption() {
    return paymentMethods.find((method) => method.id === selectedPaymentMethod);
  }

  function getDisplayPayment() {
    if (!order) {
      return null;
    }

    const snapshot = order.payment_method_snapshot;

    const currentOption = getCurrentPaymentOption();

    return {
      display_name:
        snapshot?.display_name ??
        currentOption?.display_name ??
        order.payment_method ??
        "Payment method",

      method_type: snapshot?.method_type ?? currentOption?.method_type ?? null,

      account_name:
        snapshot?.account_name ?? currentOption?.account_name ?? null,

      phone_number:
        snapshot?.phone_number ?? currentOption?.phone_number ?? null,

      payment_url: snapshot?.payment_url ?? currentOption?.payment_url ?? null,

      instructions:
        snapshot?.instructions ?? currentOption?.instructions ?? null,

      qr_code_url: snapshot?.qr_code_url ?? currentOption?.qr_code_url ?? null,
    };
  }

  /* =======================================================
     EDIT MODE
  ======================================================= */

  function syncEditForm() {
    if (!order) {
      return;
    }

    setShippingName(order.shipping_name ?? "");

    setShippingPhone(order.shipping_phone ?? "");

    setShippingAddress(order.shipping_address ?? "");

    setShippingCity(order.shipping_city ?? "");

    setShippingPostalCode(order.shipping_postal_code ?? "");

    setShippingCountry(order.shipping_country ?? "");

    setCustomerNote(order.customer_note ?? "");

    if (order.preferred_fulfillment_at) {
      const date = new Date(order.preferred_fulfillment_at);

      setPreferredFulfillmentAt(Number.isNaN(date.getTime()) ? null : date);
    } else {
      setPreferredFulfillmentAt(null);
    }

    setDeliveryStatus(
      order.porter_status === "requested" ? "requested" : "booked",
    );

    setDeliveryDetails(order.porter_details ?? "");

    setSelectedPaymentMethod(
      order.payment_method_id ??
        order.payment_method_snapshot?.id ??
        paymentMethods[0]?.id ??
        "",
    );
  }

  function startEditing() {
    setSaveError("");
    setSaveSuccess("");

    syncEditForm();

    setEditMode(true);
  }

  function cancelEditing() {
    syncEditForm();

    setSaveError("");
    setSaveSuccess("");

    setShowFulfillmentDatePicker(false);

    setShowFulfillmentTimePicker(false);

    setEditMode(false);
  }

  /* =======================================================
     SAVE ADMIN EDIT
  ======================================================= */

  async function handleSave() {
    if (!order || saving) {
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      if (
        !shippingName.trim() ||
        !shippingPhone.trim() ||
        !shippingAddress.trim() ||
        !shippingCity.trim() ||
        !shippingPostalCode.trim() ||
        !shippingCountry.trim()
      ) {
        throw new Error("Please complete the shipping address.");
      }

      if (deliveryStatus === "requested" && !deliveryDetails.trim()) {
        throw new Error(
          "Please enter the delivery details when admin is booking the delivery service.",
        );
      }

      if (!selectedPaymentMethod) {
        throw new Error("Please select a payment method.");
      }

      if (!WEB_API_URL) {
        throw new Error("EXPO_PUBLIC_WEB_API_URL is not configured.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch(
        `${WEB_API_URL}/api/admin/orders/${order.id}/customer-update`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",

            Authorization: `Bearer ${session.access_token}`,
          },

          body: JSON.stringify({
            shipping_name: shippingName.trim(),

            shipping_phone: shippingPhone.trim(),

            shipping_address: shippingAddress.trim(),

            shipping_city: shippingCity.trim(),

            shipping_postal_code: shippingPostalCode.trim(),

            shipping_country: shippingCountry.trim(),

            customer_note: customerNote.trim() || null,

            preferred_fulfillment_at: preferredFulfillmentAt
              ? preferredFulfillmentAt.toISOString()
              : null,

            payment_method: selectedPaymentMethod,

            porter_status: deliveryStatus,

            porter_details: deliveryDetails.trim() || null,

            delivery_service_mode: deliveryStatus,

            notify_admin: false,

            finalize_notification: false,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to update the order.");
      }

      setSaveSuccess(result?.message ?? "Order updated successfully.");

      setEditMode(false);

      await loadOrder();
    } catch (error) {
      console.log("Failed to save admin order:", error);

      setSaveError(
        error instanceof Error ? error.message : "Unable to update the order.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     PAYMENT STATUS
  ======================================================= */

  async function updatePaymentStatus(newPaymentStatus: "pending" | "paid") {
    if (!order || updatingPayment) {
      return;
    }

    setUpdatingPayment(true);

    try {
      /*
       * Keep the existing working payment-status
       * action for now.
       *
       * This is separate from the customer/order
       * information PATCH endpoint above.
       */

      const updateData: {
        payment_status: string;
        payment_verified_at: string | null;
        status?: string;
      } = {
        payment_status: newPaymentStatus,

        payment_verified_at:
          newPaymentStatus === "paid" ? new Date().toISOString() : null,
      };

      if (newPaymentStatus === "paid" && order.status === "pending_payment") {
        updateData.status = "processing";
      }

      if (newPaymentStatus === "pending" && order.status === "processing") {
        updateData.status = "pending_payment";
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadOrder();
    } catch (error) {
      Alert.alert(
        "Payment update failed",
        error instanceof Error
          ? error.message
          : "Unable to update payment status.",
      );
    } finally {
      setUpdatingPayment(false);
    }
  }

  /* =======================================================
     ORDER STATUS
  ======================================================= */

  async function updateOrderStatus(newStatus: OrderStatus) {
    if (!order || updatingStatus) {
      return;
    }

    if (newStatus !== "cancelled" && order.payment_status !== "paid") {
      Alert.alert(
        "Payment required",
        "Verify the payment before processing this order.",
      );

      return;
    }

    setUpdatingStatus(true);

    try {
      const now = new Date().toISOString();

      const updateData: {
        status: OrderStatus;
        shipped_at: string | null;
        delivered_at: string | null;
      } = {
        status: newStatus,
        shipped_at: null,
        delivered_at: null,
      };

      if (newStatus === "shipped") {
        updateData.shipped_at = now;
      }

      if (newStatus === "delivered") {
        updateData.shipped_at = now;
        updateData.delivered_at = now;
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) {
        throw new Error(error.message);
      }

      await loadOrder();
    } catch (error) {
      Alert.alert(
        "Status update failed",
        error instanceof Error
          ? error.message
          : "Unable to update order status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />

          <Text style={styles.loadingText}>Loading order...</Text>
        </View>
      </SafeAreaView>
    );
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (errorMessage || !order) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.errorScreen}>
          <Text style={styles.errorTitle}>Unable to load order</Text>

          <Text style={styles.errorText}>
            {errorMessage ?? "Order not found."}
          </Text>

          <Pressable onPress={() => router.back()} style={styles.darkButton}>
            <Text style={styles.darkButtonText}>Back to orders</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canChangeStatus =
    order.payment_status === "paid" || order.status === "cancelled";

  const displayPayment = getDisplayPayment();

  const selectedPaymentOption = getSelectedPaymentOption();

  /* =======================================================
     UI
  ======================================================= */

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back to orders</Text>
          </Pressable>

          <Text style={styles.title}>Order {order.order_number}</Text>

          <Text style={styles.placedDate}>
            Placed on {formatLongDate(order.created_at)}
          </Text>

          <View style={styles.headerBadges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{order.status}</Text>
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>{order.payment_status}</Text>
            </View>

            {order.customer_change_unread ? (
              <View style={styles.customerUpdateBadge}>
                <Text style={styles.customerUpdateBadgeText}>
                  Customer update
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* =================================================
            CUSTOMER UPDATE
        ================================================= */}

        {order.customer_change_summary ? (
          <View style={styles.customerUpdateSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Customer order update</Text>

                {order.customer_change_at ? (
                  <Text style={styles.sectionSubtitle}>
                    {formatDate(order.customer_change_at)}
                  </Text>
                ) : null}
              </View>

              {order.customer_change_unread ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>New</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.updateSummary}>
              {order.customer_change_summary}
            </Text>
          </View>
        ) : null}

        {/* =================================================
            ORDER PROGRESS
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order progress</Text>

          <View style={styles.timelineContainer}>
            <TimelineRow
              title="Order placed"
              complete
              detail={formatDate(order.created_at)}
            />

            <TimelineRow
              title="Payment"
              complete={order.payment_status === "paid"}
              detail={
                order.payment_status === "paid"
                  ? formatDate(order.payment_verified_at)
                  : "Pending"
              }
            />

            <TimelineRow
              title="Processing"
              complete={["processing", "shipped", "delivered"].includes(
                order.status,
              )}
              detail={
                ["processing", "shipped", "delivered"].includes(order.status)
                  ? order.payment_verified_at
                    ? formatDate(order.payment_verified_at)
                    : "In progress"
                  : "Not yet"
              }
            />

            <TimelineRow
              title="Shipped"
              complete={["shipped", "delivered"].includes(order.status)}
              detail={
                order.shipped_at ? formatDate(order.shipped_at) : "Not yet"
              }
            />

            <TimelineRow
              title="Delivered"
              complete={order.status === "delivered"}
              detail={
                order.delivered_at ? formatDate(order.delivered_at) : "Not yet"
              }
              last
            />
          </View>
        </View>

        {/* =================================================
            ORDER SUMMARY
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order summary</Text>

          <InfoRow label="Subtotal" value={formatMoney(order.subtotal)} />

          <InfoRow
            label="Shipping"
            value={
              Number(order.shipping_cost) === 0
                ? "Free"
                : formatMoney(order.shipping_cost)
            }
          />

          <Text style={styles.shippingHint}>
            Shipping will not be paid if customer books the delivery service
            themselves.
          </Text>

          <View style={styles.totalDivider} />

          <InfoRow label="Total" value={formatMoney(order.total)} strong />
        </View>

        {/* =================================================
            HISTORY
        ================================================= */}

        {historyItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order history</Text>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => setHistoryOpen(true)}
            >
              <Text style={styles.secondaryButtonText}>View history</Text>
            </Pressable>
          </View>
        ) : null}

        {/* =================================================
            ADMIN ORDER CONTROLS
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order progress</Text>

          <Text style={styles.sectionSubtitle}>Admin-only order controls</Text>

          <View style={styles.controlSummary}>
            <InfoRow label="Status" value={order.status} />

            <InfoRow label="Payment" value={order.payment_status} />
          </View>

          <Text style={styles.actionLabel}>Payment</Text>

          {order.payment_status !== "paid" ? (
            <Pressable
              disabled={updatingPayment}
              onPress={() => updatePaymentStatus("paid")}
              style={[
                styles.primaryButton,

                updatingPayment && styles.disabledButton,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {updatingPayment ? "Updating..." : "Mark payment as paid"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={updatingPayment}
              onPress={() => updatePaymentStatus("pending")}
              style={[
                styles.secondaryButton,

                updatingPayment && styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {updatingPayment ? "Updating..." : "Mark payment as pending"}
              </Text>
            </Pressable>
          )}

          <Text style={[styles.actionLabel, styles.actionLabelSpacing]}>
            Order status
          </Text>

          {!canChangeStatus ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Verify the payment before processing this order.
              </Text>
            </View>
          ) : (
            <View style={styles.statusButtons}>
              {statusOptions.map((status) => {
                const active = status === order.status;

                return (
                  <Pressable
                    key={status}
                    disabled={updatingStatus || active}
                    onPress={() => updateOrderStatus(status)}
                    style={[
                      styles.statusButton,

                      active && styles.statusButtonActive,

                      (updatingStatus || active) && styles.statusButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,

                        active && styles.statusButtonTextActive,
                      ]}
                    >
                      {status}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* =================================================
            ORDER ITEMS
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order items</Text>

          <Text style={styles.sectionSubtitle}>Confirmed from checkout</Text>

          <View style={styles.itemsContainer}>
            {order.order_items?.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.item,

                  index === order.order_items.length - 1 && styles.lastItem,
                ]}
              >
                <View style={styles.itemTopRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.product_name}</Text>

                    <Text style={styles.itemPrice}>
                      {formatMoney(item.unit_price)} × {item.quantity}
                    </Text>
                  </View>

                  <Text style={styles.itemTotal}>
                    {formatMoney(item.total_price)}
                  </Text>
                </View>

                <View style={styles.itemDetails}>
                  {item.weight_grams != null ? (
                    <Text style={styles.itemDetail}>
                      Weight: {Number(item.weight_grams)} g
                    </Text>
                  ) : null}

                  {item.size ? (
                    <Text style={styles.itemDetail}>Size: {item.size}</Text>
                  ) : null}

                  {item.height != null &&
                  item.width != null &&
                  item.depth != null ? (
                    <Text style={styles.itemDetail}>
                      Dimensions: {Number(item.height)} × {Number(item.width)} ×{" "}
                      {Number(item.depth)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* =================================================
            EDIT BUTTON
        ================================================= */}

        <View style={styles.editButtonContainer}>
          {!editMode ? (
            <Pressable style={styles.primaryButton} onPress={startEditing}>
              <Text style={styles.primaryButtonText}>Edit order</Text>
            </Pressable>
          ) : (
            <View style={styles.editActionRow}>
              <Pressable
                disabled={saving}
                style={[
                  styles.secondaryButton,
                  styles.editActionButton,

                  saving && styles.disabledButton,
                ]}
                onPress={cancelEditing}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={saving}
                style={[
                  styles.primaryButton,
                  styles.editActionButton,

                  saving && styles.disabledButton,
                ]}
                onPress={handleSave}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? "Saving..." : "Save order"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {saveSuccess ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{saveSuccess}</Text>
          </View>
        ) : null}

        {saveError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{saveError}</Text>
          </View>
        ) : null}

        {/* =================================================
            SHIPPING ADDRESS
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping address</Text>

          <Text style={styles.sectionSubtitle}>
            Customer delivery information
          </Text>

          {editMode ? (
            <View style={styles.formContainer}>
              <FormField
                label="Name"
                value={shippingName}
                onChangeText={setShippingName}
                editable={!saving}
              />

              <FormField
                label="Phone"
                value={shippingPhone}
                onChangeText={setShippingPhone}
                editable={!saving}
                keyboardType="phone-pad"
              />

              <FormField
                label="Address"
                value={shippingAddress}
                onChangeText={setShippingAddress}
                editable={!saving}
              />

              <FormField
                label="City"
                value={shippingCity}
                onChangeText={setShippingCity}
                editable={!saving}
              />

              <FormField
                label="Postal code"
                value={shippingPostalCode}
                onChangeText={setShippingPostalCode}
                editable={!saving}
              />

              <FormField
                label="Country"
                value={shippingCountry}
                onChangeText={setShippingCountry}
                editable={!saving}
              />
            </View>
          ) : (
            <View style={styles.infoBlock}>
              <Text style={styles.customerName}>{order.shipping_name}</Text>

              <Text style={styles.infoText}>{order.shipping_phone}</Text>

              <Text style={styles.address}>{order.shipping_address}</Text>

              <Text style={styles.infoText}>
                {order.shipping_postal_code} {order.shipping_city}
              </Text>

              <Text style={styles.infoText}>{order.shipping_country}</Text>
            </View>
          )}
        </View>

        {/* =================================================
            DELIVERY SERVICE
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery service</Text>

          <Text style={styles.sectionSubtitle}>
            Who will arrange the delivery?
          </Text>

          {editMode ? (
            <View style={styles.formContainer}>
              <ChoiceCard
                selected={deliveryStatus === "booked"}
                title="Customer will book the delivery service"
                description="Customer arranges the delivery themselves."
                onPress={() => {
                  setDeliveryStatus("booked");

                  setDeliveryDetails("");
                }}
                disabled={saving}
              />

              <ChoiceCard
                selected={deliveryStatus === "requested"}
                title="Admin should book the delivery service"
                description="Admin will arrange the delivery. Extra charges may apply."
                onPress={() => setDeliveryStatus("requested")}
                disabled={saving}
              />

              {deliveryStatus === "requested" ? (
                <View style={styles.fieldContainer}>
                  <Text style={styles.fieldLabel}>Delivery details</Text>

                  <TextInput
                    value={deliveryDetails}
                    onChangeText={setDeliveryDetails}
                    editable={!saving}
                    multiline
                    textAlignVertical="top"
                    placeholder="Enter the delivery company, booking details, contact details, price, or other delivery information."
                    placeholderTextColor="#888"
                    style={[styles.input, styles.textArea]}
                  />

                  <Text style={styles.fieldHint}>
                    These details remain visible to both the customer and admin.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.infoBlock}>
              <InfoRow
                label="Option"
                value={
                  order.porter_status === "requested"
                    ? "Admin books"
                    : "Customer books"
                }
              />

              {order.porter_details ? (
                <View style={styles.detailsBox}>
                  <Text style={styles.infoText}>{order.porter_details}</Text>
                </View>
              ) : (
                <Text style={styles.infoMuted}>
                  {order.porter_status === "requested"
                    ? "Admin will arrange the delivery and extra charges may apply."
                    : "Customer will arrange the delivery service."}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* =================================================
            PREFERRED FULFILLMENT
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferred fulfillment</Text>

          <Text style={styles.sectionSubtitle}>
            Customer preferred date and time
          </Text>

          {editMode ? (
            <View style={styles.formContainer}>
              <Pressable
                style={styles.dateButton}
                onPress={() => setShowFulfillmentDatePicker(true)}
              >
                <Text
                  style={
                    preferredFulfillmentAt
                      ? styles.dateButtonText
                      : styles.datePlaceholder
                  }
                >
                  {preferredFulfillmentAt
                    ? formatEditableDate(preferredFulfillmentAt)
                    : "Select date and time"}
                </Text>
              </Pressable>

              {preferredFulfillmentAt ? (
                <Pressable onPress={() => setPreferredFulfillmentAt(null)}>
                  <Text style={styles.clearDateText}>Clear preferred time</Text>
                </Pressable>
              ) : null}

              {showFulfillmentDatePicker ? (
                <DateTimePicker
                  value={preferredFulfillmentAt ?? new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onValueChange={(_event, selectedDate) => {
                    if (!selectedDate) {
                      setShowFulfillmentDatePicker(false);

                      return;
                    }

                    const current = preferredFulfillmentAt ?? new Date();

                    const updated = new Date(
                      selectedDate.getFullYear(),
                      selectedDate.getMonth(),
                      selectedDate.getDate(),
                      current.getHours(),
                      current.getMinutes(),
                      0,
                      0,
                    );

                    setPreferredFulfillmentAt(updated);

                    setShowFulfillmentDatePicker(false);

                    setShowFulfillmentTimePicker(true);
                  }}
                />
              ) : null}

              {showFulfillmentTimePicker ? (
                <DateTimePicker
                  value={preferredFulfillmentAt ?? new Date()}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onValueChange={(_event, selectedTime) => {
                    setShowFulfillmentTimePicker(false);

                    if (!selectedTime) {
                      return;
                    }

                    const current = preferredFulfillmentAt ?? new Date();

                    const updated = new Date(
                      current.getFullYear(),
                      current.getMonth(),
                      current.getDate(),
                      selectedTime.getHours(),
                      selectedTime.getMinutes(),
                      0,
                      0,
                    );

                    setPreferredFulfillmentAt(updated);
                  }}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.infoBlock}>
              <Text style={styles.infoText}>
                {formatFulfillmentDate(order.preferred_fulfillment_at)}
              </Text>
            </View>
          )}
        </View>

        {/* =================================================
            PAYMENT METHOD
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment method</Text>

          <Text style={styles.sectionSubtitle}>
            Payment method selected for this order
          </Text>

          {editMode ? (
            <View style={styles.formContainer}>
              {paymentMethods.length === 0 ? (
                <Text style={styles.infoMuted}>
                  No active payment methods are currently available for
                  selection.
                </Text>
              ) : (
                paymentMethods.map((method) => (
                  <ChoiceCard
                    key={method.id}
                    selected={selectedPaymentMethod === method.id}
                    title={method.display_name}
                    description={
                      method.instructions ?? method.method_type ?? undefined
                    }
                    onPress={() => setSelectedPaymentMethod(method.id)}
                    disabled={saving}
                  />
                ))
              )}

              {selectedPaymentOption ? (
                <PaymentDetails payment={selectedPaymentOption} />
              ) : null}
            </View>
          ) : displayPayment ? (
            <PaymentDetails payment={displayPayment} />
          ) : null}
        </View>

        {/* =================================================
            CUSTOMER NOTE
        ================================================= */}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer note</Text>

          <Text style={styles.sectionSubtitle}>
            Additional information for this order
          </Text>

          {editMode ? (
            <TextInput
              value={customerNote}
              onChangeText={setCustomerNote}
              editable={!saving}
              multiline
              textAlignVertical="top"
              placeholder="Optional"
              placeholderTextColor="#888"
              style={[styles.input, styles.textArea]}
            />
          ) : (
            <Text style={order.customer_note ? styles.note : styles.infoMuted}>
              {order.customer_note ?? "No customer note."}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* ===================================================
          HISTORY MODAL
      =================================================== */}

      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Order history</Text>

                <Text style={styles.modalSubtitle}>
                  Changes made to this order by you or the customer.
                </Text>
              </View>

              <Pressable
                onPress={() => setHistoryOpen(false)}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {historyItems.length === 0 ? (
                <Text style={styles.infoMuted}>
                  No changes have been recorded for this order yet.
                </Text>
              ) : (
                historyItems.map((item) => (
                  <View key={item.id} style={styles.historyCard}>
                    <Text style={styles.historyDate}>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString(
                            STORE_LOCALE,
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        : "Unknown date"}
                    </Text>

                    <Text style={styles.historyAuthor}>
                      {item.changed_by_type === "admin" ? "Admin" : "Customer"}
                    </Text>

                    {item.description ? (
                      <Text style={styles.historyDescription}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.label, strong && styles.strongText]}>{label}</Text>

      <Text style={[styles.value, strong && styles.strongText]}>{value}</Text>
    </View>
  );
}

function TimelineRow({
  title,
  detail,
  complete,
  last = false,
}: {
  title: string;
  detail: string;
  complete: boolean;
  last?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineMarkerColumn}>
        <View
          style={[styles.timelineDot, complete && styles.timelineDotComplete]}
        />

        {!last ? (
          <View
            style={[
              styles.timelineLine,
              complete && styles.timelineLineComplete,
            ]}
          />
        ) : null}
      </View>

      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>{title}</Text>

        <Text style={styles.timelineDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  editable,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        placeholderTextColor="#888"
        style={styles.input}
      />
    </View>
  );
}

function ChoiceCard({
  selected,
  title,
  description,
  onPress,
  disabled,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choiceCard,

        selected && styles.choiceCardSelected,

        disabled && styles.disabledButton,
      ]}
    >
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>

      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>

        {description ? (
          <Text style={styles.choiceDescription}>{description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function PaymentDetails({
  payment,
}: {
  payment: {
    display_name?: string | null;
    method_type?: string | null;
    account_name?: string | null;
    phone_number?: string | null;
    payment_url?: string | null;
    instructions?: string | null;
    qr_code_url?: string | null;
  };
}) {
  return (
    <View style={styles.paymentDetails}>
      <Text style={styles.paymentName}>
        {payment.display_name ?? "Payment method"}
      </Text>

      {payment.method_type ? (
        <Text style={styles.infoMuted}>{payment.method_type}</Text>
      ) : null}

      {payment.account_name ? (
        <InfoRow label="Account name" value={payment.account_name} />
      ) : null}

      {payment.phone_number ? (
        <InfoRow label="Phone" value={payment.phone_number} />
      ) : null}

      {payment.payment_url ? (
        <InfoRow label="Payment link" value={payment.payment_url} />
      ) : null}

      {payment.instructions ? (
        <View style={styles.detailsBox}>
          <Text style={styles.infoText}>{payment.instructions}</Text>
        </View>
      ) : null}

      {payment.qr_code_url ? (
        <Image
          source={{
            uri: payment.qr_code_url,
          }}
          style={styles.qrImage}
          contentFit="contain"
        />
      ) : null}
    </View>
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
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  loadingText: {
    fontSize: 14,
    opacity: 0.65,
  },

  errorScreen: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 16,
  },

  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
  },

  errorText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.7,
  },

  header: {
    gap: 8,
    marginBottom: 4,
  },

  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },

  backText: {
    fontSize: 14,
    opacity: 0.65,
  },

  title: {
    fontSize: 28,
    fontWeight: "800",
  },

  placedDate: {
    fontSize: 14,
    opacity: 0.65,
  },

  headerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#eeeeee",
  },

  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },

  customerUpdateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#111111",
  },

  customerUpdateBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  newBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#111111",
  },

  newBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },

  section: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 16,
    padding: 16,
    backgroundColor: STORE.colors.background,
    gap: 12,
  },

  customerUpdateSection: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 16,
    padding: 16,
    backgroundColor: STORE.colors.background,
    gap: 14,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  sectionHeaderText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },

  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.6,
  },

  updateSummary: {
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.8,
  },

  infoRows: {
    gap: 8,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 4,
  },

  label: {
    flex: 1,
    fontSize: 14,
    opacity: 0.65,
  },

  value: {
    flex: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "500",
  },

  strongText: {
    fontWeight: "800",
    opacity: 1,
  },

  totalDivider: {
    height: 1,
    backgroundColor: "#e5e5e5",
    marginVertical: 4,
  },

  shippingHint: {
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.55,
  },

  controlSummary: {
    borderRadius: 12,
    backgroundColor: "#f6f6f6",
    padding: 10,
    gap: 4,
  },

  actionLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },

  actionLabelSpacing: {
    marginTop: 12,
  },

  primaryButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d5d5d5",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },

  darkButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },

  darkButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  disabledButton: {
    opacity: 0.45,
  },

  warningBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff8e1",
  },

  warningText: {
    fontSize: 13,
    lineHeight: 19,
  },

  statusButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  statusButton: {
    borderWidth: 1,
    borderColor: "#d5d5d5",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },

  statusButtonActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },

  statusButtonDisabled: {
    opacity: 0.7,
  },

  statusButtonText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },

  statusButtonTextActive: {
    color: "#ffffff",
  },

  itemsContainer: {
    gap: 0,
  },

  item: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },

  lastItem: {
    borderBottomWidth: 0,
  },

  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  itemInfo: {
    flex: 1,
  },

  itemName: {
    fontSize: 15,
    fontWeight: "700",
  },

  itemPrice: {
    marginTop: 4,
    fontSize: 13,
    opacity: 0.65,
  },

  itemTotal: {
    fontSize: 14,
    fontWeight: "700",
  },

  itemDetails: {
    marginTop: 8,
    gap: 3,
  },

  itemDetail: {
    fontSize: 12,
    opacity: 0.6,
  },

  editButtonContainer: {
    alignItems: "flex-end",
  },

  editActionRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },

  editActionButton: {
    flex: 1,
  },

  successBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#e8f5e9",
  },

  successText: {
    color: "#1b5e20",
    fontSize: 13,
    lineHeight: 19,
  },

  errorBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#ffebee",
  },

  errorBoxText: {
    color: "#b71c1c",
    fontSize: 13,
    lineHeight: 19,
  },

  infoBlock: {
    gap: 5,
  },

  customerName: {
    fontSize: 15,
    fontWeight: "700",
  },

  infoText: {
    fontSize: 14,
    lineHeight: 21,
  },

  infoMuted: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.6,
  },

  address: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },

  note: {
    fontSize: 14,
    lineHeight: 22,
  },

  detailsBox: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },

  formContainer: {
    gap: 14,
  },

  fieldContainer: {
    gap: 7,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  fieldHint: {
    fontSize: 11,
    lineHeight: 17,
    opacity: 0.55,
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d5d5d5",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: STORE.colors.background,
  },

  textArea: {
    minHeight: 110,
  },

  choiceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 14,
  },

  choiceCardSelected: {
    borderColor: "#111111",
    backgroundColor: "#f6f6f6",
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#aaaaaa",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },

  radioOuterSelected: {
    borderColor: "#111111",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#111111",
  },

  choiceText: {
    flex: 1,
  },

  choiceTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },

  choiceDescription: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.6,
  },

  dateButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d5d5d5",
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },

  dateButtonText: {
    fontSize: 14,
  },

  datePlaceholder: {
    fontSize: 14,
    opacity: 0.5,
  },

  clearDateText: {
    fontSize: 12,
    textDecorationLine: "underline",
    opacity: 0.65,
  },

  paymentDetails: {
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 14,
  },

  paymentName: {
    fontSize: 16,
    fontWeight: "700",
  },

  qrImage: {
    width: 190,
    height: 190,
    alignSelf: "center",
    marginTop: 8,
  },

  timelineContainer: {
    marginTop: 4,
  },

  timelineRow: {
    flexDirection: "row",
    minHeight: 64,
  },

  timelineMarkerColumn: {
    width: 28,
    alignItems: "center",
  },

  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#bbbbbb",
    backgroundColor: STORE.colors.background,
  },

  timelineDotComplete: {
    borderColor: "#111111",
    backgroundColor: "#111111",
  },

  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#dddddd",
  },

  timelineLineComplete: {
    backgroundColor: "#111111",
  },

  timelineContent: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 18,
  },

  timelineTitle: {
    fontSize: 14,
    fontWeight: "700",
  },

  timelineDetail: {
    marginTop: 3,
    fontSize: 12,
    opacity: 0.6,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    maxHeight: "82%",
    borderRadius: 18,
    backgroundColor: STORE.colors.background,
    padding: 18,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
  },

  modalSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.6,
  },

  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eeeeee",
  },

  modalCloseText: {
    fontSize: 16,
    fontWeight: "700",
  },

  historyCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },

  historyDate: {
    fontSize: 11,
    opacity: 0.55,
  },

  historyAuthor: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "700",
  },

  historyDescription: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
  },
});
