import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { notifyCartChanged, supabase } from "@/lib/supabase";
import { CURRENCY_SYMBOL, STORE } from "@/constants/store";

type CartProduct = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number;
  images: string[];
  available_for_sale: boolean;
};

type CartItem = {
  id: string;
  quantity: number;
  product: CartProduct;
};

export default function CartScreen() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [catalogMode, setCatalogMode] = useState(false);

  /*
   * Reload the cart whenever the screen becomes active.
   *
   * Also reload catalog mode so the cart immediately reflects
   * the current storefront setting.
   */
  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, []),
  );

  async function loadCart() {
    try {
      setLoading(true);

      // ---------------------------------------------------------
      // Load catalog mode
      // ---------------------------------------------------------

      const { data: siteSettings, error: siteSettingsError } =
        await supabase
          .from("site_settings")
          .select("catalog_mode")
          .eq("id", true)
          .maybeSingle();

      if (siteSettingsError) {
        console.error("Site settings loading error:", siteSettingsError);

        // Do not block the cart if the setting cannot be loaded.
        setCatalogMode(false);
      } else {
        setCatalogMode(Boolean(siteSettings?.catalog_mode));
      }

      // ---------------------------------------------------------
      // Get current user
      // ---------------------------------------------------------

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setItems([]);
        return;
      }

      // ---------------------------------------------------------
      // Find user's cart
      // ---------------------------------------------------------

      const { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cartError) {
        throw cartError;
      }

      if (!cart) {
        setItems([]);
        return;
      }

      // ---------------------------------------------------------
      // Get cart items + product information
      // ---------------------------------------------------------

      const { data: cartItems, error: itemsError } = await supabase
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
              available_for_sale
            )
          `,
        )
        .eq("cart_id", cart.id)
        .order("created_at", {
          ascending: true,
        });

      if (itemsError) {
        throw itemsError;
      }

      const formattedItems: CartItem[] = (cartItems ?? []).flatMap((item) => {
        const product = item.products as
          | CartProduct
          | CartProduct[]
          | null;

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
            },
          },
        ];
      });

      setItems(formattedItems);
    } catch (error) {
      console.error("Cart loading error:", error);

      Alert.alert("Unable to load cart", "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // Update quantity
  // -------------------------------------------------------------

  async function updateQuantity(item: CartItem, newQuantity: number) {
    if (updatingId) return;

    const isPreBooking =
      !item.product.available_for_sale && item.product.stock <= 0;

    if (newQuantity < 1) {
      return;
    }

    /*
     * Normal products cannot exceed available stock.
     *
     * Pre-booking products intentionally have stock = 0,
     * so they do not have this restriction.
     */
    if (!isPreBooking && newQuantity > item.product.stock) {
      Alert.alert(
        "Not enough stock",
        `Only ${item.product.stock} item${
          item.product.stock === 1 ? "" : "s"
        } available.`,
      );

      return;
    }

    try {
      setUpdatingId(item.id);

      const { error } = await supabase
        .from("cart_items")
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      notifyCartChanged();

      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                quantity: newQuantity,
              }
            : currentItem,
        ),
      );
    } catch (error) {
      console.error("Quantity update error:", error);

      Alert.alert("Unable to update cart", "Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  // -------------------------------------------------------------
  // Remove item
  // -------------------------------------------------------------

  async function removeItem(item: CartItem) {
    if (updatingId) return;

    try {
      setUpdatingId(item.id);

      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      notifyCartChanged();

      setItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
    } catch (error) {
      console.error("Remove cart item error:", error);

      Alert.alert("Unable to remove item", "Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  // -------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>Loading cart...</Text>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Empty cart
  // -------------------------------------------------------------

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛒</Text>

          <Text style={styles.emptyTitle}>Your cart is empty</Text>

          <Text style={styles.emptyText}>
            Add something beautiful to your cart and come back here.
          </Text>

          <Pressable
            style={styles.continueButton}
            onPress={() => router.push("/explore")}
          >
            <Text style={styles.continueButtonText}>
              Continue shopping
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------
  // Totals
  // -------------------------------------------------------------

  /*
   * We still calculate the real subtotal because checkout/order
   * creation continues to use the actual product prices.
   *
   * Catalog mode only hides these values from the customer UI.
   */
  const subtotal = items.reduce((total, item) => {
    const unitPrice =
      item.product.sale_price !== null
        ? item.product.sale_price
        : item.product.price;

    return total + unitPrice * item.quantity;
  }, 0);

  const itemCount = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  // -------------------------------------------------------------
  // Render
  // -------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* =====================================================
            Header
           ===================================================== */}

        <View style={styles.titleRow}>
          <Text style={styles.title}>Your Cart</Text>

          <Text style={styles.itemCount}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
        </View>

        {/* =====================================================
            Catalog mode information
           ===================================================== */}

        {catalogMode && (
          <View style={styles.catalogNotice}>
            <Text style={styles.catalogNoticeTitle}>
              Catalog mode
            </Text>

            <Text style={styles.catalogNoticeText}>
              Prices are provided after your order is submitted.
            </Text>
          </View>
        )}

        {/* =====================================================
            Items
           ===================================================== */}

        <View style={styles.items}>
          {items.map((item) => {
            const product = item.product;

            const isPreBooking =
              !product.available_for_sale && product.stock <= 0;

            const unitPrice =
              product.sale_price !== null
                ? product.sale_price
                : product.price;

            const lineTotal = unitPrice * item.quantity;

            const image = product.images?.[0] ?? null;

            const busy = updatingId === item.id;

            return (
              <View key={item.id} style={styles.cartItem}>
                {/* Product image */}

                <View style={styles.imageContainer}>
                  {image ? (
                    <Image
                      source={{
                        uri: image,
                      }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.noImage}>
                      <Text style={styles.noImageText}>
                        No image
                      </Text>
                    </View>
                  )}
                </View>

                {/* Product details */}

                <View style={styles.itemDetails}>
                  <Text
                    style={styles.productName}
                    numberOfLines={2}
                  >
                    {product.name}
                  </Text>

                  {isPreBooking && (
                    <Text style={styles.preBooking}>
                      Pre-booking
                    </Text>
                  )}

                  {/* Prices are hidden in catalog mode */}

                  {!catalogMode && (
                    <View style={styles.priceRow}>
                      <Text style={styles.unitPrice}>
                        {CURRENCY_SYMBOL} {unitPrice.toFixed(2)}
                      </Text>

                      {product.sale_price !== null && (
                        <Text style={styles.originalPrice}>
                          {CURRENCY_SYMBOL} {product.price.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Quantity */}

                  <View style={styles.bottomRow}>
                    <View style={styles.quantityControl}>
                      <Pressable
                        disabled={
                          busy || item.quantity <= 1
                        }
                        onPress={() =>
                          updateQuantity(
                            item,
                            item.quantity - 1,
                          )
                        }
                        style={styles.quantityButton}
                      >
                        <Text style={styles.quantityButtonText}>
                          −
                        </Text>
                      </Pressable>

                      <Text style={styles.quantityText}>
                        {item.quantity}
                      </Text>

                      <Pressable
                        disabled={
                          busy ||
                          (!isPreBooking &&
                            item.quantity >= product.stock)
                        }
                        onPress={() =>
                          updateQuantity(
                            item,
                            item.quantity + 1,
                          )
                        }
                        style={styles.quantityButton}
                      >
                        <Text style={styles.quantityButtonText}>
                          +
                        </Text>
                      </Pressable>
                    </View>

                    {!catalogMode && (
                      <Text style={styles.lineTotal}>
                        {CURRENCY_SYMBOL} {lineTotal.toFixed(2)}
                      </Text>
                    )}
                  </View>

                  {/* Remove */}

                  <Pressable
                    disabled={busy}
                    onPress={() => removeItem(item)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>

        {/* =====================================================
            Summary
           ===================================================== */}

        <View style={styles.summary}>
          {!catalogMode ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Subtotal
                </Text>

                <Text style={styles.summaryValue}>
                  {CURRENCY_SYMBOL} {subtotal.toFixed(2)}
                </Text>
              </View>

              <Text style={styles.shippingNote}>
                Shipping and payment options will be shown at
                checkout.
              </Text>
            </>
          ) : (
            <Text style={styles.catalogSummaryText}>
              Submit your order and the admin will contact you
              with the price details, shipping and payment
              options.
            </Text>
          )}

          {/* Checkout remains available in catalog mode */}

          <Pressable
            style={styles.checkoutButton}
            onPress={() => router.push("/checkout" as any)}
          >
            <Text style={styles.checkoutButtonText}>
              Proceed to checkout
            </Text>
          </Pressable>

          <Pressable
            style={styles.continueLink}
            onPress={() => router.push("/explore")}
          >
            <Text style={styles.continueLinkText}>
              ← Continue shopping
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   Styles
   ========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: STORE.colors.background,
  },

  loadingText: {
    marginTop: 10,
    color: "#777",
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
  },

  /* =======================================================
     Title
     ======================================================= */

  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },

  itemCount: {
    fontSize: 13,
    color: "#777",
  },

  /* =======================================================
     Catalog mode
     ======================================================= */

  catalogNotice: {
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1ddd5",
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  catalogNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },

  catalogNoticeText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
  },

  /* =======================================================
     Cart items
     ======================================================= */

  items: {
    gap: 14,
  },

  cartItem: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "#e1ddd5",
    borderRadius: 16,
    padding: 10,
  },

  imageContainer: {
    width: 105,
    height: 105,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#eee",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  noImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  noImageText: {
    fontSize: 11,
    color: "#999",
  },

  itemDetails: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },

  productName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: "#222",
  },

  preBooking: {
    marginTop: 3,
    fontSize: 11,
    color: "#bd9650",
    fontWeight: "600",
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },

  unitPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },

  originalPrice: {
    fontSize: 12,
    color: "#999",
    textDecorationLine: "line-through",
  },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d8d5cf",
    borderRadius: 8,
    overflow: "hidden",
  },

  quantityButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },

  quantityButtonText: {
    fontSize: 18,
    color: "#333",
  },

  quantityText: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },

  lineTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222",
  },

  removeButton: {
    alignSelf: "flex-start",
    marginTop: 6,
  },

  removeText: {
    fontSize: 12,
    color: "#b3261e",
  },

  /* =======================================================
     Summary
     ======================================================= */

  summary: {
    marginTop: 25,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dedad2",
    backgroundColor: "rgba(255,255,255,0.55)",
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  summaryLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },

  shippingNote: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#777",
  },

  catalogSummaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#666",
  },

  checkoutButton: {
    marginTop: 18,
    borderRadius: 13,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#111",
  },

  checkoutButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  continueLink: {
    alignItems: "center",
    marginTop: 15,
  },

  continueLinkText: {
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },

  /* =======================================================
     Empty cart
     ======================================================= */

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 35,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 15,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#222",
  },

  emptyText: {
    marginTop: 8,
    textAlign: "center",
    lineHeight: 21,
    fontSize: 14,
    color: "#777",
  },

  continueButton: {
    marginTop: 22,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111",
  },

  continueButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});