import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,  
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { CURRENCY_SYMBOL, STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number | null;
  active: boolean | null;
  available_for_sale: boolean;
  sticker: string | null;
  images: string[] | null;
};

function ProductThumbnail({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(!uri);

  if (failed || !uri) {
    return (
      <View style={styles.productImagePlaceholder}>
        <Text style={styles.productImagePlaceholderText}>No image</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.productImage}
      contentFit="cover"
       transition={150}
      onError={() => setFailed(true)}
    />
  );
}

export default function AdminProductsPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || profile?.role !== "admin") {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, price, sale_price, stock, active, available_for_sale, sticker, images",
        )
        .order("name");

      if (error) {
        console.log("Unable to load products:", error.message);
        return;
      }

      setProducts((data ?? []) as Product[]);
    } catch (error) {
      console.log("Admin products error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  function handleRefresh() {
    setRefreshing(true);
    loadProducts();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
     

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={STORE.colors.primary} />

          <Text style={styles.loadingText}>Loading products...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[ "bottom"]}>
      

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* PAGE HEADER */}

        <View style={styles.pageHeader}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Products</Text>

            <Text style={styles.subtitle}>Manage your shop products.</Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/admin/products/new")}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </Pressable>
        </View>

        {/* PRODUCT COUNT */}

        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {products.length} {products.length === 1 ? "product" : "products"}
          </Text>

          <Text style={styles.countHint}>Pull down to refresh</Text>
        </View>

        {/* PRODUCTS */}

        {products.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📦</Text>

            <Text style={styles.emptyTitle}>No products yet</Text>

            <Text style={styles.emptyText}>
              Add your first product to start selling.
            </Text>

            <Pressable
              style={styles.emptyButton}
              onPress={() => router.push("/admin/products/new")}
            >
              <Text style={styles.emptyButtonText}>+ Add Product</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.productList}>
            {products.map((product) => {
              const stock = product.stock ?? 0;

              const displayPrice =
                product.sale_price != null ? product.sale_price : product.price;

              const hasSale =
                product.sale_price != null &&
                product.sale_price < product.price;

              return (
                <Pressable
                  key={product.id}
                  style={({ pressed }) => [
                    styles.productCard,
                    pressed && styles.productCardPressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/admin/products/[id]/edit",
                      params: { id: product.id },
                    })
                  }
                >
                  <ProductThumbnail
                    uri={
                      product.images?.find(
                        (image) =>
                          typeof image === "string" && image.trim().length > 0,
                      ) ?? null
                    }
                  />

                  <View style={styles.productMain}>
                    <View style={styles.productTitleRow}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {product.name}
                      </Text>

                      {product.sticker ? (
                        <View style={styles.sticker}>
                          <Text style={styles.stickerText}>
                            {product.sticker}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.detailsRow}>
                      <View style={styles.priceContainer}>
                        <Text style={styles.price}>
                          {CURRENCY_SYMBOL} {Number(displayPrice).toFixed(2)}
                        </Text>

                        {hasSale ? (
                          <Text style={styles.originalPrice}>
                            {CURRENCY_SYMBOL} {Number(product.price).toFixed(2)}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={styles.stockText}>Stock: {stock}</Text>
                    </View>

                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          product.active
                            ? styles.activeBadge
                            : styles.draftBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            product.active
                              ? styles.activeText
                              : styles.draftText,
                          ]}
                        >
                          {product.active ? "Active" : "Draft"}
                        </Text>
                      </View>

                      {product.available_for_sale && stock === 0 ? (
                        <View style={styles.prebookingBadge}>
                          <Text style={styles.prebookingText}>Prebooking</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6f6b66",
  },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },

  headerText: {
    flex: 1,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#292824",
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#716d66",
  },

  addButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#292824",
    alignItems: "center",
    justifyContent: "center",
  },

  addButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  countText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4d4942",
  },

  countHint: {
    fontSize: 11,
    color: "#969087",
  },

  productList: {
    gap: 10,
  },

  productCard: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf9",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  productImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#efeae0",
    marginRight: 12,
  },

  productImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#efeae0",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  productImagePlaceholderText: {
    fontSize: 10,
    color: "#8d877d",
    textAlign: "center",
  },

  productCardPressed: {
    opacity: 0.7,
  },

  productMain: {
    flex: 1,
  },

  productTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  productName: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#292824",
  },

  sticker: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#efe3ca",
  },

  stickerText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6d5630",
  },

  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },

  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  price: {
    fontSize: 14,
    fontWeight: "700",
    color: "#292824",
  },

  originalPrice: {
    fontSize: 11,
    color: "#9a958d",
    textDecorationLine: "line-through",
  },

  stockText: {
    fontSize: 12,
    color: "#716d66",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
  },

  statusBadge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  activeBadge: {
    backgroundColor: "#e7f3e9",
  },

  draftBadge: {
    backgroundColor: "#eeeae4",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },

  activeText: {
    color: "#347343",
  },

  draftText: {
    color: "#777169",
  },

  prebookingBadge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f3ead8",
  },

  prebookingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#806638",
  },

  arrow: {
    marginLeft: 10,
    fontSize: 30,
    fontWeight: "300",
    color: "#9a8a6d",
  },

  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8d5cf",
    backgroundColor: "#faf8f3",
    padding: 28,
    alignItems: "center",
  },

  emptyIcon: {
    fontSize: 32,
  },

  emptyTitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "700",
    color: "#292824",
  },

  emptyText: {
    marginTop: 5,
    fontSize: 13,
    color: "#716d66",
    textAlign: "center",
  },

  emptyButton: {
    marginTop: 18,
    borderRadius: 11,
    backgroundColor: "#292824",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },

  emptyButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});
