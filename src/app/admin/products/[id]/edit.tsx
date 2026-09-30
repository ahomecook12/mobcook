import ProductForm, {
  type Category,
  type Product,
} from "@/components/admin/ProductForm";

import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    loadProduct();
  }, [id]);

  async function loadProduct() {
    try {
      setLoading(true);

      // --------------------------------------------------
      // CHECK LOGIN / ADMIN
      // --------------------------------------------------

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

      if (profileError) {
        throw profileError;
      }

      if (profile?.role !== "admin") {
        router.replace("/");
        return;
      }

      // --------------------------------------------------
      // LOAD PRODUCT + CATEGORIES
      // --------------------------------------------------

      const [
        { data: productData, error: productError },
        { data: categoryData, error: categoryError },
        { data: productCategoryData, error: productCategoryError },
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
              youtube_post_urls,
              active,
              available_for_sale,
              display_settings,
              keywords,
              sticker
            `,
          )
          .eq("id", id)
          .maybeSingle(),

        supabase.from("categories").select("id, name").order("name"),

        supabase
          .from("product_categories")
          .select("category_id")
          .eq("product_id", id),
      ]);

      if (productError) {
        throw productError;
      }

      if (categoryError) {
        throw categoryError;
      }

      if (productCategoryError) {
        throw productCategoryError;
      }

      if (!productData) {
        throw new Error("Product not found.");
      }

      setProduct(productData as Product);
      setCategories((categoryData ?? []) as Category[]);
      setCategoryIds(
        (productCategoryData ?? []).map((item) => item.category_id),
      );
    } catch (error) {
      console.log("Unable to load product:", error);

      // Product could not be loaded.
      router.replace("/admin/products");
    } finally {
      setLoading(false);
    }
  }

  if (loading || !product) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#faf8f3",
        }}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" />

          <Text
            style={{
              marginTop: 10,
              color: "#716d66",
            }}
          >
            Loading product...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ProductForm
      product={product}
      categories={categories}
      initialCategoryIds={categoryIds}
    />
  );
}
