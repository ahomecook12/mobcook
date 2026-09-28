import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { STORE, STORE_LOCALE } from "@/constants/store";

/* =========================================================
   TYPES
   ========================================================= */

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type PaymentMethodSnapshot = {
  id?: string;
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

  payment_method: string;
  payment_method_id: string | null;
  payment_method_snapshot: PaymentMethodSnapshot | null;
  payment_status: string;

  subtotal: number;
  shipping_cost: number;
  total: number;

  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_postal_code: string;
  shipping_country: string;

  customer_note: string | null;

  preferred_fulfillment_at: string | null;

  porter_status: string | null;
  porter_details: string | null;

  created_at: string;
  updated_at: string | null;

  payment_verified_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;

  customer_change_unread: boolean | null;
  customer_change_at: string | null;
  customer_change_summary: string | null;

  order_items: OrderItem[];
};

type DeliveryMode = "booked" | "requested";

/* =========================================================
   CONSTANTS
   ========================================================= */

const EDITABLE_STATUSES = [
  "pending_payment",
  "processing",
];

const WEB_API_URL =
  process.env.EXPO_PUBLIC_WEB_API_URL;

const CURRENCY_SYMBOL = "₹";

/* =========================================================
   SCREEN
   ========================================================= */

export default function OrderDetailScreen() {
  const router = useRouter();

  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const [order, setOrder] =
    useState<Order | null>(null);

  const [catalogMode, setCatalogMode] =
    useState(false);

  const [
    paymentMethods,
    setPaymentMethods,
  ] = useState<PaymentMethodOption[]>([]);

  const [
    orderHistory,
    setOrderHistory,
  ] = useState<OrderHistoryItem[]>([]);

  const [
    historyOpen,
    setHistoryOpen,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState("");

  const [editMode, setEditMode] =
    useState(false);

  /* =========================================================
     EDIT STATES
     ========================================================= */

  const [
    shippingName,
    setShippingName,
  ] = useState("");

  const [
    shippingPhone,
    setShippingPhone,
  ] = useState("");

  const [
    shippingAddress,
    setShippingAddress,
  ] = useState("");

  const [
    shippingCity,
    setShippingCity,
  ] = useState("");

  const [
    shippingPostalCode,
    setShippingPostalCode,
  ] = useState("");

  const [
    shippingCountry,
    setShippingCountry,
  ] = useState("");

  const [
    customerNote,
    setCustomerNote,
  ] = useState("");

  const [
    deliveryMode,
    setDeliveryMode,
  ] = useState<DeliveryMode>("booked");

  const [
    deliveryDetails,
    setDeliveryDetails,
  ] = useState("");

  const [
    paymentMethodId,
    setPaymentMethodId,
  ] = useState("");

  const [
    preferredFulfillmentAt,
    setPreferredFulfillmentAt,
  ] = useState<Date | null>(null);

  const [
    showDatePicker,
    setShowDatePicker,
  ] = useState(false);

  const [
    showTimePicker,
    setShowTimePicker,
  ] = useState(false);

  /* =========================================================
     LOAD
     ========================================================= */

  useFocusEffect(
    useCallback(() => {
      if (id) {
        loadOrder();
      }
    }, [id]),
  );

  async function loadOrder() {
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
        router.replace(
          `/auth/login?redirectTo=/orders/${id}`,
        );

        return;
      }

      const [
        siteSettingsResult,
        orderResult,
        paymentMethodsResult,
        orderHistoryResult,
      ] = await Promise.all([
        supabase
          .from("site_settings")
          .select("catalog_mode")
          .eq("id", true)
          .maybeSingle(),

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

              preferred_fulfillment_at,

              porter_status,
              porter_details,

              created_at,
              updated_at,

              payment_verified_at,
              shipped_at,
              delivered_at,

              customer_change_unread,
              customer_change_at,
              customer_change_summary,

              order_items (
                id,
                product_name,
                quantity,
                unit_price,
                total_price
              )
            `,
          )
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("payment_methods")
          .select(
            `
              id,
              method_type,
              display_name,
              account_name,
              phone_number,
              payment_url,
              instructions,
              qr_code_url
            `,
          )
          .eq("enabled", true)
          .order("display_name", {
            ascending: true,
          }),

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
          .eq("order_id", id)
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (siteSettingsResult.error) {
        throw siteSettingsResult.error;
      }

      if (orderResult.error) {
        throw orderResult.error;
      }

      if (paymentMethodsResult.error) {
        throw paymentMethodsResult.error;
      }

      if (orderHistoryResult.error) {
        throw orderHistoryResult.error;
      }

      if (!orderResult.data) {
        setOrder(null);

        setError(
          "This order could not be found.",
        );

        return;
      }

      setCatalogMode(
        Boolean(
          siteSettingsResult.data
            ?.catalog_mode,
        ),
      );

      const methods =
        (paymentMethodsResult.data ??
          []) as PaymentMethodOption[];

      setPaymentMethods(methods);

      setOrderHistory(
        (orderHistoryResult.data ??
          []) as OrderHistoryItem[],
      );

      const data = orderResult.data;

      const formattedOrder: Order = {
        ...data,

        subtotal: Number(
          data.subtotal ?? 0,
        ),

        shipping_cost: Number(
          data.shipping_cost ?? 0,
        ),

        total: Number(
          data.total ?? 0,
        ),

        payment_method_snapshot:
          (data.payment_method_snapshot ??
            null) as PaymentMethodSnapshot | null,

        order_items: (
          data.order_items ?? []
        ).map((item) => ({
          ...item,

          unit_price: Number(
            item.unit_price ?? 0,
          ),

          total_price: Number(
            item.total_price ?? 0,
          ),
        })),
      };

      setOrder(formattedOrder);

      syncFormWithOrder(
        formattedOrder,
        methods,
      );
    } catch (err) {
      console.error(
        "❌ Load order detail error:",
        err,
      );

      setError(
        "Unable to load this order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     COPY ORDER INTO EDIT FORM
     ========================================================= */

  function syncFormWithOrder(
    currentOrder: Order,
    methods: PaymentMethodOption[],
  ) {
    setShippingName(
      currentOrder.shipping_name ?? "",
    );

    setShippingPhone(
      currentOrder.shipping_phone ?? "",
    );

    setShippingAddress(
      currentOrder.shipping_address ?? "",
    );

    setShippingCity(
      currentOrder.shipping_city ?? "",
    );

    setShippingPostalCode(
      currentOrder.shipping_postal_code ??
        "",
    );

    setShippingCountry(
      currentOrder.shipping_country ?? "",
    );

    setCustomerNote(
      currentOrder.customer_note ?? "",
    );

    setDeliveryMode(
      currentOrder.porter_status ===
        "requested"
        ? "requested"
        : "booked",
    );

    setDeliveryDetails(
      currentOrder.porter_details ?? "",
    );

    setPaymentMethodId(
      currentOrder.payment_method_id ??
        methods[0]?.id ??
        "",
    );

    if (
      currentOrder.preferred_fulfillment_at
    ) {
      const date = new Date(
        currentOrder.preferred_fulfillment_at,
      );

      setPreferredFulfillmentAt(
        Number.isNaN(date.getTime())
          ? null
          : date,
      );
    } else {
      setPreferredFulfillmentAt(null);
    }
  }

  /* =========================================================
     EDIT PERMISSION
     ========================================================= */

  const canEdit = useMemo(() => {
    if (!order) {
      return false;
    }

    return EDITABLE_STATUSES.includes(
      order.status,
    );
  }, [order]);

  /* =========================================================
     CHANGE CHECK
     ========================================================= */

  const hasChanges = useMemo(() => {
    if (!order) {
      return false;
    }

    const originalDeliveryMode:
      | DeliveryMode =
      order.porter_status === "requested"
        ? "requested"
        : "booked";

    const originalDate =
      order.preferred_fulfillment_at
        ? new Date(
            order.preferred_fulfillment_at,
          ).getTime()
        : null;

    const currentDate =
      preferredFulfillmentAt?.getTime() ??
      null;

    return (
      shippingName !==
        (order.shipping_name ?? "") ||
      shippingPhone !==
        (order.shipping_phone ?? "") ||
      shippingAddress !==
        (order.shipping_address ?? "") ||
      shippingCity !==
        (order.shipping_city ?? "") ||
      shippingPostalCode !==
        (order.shipping_postal_code ??
          "") ||
      shippingCountry !==
        (order.shipping_country ?? "") ||
      customerNote !==
        (order.customer_note ?? "") ||
      deliveryMode !==
        originalDeliveryMode ||
      deliveryDetails !==
        (order.porter_details ?? "") ||
      paymentMethodId !==
        (order.payment_method_id ??
          paymentMethods[0]?.id ??
          "") ||
      currentDate !== originalDate
    );
  }, [
    order,
    shippingName,
    shippingPhone,
    shippingAddress,
    shippingCity,
    shippingPostalCode,
    shippingCountry,
    customerNote,
    deliveryMode,
    deliveryDetails,
    paymentMethodId,
    preferredFulfillmentAt,
    paymentMethods,
  ]);

  /* =========================================================
     EDIT
     ========================================================= */

  function startEditing() {
    if (!order || !canEdit) {
      return;
    }

    setError(null);
    setSuccess("");
    setEditMode(true);
  }

  function cancelEditing() {
    if (!order) {
      return;
    }

    const cancel = () => {
      syncFormWithOrder(
        order,
        paymentMethods,
      );

      setEditMode(false);
      setError(null);
      setSuccess("");
    };

    if (!hasChanges) {
      cancel();
      return;
    }

    Alert.alert(
      "Discard changes?",
      "Your unsaved changes will be lost.",
      [
        {
          text: "Keep editing",
          style: "cancel",
        },
        {
          text: "Discard",
          style: "destructive",
          onPress: cancel,
        },
      ],
    );
  }

  /* =========================================================
     SAVE
     ========================================================= */

  async function saveChanges() {
    if (
      !order ||
      !canEdit ||
      saving
    ) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess("");

      if (
        !shippingName.trim() ||
        !shippingPhone.trim() ||
        !shippingAddress.trim() ||
        !shippingCity.trim() ||
        !shippingPostalCode.trim() ||
        !shippingCountry.trim()
      ) {
        throw new Error(
          "Please complete your shipping address.",
        );
      }

      if (
        deliveryMode === "booked" &&
        !deliveryDetails.trim()
      ) {
        throw new Error(
          'Please enter the delivery service details, or select "Request admin to book the delivery service".',
        );
      }

      if (!WEB_API_URL) {
        throw new Error(
          "EXPO_PUBLIC_WEB_API_URL is not configured.",
        );
      }

      const {
        data: { session },
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error(
          "Your session has expired. Please log in again.",
        );
      }

      const payload = {
        shipping_name:
          shippingName.trim(),

        shipping_phone:
          shippingPhone.trim(),

        shipping_address:
          shippingAddress.trim(),

        shipping_city:
          shippingCity.trim(),

        shipping_postal_code:
          shippingPostalCode.trim(),

        shipping_country:
          shippingCountry.trim(),

        customer_note:
          customerNote.trim() || null,

        preferred_fulfillment_at:
          preferredFulfillmentAt
            ? preferredFulfillmentAt.toISOString()
            : null,

        payment_method:
          paymentMethodId || null,

        porter_status:
          deliveryMode === "requested"
            ? "requested"
            : "booked",

        porter_details:
          deliveryDetails.trim() ||
          null,

        delivery_service_mode:
          deliveryMode,

        notify_admin: true,

        finalize_notification: true,
      };

      const response = await fetch(
        `${WEB_API_URL}/api/orders/${order.id}/customer-update`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${session.access_token}`,
          },

          body: JSON.stringify(payload),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ??
            "Unable to update your order.",
        );
      }

      setEditMode(false);

      setSuccess(
        result?.message ??
          "Your changes were sent to the admin.",
      );

      await loadOrder();
    } catch (saveError) {
      console.error(
        "❌ Save order changes error:",
        saveError,
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update your order.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     DATE HELPERS
     ========================================================= */

  function formatDate(
    date: string | null,
  ) {
    if (!date) {
      return null;
    }

    return new Date(
      date,
    ).toLocaleDateString(STORE_LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function formatDateTime(
    value: string | null,
  ) {
    if (!value) {
      return "Not set";
    }

    return new Date(
      value,
    ).toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function formatSelectedDateTime(
    value: Date | null,
  ) {
    if (!value) {
      return "Not set";
    }

    return value.toLocaleString(
      STORE_LOCALE,
      {
        dateStyle: "medium",
        timeStyle: "short",
      },
    );
  }

  function updateDate(
    selectedDate?: Date,
  ) {
    setShowDatePicker(false);

    if (!selectedDate) {
      return;
    }

    const current =
      preferredFulfillmentAt ??
      new Date();

    const next = new Date(current);

    next.setFullYear(
      selectedDate.getFullYear(),
    );

    next.setMonth(
      selectedDate.getMonth(),
    );

    next.setDate(
      selectedDate.getDate(),
    );

    setPreferredFulfillmentAt(next);
  }

  function updateTime(
    selectedTime?: Date,
  ) {
    setShowTimePicker(false);

    if (!selectedTime) {
      return;
    }

    const current =
      preferredFulfillmentAt ??
      new Date();

    const next = new Date(current);

    next.setHours(
      selectedTime.getHours(),
    );

    next.setMinutes(
      selectedTime.getMinutes(),
    );

    next.setSeconds(0);
    next.setMilliseconds(0);

    setPreferredFulfillmentAt(next);
  }

  /* =========================================================
     PAYMENT
     ========================================================= */

  const paymentSnapshot =
    order?.payment_method_snapshot ??
    null;

  const paymentName =
    paymentSnapshot?.display_name ??
    paymentMethods.find(
      (method) =>
        method.id ===
        order?.payment_method_id,
    )?.display_name ??
    order?.payment_method ??
    "Payment method";

  /* =========================================================
     LOADING / ERROR
     ========================================================= */

  if (loading && !order) {
    return (
      <SafeAreaView
        style={styles.center}
      >
        <ActivityIndicator
          size="large"
        />

        <Text
          style={styles.loadingText}
        >
          Loading order...
        </Text>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centerContent}
        >
          <Text
            style={styles.errorTitle}
          >
            Order unavailable
          </Text>

          <Text
            style={styles.errorMessage}
          >
            {error ??
              "This order could not be found."}
          </Text>

          <Pressable
            style={
              styles.primaryButton
            }
            onPress={() =>
              router.replace("/orders")
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Back to my orders
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* =========================================================
     TIMELINE
     ========================================================= */

  const timeline = [
    {
      title: "Order placed",
      date: formatDate(
        order.created_at,
      ),
      done: true,
    },
    {
      title: "Payment verified",
      date: formatDate(
        order.payment_verified_at,
      ),
      done:
        !!order.payment_verified_at,
    },
    {
      title: "Shipped",
      date: formatDate(
        order.shipped_at,
      ),
      done: !!order.shipped_at,
    },
    {
      title: "Delivered",
      date: formatDate(
        order.delivered_at,
      ),
      done: !!order.delivered_at,
    },
  ];

  /* =========================================================
     UI
     ========================================================= */

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          styles.container
        }
      >
        {/* BACK */}

        <Pressable
          onPress={() => {
            if (
              editMode &&
              hasChanges
            ) {
              Alert.alert(
                "Unsaved changes",
                "Leave without saving your changes?",
                [
                  {
                    text: "Stay",
                    style: "cancel",
                  },
                  {
                    text: "Leave",
                    style:
                      "destructive",
                    onPress: () =>
                      router.replace(
                        "/orders",
                      ),
                  },
                ],
              );

              return;
            }

            router.replace("/orders");
          }}
          hitSlop={10}
        >
          <Text style={styles.backText}>
            ← Back to my orders
          </Text>
        </Pressable>

        {/* HEADER */}

        <View style={styles.header}>
          <Text style={styles.title}>
            Order {order.order_number}
          </Text>

          <Text style={styles.date}>
            {formatDate(
              order.created_at,
            )}
          </Text>

          <View
            style={
              styles.statusBadges
            }
          >
            <View
              style={
                styles.statusBadge
              }
            >
              <Text
                style={
                  styles.statusBadgeText
                }
              >
                {order.status}
              </Text>
            </View>

            <View
              style={
                styles.statusBadge
              }
            >
              <Text
                style={
                  styles.statusBadgeText
                }
              >
                {order.payment_status}
              </Text>
            </View>
          </View>
        </View>

        {/* SUCCESS / ERROR */}

        {success ? (
          <View
            style={styles.successBox}
          >
            <Text
              style={
                styles.successText
              }
            >
              {success}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={styles.errorBox}
          >
            <Text
              style={styles.errorBoxText}
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* TIMELINE */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Order status
          </Text>

          <View style={styles.timeline}>
            {timeline.map(
              (step, index) => (
                <View
                  key={step.title}
                  style={
                    styles.timelineRow
                  }
                >
                  <View
                    style={
                      styles.timelineLeft
                    }
                  >
                    <View
                      style={[
                        styles.timelineCircle,
                        step.done &&
                          styles.timelineCircleDone,
                      ]}
                    >
                      {step.done ? (
                        <Text
                          style={
                            styles.timelineCheck
                          }
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>

                    {index <
                      timeline.length -
                        1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          timeline[
                            index + 1
                          ].done &&
                            styles.timelineLineDone,
                        ]}
                      />
                    )}
                  </View>

                  <View
                    style={
                      styles.timelineContent
                    }
                  >
                    <Text
                      style={[
                        styles.timelineTitle,
                        step.done &&
                          styles.timelineTitleDone,
                      ]}
                    >
                      {step.title}
                    </Text>

                    {step.date ? (
                      <Text
                        style={
                          styles.timelineDate
                        }
                      >
                        {step.date}
                      </Text>
                    ) : (
                      <Text
                        style={
                          styles.timelinePending
                        }
                      >
                        Pending
                      </Text>
                    )}
                  </View>
                </View>
              ),
            )}
          </View>
        </View>

        {/* SUMMARY */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Order summary
          </Text>

          {catalogMode ? (
            <Text
              style={
                styles.mutedCentered
              }
            >
              Prices confirmed directly.
            </Text>
          ) : (
            <>
              <DetailRow
                label="Subtotal"
                value={`${CURRENCY_SYMBOL} ${order.subtotal.toFixed(
                  2,
                )}`}
              />

              <DetailRow
                label="Shipping - don't pay if you book porter"
                value={
                  order.shipping_cost ===
                  0
                    ? "Free"
                    : `${CURRENCY_SYMBOL} ${order.shipping_cost.toFixed(
                        2,
                      )}`
                }
              />

              <View
                style={styles.divider}
              />

              <View
                style={styles.totalRow}
              >
                <Text
                  style={
                    styles.totalLabel
                  }
                >
                  Total
                </Text>

                <Text
                  style={
                    styles.totalValue
                  }
                >
                  {CURRENCY_SYMBOL}{" "}
                  {order.total.toFixed(2)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ORDER HISTORY */}

        <View style={styles.card}>
          <View
            style={
              styles.historyHeader
            }
          >
            <View
              style={
                styles.historyHeaderText
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Order history
              </Text>

              <Text
                style={
                  styles.subtitleNoMargin
                }
              >
                View changes made to this
                order.
              </Text>
            </View>

            <Pressable
              style={
                styles.historyButton
              }
              onPress={() =>
                setHistoryOpen(true)
              }
            >
              <Text
                style={
                  styles.historyButtonText
                }
              >
                ◷ View history
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ORDER ITEMS */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Order items
          </Text>

          <Text style={styles.subtitle}>
            Confirmed from checkout
          </Text>

          <View style={styles.items}>
            {order.order_items.map(
              (item) => (
                <View
                  key={item.id}
                  style={styles.item}
                >
                  <View
                    style={
                      styles.itemInfo
                    }
                  >
                    <Text
                      style={
                        styles.itemName
                      }
                    >
                      {item.product_name}
                    </Text>

                    <Text
                      style={
                        styles.itemQuantity
                      }
                    >
                      Quantity:{" "}
                      {item.quantity}
                    </Text>

                    {!catalogMode ? (
                      <Text
                        style={
                          styles.itemQuantity
                        }
                      >
                        {CURRENCY_SYMBOL}{" "}
                        {item.unit_price.toFixed(
                          2,
                        )}{" "}
                        × {item.quantity}
                      </Text>
                    ) : null}
                  </View>

                  {!catalogMode ? (
                    <Text
                      style={
                        styles.itemTotal
                      }
                    >
                      {CURRENCY_SYMBOL}{" "}
                      {item.total_price.toFixed(
                        2,
                      )}
                    </Text>
                  ) : null}
                </View>
              ),
            )}
          </View>
        </View>

        {/* EDIT BUTTON */}

        {!editMode && canEdit ? (
          <Pressable
            style={
              styles.primaryButton
            }
            onPress={startEditing}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              ✎ Edit order
            </Text>
          </Pressable>
        ) : null}

        {/* SHIPPING */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Shipping address
          </Text>

          <Text style={styles.subtitle}>
            Your delivery information
          </Text>

          {editMode ? (
            <>
              <Field
                label="Name"
                value={shippingName}
                onChangeText={
                  setShippingName
                }
              />

              <Field
                label="Phone"
                value={shippingPhone}
                onChangeText={
                  setShippingPhone
                }
                keyboardType="phone-pad"
              />

              <Field
                label="Address"
                value={shippingAddress}
                onChangeText={
                  setShippingAddress
                }
              />

              <Field
                label="City"
                value={shippingCity}
                onChangeText={
                  setShippingCity
                }
              />

              <Field
                label="Postal code"
                value={
                  shippingPostalCode
                }
                onChangeText={
                  setShippingPostalCode
                }
              />

              <Field
                label="Country"
                value={shippingCountry}
                onChangeText={
                  setShippingCountry
                }
              />
            </>
          ) : (
            <View style={styles.address}>
              <Text
                style={
                  styles.addressName
                }
              >
                {order.shipping_name}
              </Text>

              <Text
                style={
                  styles.addressText
                }
              >
                {order.shipping_phone}
              </Text>

              <Text
                style={
                  styles.addressText
                }
              >
                {order.shipping_address}
              </Text>

              <Text
                style={
                  styles.addressText
                }
              >
                {
                  order.shipping_postal_code
                }{" "}
                {order.shipping_city}
              </Text>

              <Text
                style={
                  styles.addressText
                }
              >
                {order.shipping_country}
              </Text>
            </View>
          )}
        </View>

        {/* DELIVERY */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Delivery service
          </Text>

          <Text style={styles.subtitle}>
            Customer request and admin
            booking
          </Text>

          {editMode ? (
            <>
              <ChoiceCard
                selected={
                  deliveryMode ===
                  "booked"
                }
                title="I will book the delivery service myself"
                description="Add the delivery details below."
                onPress={() =>
                  setDeliveryMode(
                    "booked",
                  )
                }
              />

              <ChoiceCard
                selected={
                  deliveryMode ===
                  "requested"
                }
                title="Request admin to book the delivery service"
                description="We will arrange it and extra charges may apply."
                onPress={() =>
                  setDeliveryMode(
                    "requested",
                  )
                }
              />

              <Text
                style={styles.fieldLabel}
              >
                Delivery details
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  deliveryMode ===
                    "requested" &&
                    styles.disabledInput,
                ]}
                value={deliveryDetails}
                onChangeText={
                  setDeliveryDetails
                }
                editable={
                  deliveryMode !==
                  "requested"
                }
                multiline
                placeholder="Add the delivery company, contact details, or notes"
                placeholderTextColor="#999"
                textAlignVertical="top"
              />
            </>
          ) : (
            <>
              <DetailRow
                label="Option"
                value={
                  order.porter_status ===
                  "requested"
                    ? "Admin books"
                    : "Customer books"
                }
              />

              {order.porter_details ? (
                <Text
                  style={
                    styles.detailsBox
                  }
                >
                  {order.porter_details}
                </Text>
              ) : order.porter_status ===
                "requested" ? (
                <Text
                  style={
                    styles.mutedText
                  }
                >
                  Admin will arrange the
                  delivery and extra
                  charges may apply.
                </Text>
              ) : (
                <Text
                  style={
                    styles.mutedText
                  }
                >
                  Customer books is the
                  default delivery option.
                </Text>
              )}
            </>
          )}
        </View>

        {/* PAYMENT */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Payment method
          </Text>

          <Text style={styles.subtitle}>
            Current payment method
          </Text>

          {editMode ? (
            paymentMethods.length > 0 ? (
              paymentMethods.map(
                (method) => (
                  <PaymentChoice
                    key={method.id}
                    method={method}
                    selected={
                      paymentMethodId ===
                      method.id
                    }
                    onPress={() =>
                      setPaymentMethodId(
                        method.id,
                      )
                    }
                  />
                ),
              )
            ) : (
              <Text
                style={
                  styles.mutedText
                }
              >
                No payment methods are
                currently available.
              </Text>
            )
          ) : (
            <>
              <DetailRow
                label="Method"
                value={paymentName}
              />

              {paymentSnapshot?.account_name ? (
                <DetailRow
                  label="Account"
                  value={
                    paymentSnapshot.account_name
                  }
                />
              ) : null}

              {paymentSnapshot?.phone_number ? (
                <DetailRow
                  label="Phone"
                  value={
                    paymentSnapshot.phone_number
                  }
                />
              ) : null}

              {paymentSnapshot?.instructions ? (
                <Text
                  style={
                    styles.detailsBox
                  }
                >
                  {
                    paymentSnapshot.instructions
                  }
                </Text>
              ) : null}

              {paymentSnapshot?.payment_url ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(
                      paymentSnapshot.payment_url!,
                    )
                  }
                >
                  <Text
                    style={
                      styles.linkText
                    }
                  >
                    Open payment link
                  </Text>
                </Pressable>
              ) : null}

              {paymentSnapshot?.qr_code_url ? (
                <Image
                  source={{
                    uri: paymentSnapshot.qr_code_url,
                  }}
                  style={
                    styles.paymentQr
                  }
                  resizeMode="contain"
                />
              ) : null}
            </>
          )}
        </View>

        {/* FULFILLMENT */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Fulfillment date
          </Text>

          <Text style={styles.subtitle}>
            Preferred schedule
          </Text>

          {editMode ? (
            <>
              <Text
                style={styles.fieldLabel}
              >
                Preferred fulfillment date
                & time
              </Text>

              <View
                style={
                  styles.dateButtonRow
                }
              >
                <Pressable
                  style={
                    styles.secondaryButton
                  }
                  onPress={() =>
                    setShowDatePicker(
                      true,
                    )
                  }
                >
                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Choose date
                  </Text>
                </Pressable>

                <Pressable
                  style={
                    styles.secondaryButton
                  }
                  onPress={() =>
                    setShowTimePicker(
                      true,
                    )
                  }
                >
                  <Text
                    style={
                      styles.secondaryButtonText
                    }
                  >
                    Choose time
                  </Text>
                </Pressable>
              </View>

              <Text
                style={
                  styles.selectedDate
                }
              >
                {formatSelectedDateTime(
                  preferredFulfillmentAt,
                )}
              </Text>

              {preferredFulfillmentAt ? (
                <Pressable
                  onPress={() =>
                    setPreferredFulfillmentAt(
                      null,
                    )
                  }
                >
                  <Text
                    style={
                      styles.linkText
                    }
                  >
                    Clear date
                  </Text>
                </Pressable>
              ) : null}

              {showDatePicker ? (
                <DateTimePicker
                  value={
                    preferredFulfillmentAt ??
                    new Date()
                  }
                  mode="date"
                  display={
                    Platform.OS ===
                    "ios"
                      ? "spinner"
                      : "default"
                  }
                  onValueChange={(
                    _,
                    selectedDate,
                  ) =>
                    updateDate(
                      selectedDate,
                    )
                  }
                />
              ) : null}

              {showTimePicker ? (
                <DateTimePicker
                  value={
                    preferredFulfillmentAt ??
                    new Date()
                  }
                  mode="time"
                  display={
                    Platform.OS ===
                    "ios"
                      ? "spinner"
                      : "default"
                  }
                  onValueChange={(
                    _,
                    selectedTime,
                  ) =>
                    updateTime(
                      selectedTime,
                    )
                  }
                />
              ) : null}

              <Text
                style={
                  styles.helperText
                }
              >
                Optional. Choose when you
                would preferably like your
                order to be fulfilled.
              </Text>
            </>
          ) : (
            <Text
              style={styles.mutedText}
            >
              {formatDateTime(
                order.preferred_fulfillment_at,
              )}
            </Text>
          )}
        </View>

        {/* CUSTOMER NOTE */}

        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            Customer note
          </Text>

          <Text style={styles.subtitle}>
            Any extra details for us
          </Text>

          {editMode ? (
            <TextInput
              style={[
                styles.input,
                styles.textArea,
              ]}
              value={customerNote}
              onChangeText={
                setCustomerNote
              }
              multiline
              placeholder="Anything you'd like us to know?"
              placeholderTextColor="#999"
              textAlignVertical="top"
            />
          ) : (
            <Text
              style={styles.mutedText}
            >
              {order.customer_note ||
                "No customer note yet."}
            </Text>
          )}
        </View>

        {/* EDIT ACTIONS */}

        {editMode ? (
          <View
            style={styles.editActions}
          >
            <Pressable
              style={
                styles.cancelButton
              }
              disabled={saving}
              onPress={cancelEditing}
            >
              <Text
                style={
                  styles.cancelButtonText
                }
              >
                Cancel changes
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryButton,
                styles.saveButton,
                (!hasChanges ||
                  saving) &&
                  styles.disabledButton,
              ]}
              disabled={
                !hasChanges || saving
              }
              onPress={saveChanges}
            >
              {saving ? (
                <ActivityIndicator
                  color="#fff"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Save all changes
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* BOTTOM */}

        {!editMode ? (
          <Pressable
            style={
              styles.primaryButton
            }
            onPress={() =>
              router.replace("/orders")
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Back to my orders
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* =====================================================
          ORDER HISTORY MODAL
          ===================================================== */}

      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setHistoryOpen(false)
        }
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={styles.modalContent}
          >
            <View
              style={styles.modalHeader}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Order history
                </Text>

                <Text
                  style={
                    styles.modalDescription
                  }
                >
                  Changes made to this
                  order by you or the
                  admin.
                </Text>
              </View>

              <Pressable
                style={
                  styles.modalCloseButton
                }
                onPress={() =>
                  setHistoryOpen(false)
                }
                hitSlop={10}
              >
                <Text
                  style={
                    styles.modalCloseText
                  }
                >
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.historyList
              }
            >
              {orderHistory.length ===
              0 ? (
                <View
                  style={
                    styles.emptyHistory
                  }
                >
                  <Text
                    style={
                      styles.emptyHistoryText
                    }
                  >
                    No changes have been
                    recorded for this
                    order yet.
                  </Text>
                </View>
              ) : (
                orderHistory.map(
                  (item) => {
                    const changedBy =
                      item.changed_by_type ===
                      "admin"
                        ? "Admin"
                        : "Customer";

                    return (
                      <View
                        key={item.id}
                        style={
                          styles.historyItem
                        }
                      >
                        <Text
                          style={
                            styles.historyDate
                          }
                        >
                          {item.created_at
                            ? new Date(
                                item.created_at,
                              ).toLocaleString(
                                STORE_LOCALE,
                                {
                                  day: "2-digit",
                                  month:
                                    "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute:
                                    "2-digit",
                                },
                              )
                            : "Unknown date"}
                        </Text>

                        <Text
                          style={
                            styles.historyChangedBy
                          }
                        >
                          {changedBy}
                        </Text>

                        {item.description ? (
                          <Text
                            style={
                              styles.historyDescription
                            }
                          >
                            {
                              item.description
                            }
                          </Text>
                        ) : null}
                      </View>
                    );
                  },
                )
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

function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (
    value: string,
  ) => void;
  keyboardType?:
    | "default"
    | "phone-pad"
    | "numeric"
    | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
      </Text>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#999"
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text
        style={styles.detailLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.detailValue}
      >
        {value}
      </Text>
    </View>
  );
}

function ChoiceCard({
  selected,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.choiceCard,
        selected &&
          styles.choiceCardSelected,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.radioOuter,
          selected &&
            styles.radioOuterSelected,
        ]}
      >
        {selected ? (
          <View
            style={styles.radioInner}
          />
        ) : null}
      </View>

      <View style={styles.choiceText}>
        <Text
          style={styles.choiceTitle}
        >
          {title}
        </Text>

        <Text
          style={
            styles.choiceDescription
          }
        >
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function PaymentChoice({
  method,
  selected,
  onPress,
}: {
  method: PaymentMethodOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.paymentChoice,
        selected &&
          styles.choiceCardSelected,
      ]}
      onPress={onPress}
    >
      <View style={styles.choiceTop}>
        <View
          style={[
            styles.radioOuter,
            selected &&
              styles.radioOuterSelected,
          ]}
        >
          {selected ? (
            <View
              style={styles.radioInner}
            />
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={styles.choiceTitle}
          >
            {method.display_name}
          </Text>

          {method.method_type ? (
            <Text
              style={
                styles.choiceDescription
              }
            >
              {method.method_type}
            </Text>
          ) : null}
        </View>
      </View>

      {method.account_name ? (
        <Text
          style={styles.paymentInfo}
        >
          Account:{" "}
          {method.account_name}
        </Text>
      ) : null}

      {method.phone_number ? (
        <Text
          style={styles.paymentInfo}
        >
          Phone: {method.phone_number}
        </Text>
      ) : null}

      {method.instructions ? (
        <Text
          style={styles.paymentInfo}
        >
          {method.instructions}
        </Text>
      ) : null}

      {method.payment_url ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();

            Linking.openURL(
              method.payment_url!,
            );
          }}
        >
          <Text style={styles.linkText}>
            Open payment link
          </Text>
        </Pressable>
      ) : null}

      {method.qr_code_url ? (
        <Image
          source={{
            uri: method.qr_code_url,
          }}
          style={styles.paymentQr}
          resizeMode="contain"
        />
      ) : null}
    </Pressable>
  );
}

/* =========================================================
   STYLES
   ========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor:
      STORE.colors.background,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor:
      STORE.colors.background,
  },

  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#777",
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 60,
  },

  backText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },

  header: {
    marginTop: 20,
    marginBottom: 22,
  },

  title: {
    fontSize: 25,
    fontWeight: "700",
    color: "#222",
  },

  date: {
    marginTop: 5,
    fontSize: 12,
    color: "#777",
  },

  statusBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor:
      "rgba(0,0,0,0.06)",
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#555",
  },

  card: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 14,
    padding: 15,
    backgroundColor:
      "rgba(255,255,255,0.45)",
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
  },

  subtitle: {
    marginTop: 3,
    marginBottom: 15,
    fontSize: 12,
    color: "#888",
  },

  subtitleNoMargin: {
    marginTop: 3,
    fontSize: 12,
    color: "#888",
  },

  timeline: {
    paddingTop: 8,
  },

  timelineRow: {
    flexDirection: "row",
    minHeight: 58,
  },

  timelineLeft: {
    width: 30,
    alignItems: "center",
  },

  timelineCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#bbb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  timelineCircleDone: {
    borderColor: "#bd9650",
    backgroundColor: "#bd9650",
  },

  timelineCheck: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },

  timelineLine: {
    width: 1,
    flex: 1,
    marginVertical: 3,
    backgroundColor: "#ddd",
  },

  timelineLineDone: {
    backgroundColor: "#bd9650",
  },

  timelineContent: {
    flex: 1,
    marginLeft: 10,
    paddingBottom: 15,
  },

  timelineTitle: {
    fontSize: 13,
    color: "#777",
  },

  timelineTitleDone: {
    fontWeight: "600",
    color: "#222",
  },

  timelineDate: {
    marginTop: 3,
    fontSize: 11,
    color: "#888",
  },

  timelinePending: {
    marginTop: 3,
    fontSize: 11,
    color: "#aaa",
  },

  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  historyHeaderText: {
    flex: 1,
  },

  historyButton: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#ccc5b9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },

  historyButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },

  items: {
    gap: 14,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: 10,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e0d9",
  },

  itemInfo: {
    flex: 1,
  },

  itemName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    color: "#222",
  },

  itemQuantity: {
    marginTop: 4,
    fontSize: 11,
    color: "#777",
  },

  itemTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },

  address: {
    gap: 5,
  },

  addressName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },

  addressText: {
    fontSize: 13,
    color: "#555",
  },

  field: {
    marginBottom: 14,
  },

  fieldLabel: {
    marginBottom: 7,
    fontSize: 12,
    fontWeight: "600",
    color: "#444",
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d6d0c6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#222",
    backgroundColor: "#fff",
  },

  textArea: {
    minHeight: 105,
  },

  disabledInput: {
    opacity: 0.5,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    gap: 15,
    marginBottom: 11,
  },

  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: "#777",
  },

  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    textAlign: "right",
  },

  divider: {
    height: 1,
    marginVertical: 5,
    backgroundColor: "#e4e0d9",
  },

  totalRow: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    paddingTop: 7,
  },

  totalLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
  },

  totalValue: {
    fontSize: 19,
    fontWeight: "700",
    color: "#222",
  },

  choiceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
  },

  choiceCardSelected: {
    borderColor: "#bd9650",
    backgroundColor:
      "rgba(189,150,80,0.08)",
  },

  choiceTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  choiceText: {
    flex: 1,
  },

  choiceTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },

  choiceDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: "#777",
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#aaa",
    alignItems: "center",
    justifyContent: "center",
  },

  radioOuterSelected: {
    borderColor: "#bd9650",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#bd9650",
  },

  paymentChoice: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
  },

  paymentInfo: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#666",
  },

  paymentQr: {
    width: 170,
    height: 170,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
  },

  detailsBox: {
    marginTop: 5,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8d3ca",
    borderRadius: 9,
    padding: 11,
    fontSize: 12,
    lineHeight: 18,
    color: "#666",
  },

  mutedText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#777",
  },

  mutedCentered: {
    fontSize: 13,
    textAlign: "center",
    color: "#777",
  },

  linkText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine:
      "underline",
    color: "#7d5d27",
  },

  dateButtonRow: {
    flexDirection: "row",
    gap: 10,
  },

  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc5b9",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },

  selectedDate: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },

  helperText: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: "#888",
  },

  editActions: {
    gap: 10,
    marginTop: 4,
    marginBottom: 20,
  },

  primaryButton: {
    marginTop: 8,
    borderRadius: 13,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },

  saveButton: {
    marginTop: 0,
  },

  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  disabledButton: {
    opacity: 0.45,
  },

  successBox: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor:
      "rgba(34,130,70,0.3)",
    borderRadius: 10,
    padding: 12,
    backgroundColor:
      "rgba(34,130,70,0.08)",
  },

  successText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#216e3b",
  },

  errorBox: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor:
      "rgba(190,40,40,0.3)",
    borderRadius: 10,
    padding: 12,
    backgroundColor:
      "rgba(190,40,40,0.07)",
  },

  errorBoxText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#a52a2a",
  },

  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#222",
  },

  errorMessage: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: "#777",
  },

  /* =======================================================
     HISTORY MODAL
     ======================================================= */

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 40,
    backgroundColor:
      "rgba(0,0,0,0.45)",
  },

  modalContent: {
    maxHeight: "85%",
    borderRadius: 16,
    padding: 18,
    backgroundColor:
      STORE.colors.background,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },

  modalDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      "rgba(0,0,0,0.06)",
  },

  modalCloseText: {
    fontSize: 16,
    color: "#444",
  },

  historyList: {
    paddingBottom: 5,
    gap: 12,
  },

  historyItem: {
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 12,
    padding: 14,
    backgroundColor:
      "rgba(255,255,255,0.55)",
  },

  historyDate: {
    fontSize: 11,
    color: "#888",
  },

  historyChangedBy: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
    color: "#222",
  },

  historyDescription: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 20,
    color: "#444",
  },

  emptyHistory: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d6d0c6",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },

  emptyHistoryText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: "#777",
  },
});