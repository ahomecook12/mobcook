import { Image } from "expo-image";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STORE, STORE_LOCALE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

/* =========================================================
   CONSTANTS
   ========================================================= */

const CURRENCY_SYMBOL = "₹";

const WEB_API_URL =
  process.env.EXPO_PUBLIC_WEB_API_URL?.replace(/\/$/, "") ?? "";

/* =========================================================
   TYPES
   ========================================================= */

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
};

type CartProduct = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number;
  images: string[];
  available_for_sale: boolean;
  weight_grams: number | null;
  size: string | null;
  height: number | null;
  width: number | null;
  depth: number | null;
};

type CartItem = {
  id: string;
  quantity: number;
  product: CartProduct;
};

type StorefrontSettings = {
  shipping_enabled: boolean;
  shipping_method: string | null;
  shipping_price: number;
  free_shipping: boolean;
};

type PaymentMethod = {
  id: string;
  method_type: string;
  display_name: string;
  enabled: boolean;
  account_name: string | null;
  phone_number: string | null;
  payment_url: string | null;
  instructions: string | null;
  qr_code_url: string | null;
  sort_order: number;
};

type DeliveryMode = "booked" | "requested";

/* =========================================================
   COMPONENT
   ========================================================= */

export default function CheckoutScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [items, setItems] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState<StorefrontSettings | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [paymentMethodId, setPaymentMethodId] = useState("");

  const [catalogMode, setCatalogMode] = useState(false);

  /* =========================================================
     SHIPPING ADDRESS
     ========================================================= */

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("India");

  /* =========================================================
     PREFERRED FULFILLMENT
     ========================================================= */

  const [preferredFulfillmentAt, setPreferredFulfillmentAt] =
    useState<Date | null>(null);

  const [showFulfillmentDatePicker, setShowFulfillmentDatePicker] =
    useState(false);

  const [showFulfillmentTimePicker, setShowFulfillmentTimePicker] =
    useState(false);

  /* =========================================================
     DELIVERY SERVICE
     ========================================================= */

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("requested");

  const [deliveryDetails, setDeliveryDetails] = useState("");

  /* =========================================================
     LOAD CHECKOUT
     ========================================================= */

  useFocusEffect(
    useCallback(() => {
      loadCheckout();
    }, []),
  );

  async function loadCheckout() {
    try {
      setLoading(true);

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

      const [
        profileResult,
        cartResult,
        settingsResult,
        siteSettingsResult,
        paymentMethodsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            `
              id,
              full_name,
              phone,
              address,
              city,
              postal_code,
              country
            `,
          )
          .eq("id", user.id)
          .maybeSingle(),

        supabase
          .from("carts")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("storefront_settings")
          .select(
            `
              shipping_enabled,
              shipping_method,
              shipping_price,
              free_shipping
            `,
          )
          .limit(1)
          .maybeSingle(),

        supabase
          .from("site_settings")
          .select("catalog_mode")
          .eq("id", true)
          .maybeSingle(),

        supabase
          .from("payment_methods")
          .select(
            `
              id,
              method_type,
              display_name,
              enabled,
              account_name,
              phone_number,
              payment_url,
              instructions,
              qr_code_url,
              sort_order
            `,
          )
          .eq("enabled", true)
          .order("sort_order", {
            ascending: true,
          }),
      ]);

      /* =====================================================
         PROFILE
         ===================================================== */

      if (profileResult.error) {
        throw profileResult.error;
      }

      const profile = profileResult.data as Profile | null;

      setFullName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
      setAddress(profile?.address ?? "");
      setPostalCode(profile?.postal_code ?? "");

      setCity(profile?.city?.trim() ? profile.city : "Bangalore");

      setCountry(profile?.country?.trim() ? profile.country : "India");

      /* =====================================================
         STOREFRONT SETTINGS
         ===================================================== */

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      if (settingsResult.data) {
        setSettings({
          ...settingsResult.data,
          shipping_price: Number(settingsResult.data.shipping_price ?? 0),
        } as StorefrontSettings);
      } else {
        setSettings(null);
      }

      /* =====================================================
         CATALOG MODE
         ===================================================== */

      if (siteSettingsResult.error) {
        throw siteSettingsResult.error;
      }

      setCatalogMode(Boolean(siteSettingsResult.data?.catalog_mode));

      /* =====================================================
         PAYMENT METHODS
         ===================================================== */

      if (paymentMethodsResult.error) {
        throw paymentMethodsResult.error;
      }

      const loadedPaymentMethods = (paymentMethodsResult.data ??
        []) as PaymentMethod[];

      setPaymentMethods(loadedPaymentMethods);

      setPaymentMethodId((current) => {
        if (
          current &&
          loadedPaymentMethods.some((method) => method.id === current)
        ) {
          return current;
        }

        return "";
      });

      /* =====================================================
         CART
         ===================================================== */

      if (cartResult.error) {
        throw cartResult.error;
      }

      if (!cartResult.data) {
        setItems([]);
        return;
      }

      const { data: cartItems, error: cartItemsError } = await supabase
        .from("cart_items")
        .select(
          `
            id,
            quantity,
            product_id,
            products (
              id,
              name,
              price,
              sale_price,
              stock,
              images,
              available_for_sale,
              weight_grams,
              size,
              height,
              width,
              depth
            )
          `,
        )
        .eq("cart_id", cartResult.data.id)
        .order("created_at", {
          ascending: true,
        });

      if (cartItemsError) {
        throw cartItemsError;
      }

      const formattedItems: CartItem[] = (cartItems ?? []).flatMap((item) => {
        const product = item.products as CartProduct | CartProduct[] | null;

        const actualProduct = Array.isArray(product) ? product[0] : product;

        if (!actualProduct) {
          return [];
        }

        return [
          {
            id: item.id,
            quantity: item.quantity,

            product: {
              ...actualProduct,

              price: Number(actualProduct.price),

              sale_price:
                actualProduct.sale_price == null
                  ? null
                  : Number(actualProduct.sale_price),

              stock: actualProduct.stock ?? 0,

              images: Array.isArray(actualProduct.images)
                ? actualProduct.images
                : [],

              weight_grams:
                actualProduct.weight_grams == null
                  ? null
                  : Number(actualProduct.weight_grams),

              height:
                actualProduct.height == null
                  ? null
                  : Number(actualProduct.height),

              width:
                actualProduct.width == null
                  ? null
                  : Number(actualProduct.width),

              depth:
                actualProduct.depth == null
                  ? null
                  : Number(actualProduct.depth),
            },
          },
        ];
      });

      setItems(formattedItems);
    } catch (error) {
      console.error("Checkout loading error:", error);

      Alert.alert("Unable to load checkout", "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     SAVE PROFILE ADDRESS
     ========================================================= */

  async function saveCheckoutAddress() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return false;
      }

      const trimmedFullName = fullName.trim();

      const trimmedPhone = phone.trim();
      const trimmedAddress = address.trim();

      const trimmedPostalCode = postalCode.trim();

      const trimmedCity = city.trim();
      const trimmedCountry = country.trim();

      if (
        !trimmedFullName ||
        !trimmedPhone ||
        !trimmedAddress ||
        !trimmedPostalCode ||
        !trimmedCity ||
        !trimmedCountry
      ) {
        Alert.alert(
          "Missing information",
          "Please complete all shipping address fields.",
        );

        return false;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedFullName,
          phone: trimmedPhone,
          address: trimmedAddress,
          postal_code: trimmedPostalCode,
          city: trimmedCity,
          country: trimmedCountry,
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error("Saving checkout address failed:", error);

      Alert.alert("Unable to save address", "Please try again.");

      return false;
    }
  }

  /* =========================================================
     PREFERRED FULFILLMENT HELPERS
     ========================================================= */

  function formatPreferredFulfillment(date: Date) {
    return date.toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function getPreferredFulfillmentValue() {
    if (!preferredFulfillmentAt) {
      return null;
    }

    /*
     * Same intent as web datetime-local:
     * send the selected local date/time.
     */
    const year = preferredFulfillmentAt.getFullYear();

    const month = String(preferredFulfillmentAt.getMonth() + 1).padStart(
      2,
      "0",
    );

    const day = String(preferredFulfillmentAt.getDate()).padStart(2, "0");

    const hours = String(preferredFulfillmentAt.getHours()).padStart(2, "0");

    const minutes = String(preferredFulfillmentAt.getMinutes()).padStart(
      2,
      "0",
    );

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  /* =========================================================
     PLACE ORDER
     ========================================================= */

  async function placeOrder() {
    if (placingOrder) {
      return;
    }

    try {
      setPlacingOrder(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        Alert.alert(
          "Please sign in",
          "Your login session has expired. Please sign in again.",
        );

        router.replace("/auth/login");
        return;
      }

      /* =====================================================
         ADDRESS VALIDATION
         ===================================================== */

      const trimmedFullName = fullName.trim();

      const trimmedPhone = phone.trim();

      const trimmedAddress = address.trim();

      const trimmedPostalCode = postalCode.trim();

      const trimmedCity = city.trim();

      const trimmedCountry = country.trim();

      if (!trimmedFullName) {
        Alert.alert("Full name required", "Please enter your full name.");

        return;
      }

      if (!trimmedPhone) {
        Alert.alert("Phone required", "Please enter your phone number.");

        return;
      }

      if (!trimmedAddress) {
        Alert.alert("Address required", "Please enter your address.");

        return;
      }

      if (!trimmedCity) {
        Alert.alert("City required", "Please enter your city.");

        return;
      }

      if (!trimmedPostalCode) {
        Alert.alert("Postal code required", "Please enter your postal code.");

        return;
      }

      if (!trimmedCountry) {
        Alert.alert("Country required", "Please enter your country.");

        return;
      }

      /* =====================================================
         DELIVERY VALIDATION
         ===================================================== */

      if (deliveryMode !== "booked" && deliveryMode !== "requested") {
        Alert.alert(
          "Delivery service required",
          "Please select how the delivery service should be arranged.",
        );

        return;
      }

      const trimmedDeliveryDetails = deliveryDetails.trim();

      if (deliveryMode === "booked" && !trimmedDeliveryDetails) {
        Alert.alert(
          "Delivery details required",
          'Please enter the delivery service details, or select "Request admin to book the delivery service".',
        );

        return;
      }

      /* =====================================================
         PAYMENT VALIDATION
         ===================================================== */

      if (!paymentMethodId) {
        Alert.alert(
          "Payment method required",
          "Please select a payment method.",
        );

        return;
      }

      const selectedPaymentMethod = paymentMethods.find(
        (method) => method.id === paymentMethodId,
      );

      if (!selectedPaymentMethod) {
        Alert.alert(
          "Payment method unavailable",
          "Please select an available payment method.",
        );

        return;
      }

      /* =====================================================
         SAVE PROFILE
         ===================================================== */

      const saved = await saveCheckoutAddress();

      if (!saved) {
        return;
      }

      /* =====================================================
         API
         ===================================================== */

      if (!WEB_API_URL) {
        throw new Error("Web API URL is not configured.");
      }

      const response = await fetch(`${WEB_API_URL}/api/orders`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${session.access_token}`,
        },

        body: JSON.stringify({
          full_name: trimmedFullName,
          phone: trimmedPhone,
          address: trimmedAddress,
          city: trimmedCity,
          postal_code: trimmedPostalCode,
          country: trimmedCountry,

          payment_method: paymentMethodId,

          preferred_fulfillment_at: getPreferredFulfillmentValue(),

          porter_status: deliveryMode,

          porter_details: trimmedDeliveryDetails || null,
        }),
      });

      const responseText = await response.text();

      let result: {
        success?: boolean;
        order_id?: string;
        order_number?: string;
        error?: string;
      } = {};

      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(
          `The order server returned an unexpected response (${response.status}).`,
        );
      }

      if (!response.ok) {
        throw new Error(result.error || "Unable to place your order.");
      }

      if (!result.success || !result.order_id || !result.order_number) {
        throw new Error("The order was not created successfully.");
      }

      router.replace({
        pathname: "/order-success",

        params: {
          order: result.order_number,
        },
      });
    } catch (error) {
      console.error("MOBILE PLACE ORDER ERROR:", error);

      Alert.alert(
        "Unable to place order",
        error instanceof Error
          ? error.message
          : "Something went wrong while placing your order. Please try again.",
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  /* =========================================================
     TOTALS
     ========================================================= */

  const subtotal = useMemo(
    () =>
      items.reduce((total, item) => {
        const price =
          item.product.sale_price !== null
            ? item.product.sale_price
            : item.product.price;

        return total + price * item.quantity;
      }, 0),
    [items],
  );

  const shippingCost = settings?.free_shipping
    ? 0
    : Number(settings?.shipping_price ?? 0);

  const total = subtotal + shippingCost;

  const addressComplete =
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    address.trim().length > 0 &&
    postalCode.trim().length > 0 &&
    city.trim().length > 0 &&
    country.trim().length > 0;

  const deliveryComplete =
    deliveryMode === "requested" ||
    (deliveryMode === "booked" && deliveryDetails.trim().length > 0);

  const canPlaceOrder =
    addressComplete &&
    deliveryComplete &&
    paymentMethodId.length > 0 &&
    !placingOrder;

  /* =========================================================
     EMPTY CART
     ========================================================= */

  if (!loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛒</Text>

          <Text style={styles.emptyTitle}>Your cart is empty</Text>

          <Text style={styles.emptyText}>
            Add products to your cart before checking out.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace("/explore")}
          >
            <Text style={styles.primaryButtonText}>Continue shopping</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>Loading checkout...</Text>
      </SafeAreaView>
    );
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* =================================================
              HEADER
          ================================================= */}

          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>

            <Text style={styles.title}>Checkout</Text>

            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.pageDescription}>
            {catalogMode
              ? "Review your order before placing it. We will contact you with the price details."
              : "Review your order before placing it."}
          </Text>

          {/* =================================================
              1. SHIPPING ADDRESS
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Shipping address</Text>

            <View style={styles.card}>
              <Text style={styles.helperText}>
                Your current delivery details are shown below. You can edit them
                if needed.
              </Text>

              <Text style={styles.inputLabel}>Full name</Text>

              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Full name"
                placeholderTextColor="#999"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Phone</Text>

              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Text style={styles.inputLabel}>Address</Text>

              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Address"
                placeholderTextColor="#999"
                style={styles.input}
              />

              <View style={styles.inputRow}>
                <View style={styles.postalContainer}>
                  <Text style={styles.inputLabel}>Postal code</Text>

                  <TextInput
                    value={postalCode}
                    onChangeText={setPostalCode}
                    placeholder="Postal code"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                </View>

                <View style={styles.cityContainer}>
                  <Text style={styles.inputLabel}>City</Text>

                  <TextInput
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor="#999"
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Country</Text>

              <TextInput
                value={country}
                onChangeText={setCountry}
                placeholder="Country"
                placeholderTextColor="#999"
                style={styles.input}
              />

              <Text style={styles.profileNote}>
                Changes made here will update your saved account details.
              </Text>
            </View>
          </View>

          {/* =================================================
              2. PREFERRED FULFILLMENT
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Preferred fulfillment</Text>

            <View style={styles.card}>
              <Text style={styles.helperText}>
                Let us know when you would prefer your order to be fulfilled.
              </Text>

              <Text style={styles.inputLabel}>Preferred date and time</Text>

              <Pressable
                style={styles.datePickerButton}
                onPress={() => setShowFulfillmentDatePicker(true)}
              >
                <Text
                  style={
                    preferredFulfillmentAt
                      ? styles.datePickerValue
                      : styles.datePickerPlaceholder
                  }
                >
                  {preferredFulfillmentAt
                    ? formatPreferredFulfillment(preferredFulfillmentAt)
                    : "Select date and time"}
                </Text>
              </Pressable>

              {preferredFulfillmentAt && (
                <Pressable
                  onPress={() => setPreferredFulfillmentAt(null)}
                  style={styles.clearDateButton}
                >
                  <Text style={styles.clearDateText}>Clear preferred time</Text>
                </Pressable>
              )}

              {showFulfillmentDatePicker && (
                <DateTimePicker
                  value={preferredFulfillmentAt ?? new Date()}
                  mode="date"
                  minimumDate={new Date()}
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
              )}

              {showFulfillmentTimePicker && (
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
              )}

              <Text style={styles.smallHint}>
                This is your preferred fulfillment time and is not a guaranteed
                delivery time.
              </Text>
            </View>
          </View>

          {/* =================================================
              3. YOUR ITEMS
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Your items</Text>

            <View style={styles.card}>
              {items.map((item, index) => {
                const price =
                  item.product.sale_price !== null
                    ? item.product.sale_price
                    : item.product.price;

                const lineTotal = price * item.quantity;

                const image = item.product.images?.[0] ?? null;

                return (
                  <View key={item.id}>
                    <View style={styles.summaryItem}>
                      <View style={styles.summaryImageContainer}>
                        {image ? (
                          <Image
                            source={{
                              uri: image,
                            }}
                            style={styles.summaryImage}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={styles.noImage}>
                            <Text style={styles.noImageText}>—</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.summaryItemInfo}>
                        <Text style={styles.summaryItemName} numberOfLines={2}>
                          {item.product.name}
                        </Text>

                        <Text style={styles.summaryItemQuantity}>
                          Qty: {item.quantity}
                        </Text>

                        {!catalogMode && (
                          <Text style={styles.itemUnitPrice}>
                            {CURRENCY_SYMBOL} {price.toFixed(2)} ×{" "}
                            {item.quantity}
                          </Text>
                        )}
                      </View>

                      {!catalogMode && (
                        <Text style={styles.summaryItemPrice}>
                          {CURRENCY_SYMBOL} {lineTotal.toFixed(2)}
                        </Text>
                      )}
                    </View>

                    {index < items.length - 1 && (
                      <View style={styles.itemDivider} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* =================================================
              4. DELIVERY SERVICE
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Delivery service</Text>

            <View style={styles.card}>
              <Text style={styles.helperText}>
                Choose who should arrange the delivery service.
              </Text>

              <Pressable
                onPress={() => setDeliveryMode("booked")}
                style={[
                  styles.optionCard,
                  deliveryMode === "booked" && styles.optionCardSelected,
                ]}
              >
                <View style={styles.radioOuter}>
                  {deliveryMode === "booked" && (
                    <View style={styles.radioInner} />
                  )}
                </View>

                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    I will book the delivery service myself
                  </Text>

                  <Text style={styles.optionDescription}>
                    Add the delivery company, contact details, or other delivery
                    information below.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setDeliveryMode("requested")}
                style={[
                  styles.optionCard,
                  deliveryMode === "requested" && styles.optionCardSelected,
                ]}
              >
                <View style={styles.radioOuter}>
                  {deliveryMode === "requested" && (
                    <View style={styles.radioInner} />
                  )}
                </View>

                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>
                    Request admin to book the delivery service
                  </Text>

                  <Text style={styles.optionDescription}>
                    We will arrange the delivery service for you. Extra delivery
                    charges may apply.
                  </Text>
                </View>
              </Pressable>

              <Text style={[styles.inputLabel, styles.deliveryDetailsLabel]}>
                Delivery details
              </Text>

              <TextInput
                value={deliveryDetails}
                onChangeText={setDeliveryDetails}
                placeholder="Add the delivery company, contact details, or notes"
                placeholderTextColor="#999"
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.textArea]}
              />

              <Text style={styles.smallHint}>
                {deliveryMode === "requested"
                  ? "If you ask us to arrange the delivery, you can leave this blank."
                  : "Please add the delivery service details when arranging delivery yourself."}
              </Text>
            </View>
          </View>

          {/* =================================================
              5. PAYMENT METHOD
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Payment method</Text>

            {paymentMethods.length === 0 ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  No payment method is currently available.
                </Text>
              </View>
            ) : (
              <View style={styles.paymentList}>
                {paymentMethods.map((method) => {
                  const selected = paymentMethodId === method.id;

                  return (
                    <Pressable
                      key={method.id}
                      onPress={() => setPaymentMethodId(method.id)}
                      style={[
                        styles.paymentCard,
                        selected && styles.paymentCardSelected,
                      ]}
                    >
                      <View style={styles.paymentRadio}>
                        {selected && <View style={styles.paymentDot} />}
                      </View>

                      <View style={styles.paymentContent}>
                        <Text style={styles.paymentTitle}>
                          {method.display_name}
                        </Text>

                        {method.account_name && (
                          <Text style={styles.paymentInfo}>
                            Account: {method.account_name}
                          </Text>
                        )}

                        {method.phone_number && (
                          <Text style={styles.paymentInfo}>
                            Phone: {method.phone_number}
                          </Text>
                        )}

                        {method.instructions && (
                          <Text style={styles.paymentInstructions}>
                            {method.instructions}
                          </Text>
                        )}

                        {method.qr_code_url && (
                          <Image
                            source={{
                              uri: method.qr_code_url,
                            }}
                            style={styles.paymentQr}
                            contentFit="contain"
                          />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* =================================================
              6. ORDER SUMMARY
          ================================================= */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Order summary</Text>

            <View style={styles.card}>
              {catalogMode ? (
                <View style={styles.catalogPriceBox}>
                  <Text style={styles.catalogPriceTitle}>Price details</Text>

                  <Text style={styles.catalogPriceText}>
                    We will contact you after your order with the price and
                    shipping details.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>

                    <Text style={styles.totalValue}>
                      {CURRENCY_SYMBOL} {subtotal.toFixed(2)}
                    </Text>
                  </View>

                  <View style={styles.totalRow}>
                    <View style={styles.shippingLabelContainer}>
                      <Text style={styles.totalLabel}>Shipping</Text>

                      <Text style={styles.shippingNote}>
                        Don't pay this if you book the delivery service
                        yourself.
                      </Text>
                    </View>

                    <Text style={styles.totalValue}>
                      {shippingCost === 0
                        ? "Free"
                        : `${CURRENCY_SYMBOL} ${shippingCost.toFixed(2)}`}
                    </Text>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.grandTotalRow}>
                    <Text style={styles.grandTotalLabel}>Total</Text>

                    <Text style={styles.grandTotalValue}>
                      {CURRENCY_SYMBOL} {total.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* =================================================
              PLACE ORDER
          ================================================= */}

          <Pressable
            style={[
              styles.placeOrderButton,
              !canPlaceOrder && styles.placeOrderDisabled,
            ]}
            disabled={!canPlaceOrder}
            onPress={placeOrder}
          >
            {placingOrder ? (
              <View style={styles.placeOrderLoading}>
                <ActivityIndicator size="small" color="#fff" />

                <Text style={styles.placeOrderText}>Placing order...</Text>
              </View>
            ) : (
              <Text style={styles.placeOrderText}>Place order</Text>
            )}
          </Pressable>

          {!addressComplete && (
            <Text style={styles.requiredNote}>
              Please complete your shipping address before placing the order.
            </Text>
          )}

          {addressComplete && !deliveryComplete && (
            <Text style={styles.requiredNote}>
              Please complete the delivery service details.
            </Text>
          )}

          {addressComplete && deliveryComplete && !paymentMethodId && (
            <Text style={styles.requiredNote}>
              Please select a payment method.
            </Text>
          )}

          <Text style={styles.secureNote}>
            Your order will be processed using the details selected above.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
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

  keyboardAvoiding: {
    flex: 1,
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
    color: "#777",
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 50,
  },

  /* =======================================================
     HEADER
     ======================================================= */

  headerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backText: {
    fontSize: 14,
    color: "#555",
    fontWeight: "500",
  },

  title: {
    fontSize: 25,
    fontWeight: "700",
    color: "#222",
  },

  headerSpacer: {
    width: 45,
  },

  pageDescription: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#777",
  },

  /* =======================================================
     SECTIONS
     ======================================================= */

  section: {
    marginTop: 22,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
    marginBottom: 12,
  },

  card: {
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  helperText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
    marginBottom: 14,
  },

  smallHint: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: "#888",
  },

  /* =======================================================
     INPUTS
     ======================================================= */

  inputLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#444",
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d8d4cc",
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 14,
    color: "#222",
    backgroundColor: "rgba(255,255,255,0.65)",
    marginBottom: 12,
  },

  inputRow: {
    flexDirection: "row",
    gap: 10,
  },

  postalContainer: {
    flex: 0.38,
  },

  cityContainer: {
    flex: 0.62,
  },

  textArea: {
    minHeight: 105,
    paddingTop: 12,
  },

  profileNote: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#888",
  },

  /* =======================================================
     DATE
     ======================================================= */

  datePickerButton: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8d4cc",
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: "rgba(255,255,255,0.65)",
  },

  datePickerPlaceholder: {
    fontSize: 14,
    color: "#999",
  },

  datePickerValue: {
    fontSize: 14,
    color: "#222",
  },

  clearDateButton: {
    alignSelf: "flex-start",
    marginTop: 9,
    marginBottom: 3,
  },

  clearDateText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8c672d",
  },

  doneDateButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  doneDateText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8c672d",
  },

  /* =======================================================
     ITEMS
     ======================================================= */

  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  itemDivider: {
    height: 1,
    backgroundColor: "#e4e0d9",
    marginVertical: 13,
  },

  summaryImageContainer: {
    width: 64,
    height: 64,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#eee",
  },

  summaryImage: {
    width: "100%",
    height: "100%",
  },

  noImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  noImageText: {
    color: "#999",
  },

  summaryItemInfo: {
    flex: 1,
    marginLeft: 11,
    minWidth: 0,
  },

  summaryItemName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#222",
  },

  summaryItemQuantity: {
    marginTop: 3,
    fontSize: 11,
    color: "#777",
  },

  itemUnitPrice: {
    marginTop: 3,
    fontSize: 11,
    color: "#777",
  },

  summaryItemPrice: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },

  /* =======================================================
     DELIVERY
     ======================================================= */

  optionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.4)",
  },

  optionCardSelected: {
    borderColor: "#bd9650",
    backgroundColor: "rgba(255,255,255,0.75)",
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#aaa",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    marginTop: 1,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#bd9650",
  },

  optionContent: {
    flex: 1,
  },

  optionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    color: "#222",
  },

  optionDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#777",
  },

  deliveryDetailsLabel: {
    marginTop: 8,
  },

  /* =======================================================
     PAYMENT
     ======================================================= */

  paymentList: {
    gap: 10,
  },

  paymentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#ddd8cf",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  paymentCardSelected: {
    borderColor: "#bd9650",
    backgroundColor: "rgba(255,255,255,0.7)",
  },

  paymentRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#aaa",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },

  paymentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#bd9650",
  },

  paymentContent: {
    flex: 1,
  },

  paymentTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
  },

  paymentInfo: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: "#555",
  },

  paymentInstructions: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
  },

  paymentQr: {
    width: 180,
    height: 180,
    marginTop: 12,
    alignSelf: "center",
  },

  warningBox: {
    borderWidth: 1,
    borderColor: "#e3c7c4",
    borderRadius: 12,
    padding: 13,
    backgroundColor: "#fff6f5",
  },

  warningText: {
    fontSize: 13,
    color: "#9b3028",
  },

  /* =======================================================
     TOTALS
     ======================================================= */

  catalogPriceBox: {
    borderRadius: 10,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.035)",
  },

  catalogPriceTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },

  catalogPriceText: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
  },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 7,
    gap: 15,
  },

  totalLabel: {
    fontSize: 13,
    color: "#666",
  },

  totalValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },

  shippingLabelContainer: {
    flex: 1,
  },

  shippingNote: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    color: "#888",
  },

  divider: {
    height: 1,
    backgroundColor: "#e4e0d9",
    marginVertical: 8,
  },

  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
  },

  grandTotalLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
  },

  grandTotalValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },

  /* =======================================================
     PLACE ORDER
     ======================================================= */

  placeOrderButton: {
    marginTop: 28,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#111",
  },

  placeOrderDisabled: {
    backgroundColor: "#aaa",
  },

  placeOrderLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  placeOrderText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  requiredNote: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    color: "#9b3028",
  },

  secureNote: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 17,
    color: "#888",
  },

  /* =======================================================
     EMPTY
     ======================================================= */

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#222",
  },

  emptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    color: "#777",
  },

  primaryButton: {
    marginTop: 22,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: "#111",
  },

  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
