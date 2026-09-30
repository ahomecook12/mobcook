import {
  CURRENCY_SYMBOL,
  CLOUDINARY_FALLBACK_IMAGE,
  STORE,
} from "@/constants/store";
import { supabase } from "@/lib/supabase";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Product = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  sticker: string | null;
  price: number;
  sale_price: number | null;
  images: string[];
  categoryIds: string[];
  created_at: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
};

type SortOption = "newest" | "most-expensive" | "least-expensive" | "oldest";

export default function ProductsScreen() {
  const { category } = useLocalSearchParams<{
    category?: string | string[];
  }>();

  const categorySlug = Array.isArray(category) ? category[0] : category;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [catalogMode, setCatalogMode] = useState(false);
  const [cloudinaryImagesEnabled, setCloudinaryImagesEnabled] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);

      const [
        { data: productData, error: productsError },
        { data: categoryData, error: categoriesError },
        { data: siteSettings, error: siteSettingsError },
      ] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
              id,
              name,
              description,
              keywords,
              sticker,
              price,
              sale_price,
              images,
              product_categories ( category_id ),
              created_at
            `,
          )
          .eq("active", true)
          .order("name"),

        supabase
          .from("categories")
          .select("id, name, slug")
          .eq("is_active", true)
          .order("sort_order")
          .order("name"),

        supabase
          .from("site_settings")
          .select("catalog_mode, cloudinary_images_enabled")
          .eq("id", true)
          .single(),
      ]);

      if (productsError) {
        throw productsError;
      }

      if (categoriesError) {
        throw categoriesError;
      }

      if (siteSettingsError) {
        throw siteSettingsError;
      }

      const formattedProducts: Product[] = (productData ?? []).map(
        (product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          keywords: product.keywords ?? [],
          sticker: product.sticker ?? null,
          price: Number(product.price),
          sale_price:
            product.sale_price == null ? null : Number(product.sale_price),
          images: Array.isArray(product.images)
            ? product.images.filter(
                (image): image is string =>
                  typeof image === "string" && image.trim().length > 0,
              )
            : [],
          categoryIds: (product.product_categories ?? []).map(
            (category) => category.category_id,
          ),
          created_at: product.created_at,
        }),
      );

      const loadedCategories = categoryData ?? [];

      setProducts(formattedProducts);
      setCategories(loadedCategories);
      setCatalogMode(siteSettings?.catalog_mode === true);
      setCloudinaryImagesEnabled(
        siteSettings?.cloudinary_images_enabled ?? true,
      );
    } catch (err) {
      console.error("Products loading error:", err);
      setError("Unable to load products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!categorySlug || categories.length === 0) {
      return;
    }

    const matchingCategory = categories.find(
      (item) => item.slug === categorySlug,
    );

    if (matchingCategory) {
      setSelectedCategory(matchingCategory.id);
    } else {
      setSelectedCategory("all");
    }
  }, [categorySlug, categories]);

  /* =========================================================
     Filter + Search + Sort
     ========================================================= */

  const filteredProducts = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const result = products.filter((product) => {
      const matchesCategory =
        selectedCategory === "all" ||
        product.categoryIds.includes(selectedCategory);

      const keywordText = (product.keywords ?? []).join(" ");

      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        (product.description ?? "").toLowerCase().includes(searchTerm) ||
        keywordText.toLowerCase().includes(searchTerm);

      return matchesCategory && matchesSearch;
    });

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "most-expensive":
          return (b.sale_price ?? b.price) - (a.sale_price ?? a.price);

        case "least-expensive":
          return (a.sale_price ?? a.price) - (b.sale_price ?? b.price);

        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

        case "newest":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
  }, [products, selectedCategory, search, sortBy]);

  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading products...</Text>
      </SafeAreaView>
    );
  }

  /* =========================================================
     Error
     ========================================================= */

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={loadProducts}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* =================================================
            Header
            ================================================= */}

        <View style={styles.header}>
          <Text style={styles.title}>Products</Text>

          <Text style={styles.subtitle}>Browse our collection →</Text>
        </View>

        {/* =================================================
            Search
            ================================================= */}

        <View style={styles.searchContainer}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search products..."
            placeholderTextColor="#999"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        {/* =================================================
            Categories
            ================================================= */}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          <CategoryButton
            title="All"
            selected={selectedCategory === "all"}
            onPress={() => setSelectedCategory("all")}
          />

          {categories.map((category) => (
            <CategoryButton
              key={category.id}
              title={category.name}
              selected={selectedCategory === category.id}
              onPress={() => setSelectedCategory(category.id)}
            />
          ))}
        </ScrollView>

        {/* =================================================
            Sort
            ================================================= */}

        {!catalogMode && (
          <View style={styles.sortSection}>
            <Text style={styles.resultCount}>
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1 ? "product" : "products"}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortList}
            >
              <SortButton
                title="Newest"
                selected={sortBy === "newest"}
                onPress={() => setSortBy("newest")}
              />

              <SortButton
                title="Most expensive"
                selected={sortBy === "most-expensive"}
                onPress={() => setSortBy("most-expensive")}
              />

              <SortButton
                title="Least expensive"
                selected={sortBy === "least-expensive"}
                onPress={() => setSortBy("least-expensive")}
              />

              <SortButton
                title="Oldest"
                selected={sortBy === "oldest"}
                onPress={() => setSortBy("oldest")}
              />
            </ScrollView>
          </View>
        )}

        {/* =================================================
            Products
            ================================================= */}

        {filteredProducts.length > 0 ? (
          <View style={styles.productGrid}>
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                catalogMode={catalogMode}
                cloudinaryImagesEnabled={cloudinaryImagesEnabled}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No products found.</Text>

            <Text style={styles.emptyText}>
              Try another search or category.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   Category Button
   ========================================================= */

function CategoryButton({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.categoryButton, selected && styles.categoryButtonSelected]}
    >
      <Text
        style={[styles.categoryText, selected && styles.categoryTextSelected]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/* =========================================================
   Sort Button
   ========================================================= */

function SortButton({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.sortButton, selected && styles.sortButtonSelected]}
    >
      <Text style={[styles.sortText, selected && styles.sortTextSelected]}>
        {title}
      </Text>
    </Pressable>
  );
}

/* =========================================================
   Product Card
   ========================================================= */

function ProductCard({
  product,
  catalogMode,
  cloudinaryImagesEnabled,
}: {
  product: Product;
  catalogMode: boolean;
  cloudinaryImagesEnabled: boolean;
}) {
  const router = useRouter();
  const [imageFailed, setImageFailed] = useState(false);

  const image =
    product.images
      .find((item) => {
        const url = item?.trim();

        if (!url) {
          return false;
        }

        const isCloudinaryImage = url.includes("res.cloudinary.com");

        return !isCloudinaryImage || cloudinaryImagesEnabled;
      })
      ?.trim() ?? null;

  const isOnSale =
    product.sale_price !== null && product.sale_price < product.price;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.productCard,
        pressed && styles.productCardPressed,
      ]}
      onPress={() => {
        router.push({
          pathname: "/product/[id]",
          params: {
            id: product.id,
          },
        });
      }}
    >
      {/* Image */}

      <View style={styles.productImageContainer}>
        {image && !imageFailed ? (
          <Image
            source={image}
            style={styles.productImage}
            contentFit="cover"
            transition={150}
            onError={(event) => {
              console.warn(
                "Product image failed to load:",
                product.id,
                event.error,
              );
              setImageFailed(true);
            }}
          />
        ) : (
          <Image
            source={CLOUDINARY_FALLBACK_IMAGE}
            style={styles.productImage}
            contentFit="cover"
          />
        )}

        {/* Sticker */}

        {product.sticker ? (
          <View style={styles.sticker}>
            <Text style={styles.stickerText}>✦ {product.sticker}</Text>
          </View>
        ) : null}
      </View>

      {/* Product information */}

      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>

        {!catalogMode &&
          (isOnSale ? (
            <View style={styles.priceRow}>
              <Text style={styles.salePrice}>
                {CURRENCY_SYMBOL} {product.sale_price!.toFixed(2)}
              </Text>

              <Text style={styles.originalPrice}>
                {CURRENCY_SYMBOL} {product.price.toFixed(2)}
              </Text>
            </View>
          ) : (
            <Text style={styles.price}>
              {CURRENCY_SYMBOL} {product.price.toFixed(2)}
            </Text>
          ))}
      </View>
    </Pressable>
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
    backgroundColor: STORE.colors.background,
    padding: 20,
  },

  loadingText: {
    marginTop: 10,
    color: "#777",
  },

  errorText: {
    color: "#b00020",
    fontSize: 16,
    textAlign: "center",
  },

  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#111",
  },

  retryText: {
    color: "#fff",
    fontWeight: "600",
  },

  container: {
    paddingBottom: 40,
  },

  /* =======================================================
     Header
     ======================================================= */

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },

  subtitle: {
    marginTop: 5,
    fontSize: 15,
    color: "#777",
  },

  /* =======================================================
     Search
     ======================================================= */

  searchContainer: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 14,
    backgroundColor: "#fafafa",
  },

  searchInput: {
    height: 48,
    paddingHorizontal: 16,
    fontSize: 15,
    color: "#111",
  },

  /* =======================================================
     Categories
     ======================================================= */

  categoryList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 8,
  },

  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },

  categoryButtonSelected: {
    backgroundColor: "#111",
    borderColor: "#111",
  },

  categoryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#444",
  },

  categoryTextSelected: {
    color: "#fff",
  },

  /* =======================================================
     Sort
     ======================================================= */

  sortSection: {
    marginTop: 18,
    paddingHorizontal: 20,
  },

  resultCount: {
    fontSize: 14,
    color: "#777",
    marginBottom: 10,
  },

  sortList: {
    gap: 8,
  },

  sortButton: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },

  sortButtonSelected: {
    backgroundColor: "#f1f1f1",
    borderColor: "#aaa",
  },

  sortText: {
    fontSize: 13,
    color: "#555",
  },

  sortTextSelected: {
    fontWeight: "600",
    color: "#111",
  },

  /* =======================================================
     Product Grid
     ======================================================= */

  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 16,
  },

  productCard: {
    width: "48%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  productCardPressed: {
    opacity: 0.75,
  },

  productImageContainer: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#f3f3f3",
    position: "relative",
  },

  productImage: {
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
    fontSize: 13,
  },

  /* =======================================================
     Sticker
     ======================================================= */

  sticker: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#e53935",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },

  stickerText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  /* =======================================================
     Product Information
     ======================================================= */

  productInfo: {
    paddingTop: 9,
    paddingBottom: 8,
  },

  productName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: "#111",
  },

  price: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    marginTop: 5,
  },

  salePrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },

  originalPrice: {
    fontSize: 12,
    color: "#888",
    textDecorationLine: "line-through",
  },

  /* =======================================================
     Empty
     ======================================================= */

  emptyContainer: {
    marginHorizontal: 20,
    marginTop: 30,
    padding: 30,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#ddd",
    borderRadius: 16,
    alignItems: "center",
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },

  emptyText: {
    marginTop: 5,
    fontSize: 13,
    color: "#777",
  },
});
