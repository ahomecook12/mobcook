import { File } from "expo-file-system";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { CURRENCY_SYMBOL, STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

export type ProductDisplaySettings = {
  price: boolean;
  size: boolean;
  description: boolean;
  stock: boolean;
  dimensions: boolean;
  weight: boolean;
  videos: boolean;
};

const defaultDisplaySettings: ProductDisplaySettings = {
  price: true,
  size: true,
  description: true,
  stock: false,
  dimensions: true,
  weight: true,
  videos: true,
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  size: string | null;
  price: number;
  sale_price: number | null;
  stock: number | null;
  weight_grams: number | null;
  height: number | null;
  width: number | null;
  depth: number | null;
  images: string[] | null;
  video_urls: string[] | null;
  active: boolean | null;
  available_for_sale: boolean;
  display_settings: ProductDisplaySettings | null;
  keywords: string[] | null;
  sticker: string | null;
};

export type Category = {
  id: string;
  name: string;
};

type Props = {
  product?: Product;
  categories?: Category[];
  initialCategoryIds?: string[];
};

function inputValue(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

export default function ProductForm({
  product,
  categories = [],
  initialCategoryIds = [],
}: Props) {
  const router = useRouter();
  const editing = Boolean(product);

  // -------------------------------------------------------
  // BASIC INFORMATION
  // -------------------------------------------------------

  const [name, setName] = useState(product?.name ?? "");
  const [sticker, setSticker] = useState(product?.sticker ?? "");
  const [size, setSize] = useState(product?.size ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [keywords, setKeywords] = useState(product?.keywords?.join(", ") ?? "");

  // -------------------------------------------------------
  // PRICING
  // -------------------------------------------------------

  const [price, setPrice] = useState(inputValue(product?.price));
  const [salePrice, setSalePrice] = useState(inputValue(product?.sale_price));
  const [stock, setStock] = useState(inputValue(product?.stock));

  // -------------------------------------------------------
  // DIMENSIONS
  // -------------------------------------------------------

  const [height, setHeight] = useState(inputValue(product?.height));
  const [width, setWidth] = useState(inputValue(product?.width));
  const [depth, setDepth] = useState(inputValue(product?.depth));
  const [weight, setWeight] = useState(inputValue(product?.weight_grams));

  // -------------------------------------------------------
  // IMAGES
  // -------------------------------------------------------

  const [images, setImages] = useState<string[]>(product?.images ?? []);

  // -------------------------------------------------------
  // VIDEOS
  // -------------------------------------------------------

  const [videoUrls, setVideoUrls] = useState<string[]>(
    product?.video_urls ?? [],
  );

  const [videoUrl, setVideoUrl] = useState("");

  // -------------------------------------------------------
  // CATEGORIES
  // -------------------------------------------------------

  const [categoryIds, setCategoryIds] = useState<string[]>(initialCategoryIds);

  const [availableCategories, setAvailableCategories] =
    useState<Category[]>(categories);

  const [newCategoryName, setNewCategoryName] = useState("");

  // -------------------------------------------------------
  // PRODUCT SETTINGS
  // -------------------------------------------------------

  const [active, setActive] = useState(product?.active ?? true);

  const [availableForSale, setAvailableForSale] = useState(
    product?.available_for_sale ?? true,
  );

  const [displaySettings, setDisplaySettings] =
    useState<ProductDisplaySettings>({
      ...defaultDisplaySettings,
      ...product?.display_settings,
    });

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiImageUri, setAiImageUri] = useState<string | null>(null);
  // -------------------------------------------------------
  // KEEP CATEGORY STATE IN SYNC
  // -------------------------------------------------------

  useEffect(() => {
    setAvailableCategories(categories);
  }, [categories]);

  // -------------------------------------------------------
  // IMAGE PICK + UPLOAD
  // -------------------------------------------------------

  async function pickAndUploadImage() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Please allow photo library access to select product images.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }
      setAiImageUri(result.assets[0].uri);

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

      for (const asset of result.assets) {
        const fileName = asset.fileName ?? `product-${Date.now()}.jpg`;

        const mimeType = asset.mimeType ?? "image/jpeg";

        console.log("Uploading image:", fileName, mimeType, asset.uri);

        const formData = new FormData();

        const file = new File(asset.uri);

        formData.append("file", file);
        formData.append("folder", "products");

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
          throw new Error(data?.error ?? "Image upload failed.");
        }

        if (data?.url) {
          setImages((current) => [...current, data.url]);
        }
      }

      Alert.alert(
        "Upload successful",
        `${result.assets.length} image${
          result.assets.length === 1 ? "" : "s"
        } uploaded successfully.`,
      );
    } catch (error) {
      console.error("Product image upload error:", error);

      Alert.alert(
        "Image upload failed",
        error instanceof Error ? error.message : "Could not upload the image.",
      );
    }
  }

  async function analyzeProductWithAI() {
    if (!aiImageUri) {
      Alert.alert(
        "AI Product Analysis",
        "Please choose a product image first. AI can analyze one image at a time.",
      );
      return;
    }

    setAiAnalyzing(true);

    try {
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

      console.log("AI image URI:", aiImageUri);

      const file = new File(aiImageUri);

      const base64 = await file.base64();

      if (!base64) {
        throw new Error("Could not read the selected image.");
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_WEB_API_URL}/api/admin/ai/analyze-product`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: "image/jpeg",
            fileName: "product-image.jpg",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "AI analysis failed.");
      }

      if (data.name) {
        setName(data.name);
      }

      if (data.description) {
        setDescription(data.description);
      }

      if (Array.isArray(data.keywords)) {
        const aiKeywords = data.keywords
          .filter(
            (keyword: unknown): keyword is string =>
              typeof keyword === "string",
          )
          .map((keyword: string) => keyword.trim().toLowerCase())
          .filter((keyword: string) => Boolean(keyword));

        setKeywords(aiKeywords.join(", "));
      }

      if (data.size) {
        setSize(data.size);
      }

      if (data.suggestedCategory) {
        const suggested = availableCategories.find(
          (category) =>
            category.name.toLowerCase().trim() ===
            data.suggestedCategory.toLowerCase().trim(),
        );

        if (suggested) {
          setCategoryIds((current) =>
            current.includes(suggested.id)
              ? current
              : [...current, suggested.id],
          );
        }
      }

      Alert.alert("AI complete", "Product details have been filled in.");
    } catch (error) {
      console.error("AI product analysis error:", error);

      Alert.alert(
        "AI analysis failed",
        error instanceof Error
          ? error.message
          : "Could not analyze the product image.",
      );
    } finally {
      setAiAnalyzing(false);
    }
  }
  // -------------------------------------------------------
  // DELETE CLOUDINARY IMAGE
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
  // REMOVE IMAGE
  // -------------------------------------------------------

  async function removeImage(index: number) {
    const url = images[index];

    if (!url) {
      return;
    }

    Alert.alert(
      "Remove image",
      "Remove this image from Cloudinary and from the product?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (!session?.access_token) {
                throw new Error(
                  "Your admin session has expired. Please sign in again.",
                );
              }

              await deleteCloudinaryImage(url, session.access_token);

              setImages((current) =>
                current.filter((_, imageIndex) => imageIndex !== index),
              );

              Alert.alert(
                "Image removed",
                "The image has been deleted from Cloudinary.",
              );
            } catch (error) {
              console.error("Cloudinary image delete error:", error);

              Alert.alert(
                "Remove failed",
                error instanceof Error
                  ? error.message
                  : "Could not delete the image.",
              );
            }
          },
        },
      ],
    );
  }

  // -------------------------------------------------------
  // VIDEO
  // -------------------------------------------------------

  function addVideo() {
    const url = videoUrl.trim();

    if (!url) {
      Alert.alert("Video", "Please enter a video URL.");
      return;
    }

    if (videoUrls.includes(url)) {
      Alert.alert("Video", "This video has already been added.");
      return;
    }

    setVideoUrls((current) => [...current, url]);
    setVideoUrl("");
  }

  function removeVideo(index: number) {
    setVideoUrls((current) =>
      current.filter((_, videoIndex) => videoIndex !== index),
    );
  }

  // -------------------------------------------------------
  // CATEGORY
  // -------------------------------------------------------

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id)
        ? current.filter((categoryId) => categoryId !== id)
        : [...current, id],
    );
  }

  async function createCategory() {
    const categoryName = newCategoryName.trim();

    if (!categoryName) {
      return;
    }

    const exists = availableCategories.some(
      (category) => category.name.toLowerCase() === categoryName.toLowerCase(),
    );

    if (exists) {
      Alert.alert("Category", "A category with this name already exists.");
      return;
    }

    setCreatingCategory(true);

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
        Alert.alert(
          "Access denied",
          "Only administrators can create categories.",
        );
        return;
      }

      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: categoryName,
        })
        .select("id, name")
        .single();

      if (error) {
        throw error;
      }

      const newCategory = data as Category;

      setAvailableCategories((current) =>
        [...current, newCategory].sort((a, b) => a.name.localeCompare(b.name)),
      );

      setCategoryIds((current) => [...current, newCategory.id]);

      setNewCategoryName("");
    } catch (error) {
      Alert.alert(
        "Category",
        error instanceof Error ? error.message : "Failed to create category.",
      );
    } finally {
      setCreatingCategory(false);
    }
  }

  // -------------------------------------------------------
  // SAVE
  // -------------------------------------------------------

  async function saveProduct() {
    if (!name.trim()) {
      Alert.alert("Product", "Please enter a product name.");
      return;
    }

    if (!price || Number(price) <= 0) {
      Alert.alert("Product", "Please enter a valid price.");
      return;
    }

    if (!images.length) {
      Alert.alert("Product", "Please add at least one product image.");
      return;
    }

    if (salePrice && Number(salePrice) >= Number(price)) {
      Alert.alert(
        "Sale price",
        "Sale price should be lower than the regular price.",
      );
      return;
    }

    setSaving(true);

    try {
      const values = {
        name: name.trim(),
        description: description.trim() || null,
        size: size.trim() || null,

        price: Number(price),

        sale_price: salePrice ? Number(salePrice) : null,

        stock: stock ? Number(stock) : 0,

        weight_grams: weight ? Number(weight) : null,

        height: height ? Number(height) : null,

        width: width ? Number(width) : null,

        depth: depth ? Number(depth) : null,

        images,

        video_urls: videoUrls,

        active,

        available_for_sale: availableForSale,

        display_settings: displaySettings,

        keywords: keywords
          .split(",")
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean),

        sticker: sticker.trim() || null,
      };

      let productId = product?.id;

      if (editing) {
        const { error } = await supabase
          .from("products")
          .update(values)
          .eq("id", product!.id);

        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(values)
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        productId = data.id;
      }

      if (!productId) {
        throw new Error("Product could not be saved.");
      }

      const { error: deleteCategoryError } = await supabase
        .from("product_categories")
        .delete()
        .eq("product_id", productId);

      if (deleteCategoryError) {
        throw deleteCategoryError;
      }

      if (categoryIds.length > 0) {
        const rows = categoryIds.map((category_id) => ({
          product_id: productId!,
          category_id,
        }));

        const { error: categoryError } = await supabase
          .from("product_categories")
          .insert(rows);

        if (categoryError) {
          throw categoryError;
        }
      }

      Alert.alert(
        editing ? "Product updated" : "Product created",
        editing
          ? "The product has been updated successfully."
          : "The product has been added successfully.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/admin/products"),
          },
        ],
      );
    } catch (error) {
      console.log("Save product error:", error);

      Alert.alert(
        "Save failed",
        error instanceof Error ? error.message : "Failed to save product.",
      );
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------
  // DELETE
  // -------------------------------------------------------

  function confirmDelete() {
    if (!product) {
      return;
    }

    Alert.alert(
      "Delete product",
      `Delete "${product.name}"? This cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteProduct,
        },
      ],
    );
  }

  async function deleteProduct() {
    if (!product) {
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

      const productImages = product.images ?? [];

      for (const imageUrl of productImages) {
        try {
          await deleteCloudinaryImage(imageUrl, session.access_token);
        } catch (imageError) {
          console.error(
            "Failed to delete product image from Cloudinary:",
            imageUrl,
            imageError,
          );

          throw new Error(
            "One or more product images could not be deleted from Cloudinary. The product was not deleted.",
          );
        }
      }

      const { error: categoryError } = await supabase
        .from("product_categories")
        .delete()
        .eq("product_id", product.id);

      if (categoryError) {
        throw categoryError;
      }

      const { error: productError } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);

      if (productError) {
        throw productError;
      }

      Alert.alert(
        "Product deleted",
        "The product and its Cloudinary images have been deleted.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/admin/products"),
          },
        ],
      );
    } catch (error) {
      console.error("Delete product error:", error);

      Alert.alert(
        "Delete failed",
        error instanceof Error ? error.message : "Failed to delete product.",
      );
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------------------------------------
  // DISPLAY TOGGLE
  // -------------------------------------------------------

  function toggleDisplaySetting(key: keyof ProductDisplaySettings) {
    setDisplaySettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
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
              onPress={() => router.replace("/admin/products")}
              style={styles.backButton}
            >
              <Text style={styles.backText}>‹ Products</Text>
            </Pressable>

            <Text style={styles.title}>
              {editing ? "Edit Product" : "Add Product"}
            </Text>

            <Text style={styles.subtitle}>
              {editing
                ? "Update product details."
                : "Add a new product to your shop."}
            </Text>
          </View>

          {/* BASIC INFORMATION */}

          <Section title="Basic Information">
            <Field
              label="Product Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pearl Jhumka Earrings"
            />

            <Field
              label="Sticker"
              value={sticker}
              onChangeText={setSticker}
              placeholder="NEW, BESTSELLER, LIMITED"
            />

            <Text style={styles.helper}>
              Optional. Appears on the product card.
            </Text>

            <Field
              label="Size"
              value={size}
              onChangeText={setSize}
              placeholder="e.g. S, M, L or 20 × 30 cm"
            />

            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the product..."
              multiline
            />

            <Field
              label="Keywords"
              value={keywords}
              onChangeText={setKeywords}
              placeholder="yellow, jhumka, jewellery, gift"
            />

            <Text style={styles.helper}>Separate keywords with commas.</Text>
          </Section>

          {/* IMAGES */}

          <Section title="Product Images">
            <Pressable
              style={styles.secondaryButton}
              onPress={pickAndUploadImage}
            >
              <Text style={styles.secondaryButtonText}>+ Choose Images</Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryButton,
                aiAnalyzing && styles.disabledButton,
              ]}
              onPress={analyzeProductWithAI}
              disabled={
                aiAnalyzing || saving || deleting || images.length === 0
              }
            >
              {aiAnalyzing ? (
                <View style={styles.aiButtonContent}>
                  <ActivityIndicator size="small" color="#6d5630" />
                  <Text style={styles.secondaryButtonText}>Analyzing...</Text>
                </View>
              ) : (
                <Text style={styles.secondaryButtonText}>✨ Fill with AI</Text>
              )}
            </Pressable>

            <Text style={styles.helper}>
              Select a product image first. AI will suggest the product name,
              description, keywords, size and category.
            </Text>

            {images.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.imagePreviewRow}
              >
                {images.map((url, index) => (
                  <View key={`${url}-${index}`} style={styles.imagePreviewCard}>
                    <Image
                      source={{ uri: url }}
                      style={styles.productImage}
                      contentFit="cover"
                      transition={150}
                    />

                    <View style={styles.imageNumberBadge}>
                      <Text style={styles.imageNumberText}>{index + 1}</Text>
                    </View>

                    <Pressable
                      onPress={() => removeImage(index)}
                      style={styles.imageRemoveButton}
                    >
                      <Text style={styles.imageRemoveText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Text style={styles.helper}>
              Select one or more images from your phone. Images are uploaded
              securely to Cloudinary.
            </Text>
          </Section>

          {/* CATEGORIES */}

          <Section title="Categories">
            <View style={styles.categoryCreateRow}>
              <TextInput
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="New category name"
                placeholderTextColor="#aaa49a"
                style={styles.categoryInput}
              />

              <Pressable
                style={styles.smallButton}
                onPress={createCategory}
                disabled={creatingCategory || !newCategoryName.trim()}
              >
                {creatingCategory ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.smallButtonText}>Add</Text>
                )}
              </Pressable>
            </View>

            {availableCategories.length > 0 ? (
              <View style={styles.categoryScrollContainer}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.categoryList}
                >
                  {availableCategories.map((category) => {
                    const selected = categoryIds.includes(category.id);

                    return (
                      <Pressable
                        key={category.id}
                        style={[
                          styles.categoryItem,
                          selected && styles.categoryItemSelected,
                        ]}
                        onPress={() => toggleCategory(category.id)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            selected && styles.checkboxSelected,
                          ]}
                        >
                          {selected ? (
                            <Text style={styles.checkmark}>✓</Text>
                          ) : null}
                        </View>

                        <Text style={styles.categoryName}>{category.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text style={styles.helper}>No categories yet.</Text>
            )}
          </Section>

          {/* PRICING */}

          <Section title="Pricing & Inventory">
            <Field
              label={`Price (${CURRENCY_SYMBOL})`}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Field
              label={`Sale Price (${CURRENCY_SYMBOL})`}
              value={salePrice}
              onChangeText={setSalePrice}
              placeholder="Optional"
              keyboardType="decimal-pad"
            />

            <Field
              label="Stock"
              value={stock}
              onChangeText={setStock}
              placeholder="0"
              keyboardType="number-pad"
            />
          </Section>

          {/* DIMENSIONS */}

          <Section title="Dimensions & Weight">
            <Field
              label="Height (cm)"
              value={height}
              onChangeText={setHeight}
              placeholder="0"
              keyboardType="decimal-pad"
            />

            <Field
              label="Width (cm)"
              value={width}
              onChangeText={setWidth}
              placeholder="0"
              keyboardType="decimal-pad"
            />

            <Field
              label="Depth (cm)"
              value={depth}
              onChangeText={setDepth}
              placeholder="0"
              keyboardType="decimal-pad"
            />

            <Field
              label="Weight (g)"
              value={weight}
              onChangeText={setWeight}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </Section>

          {/* VIDEOS */}

          <Section title="Product Videos">
            <Field
              label="YouTube URL"
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://youtube.com/..."
              autoCapitalize="none"
            />

            <Pressable style={styles.secondaryButton} onPress={addVideo}>
              <Text style={styles.secondaryButtonText}>+ Add Video</Text>
            </Pressable>

            {videoUrls.map((url, index) => (
              <View key={`${url}-${index}`} style={styles.listItem}>
                <Text style={styles.listItemUrl} numberOfLines={3}>
                  {url}
                </Text>

                <Pressable onPress={() => removeVideo(index)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </Section>

          {/* PUBLIC PRODUCT PAGE */}

          <Section title="Public Product Page">
            <DisplaySwitch
              label="Price"
              description="Show the product price"
              value={displaySettings.price}
              onValueChange={() => toggleDisplaySetting("price")}
            />

            <DisplaySwitch
              label="Size"
              description="Show the size field"
              value={displaySettings.size}
              onValueChange={() => toggleDisplaySetting("size")}
            />

            <DisplaySwitch
              label="Description"
              description="Show the product description"
              value={displaySettings.description}
              onValueChange={() => toggleDisplaySetting("description")}
            />

            <DisplaySwitch
              label="Stock"
              description="Show available stock"
              value={displaySettings.stock}
              onValueChange={() => toggleDisplaySetting("stock")}
            />

            <DisplaySwitch
              label="Dimensions"
              description="Show height, width and depth"
              value={displaySettings.dimensions}
              onValueChange={() => toggleDisplaySetting("dimensions")}
            />

            <DisplaySwitch
              label="Weight"
              description="Show product weight"
              value={displaySettings.weight}
              onValueChange={() => toggleDisplaySetting("weight")}
            />

            <DisplaySwitch
              label="Videos"
              description="Show product video links"
              value={displaySettings.videos}
              onValueChange={() => toggleDisplaySetting("videos")}
            />
          </Section>

          {/* STATUS */}

          <Section title="Product Status">
            <DisplaySwitch
              label="Active Product"
              description="Active products are visible in the shop."
              value={active}
              onValueChange={setActive}
            />

            <DisplaySwitch
              label="Available for sale"
              description="Customers can buy even when stock is 0. Useful for prebooking."
              value={availableForSale}
              onValueChange={setAvailableForSale}
            />
          </Section>

          {/* ACTIONS */}

          <View style={styles.actions}>
            {editing ? (
              <Pressable
                style={styles.deleteButton}
                onPress={confirmDelete}
                disabled={deleting || saving}
              >
                {deleting ? (
                  <ActivityIndicator color="#b42318" />
                ) : (
                  <Text style={styles.deleteButtonText}>Delete Product</Text>
                )}
              </Pressable>
            ) : null}

            <View style={styles.bottomButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => router.replace("/admin/products")}
                disabled={saving || deleting}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={styles.saveButton}
                onPress={saveProduct}
                disabled={saving || deleting}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveText}>
                    {editing ? "Save Changes" : "Save Product"}
                  </Text>
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

  helper: {
    marginTop: -8,
    marginBottom: 15,
    fontSize: 11,
    lineHeight: 17,
    color: "#888177",
  },

  secondaryButton: {
    alignSelf: "flex-start",
    minHeight: 42,
    paddingHorizontal: 15,
    borderRadius: 11,
    backgroundColor: "#eee7da",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6d5630",
  },
  disabledButton: {
    opacity: 0.6,
  },

  aiButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // -------------------------------------------------------
  // IMAGE PREVIEWS
  // -------------------------------------------------------

  imagePreviewRow: {
    gap: 12,
    paddingVertical: 4,
    paddingRight: 4,
    marginBottom: 10,
  },

  imagePreviewCard: {
    width: 145,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0ddd7",
    backgroundColor: "#faf8f3",
    padding: 7,
  },

  productImage: {
    width: 129,
    height: 129,
    borderRadius: 10,
    backgroundColor: "#eeeae2",
  },

  imageNumberBadge: {
    position: "absolute",
    top: 13,
    left: 13,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "rgba(41,40,36,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },

  imageNumberText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },

  imageRemoveButton: {
    minHeight: 32,
    marginTop: 7,
    borderRadius: 8,
    backgroundColor: "#fff1f0",
    alignItems: "center",
    justifyContent: "center",
  },

  imageRemoveText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#b42318",
  },

  // -------------------------------------------------------
  // GENERAL LIST
  // -------------------------------------------------------

  list: {
    gap: 8,
  },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e0ddd7",
    borderRadius: 11,
    padding: 11,
    marginBottom: 8,
    backgroundColor: "#faf8f3",
  },

  listItemContent: {
    flex: 1,
  },

  listItemTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#403d38",
  },

  listItemUrl: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#777169",
  },

  removeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b42318",
  },

  // -------------------------------------------------------
  // CATEGORIES
  // -------------------------------------------------------

  categoryCreateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  categoryInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    borderRadius: 11,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#292824",
  },

  smallButton: {
    minWidth: 62,
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: "#292824",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  smallButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  categoryScrollContainer: {
    height: 230,
    borderWidth: 1,
    borderColor: "#e0ddd7",
    borderRadius: 12,
    backgroundColor: "#faf8f3",
    overflow: "hidden",
  },

  categoryList: {
    padding: 8,
    gap: 8,
  },

  categoryItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0ddd7",
    borderRadius: 11,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },

  categoryItemSelected: {
    backgroundColor: "#faf5e9",
    borderColor: "#cbb98e",
  },

  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: "#bcb7af",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  checkboxSelected: {
    backgroundColor: "#806638",
    borderColor: "#806638",
  },

  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },

  categoryName: {
    flex: 1,
    fontSize: 13,
    color: "#403d38",
  },

  // -------------------------------------------------------
  // SWITCHES
  // -------------------------------------------------------

  switchRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ebe7df",
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

  // -------------------------------------------------------
  // ACTIONS
  // -------------------------------------------------------

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
