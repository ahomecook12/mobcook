import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CLOUDINARY_FALLBACK_IMAGE, STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  image_public_id: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function EditCategoryScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{ id: string }>();
  const categoryId = params.id;

  // -------------------------------------------------------
  // CATEGORY
  // -------------------------------------------------------

  const [category, setCategory] = useState<Category | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [cloudinaryImagesEnabled, setCloudinaryImagesEnabled] = useState(false);

  const [cloudinarySettingsLoading, setCloudinarySettingsLoading] =
    useState(true);

  const [cloudinarySettingsError, setCloudinarySettingsError] = useState<
    string | null
  >(null);

  // -------------------------------------------------------
  // FORM
  // -------------------------------------------------------

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  // -------------------------------------------------------
  // IMAGE
  // -------------------------------------------------------

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePublicId, setImagePublicId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // -------------------------------------------------------
  // LOAD CATEGORY
  // -------------------------------------------------------

  useEffect(() => {
    if (!categoryId) {
      Alert.alert("Category", "Category ID is missing.", [
        {
          text: "OK",
          onPress: () => router.replace("/admin/categories"),
        },
      ]);

      return;
    }

    loadCategory();
  }, [categoryId]);

  async function loadCategory() {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "admin") {
        Alert.alert(
          "Access denied",
          "Only administrators can edit categories.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ],
        );

        return;
      }

      const { data, error } = await supabase
        .from("categories")
        .select(
          "id, name, slug, description, image_url, image_public_id, is_active, sort_order",
        )
        .eq("id", categoryId)
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Category not found.");
      }

      const loadedCategory = data as Category;

      setCategory(loadedCategory);

      setName(loadedCategory.name);
      setSlug(loadedCategory.slug);
      setDescription(loadedCategory.description ?? "");
      setSortOrder(String(loadedCategory.sort_order ?? 0));
      setIsActive(loadedCategory.is_active);

      setImageUrl(loadedCategory.image_url);
      setImagePublicId(loadedCategory.image_public_id);
      setImagePreview(loadedCategory.image_url);
      setImageFile(null);
    } catch (error) {
      console.error("Load category error:", error);

      Alert.alert(
        "Category",
        error instanceof Error ? error.message : "Failed to load category.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/admin/categories"),
          },
        ],
      );
    } finally {
      setLoading(false);
    }
  }
  // -------------------------------------------------------
  // CLOUDINARY PROTECTION
  // -------------------------------------------------------

  const refreshCloudinarySetting = useCallback(async () => {
    setCloudinarySettingsLoading(true);
    setCloudinarySettingsError(null);
    setCloudinaryImagesEnabled(false);

    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("cloudinary_images_enabled")
        .eq("id", true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data || typeof data.cloudinary_images_enabled !== "boolean") {
        throw new Error("Cloudinary status is unavailable.");
      }

      const enabled = data.cloudinary_images_enabled === true;

      setCloudinaryImagesEnabled(enabled);

      return enabled;
    } catch (error) {
      setCloudinaryImagesEnabled(false);

      setCloudinarySettingsError(
        "Unable to check Cloudinary status. Image uploads are blocked until the status can be verified.",
      );

      throw error;
    } finally {
      setCloudinarySettingsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshCloudinarySetting().catch((error) => {
        console.error("Cloudinary settings loading error:", error);
      });
    }, [refreshCloudinarySetting]),
  );

  async function ensureCloudinaryUploadAllowed() {
    try {
      const enabled = await refreshCloudinarySetting();

      if (!enabled) {
        Alert.alert(
          "Cloudinary is full",
          "Cloudinary is full. Image upload is not allowed.",
        );

        return false;
      }

      return true;
    } catch (error) {
      console.error("Cloudinary upload status check failed:", error);

      Alert.alert(
        "Upload unavailable",
        "Unable to verify Cloudinary status. Image upload is not allowed right now. Please try again.",
      );

      return false;
    }
  }
  // -------------------------------------------------------
  // CLOUDINARY DELETE
  // -------------------------------------------------------

  async function deleteCloudinaryImage(url: string, accessToken: string) {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_WEB_API_URL}/api/admin/cloudinary/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          url,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error ?? "Failed to delete image from Cloudinary.");
    }

    return data;
  }

  // -------------------------------------------------------
  // IMAGE PICK + UPLOAD
  // -------------------------------------------------------

  async function pickAndUploadImage() {
    try {
      // Check before opening the image picker.
      if (!(await ensureCloudinaryUploadAllowed())) {
        return;
      }
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Please allow photo library access to select a category image.",
        );

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.9,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        Alert.alert(
          "Sign in required",
          "Your admin session has expired. Please sign in again.",
        );

        router.replace("/auth/login");
        return;
      }

      setUploading(true);

      const fileName = asset.fileName ?? `category-${Date.now()}.jpg`;

      const mimeType = asset.mimeType ?? "image/jpeg";

      console.log("Uploading category image:", fileName, mimeType, asset.uri);

      // ---------------------------------------------------
      // Expo 57:
      // Use a real File object for native FormData.
      // ---------------------------------------------------

      const file = new File(asset.uri);

      const formData = new FormData();

      formData.append("file", file);
      formData.append("folder", "category");

      // Recheck immediately before uploading in case
      // Cloudinary was disabled while the image was being selected.
      if (!(await ensureCloudinaryUploadAllowed())) {
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_WEB_API_URL}/api/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Category image upload failed.");
      }

      if (!data?.url) {
        throw new Error("Cloudinary did not return an image URL.");
      }

      // ---------------------------------------------------
      // IMPORTANT:
      // Do NOT delete the old image here.
      //
      // If this is a replacement, the old image remains
      // until Save Changes succeeds.
      // ---------------------------------------------------

      setImageFile(file);
      setImageUrl(data.url);
      setImagePublicId(data.public_id ?? null);
      setImagePreview(data.url);

      Alert.alert(
        "Image uploaded",
        "The new category image has been uploaded. Tap Save Changes to keep it.",
      );
    } catch (error) {
      console.error("Category image upload error:", error);

      Alert.alert(
        "Image upload failed",
        error instanceof Error
          ? error.message
          : "Could not upload the category image.",
      );
    } finally {
      setUploading(false);
    }
  }

  // -------------------------------------------------------
  // REMOVE CURRENT IMAGE
  //
  // THIS is the important fix.
  //
  // The old code only cleared the React state.
  // This version actually deletes the image from Cloudinary.
  // -------------------------------------------------------

  function removeImage() {
    if (!imageUrl) {
      return;
    }

    Alert.alert(
      "Remove image",
      "Remove this category image from Cloudinary and from the category?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setDeletingImage(true);

            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (!session?.access_token) {
                throw new Error(
                  "Your admin session has expired. Please sign in again.",
                );
              }

              const imageBeingDeleted = imageUrl;

              // ---------------------------------------------------
              // Delete from Cloudinary FIRST.
              // ---------------------------------------------------

              await deleteCloudinaryImage(
                imageBeingDeleted,
                session.access_token,
              );

              // ---------------------------------------------------
              // Cloudinary deletion succeeded.
              // Now remove the image reference from Supabase.
              // ---------------------------------------------------

              if (category) {
                const { error } = await supabase
                  .from("categories")
                  .update({
                    image_url: null,
                    image_public_id: null,
                  })
                  .eq("id", category.id);

                if (error) {
                  throw error;
                }

                setCategory((current) =>
                  current
                    ? {
                        ...current,
                        image_url: null,
                        image_public_id: null,
                      }
                    : current,
                );
              }

              // ---------------------------------------------------
              // Finally clear local state.
              // ---------------------------------------------------

              setImageUrl(null);
              setImagePublicId(null);
              setImageFile(null);
              setImagePreview(null);

              Alert.alert(
                "Image removed",
                "The category image has been deleted from Cloudinary and removed from the category.",
              );
            } catch (error) {
              console.error("Category image deletion error:", error);

              Alert.alert(
                "Remove failed",
                error instanceof Error
                  ? error.message
                  : "Could not remove the category image.",
              );
            } finally {
              setDeletingImage(false);
            }
          },
        },
      ],
    );
  }

  // -------------------------------------------------------
  // SAVE
  // -------------------------------------------------------

  async function saveCategory() {
    if (!category) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedName) {
      Alert.alert("Category", "Please enter a category name.");
      return;
    }

    if (!trimmedSlug) {
      Alert.alert("Category", "Please enter a category slug.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role !== "admin") {
        throw new Error("Only administrators can update categories.");
      }

      // ---------------------------------------------------
      // CHECK DUPLICATE CATEGORY NAME
      // ---------------------------------------------------

      const { data: existingName, error: nameError } = await supabase
        .from("categories")
        .select("id")
        .ilike("name", trimmedName)
        .neq("id", category.id)
        .maybeSingle();

      if (nameError) {
        throw nameError;
      }

      if (existingName) {
        throw new Error("A category with this name already exists.");
      }

      // ---------------------------------------------------
      // CHECK DUPLICATE SLUG
      // ---------------------------------------------------

      const { data: existingSlug, error: slugError } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", trimmedSlug)
        .neq("id", category.id)
        .maybeSingle();

      if (slugError) {
        throw slugError;
      }

      if (existingSlug) {
        throw new Error("A category with this slug already exists.");
      }

      const newSortOrder = Number(sortOrder);

      // ---------------------------------------------------
      // UPDATE CATEGORY
      // ---------------------------------------------------

      const { error } = await supabase
        .from("categories")
        .update({
          name: trimmedName,
          slug: trimmedSlug,
          description: description.trim() || null,
          sort_order: Number.isFinite(newSortOrder) ? newSortOrder : 0,
          is_active: isActive,
          image_url: imageUrl,
          image_public_id: imagePublicId,
        })
        .eq("id", category.id);

      if (error) {
        throw error;
      }

      // ---------------------------------------------------
      // DELETE OLD IMAGE IF IT WAS REPLACED
      //
      // Example:
      // old image = abc.jpg
      // new image = xyz.jpg
      //
      // After DB update succeeds, delete abc.jpg.
      // ---------------------------------------------------

      if (category.image_url && category.image_url !== imageUrl) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            await deleteCloudinaryImage(
              category.image_url,
              session.access_token,
            );
          }
        } catch (cloudinaryError) {
          console.error(
            "Failed to delete old category image from Cloudinary:",
            cloudinaryError,
          );

          // Database update succeeded.
          // Do not tell the user that saving failed.
        }
      }

      Alert.alert(
        "Category updated",
        "The category has been updated successfully.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace("/admin/categories");
            },
          },
        ],
      );
    } catch (error) {
      console.error("Save category error:", error);

      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : "Failed to update category.",
      );
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------
  // DELETE CATEGORY
  // -------------------------------------------------------

  function confirmDelete() {
    if (!category) {
      return;
    }

    Alert.alert(
      "Delete category",
      `Delete "${category.name}"?\n\nThis cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteCategory,
        },
      ],
    );
  }

  async function deleteCategory() {
    if (!category) {
      return;
    }

    setDeleting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your admin session has expired. Please sign in again.",
        );
      }

      // ---------------------------------------------------
      // CHECK WHETHER PRODUCTS USE THIS CATEGORY
      // ---------------------------------------------------

      const { count, error: linksError } = await supabase
        .from("product_categories")
        .select("product_id", {
          count: "exact",
          head: true,
        })
        .eq("category_id", category.id);

      if (linksError) {
        throw linksError;
      }

      if ((count ?? 0) > 0) {
        Alert.alert(
          "Cannot delete category",
          "This category is assigned to products. Remove those product assignments first.",
        );

        return;
      }

      // ---------------------------------------------------
      // DELETE CATEGORY IMAGE FROM CLOUDINARY FIRST
      //
      // This prevents deleting the database record while
      // silently leaving the image behind.
      // ---------------------------------------------------

      if (category.image_url) {
        await deleteCloudinaryImage(category.image_url, session.access_token);
      }

      // ---------------------------------------------------
      // DELETE CATEGORY FROM SUPABASE
      // ---------------------------------------------------

      const { error: deleteError } = await supabase
        .from("categories")
        .delete()
        .eq("id", category.id);

      if (deleteError) {
        throw deleteError;
      }

      Alert.alert("Category deleted", `"${category.name}" has been deleted.`, [
        {
          text: "OK",
          onPress: () => {
            router.replace("/admin/categories");
          },
        },
      ]);
    } catch (error) {
      console.error("Delete category error:", error);

      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Failed to delete category.",
      );
    } finally {
      setDeleting(false);
    }
  }
  const isCloudinaryPreview =
    imagePreview?.toLowerCase().includes("res.cloudinary.com") === true;

  const canShowImagePreview =
    !!imagePreview && (!isCloudinaryPreview || cloudinaryImagesEnabled);
  // -------------------------------------------------------
  // LOADING
  // -------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={STORE.colors.primary} />

          <Text style={styles.loadingText}>Loading category...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------
  // NOT FOUND
  // -------------------------------------------------------

  if (!category) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Category not found.</Text>

          <Pressable
            style={styles.backButtonLarge}
            onPress={() => router.replace("/admin/categories")}
          >
            <Text style={styles.backButtonLargeText}>Back to Categories</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}

          <View style={styles.header}>
            <Pressable
              onPress={() => router.replace("/admin/categories")}
              style={styles.backButton}
            >
              <Text style={styles.backText}>‹ Categories</Text>
            </Pressable>

            <Text style={styles.title}>Edit Category</Text>

            <Text style={styles.subtitle}>
              Update category details and shop appearance.
            </Text>
          </View>

          {/* CATEGORY DETAILS */}

          <Section title="Category Details">
            <Field
              label="Category Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Jewellery"
            />

            <Field
              label="Slug"
              value={slug}
              onChangeText={setSlug}
              placeholder="e.g. jewellery"
              autoCapitalize="none"
            />

            <Text style={styles.helper}>Used in the category URL.</Text>

            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Describe this category..."
              multiline
            />

            <Field
              label="Sort Order"
              value={sortOrder}
              onChangeText={setSortOrder}
              placeholder="0"
              keyboardType="number-pad"
            />

            <Text style={styles.helper}>Lower numbers appear first.</Text>
          </Section>

          {/* STATUS */}

          <Section title="Category Status">
            <DisplaySwitch
              label="Active Category"
              description="Active categories are visible in the shop."
              value={isActive}
              onValueChange={setIsActive}
            />
          </Section>

          {/* IMAGE */}

          <Section title="Category Image">
            {imagePreview ? (
              <View style={styles.imageContainer}>
                <Image
                  source={
                    canShowImagePreview
                      ? { uri: imagePreview }
                      : CLOUDINARY_FALLBACK_IMAGE
                  }
                  style={styles.categoryImage}
                  resizeMode={canShowImagePreview ? "cover" : "contain"}
                />
              </View>
            ) : (
              <View style={styles.noImage}>
                <Text style={styles.noImageText}>No category image</Text>
              </View>
            )}

            <View style={styles.imageButtons}>
              <Pressable
                style={styles.secondaryButton}
                onPress={pickAndUploadImage}
                disabled={
                  uploading ||
                  saving ||
                  deleting ||
                  deletingImage ||
                  !!imagePreview
                }
              >
                {uploading ? (
                  <ActivityIndicator
                    color={STORE.colors.primary}
                    size="small"
                  />
                ) : (
                  <Text
                    style={[
                      styles.secondaryButtonText,
                      imagePreview && { color: "#aaa49a" },
                    ]}
                  >
                    Choose Image
                  </Text>
                )}
              </Pressable>

              {imagePreview ? (
                <Pressable
                  style={styles.removeImageButton}
                  onPress={removeImage}
                  disabled={uploading || saving || deleting || deletingImage}
                >
                  {deletingImage ? (
                    <ActivityIndicator color="#b42318" size="small" />
                  ) : (
                    <Text style={styles.removeImageText}>Remove</Text>
                  )}
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.helper}>Choose an image Max 4.5 MB.</Text>

            {imageFile ? (
              <Text style={styles.uploadedText}>New image uploaded ✓</Text>
            ) : null}
          </Section>

          {/* ACTIONS */}

          <View style={styles.actions}>
            <Pressable
              style={styles.deleteButton}
              onPress={confirmDelete}
              disabled={deleting || saving || uploading || deletingImage}
            >
              {deleting ? (
                <ActivityIndicator color="#b42318" />
              ) : (
                <Text style={styles.deleteButtonText}>Delete Category</Text>
              )}
            </Pressable>

            <View style={styles.bottomButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => router.replace("/admin/categories")}
                disabled={saving || deleting || uploading || deletingImage}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.saveButton}
                onPress={saveCategory}
                disabled={saving || deleting || uploading || deletingImage}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ==========================================================
// REUSABLE COMPONENTS
// ==========================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa49a"
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

function DisplaySwitch({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <Text style={styles.switchLabel}>{label}</Text>

        <Text style={styles.switchDescription}>{description}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: "#d5d1ca",
          true: STORE.colors.primary,
        }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

// ==========================================================
// STYLES
// ==========================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  keyboardAvoiding: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 50,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: STORE.colors.mutedText,
  },

  errorText: {
    fontSize: 16,
    fontWeight: "600",
    color: STORE.colors.text,
    marginBottom: 18,
  },

  backButtonLarge: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: STORE.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  backButtonLargeText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  header: {
    marginBottom: 22,
  },

  backButton: {
    alignSelf: "flex-start",
    marginBottom: 16,
  },

  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#806638",
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

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#292824",
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf9",
    padding: 16,
  },

  field: {
    marginBottom: 15,
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: "#403d38",
  },

  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    borderRadius: 11,
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    color: "#292824",
  },

  textarea: {
    minHeight: 110,
    textAlignVertical: "top",
  },

  helper: {
    marginTop: -8,
    marginBottom: 15,
    fontSize: 11,
    lineHeight: 17,
    color: "#888177",
  },

  switchRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  switchText: {
    flex: 1,
  },

  switchLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#403d38",
  },

  switchDescription: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: "#777169",
  },

  imageContainer: {
    width: "100%",
    aspectRatio: 1.5,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#ffffff",
  },

  categoryImage: {
    width: "100%",
    height: "100%",
  },

  noImage: {
    width: "100%",
    aspectRatio: 1.5,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cfc8ba",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#faf8f3",
    marginBottom: 12,
  },

  noImageText: {
    fontSize: 13,
    color: "#888177",
  },

  imageButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 10,
  },

  secondaryButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 11,
    backgroundColor: "#eee7da",
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6d5630",
  },

  removeImageButton: {
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e0aaa5",
    backgroundColor: "#fff7f6",
    alignItems: "center",
    justifyContent: "center",
  },

  removeImageText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b42318",
  },

  uploadedText: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#5f6f45",
  },

  actions: {
    marginTop: 5,
    gap: 14,
  },

  deleteButton: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#e0aaa5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff7f6",
  },

  deleteButtonText: {
    color: "#b42318",
    fontSize: 14,
    fontWeight: "700",
  },

  bottomButtons: {
    flexDirection: "row",
    gap: 10,
  },

  cancelButton: {
    flex: 1,
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#d1cdc5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },

  cancelText: {
    color: "#514d47",
    fontSize: 14,
    fontWeight: "700",
  },

  saveButton: {
    flex: 1.5,
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#292824",
  },

  saveText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
