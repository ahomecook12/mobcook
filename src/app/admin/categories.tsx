import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { STORE, CLOUDINARY_FALLBACK_IMAGE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  is_active: boolean | null;
};

export default function AdminCategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cloudinaryImagesEnabled, setCloudinaryImagesEnabled] = useState(false);
  const loadCategories = useCallback(async () => {
    setCloudinaryImagesEnabled(false);
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

      const [categoriesResult, siteSettingsResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name, slug, image_url, is_active")
          .order("name"),

        supabase
          .from("site_settings")
          .select("cloudinary_images_enabled")
          .eq("id", true)
          .maybeSingle(),
      ]);

      if (siteSettingsResult.error) {
        console.log(
          "Unable to load Cloudinary setting:",
          siteSettingsResult.error.message,
        );

        setCloudinaryImagesEnabled(false);
      } else {
        setCloudinaryImagesEnabled(
          siteSettingsResult.data?.cloudinary_images_enabled === true,
        );
      }

      if (categoriesResult.error) {
        console.log(
          "Unable to load categories:",
          categoriesResult.error.message,
        );
        return;
      }

      setCategories((categoriesResult.data ?? []) as Category[]);
    } catch (error) {
      setCloudinaryImagesEnabled(false);
      console.log("Admin categories error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function handleRefresh() {
    setRefreshing(true);
    loadCategories();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={STORE.colors.primary} />

          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
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
            <Text style={styles.title}>Categories</Text>

            <Text style={styles.subtitle}>
              Manage the categories used in your shop.
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/admin/categories/new")}
          >
            <Text style={styles.addButtonText}>+ New</Text>
          </Pressable>
        </View>

        {/* CATEGORY COUNT */}

        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {categories.length}{" "}
            {categories.length === 1 ? "category" : "categories"}
          </Text>

          <Text style={styles.countHint}>Pull down to refresh</Text>
        </View>

        {/* CATEGORIES */}

        {categories.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🏷️</Text>

            <Text style={styles.emptyTitle}>No categories yet</Text>

            <Text style={styles.emptyText}>
              Add your first category to organize your products.
            </Text>

            <Pressable
              style={styles.emptyButton}
              onPress={() => router.push("/admin/categories/new")}
            >
              <Text style={styles.emptyButtonText}>+ Add Category</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.categoryList}>
            {categories.map((category) => {
              const active = category.is_active === true;
              const isCloudinaryImage =
                category.image_url
                  ?.toLowerCase()
                  .includes("res.cloudinary.com") === true;

              const categoryImage =
                category.image_url &&
                (!isCloudinaryImage || cloudinaryImagesEnabled)
                  ? { uri: category.image_url }
                  : CLOUDINARY_FALLBACK_IMAGE;

              return (
                <Pressable
                  key={category.id}
                  style={({ pressed }) => [
                    styles.categoryCard,
                    pressed && styles.categoryCardPressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/admin/categories/[id]/edit",
                      params: {
                        id: category.id,
                      },
                    })
                  }
                >
                  {/* CATEGORY IMAGE */}

                  <View style={styles.categoryImageContainer}>
                    <Image
                      source={categoryImage}
                      style={styles.categoryImage}
                      resizeMode={
                        isCloudinaryImage && !cloudinaryImagesEnabled
                          ? "contain"
                          : "cover"
                      }
                    />
                  </View>

                  {/* CATEGORY DETAILS */}

                  <View style={styles.categoryMain}>
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {category.name}
                    </Text>

                    <Text style={styles.categorySlug} numberOfLines={1}>
                      /{category.slug}
                    </Text>

                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          active ? styles.activeBadge : styles.inactiveBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            active ? styles.activeText : styles.inactiveText,
                          ]}
                        >
                          {active ? "Active" : "Inactive"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* ARROW */}

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

  categoryList: {
    gap: 10,
  },

  categoryCard: {
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf9",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  categoryCardPressed: {
    opacity: 0.7,
  },

  /* CATEGORY IMAGE */

  categoryImageContainer: {
    width: 68,
    height: 68,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#efe3ca",
    marginRight: 14,
  },

  categoryImage: {
    width: "100%",
    height: "100%",
  },

  noImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  noImageText: {
    fontSize: 22,
  },

  /* CATEGORY TEXT */

  categoryMain: {
    flex: 1,
  },

  categoryName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    color: "#292824",
  },

  categorySlug: {
    marginTop: 4,
    fontSize: 12,
    color: "#8a847b",
  },

  /* STATUS */

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  statusBadge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  activeBadge: {
    backgroundColor: "#e7f3e9",
  },

  inactiveBadge: {
    backgroundColor: "#eeeae4",
  },

  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },

  activeText: {
    color: "#347343",
  },

  inactiveText: {
    color: "#777169",
  },

  /* ARROW */

  arrow: {
    marginLeft: 10,
    fontSize: 30,
    fontWeight: "300",
    color: "#9a8a6d",
  },

  /* EMPTY */

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
