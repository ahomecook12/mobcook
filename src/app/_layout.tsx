import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import SiteHeader from "@/components/SiteHeader";
import { supabase } from "@/lib/supabase";

SplashScreen.preventAutoHideAsync();

/*
 * =========================================================
 * NOTIFICATION NAVIGATION
 * =========================================================
 */

function useNotificationObserver() {
  useEffect(() => {
    let mounted = true;

    const handleNotification = (notification: Notifications.Notification) => {
      if (!mounted) {
        return;
      }

      const data = notification.request.content.data as
        | {
            order_id?: unknown;
            product_id?: unknown;
            type?: unknown;
          }
        | undefined;

      /*
       * -----------------------------------------------------
       * ORDER NOTIFICATION
       * -----------------------------------------------------
       */

      if (typeof data?.order_id === "string" && data.order_id.length > 0) {
        const isAdminNotification =
          typeof data?.type === "string" && data.type.startsWith("admin_");

        setTimeout(() => {
          if (!mounted) {
            return;
          }

          if (isAdminNotification) {
            router.push({
              pathname: "/admin/order/[id]",
              params: {
                id: data.order_id as string,
              },
            });
          } else {
            router.push({
              pathname: "/orders/[id]",
              params: {
                id: data.order_id as string,
              },
            });
          }
        }, 300);

        return;
      }

      /*
       * -----------------------------------------------------
       * PRODUCT NOTIFICATION
       * -----------------------------------------------------
       */

      if (typeof data?.product_id === "string" && data.product_id.length > 0) {
        setTimeout(() => {
          if (!mounted) {
            return;
          }

          router.push({
            pathname: "/product/[id]",
            params: {
              id: data.product_id as string,
            },
          });
        }, 300);
      }
    };

    /*
     * -------------------------------------------------------
     * APP ALREADY RUNNING / BACKGROUND
     * -------------------------------------------------------
     */

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotification(response.notification);
      });

    /*
     * -------------------------------------------------------
     * APP COMPLETELY CLOSED
     * -------------------------------------------------------
     */

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!mounted || !response) {
          return;
        }

        handleNotification(response.notification);

        void Notifications.clearLastNotificationResponseAsync();
      })
      .catch((error) => {
        console.log("Unable to read last notification response:", error);
      });

    /*
     * -------------------------------------------------------
     * CLEANUP
     * -------------------------------------------------------
     */

    return () => {
      mounted = false;
      responseSubscription.remove();
    };
  }, []);
}

/*
 * =========================================================
 * SUPABASE PASSWORD RESET DEEP LINK
 * =========================================================
 *
 * Expected URL:
 *
 * arunaskitchen://auth/reset-password?code=XXXXXXXX
 *
 * The code must be exchanged for a Supabase session before
 * ResetPasswordScreen calls getSession().
 */

function useSupabaseDeepLinkObserver() {
  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string) {
      try {
        const cleanUrl = url.trim();

        if (!cleanUrl) {
          return;
        }

        const parsedUrl = new URL(cleanUrl);
        const path =
          (parsedUrl.pathname || "").replace(/^\/+/, "").replace(/\/+$/, "") ||
          "";

        const queryParams = Object.fromEntries(
          parsedUrl.searchParams.entries(),
        );

        const hash = parsedUrl.hash.startsWith("#")
          ? parsedUrl.hash.slice(1)
          : parsedUrl.hash;

        const hashParams = new URLSearchParams(hash);

        const allParams = {
          ...Object.fromEntries(hashParams.entries()),
          ...queryParams,
        };

        const code = typeof allParams.code === "string" ? allParams.code : null;

        const token =
          typeof allParams.token === "string"
            ? allParams.token
            : typeof allParams.token_hash === "string"
              ? allParams.token_hash
              : null;

        const type = typeof allParams.type === "string" ? allParams.type : null;

        const emailFromQuery =
          typeof allParams.email === "string" ? allParams.email : null;

        const redirectTo =
          typeof allParams.redirect_to === "string"
            ? allParams.redirect_to
            : typeof allParams.redirectTo === "string"
              ? allParams.redirectTo
              : null;

        const redirectToParams = (() => {
          if (!redirectTo) {
            return new URLSearchParams();
          }

          try {
            const redirectUrl = new URL(redirectTo);
            return new URLSearchParams(redirectUrl.search || "");
          } catch {
            return new URLSearchParams(
              redirectTo.includes("?") ? redirectTo.split("?")[1] || "" : "",
            );
          }
        })();

        const email = emailFromQuery || redirectToParams.get("email") || null;

        const accessToken =
          typeof allParams.access_token === "string"
            ? allParams.access_token
            : null;

        const refreshToken =
          typeof allParams.refresh_token === "string"
            ? allParams.refresh_token
            : null;

        /*
         * =====================================================
         * PASSWORD RESET
         * =====================================================
         */

        const isRecoveryLink =
          path === "auth/reset-password" ||
          path === "reset-password" ||
          type === "recovery" ||
          (redirectTo && redirectTo.includes("auth/reset-password"));

        if (isRecoveryLink) {
          if (code) {
            const { data, error } =
              await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              console.error("Password reset code exchange failed:", error);
              return;
            }

            if (!mounted) {
              return;
            }

            if (!data.session) {
              console.error(
                "Password reset exchange completed but no session was returned.",
              );
              return;
            }

            router.replace("/auth/reset-password");
            return;
          }

          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("Password reset token session failed:", error);
              return;
            }

            if (!mounted) {
              return;
            }

            if (!data.session) {
              console.error(
                "Password reset token exchange completed but no session was returned.",
              );
              return;
            }

            router.replace("/auth/reset-password");
            return;
          }

          if (token && type === "recovery") {
            if (!email) {
              console.error(
                "Recovery token link is missing the email parameter; checking nested redirect parameters.",
              );
            }

            const recoveryEmail = email || "";

            if (!recoveryEmail) {
              console.error(
                "Recovery token link is missing the email parameter and cannot be verified.",
              );
              return;
            }

            const { data, error } = await supabase.auth.verifyOtp({
              type: "recovery",
              token,
              email: recoveryEmail,
            });

            if (error) {
              console.error("Password reset token verification failed:", error);
              return;
            }

            if (!mounted) {
              return;
            }

            if (!data.session) {
              console.error(
                "Recovery token verification completed but no session was returned.",
              );
              return;
            }

            router.replace("/auth/reset-password");
            return;
          }

          console.error(
            "Password reset deep link did not include a supported recovery payload.",
          );
          return;
        }

        /*
         * =====================================================
         * GOOGLE OAUTH
         * =====================================================
         *
         * Google is handled directly by login.tsx because
         * openAuthSessionAsync() returns the callback URL there.
         *
         * Therefore we deliberately do NOT process
         * auth/callback here.
         */

        if (path === "auth/callback") {
          console.log("OAuth callback received by RootLayout.");

          return;
        }

        if (code || token || accessToken) {
          console.log("Ignoring non-recovery deep link with auth parameters:", {
            path,
            type,
            hasCode: !!code,
            hasToken: !!token,
            hasAccessToken: !!accessToken,
          });

          return;
        }
      } catch (error) {
        console.error("Supabase deep link handling error:", error);
      }
    }

    /*
     * =====================================================
     * APP ALREADY RUNNING
     * =====================================================
     */

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    /*
     * =====================================================
     * APP OPENED FROM CLOSED STATE
     * =====================================================
     */

    Linking.getInitialURL()
      .then((url) => {
        if (!url) {
          return;
        }

        void handleUrl(url);
      })
      .catch((error) => {
        console.error("Unable to read initial deep link:", error);
      });

    /*
     * =====================================================
     * CLEANUP
     * =====================================================
     */

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
}

/*
 * =========================================================
 * ROOT LAYOUT
 * =========================================================
 */

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useNotificationObserver();
  useSupabaseDeepLinkObserver();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />

      <Stack
        screenOptions={{
          headerShown: true,
          header: () => <SiteHeader />,
        }}
      >
        <Stack.Screen name="(tabs)" />

        <Stack.Screen name="product/[id]" />
      </Stack>
    </ThemeProvider>
  );
}
