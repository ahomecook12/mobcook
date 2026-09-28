import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { CURRENCY_SYMBOL, STORE } from "@/constants/store";
import { notifyCartChanged, supabase } from "@/lib/supabase";

type DisplaySettings = {
  price?: boolean;
  size?: boolean;
  description?: boolean;
  stock?: boolean;
  dimensions?: boolean;
  weight?: boolean;
  videos?: boolean;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  size: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  weight_grams: number | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  images: string[];
  video_urls: string[];
  display_settings: DisplaySettings | null;
  available_for_sale: boolean;
};

const shown = (
  settings: DisplaySettings | null,
  field: keyof DisplaySettings,
) => settings?.[field] !== false;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogMode, setCatalogMode] = useState(false);
  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  async function loadProduct() {
    try {
      setLoading(true);
      setError(null);

      const [
        { data: productData, error: productError },
        { data: siteSettings, error: siteSettingsError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
        id,
        name,
        description,
        size,
        price,
        sale_price,
        stock,
        weight_grams,
        height,
        width,
        depth,
        images,
        video_urls,
        display_settings,
        available_for_sale
      `,
          )
          .eq("id", id)
          .eq("active", true)
          .maybeSingle(),

        supabase
          .from("site_settings")
          .select("catalog_mode")
          .eq("id", true)
          .single(),
      ]);

      if (productError) {
        throw productError;
      }

      if (siteSettingsError) {
        throw siteSettingsError;
      }

      setCatalogMode(siteSettings?.catalog_mode === true);

      if (!productData) {
        setError("Product not found.");
        return;
      }

      const formattedProduct: Product = {
        id: productData.id,
        name: productData.name,
        description: productData.description,
        size: productData.size,
        price: Number(productData.price),
        sale_price:
          productData.sale_price == null
            ? null
            : Number(productData.sale_price),
        stock: productData.stock ?? 0,
        weight_grams:
          productData.weight_grams == null
            ? null
            : Number(productData.weight_grams),
        height: productData.height == null ? null : Number(productData.height),
        width: productData.width == null ? null : Number(productData.width),
        depth: productData.depth == null ? null : Number(productData.depth),
        images: Array.isArray(productData.images)
          ? (productData.images as unknown[])
              .filter(
                (image): image is string =>
                  typeof image === "string" && image.trim().length > 0,
              )
              .map((image) => image.trim())
          : [],
        video_urls: Array.isArray(productData.video_urls)
          ? (productData.video_urls as string[])
          : [],
        display_settings:
          (productData.display_settings as DisplaySettings | null) ?? null,
        available_for_sale: productData.available_for_sale ?? false,
      };

      setProduct(formattedProduct);

      const { data: categoryLinks, error: categoryError } = await supabase
        .from("product_categories")
        .select("categories(id, name, slug, image_url)")
        .eq("product_id", id);

      if (categoryError) {
        throw categoryError;
      }

      const formattedCategories = (categoryLinks ?? []).flatMap((link) => {
        const category = link.categories as Category | Category[] | null;

        return Array.isArray(category) ? category : category ? [category] : [];
      });

      setCategories(formattedCategories);
    } catch (err) {
      console.error("Product loading error:", err);
      setError("Unable to load this product.");
    } finally {
      setLoading(false);
    }
  }

  async function openVideo(video: string) {
    const url = video.trim();

    if (!url) {
      Alert.alert("Video", "This video does not have a valid URL.");
      return;
    }

    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;

    try {
      await Linking.openURL(normalizedUrl);
    } catch (err) {
      console.error("Video opening error:", err);
      Alert.alert(
        "Unable to open video",
        "This video link could not be opened on your device.",
      );
    }
  }

  async function addToCart() {
    if (!product) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // ---------------------------------------------------------
      // User must be logged in
      // ---------------------------------------------------------

      if (!user) {
        router.push({
          pathname: "/auth/login",
          params: {
            redirectTo: `/product/${product.id}`,
          },
        } as any);

        return;
      }

      // ---------------------------------------------------------
      // Check availability
      // ---------------------------------------------------------

      const isPreBooking = !product.available_for_sale && product.stock <= 0;

      const canOrder =
        (product.available_for_sale && product.stock > 0) || isPreBooking;

      if (!canOrder) {
        Alert.alert("Out of stock", "This product is currently unavailable.");
        return;
      }

      // ---------------------------------------------------------
      // Get user's cart
      // ---------------------------------------------------------

      let { data: cart, error: cartError } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cartError) {
        throw cartError;
      }

      // ---------------------------------------------------------
      // Create cart if user doesn't have one
      // ---------------------------------------------------------

      if (!cart) {
        const { data: newCart, error: createCartError } = await supabase
          .from("carts")
          .insert({
            user_id: user.id,
          })
          .select("id")
          .single();

        if (createCartError) {
          throw createCartError;
        }

        cart = newCart;
      }

      // ---------------------------------------------------------
      // Check whether product is already in cart
      // ---------------------------------------------------------

      const { data: existingItem, error: existingItemError } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cart.id)
        .eq("product_id", product.id)
        .maybeSingle();

      if (existingItemError) {
        throw existingItemError;
      }

      // ---------------------------------------------------------
      // Existing item → increase quantity
      // ---------------------------------------------------------

      if (existingItem) {
        const newQuantity = existingItem.quantity + 1;

        // Normal products cannot exceed stock.
        if (!isPreBooking && newQuantity > product.stock) {
          Alert.alert(
            "Not enough stock",
            `Only ${product.stock} item${
              product.stock === 1 ? "" : "s"
            } available.`,
          );

          return;
        }

        const { error: updateError } = await supabase
          .from("cart_items")
          .update({
            quantity: newQuantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingItem.id);

        if (updateError) {
          throw updateError;
        }
        notifyCartChanged();
        Alert.alert(
          "Cart updated",
          isPreBooking
            ? "Pre-booking quantity increased."
            : "Product quantity increased.",
        );

        return;
      }

      // ---------------------------------------------------------
      // New item
      // ---------------------------------------------------------

      const { error: insertError } = await supabase.from("cart_items").insert({
        cart_id: cart.id,
        product_id: product.id,
        quantity: 1,
      });

      if (insertError) {
        throw insertError;
      }
      notifyCartChanged();

      Alert.alert(
        isPreBooking ? "Pre-booking added" : "Added to cart",
        isPreBooking
          ? "The product has been added to your cart."
          : "The product has been added to your cart.",
      );
    } catch (err) {
      console.error("Add to cart error:", err);

      Alert.alert(
        "Unable to add to cart",
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  }
  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading product...</Text>
      </SafeAreaView>
    );
  }

  /* =========================================================
     Error
     ========================================================= */

  if (error || !product) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Product not found."}</Text>

        <Pressable
          style={styles.backButton}
          onPress={() => router.push("/explore")}
        >
          <Text style={styles.backButtonText}>← Back to products</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const settings = product.display_settings;

  const images = product.images;

  const videos = shown(settings, "videos") ? product.video_urls : [];

  const salePrice = product.sale_price;

  const stock = product.stock;

  const availableForSale = product.available_for_sale;

  const isPreBooking = !availableForSale && stock <= 0;

  const isOnSale = salePrice !== null && salePrice < product.price;

  const dimensions = [
    ["Height", product.height],
    ["Width", product.width],
    ["Depth", product.depth],
  ].filter(([, value]) => value != null);

  const currentImage = images[selectedImage] ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* =================================================
            Back
            ================================================= */}

        <Pressable
          onPress={() => router.push("/explore")}
          style={styles.backLink}
        >
          <Text style={styles.backLinkText}>← Back to products</Text>
        </Pressable>

        {/* =================================================
            Product Images
            ================================================= */}

        <View style={styles.gallery}>
          <View style={styles.mainImageContainer}>
            {currentImage ? (
              <Image
                source={{ uri: currentImage }}
                style={styles.mainImage}
                contentFit="contain"
                transition={150}
                onError={() => {
                  console.log("Product image failed:", currentImage);
                }}
              />
            ) : (
              <View style={styles.noImage}>
                <Text style={styles.noImageText}>No image</Text>
              </View>
            )}
          </View>

          {images.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailList}
            >
              {images.map((image, index) => (
                <Pressable
                  key={`${image}-${index}`}
                  onPress={() => setSelectedImage(index)}
                  style={[
                    styles.thumbnailContainer,
                    selectedImage === index && styles.thumbnailSelected,
                  ]}
                >
                  <Image
                    source={{ uri: image }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    transition={150}
                  />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* =================================================
            Product Information
            ================================================= */}

        <View style={styles.info}>
          <Text style={styles.productName}>{product.name}</Text>

          {/* Categories */}

          {categories.length > 0 && (
            <View style={styles.categoryList}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    router.push({
                      pathname: "/explore",
                      params: {
                        category: category.slug,
                      },
                    })
                  }
                  style={styles.categoryBadge}
                >
                  {category.image_url ? (
                    <Image
                      source={{ uri: category.image_url }}
                      style={styles.categoryImage}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : null}

                  <Text style={styles.categoryText}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Price */}

          {!catalogMode && shown(settings, "price") && (
            <View style={styles.priceContainer}>
              {isOnSale ? (
                <>
                  <Text style={styles.salePrice}>
                    {CURRENCY_SYMBOL} {salePrice!.toFixed(2)}
                  </Text>

                  <Text style={styles.originalPrice}>
                    {CURRENCY_SYMBOL} {product.price.toFixed(2)}
                  </Text>
                </>
              ) : (
                <Text style={styles.price}>{CURRENCY_SYMBOL} {product.price.toFixed(2)}</Text>
              )}
            </View>
          )}

          {/* Description */}

          {shown(settings, "description") && product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>

              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {/* Details */}

          <View style={styles.details}>
            {shown(settings, "size") && product.size && (
              <Detail label="Size" value={product.size} />
            )}

            {shown(settings, "stock") && (
              <Detail
                label="Availability"
                value={
                  isPreBooking
                    ? "Available for pre-booking"
                    : stock > 0 && availableForSale
                      ? `${stock} in stock`
                      : "Out of stock"
                }
              />
            )}

            {shown(settings, "dimensions") && dimensions.length > 0 && (
              <Detail
                label="Dimensions"
                value={dimensions
                  .map(([label, value]) => `${label}: ${value} cm`)
                  .join(" · ")}
              />
            )}

            {shown(settings, "weight") && product.weight_grams != null && (
              <Detail label="Weight" value={`${product.weight_grams} g`} />
            )}
          </View>

          {/* Videos */}

          {videos.length > 0 && (
            <View style={styles.videoSection}>
              <Text style={styles.sectionTitle}>Videos</Text>

              {videos.map((video, index) => (
                <Pressable
                  key={`${video}-${index}`}
                  style={styles.videoButton}
                  onPress={() => void openVideo(video)}
                >
                  <Text style={styles.videoButtonText}>
                    ▶ Watch video {index + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Add to Cart */}

          <Pressable
            style={[
              styles.cartButton,
              ((!availableForSale && !isPreBooking) ||
                (stock <= 0 && !isPreBooking)) &&
                styles.cartButtonDisabled,
            ]}
            disabled={
              (!availableForSale && !isPreBooking) ||
              (stock <= 0 && !isPreBooking)
            }
            onPress={addToCart}
          >
            <Text style={styles.cartButtonText}>
              {isPreBooking
                ? "Pre-book"
                : stock > 0 && availableForSale
                  ? "Add to Cart"
                  : "Out of Stock"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   Detail
   ========================================================= */

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>

      <Text style={styles.detailValue}>{value}</Text>
    </View>
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

  errorText: {
    fontSize: 16,
    color: "#b00020",
    textAlign: "center",
  },

  container: {
    paddingBottom: 40,
  },

  /* =======================================================
     Back
     ======================================================= */

  backLink: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },

  backLinkText: {
    fontSize: 15,
    color: "#555",
    fontWeight: "500",
  },

  backButton: {
    marginTop: 16,
    backgroundColor: "#111",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },

  backButtonText: {
    color: "#fff",
    fontWeight: "600",
  },

  /* =======================================================
     Gallery
     ======================================================= */

  gallery: {
    paddingHorizontal: 20,
  },

  mainImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#f7f5f7",
  },

  mainImage: {
    width: "100%",
    height: "100%",
  },

  noImage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  noImageText: {
    color: "#999",
  },

  thumbnailList: {
    gap: 10,
    paddingTop: 12,
  },

  thumbnailContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ddd",
  },

  thumbnailSelected: {
    borderWidth: 2,
    borderColor: "#111",
  },

  thumbnail: {
    width: "100%",
    height: "100%",
  },

  /* =======================================================
     Information
     ======================================================= */

  info: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  productName: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: "#111",
  },

  categoryList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f1f1f1",
  },
  categoryImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },

  categoryText: {
    fontSize: 13,
    color: "#444",
    fontWeight: "500",
  },

  /* =======================================================
     Price
     ======================================================= */

  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginTop: 16,
  },

  price: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },

  salePrice: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111",
  },

  originalPrice: {
    fontSize: 15,
    color: "#888",
    textDecorationLine: "line-through",
  },

  /* =======================================================
     Description
     ======================================================= */

  descriptionSection: {
    marginTop: 28,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },

  description: {
    fontSize: 15,
    lineHeight: 23,
    color: "#666",
  },

  /* =======================================================
     Details
     ======================================================= */

  details: {
    marginTop: 24,
    gap: 10,
  },

  detail: {
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#888",
  },

  detailValue: {
    marginTop: 4,
    fontSize: 15,
    color: "#222",
  },

  /* =======================================================
     Videos
     ======================================================= */

  videoSection: {
    marginTop: 28,
  },

  videoButton: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginTop: 8,
  },

  videoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  /* =======================================================
     Cart
     ======================================================= */

  cartButton: {
    marginTop: 28,
    backgroundColor: "#111",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },

  cartButtonDisabled: {
    backgroundColor: "#aaa",
  },

  cartButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
