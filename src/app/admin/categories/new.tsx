import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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

import { STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

// ==========================================================
// HELPERS
// ==========================================================

function createSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

// ==========================================================
// PAGE
// ==========================================================

export default function NewCategoryPage() {
  const router = useRouter();

  // -------------------------------------------------------
  // FORM
  // -------------------------------------------------------

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  // Slug is generated automatically from name
  const slug = createSlug(name);

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingImage, setDeletingImage] = useState(false);
  const [cloudinaryImagesEnabled, setCloudinaryImagesEnabled] = useState(false);

  const [cloudinarySettingsLoading, setCloudinarySettingsLoading] =
    useState(true);

  const [cloudinarySettingsError, setCloudinarySettingsError] = useState<
    string | null
  >(null);

  // -------------------------------------------------------
  // IMAGE
  // -------------------------------------------------------

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePublicId, setImagePublicId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ========================================================
  // CLOUDINARY PROTECTION
  // ========================================================

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
  // ========================================================
  // CLOUDINARY DELETE
  // ========================================================

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

  // ========================================================
  // PICK + UPLOAD IMAGE
  // ========================================================

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

      setImageFile(file);
      setImageUrl(data.url);
      setImagePublicId(data.public_id ?? null);
      setImagePreview(data.url);

      Alert.alert(
        "Image uploaded",
        "The category image has been uploaded. Tap Add Category to save the category.",
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

  // ========================================================
  // REMOVE IMAGE
  // ========================================================

  function removeImage() {
    if (!imageUrl) {
      return;
    }

    Alert.alert("Remove image", "Remove this category image from Cloudinary?", [
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

            await deleteCloudinaryImage(imageUrl, session.access_token);

            setImageUrl(null);
            setImagePublicId(null);
            setImageFile(null);
            setImagePreview(null);

            Alert.alert(
              "Image removed",
              "The category image has been deleted from Cloudinary.",
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
    ]);
  }

  // ========================================================
  // SAVE CATEGORY
  // ========================================================

  async function handleSave() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      Alert.alert("Category name required", "Please enter a category name.");
      return;
    }

    if (!slug) {
      Alert.alert(
        "Invalid category name",
        "Please enter a category name containing letters or numbers.",
      );
      return;
    }

    setSaving(true);

    try {
      // ---------------------------------------------------
      // AUTH
      // ---------------------------------------------------

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      // ---------------------------------------------------
      // ADMIN CHECK
      // ---------------------------------------------------

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (profile?.role !== "admin") {
        Alert.alert(
          "Access denied",
          "Only administrators can create categories.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/"),
            },
          ],
        );

        return;
      }

      // ---------------------------------------------------
      // CHECK DUPLICATE CATEGORY NAME
      // ---------------------------------------------------

      const { data: existingName, error: nameError } = await supabase
        .from("categories")
        .select("id")
        .ilike("name", trimmedName)
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
        .eq("slug", slug)
        .maybeSingle();

      if (slugError) {
        throw slugError;
      }

      if (existingSlug) {
        throw new Error(
          "Another category already uses this generated slug. Please choose a different name.",
        );
      }

      // ---------------------------------------------------
      // SORT ORDER
      // ---------------------------------------------------

      const newSortOrder = Number(sortOrder);

      // ---------------------------------------------------
      // INSERT CATEGORY
      // ---------------------------------------------------

      const { error: insertError } = await supabase.from("categories").insert({
        name: trimmedName,
        slug,
        description: trimmedDescription || null,
        sort_order: Number.isFinite(newSortOrder) ? newSortOrder : 0,
        is_active: isActive,
        image_url: imageUrl,
        image_public_id: imagePublicId,
      });

      if (insertError) {
        throw insertError;
      }

      // ---------------------------------------------------
      // SUCCESS
      // ---------------------------------------------------

      Alert.alert(
        "Category created",
        `"${trimmedName}" has been created successfully.`,
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
      console.error("Create category error:", error);

      // ---------------------------------------------------
      // IMPORTANT:
      // If the category was NOT created but an image was
      // already uploaded, remove that image from Cloudinary.
      // This prevents orphaned images.
      // ---------------------------------------------------

      if (imageUrl) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session?.access_token) {
            await deleteCloudinaryImage(imageUrl, session.access_token);

            setImageUrl(null);
            setImagePublicId(null);
            setImageFile(null);
            setImagePreview(null);
          }
        } catch (cleanupError) {
          console.error(
            "Failed to clean up uploaded category image:",
            cleanupError,
          );
        }
      }

      Alert.alert(
        "Unable to create category",
        error instanceof Error ? error.message : "Failed to create category.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================================
  // UI
  // ========================================================

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
              disabled={saving || uploading || deletingImage}
            >
              <Text style={styles.backText}>‹ Categories</Text>
            </Pressable>

            <Text style={styles.title}>New Category</Text>

            <Text style={styles.subtitle}>
              Create a category and configure its shop appearance.
            </Text>
          </View>

          {/* CATEGORY DETAILS */}

          <Section title="Category Details">
            <Field
              label="Category Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Jewellery"
              autoCapitalize="words"
            />

            <View style={styles.field}>
              <Text style={styles.label}>Slug</Text>

              <View style={styles.slugBox}>
                <Text
                  style={[styles.slugText, !slug && styles.slugPlaceholder]}
                >
                  {slug || "jewellery"}
                </Text>
              </View>

              <Text style={styles.helper}>
                Generated automatically from the category name.
              </Text>
            </View>

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
                  source={{ uri: imagePreview }}
                  style={styles.categoryImage}
                  resizeMode="cover"
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
                  uploading || saving || deletingImage || !!imagePreview
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
                      imagePreview && {
                        color: "#aaa49a",
                      },
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
                  disabled={uploading || saving || deletingImage}
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
            <View style={styles.bottomButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => router.replace("/admin/categories")}
                disabled={saving || uploading || deletingImage}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.saveButton}
                onPress={handleSave}
                disabled={saving || uploading || deletingImage || !name.trim()}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveText}>Add Category</Text>
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
  autoCapitalize?: "none" | "sentences" | "words";
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
        editable={true}
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

  slugBox: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#e1ddd5",
    borderRadius: 11,
    backgroundColor: "#f5f2ec",
    paddingHorizontal: 13,
    justifyContent: "center",
    marginBottom: 10,
  },

  slugText: {
    fontSize: 14,
    color: "#5f594f",
  },

  slugPlaceholder: {
    color: "#aaa49a",
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
