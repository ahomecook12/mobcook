import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { STORE, STORE_LOCALE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

const CLOUDINARY_DISABLE_AT = 95;

const WEB_API_URL =
  process.env.EXPO_PUBLIC_WEB_API_URL;

type UsageResponse = {
  usagePercent: number;
  imagesEnabled: boolean;
  automaticallyDisabled: boolean;
  canEnable: boolean;
  disableAt: number;
  checkedAt: string;
  error?: string;
};

export default function CloudinaryAdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [usagePercent, setUsagePercent] = useState(0);
  const [imagesEnabled, setImagesEnabled] =
    useState(true);
  const [checkedAt, setCheckedAt] = useState<
    string | null
  >(null);

  const [refreshing, setRefreshing] =
    useState(false);
  const [changingStatus, setChangingStatus] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const atSafetyLimit =
    usagePercent >= CLOUDINARY_DISABLE_AT;

  useEffect(() => {
    loadSettings();
  }, []);

  /* =========================================================
     LOAD STORED SETTINGS
     ========================================================= */

  async function loadSettings() {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/auth/login");
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
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

      const { data: settings, error: settingsError } =
        await supabase
          .from("site_settings")
          .select(
            "cloudinary_images_enabled, cloudinary_usage_percent, cloudinary_usage_checked_at",
          )
          .eq("id", true)
          .maybeSingle();

      if (settingsError) {
        throw settingsError;
      }

      setUsagePercent(
        Number(
          settings?.cloudinary_usage_percent ?? 0,
        ),
      );

      setImagesEnabled(
        settings?.cloudinary_images_enabled ?? true,
      );

      setCheckedAt(
        settings?.cloudinary_usage_checked_at ??
          null,
      );
    } catch (loadError) {
      console.log(
        "Cloudinary settings load error:",
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load Cloudinary settings.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     GET ACCESS TOKEN
     ========================================================= */

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;

    if (!accessToken) {
      throw new Error(
        "Your login session has expired. Please log in again.",
      );
    }

    return accessToken;
  }

  /* =========================================================
     REFRESH CLOUDINARY USAGE
     ========================================================= */

  async function refreshUsage() {
    try {
      setRefreshing(true);
      setError("");
      setMessage("");

      if (!WEB_API_URL) {
        throw new Error(
          "EXPO_PUBLIC_WEB_API_URL is not configured.",
        );
      }

      const accessToken = await getAccessToken();

      const response = await fetch(
        `${WEB_API_URL}/api/admin/cloudinary/usage`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data =
        (await response.json()) as UsageResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to refresh Cloudinary usage.",
        );
      }

      setUsagePercent(
        Number(data.usagePercent ?? 0),
      );

      setImagesEnabled(data.imagesEnabled);

      setCheckedAt(data.checkedAt);

      if (data.automaticallyDisabled) {
        setMessage(
          `Cloudinary image delivery was automatically disabled because usage reached ${Number(
            data.usagePercent,
          ).toFixed(2)}%.`,
        );
      } else {
        setMessage(
          "Cloudinary usage refreshed.",
        );
      }
    } catch (refreshError) {
      console.log(
        "Cloudinary usage refresh error:",
        refreshError,
      );

      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh Cloudinary usage.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  /* =========================================================
     ENABLE / DISABLE CLOUDINARY IMAGES
     ========================================================= */

  async function changeImageStatus(
    enabled: boolean,
  ) {
    if (enabled && atSafetyLimit) {
      setError(
        `Cloudinary images cannot be enabled while usage is ${CLOUDINARY_DISABLE_AT}% or higher.`,
      );

      return;
    }

    try {
      setChangingStatus(true);
      setError("");
      setMessage("");

      if (!WEB_API_URL) {
        throw new Error(
          "EXPO_PUBLIC_WEB_API_URL is not configured.",
        );
      }

      const accessToken = await getAccessToken();

      const response = await fetch(
        `${WEB_API_URL}/api/admin/cloudinary/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            enabled,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to change Cloudinary image status.",
        );
      }

      setImagesEnabled(data.imagesEnabled);

      if (data.usagePercent != null) {
        setUsagePercent(
          Number(data.usagePercent),
        );
      }

      if (data.checkedAt) {
        setCheckedAt(data.checkedAt);
      }

      setMessage(
        data.imagesEnabled
          ? "Cloudinary image delivery is now enabled."
          : "Cloudinary image delivery is now disabled.",
      );
    } catch (statusError) {
      console.log(
        "Cloudinary status update error:",
        statusError,
      );

      setError(
        statusError instanceof Error
          ? statusError.message
          : "Failed to change Cloudinary image status.",
      );
    } finally {
      setChangingStatus(false);
    }
  }

  /* =========================================================
     DATE
     ========================================================= */

  function formatCheckedAt(
    value: string | null,
  ) {
    if (!value) {
      return "Not checked yet";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return date.toLocaleString(STORE_LOCALE, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={["bottom"]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={STORE.colors.primary}
          />

          <Text style={styles.loadingText}>
            Loading Cloudinary settings...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const progressWidth = Math.min(
    Math.max(usagePercent, 0),
    100,
  );

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>
            ← Back to Admin
          </Text>
        </Pressable>

        <View style={styles.pageHeader}>
          <Text style={styles.title}>
            Cloudinary
          </Text>

          <Text style={styles.subtitle}>
            Monitor Cloudinary usage and control
            image delivery for your shop.
          </Text>
        </View>

        {/* =================================================
            USAGE
            ================================================= */}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Cloudinary Usage
          </Text>

          <Text style={styles.label}>
            Current usage
          </Text>

          <Text style={styles.usage}>
            {usagePercent.toFixed(2)}%
          </Text>

          <Pressable
            style={[
              styles.outlineButton,
              (refreshing || changingStatus) &&
                styles.disabledButton,
            ]}
            onPress={refreshUsage}
            disabled={
              refreshing || changingStatus
            }
          >
            {refreshing ? (
              <ActivityIndicator
                color={STORE.colors.primary}
              />
            ) : (
              <Text
                style={styles.outlineButtonText}
              >
                Refresh Usage
              </Text>
            )}
          </Pressable>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressWidth}%`,
                },
              ]}
            />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.smallText}>
              0%
            </Text>

            <Text style={styles.smallText}>
              Automatic shutdown at{" "}
              {CLOUDINARY_DISABLE_AT}%
            </Text>

            <Text style={styles.smallText}>
              100%
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              <Text style={styles.infoStrong}>
                Last checked:{" "}
              </Text>

              {formatCheckedAt(checkedAt)}
            </Text>
          </View>
        </View>

        {/* =================================================
            IMAGE DELIVERY
            ================================================= */}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Image Delivery
          </Text>

          <View
            style={[
              styles.statusBox,
              imagesEnabled
                ? styles.enabledBox
                : atSafetyLimit
                  ? styles.dangerBox
                  : styles.disabledBox,
            ]}
          >
            <Text style={styles.statusIcon}>
              {imagesEnabled
                ? "🟢"
                : atSafetyLimit
                  ? "🔴"
                  : "⚪"}
            </Text>

            <View style={styles.statusContent}>
              <Text style={styles.statusTitle}>
                {imagesEnabled
                  ? "Cloudinary images are enabled"
                  : atSafetyLimit
                    ? "Cloudinary images are automatically disabled"
                    : "Cloudinary images are disabled"}
              </Text>

              <Text
                style={styles.statusDescription}
              >
                {imagesEnabled
                  ? "Customers can currently load Cloudinary images."
                  : atSafetyLimit
                    ? `Usage is ${usagePercent.toFixed(
                        2,
                      )}%. Images cannot be enabled until usage falls below ${CLOUDINARY_DISABLE_AT}%.`
                    : "Cloudinary images will not be requested by the storefront."}
              </Text>
            </View>
          </View>

          <View style={styles.protectionBox}>
            <Text style={styles.protectionTitle}>
              Automatic protection
            </Text>

            <Text
              style={styles.protectionDescription}
            >
              When Cloudinary reports usage at{" "}
              {CLOUDINARY_DISABLE_AT}% or
              higher, image delivery is
              automatically switched off. It will
              not automatically switch back on
              when usage falls. You decide when to
              enable it again.
            </Text>
          </View>

          {imagesEnabled ? (
            <Pressable
              style={[
                styles.dangerButton,
                (changingStatus ||
                  refreshing) &&
                  styles.disabledButton,
              ]}
              onPress={() =>
                changeImageStatus(false)
              }
              disabled={
                changingStatus || refreshing
              }
            >
              {changingStatus ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  style={styles.dangerButtonText}
                >
                  Disable Cloudinary Images
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.primaryButton,
                (changingStatus ||
                  refreshing ||
                  atSafetyLimit) &&
                  styles.disabledButton,
              ]}
              onPress={() =>
                changeImageStatus(true)
              }
              disabled={
                changingStatus ||
                refreshing ||
                atSafetyLimit
              }
            >
              {changingStatus ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  style={styles.primaryButtonText}
                >
                  {atSafetyLimit
                    ? `Cannot Enable at ${CLOUDINARY_DISABLE_AT}%+`
                    : "Enable Cloudinary Images"}
                </Text>
              )}
            </Pressable>
          )}

          {message ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>
                {message}
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
   ========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: STORE.colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
    color: STORE.colors.mutedText,
  },

  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },

  backText: {
    fontSize: 14,
    color: STORE.colors.mutedText,
  },

  pageHeader: {
    marginTop: 12,
    marginBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: STORE.colors.text,
  },

  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    color: STORE.colors.mutedText,
  },

  card: {
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 18,
    backgroundColor: STORE.colors.surface,
    padding: 18,
    marginBottom: 18,
  },

  cardTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: STORE.colors.text,
    marginBottom: 20,
  },

  label: {
    fontSize: 13,
    color: STORE.colors.mutedText,
  },

  usage: {
    marginTop: 4,
    fontSize: 38,
    fontWeight: "700",
    color: STORE.colors.text,
  },

  outlineButton: {
    marginTop: 18,
    minHeight: 46,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: STORE.colors.surface,
  },

  outlineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: STORE.colors.text,
  },

  progressBackground: {
    marginTop: 22,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#ece8df",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: STORE.colors.primary,
  },

  progressLabels: {
    marginTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  smallText: {
    fontSize: 10,
    color: STORE.colors.mutedText,
  },

  infoBox: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 12,
    backgroundColor: "#faf8f2",
    padding: 13,
  },

  infoText: {
    fontSize: 13,
    color: STORE.colors.text,
  },

  infoStrong: {
    fontWeight: "600",
  },

  statusBox: {
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
  },

  enabledBox: {
    backgroundColor: "#eef9f0",
  },

  dangerBox: {
    backgroundColor: "#fff0f0",
  },

  disabledBox: {
    backgroundColor: "#f6f4ef",
  },

  statusIcon: {
    fontSize: 20,
    marginRight: 11,
  },

  statusContent: {
    flex: 1,
  },

  statusTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: STORE.colors.text,
  },

  statusDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 18,
    color: STORE.colors.mutedText,
  },

  protectionBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 12,
    padding: 14,
  },

  protectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: STORE.colors.text,
  },

  protectionDescription: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 19,
    color: STORE.colors.mutedText,
  },

  primaryButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: STORE.colors.primary,
    paddingHorizontal: 14,
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },

  dangerButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#b42318",
    paddingHorizontal: 14,
  },

  dangerButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },

  disabledButton: {
    opacity: 0.5,
  },

  messageBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 12,
    backgroundColor: "#f6f4ef",
    padding: 13,
  },

  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: STORE.colors.text,
  },

  errorBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e4a5a5",
    borderRadius: 12,
    backgroundColor: "#fff0f0",
    padding: 13,
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#a61b1b",
  },
});