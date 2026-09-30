import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CLOUDINARY_FALLBACK_IMAGE, STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";
import { CACHE_KEYS, getCachedData, setCachedData } from "@/lib/cache";

type ReviewsCache = {
  images: string[];
  cloudinaryImagesEnabled: boolean;
};

export default function ReviewsScreen() {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudinaryImagesEnabled, setCloudinaryImagesEnabled] = useState(true);
  useEffect(() => {
    loadReviews();
  }, []);

  async function loadReviews() {
    try {
      setLoading(true);

      const cached = await getCachedData<ReviewsCache>(CACHE_KEYS.reviews);

      if (cached) {
        setImages(cached.images);
        setCloudinaryImagesEnabled(cached.cloudinaryImagesEnabled);

        return;
      }

      const { data, error } = await supabase
        .from("site_settings")
        .select("customer_review_images, cloudinary_images_enabled")
        .eq("id", true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const loadedImages: string[] = Array.isArray(data?.customer_review_images)
        ? data.customer_review_images.filter(
            (image): image is string =>
              typeof image === "string" && image.trim().length > 0,
          )
        : [];

      const loadedCloudinaryImagesEnabled =
        data?.cloudinary_images_enabled ?? true;

      setImages(loadedImages);

      setCloudinaryImagesEnabled(loadedCloudinaryImagesEnabled);

      await setCachedData<ReviewsCache>(CACHE_KEYS.reviews, {
        images: loadedImages,
        cloudinaryImagesEnabled: loadedCloudinaryImagesEnabled,
      });
    } catch (error) {
      console.error("Load customer reviews error:", error);

      setImages([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STORE.colors.primary} />

          <Text style={styles.loadingText}>Loading customer reviews...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Text style={styles.eyebrow}>FROM OUR CUSTOMERS</Text>

          <Text style={styles.title}>Customer reviews</Text>

          <Text style={styles.description}>
            See what our customers have shared with us.
          </Text>
        </View>

        {/* REVIEWS */}

        {images.length > 0 ? (
          <View style={styles.gallery}>
            {images.map((image, index) => {
              const isCloudinaryImage = image
                .toLowerCase()
                .includes("res.cloudinary.com");

              const imageSource =
                isCloudinaryImage && !cloudinaryImagesEnabled
                  ? CLOUDINARY_FALLBACK_IMAGE
                  : { uri: image };

              return (
                <View key={`${image}-${index}`} style={styles.imageCard}>
                  <Image
                    source={imageSource}
                    contentFit="contain"
                    style={styles.reviewImage}
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✦</Text>

            <Text style={styles.emptyTitle}>No customer reviews yet</Text>

            <Text style={styles.emptyText}>
              Customer reviews will appear here when they are added.
            </Text>
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: STORE.colors.mutedText,
  },

  header: {
    marginBottom: 20,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    color: STORE.colors.primary,
  },

  title: {
    marginTop: 5,
    fontSize: 26,
    fontWeight: "700",
    color: "#292824",
  },

  description: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: "#716d66",
  },

  gallery: {
    gap: 14,
  },

  imageCard: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#ffffff",
  },

  reviewImage: {
    width: "100%",
    minHeight: 250,
  },

  emptyBox: {
    minHeight: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cfc8ba",
    backgroundColor: "#faf8f3",
    alignItems: "center",
    justifyContent: "center",
    padding: 25,
  },

  emptyIcon: {
    fontSize: 30,
    color: STORE.colors.primary,
  },

  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "700",
    color: "#403d38",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: "#888177",
    textAlign: "center",
  },
});
