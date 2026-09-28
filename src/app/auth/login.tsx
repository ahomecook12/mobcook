import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";

import { supabase } from "@/lib/supabase";
import { STORE } from "@/constants/store";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /*
   * Mobile OAuth callback.
   *
   * Because app.json contains:
   *
   * "scheme": "arunaskitchen"
   *
   * this becomes:
   *
   * arunaskitchen://auth/callback
   */
  // const redirectTo = makeRedirectUri({
  //   scheme: "arunaskitchen",
  //   path: "auth/callback",
  // });
const redirectTo = "arunaskitchen://auth/callback";
  /* =========================================================
     EMAIL / PASSWORD LOGIN
     ========================================================= */

  async function handleLogin() {
    setError("");
    setSuccess("");

    const cleanEmail = email.trim();

    if (!cleanEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (loginError) {
        throw loginError;
      }

      setSuccess("Login successful.");

      setTimeout(() => {
        router.replace("/");
      }, 400);
    } catch (err: any) {
      console.error("Login error:", err);

      setError(
        err?.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     GOOGLE OAUTH
     ========================================================= */

  
async function handleGoogleLogin() {
  setError("");
  setSuccess("");

  try {
    setGoogleLoading(true);

    const { data, error: oauthError } =
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

   // console.log("ACTUAL REDIRECT TO:", redirectTo);
    //console.log("SUPABASE OAUTH URL:", data?.url);

    if (oauthError) {
      throw oauthError;
    }

    if (!data?.url) {
      throw new Error("Unable to start Google sign in.");
    }

    const result =
      await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

   // console.log("OAuth browser result:", result);

    if (result.type !== "success" || !result.url) {
      if (result.type === "cancel") {
        setError("Google sign in was cancelled.");
      }

      return;
    }

    const callbackUrl = result.url;

    //console.log(      "Google OAuth callback URL:",      callbackUrl,    );

    /*
     * -------------------------------------------------------
     * PKCE CALLBACK
     * -------------------------------------------------------
     *
     * Current callback:
     *
     * arunaskitchen://auth/callback?code=XXXXXXXX
     *
     * We must exchange this code for the Supabase session.
     */

    const parsedUrl = new URL(callbackUrl);

    const code = parsedUrl.searchParams.get("code");

    if (!code) {
      throw new Error(
        "Google sign in returned no authentication code.",
      );
    }

    //console.log(      "Google OAuth code received. Exchanging for session...",    );

    const {
      data: sessionData,
      error: sessionError,
    } =
      await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.session) {
      throw new Error(
        "Google sign in completed, but no session was created.",
      );
    }

    //console.log(      "Google session established successfully.",    );

    setSuccess("Login successful.");

    setTimeout(() => {
      router.replace("/");
    }, 400);
  } catch (err: any) {
    console.error(
      "========== GOOGLE LOGIN ERROR ==========",
    );
    console.error("ERROR OBJECT:", err);
    console.error("ERROR MESSAGE:", err?.message);
    console.error("ERROR STACK:", err?.stack);
    console.error(
      "========================================",
    );

    setError(
      err?.message ||
        "Unable to sign in with Google. Please try again.",
    );
  } finally {
    setGoogleLoading(false);
  }
}


  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* =================================================
              SHOP NAME
              ================================================= */}

          <View style={styles.brandSection}>
            <Text style={styles.brandName}>
              {STORE.name}
            </Text>

            <View style={styles.goldLine} />
          </View>

          {/* =================================================
              LOGIN CARD
              ================================================= */}

          <View style={styles.card}>
            <Text style={styles.title}>
              Welcome back
            </Text>

            <Text style={styles.subtitle}>
              Sign in to your account
            </Text>

            {/* =================================================
                EMAIL
                ================================================= */}

            <View style={styles.field}>
              <Text style={styles.label}>
                Email
              </Text>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={
                  STORE.colors.mutedText
                }
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                editable={!loading && !googleLoading}
              />
            </View>

            {/* =================================================
                PASSWORD
                ================================================= */}

            <View style={styles.field}>
              <Text style={styles.label}>
                Password
              </Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={
                  STORE.colors.mutedText
                }
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                style={styles.input}
                editable={!loading && !googleLoading}
              />
            </View>

            {/* =================================================
                ERROR
                ================================================= */}

            {error ? (
              <View style={styles.messageBox}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* =================================================
                SUCCESS
                ================================================= */}

            {success ? (
              <View style={styles.messageBox}>
                <Text style={styles.successText}>
                  {success}
                </Text>
              </View>
            ) : null}

            {/* =================================================
                SIGN IN
                ================================================= */}

            <Pressable
              onPress={handleLogin}
              disabled={loading || googleLoading}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.buttonPressed,
                (loading || googleLoading) &&
                  styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator
                  color={STORE.colors.surface}
                />
              ) : (
                <Text style={styles.loginButtonText}>
                  Sign in
                </Text>
              )}
            </Pressable>

            {/* =================================================
                FORGOT PASSWORD
                ================================================= */}

            <Pressable
              onPress={() =>
                router.push("/auth/forgot-password")
              }
              disabled={loading || googleLoading}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>
                Forgot password?
              </Text>
            </Pressable>

            {/* =================================================
                DIVIDER
                ================================================= */}

            <View style={styles.dividerRow}>
              <View style={styles.divider} />

              <Text style={styles.dividerText}>
                OR
              </Text>

              <View style={styles.divider} />
            </View>

            {/* =================================================
                GOOGLE
                ================================================= */}

            <Pressable
              onPress={handleGoogleLogin}
              disabled={loading || googleLoading}
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.buttonPressed,
                (loading || googleLoading) &&
                  styles.buttonDisabled,
              ]}
            >
              {googleLoading ? (
                <ActivityIndicator
                  color={STORE.colors.text}
                />
              ) : (
                <>
                  <Text style={styles.googleG}>
                    G
                  </Text>

                  <Text style={styles.googleButtonText}>
                    Continue with Google
                  </Text>
                </>
              )}
            </Pressable>

            {/* =================================================
                CREATE ACCOUNT
                ================================================= */}

            <View style={styles.signupRow}>
              <Text style={styles.signupText}>
                Don't have an account?
              </Text>

              <Pressable
                onPress={() =>
                  router.push("/auth/signup")
                }
                disabled={loading || googleLoading}
              >
                <Text style={styles.signupLink}>
                  Create account
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

  keyboardView: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 35,
    justifyContent: "center",
  },

  brandSection: {
    alignItems: "center",
    marginBottom: 28,
  },

  brandName: {
    fontSize: 27,
    fontWeight: "700",
    color: STORE.colors.text,
    textAlign: "center",
  },

  goldLine: {
    width: 55,
    height: 3,
    borderRadius: 3,
    backgroundColor: STORE.colors.primary,
    marginTop: 10,
  },

  card: {
    backgroundColor: STORE.colors.surface,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 22,
    padding: 24,
  },

  title: {
    fontSize: 27,
    fontWeight: "700",
    color: STORE.colors.text,
  },

  subtitle: {
    fontSize: 15,
    color: STORE.colors.mutedText,
    marginTop: 6,
    marginBottom: 26,
  },

  field: {
    marginBottom: 18,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: STORE.colors.text,
    marginBottom: 7,
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    borderRadius: 12,
    backgroundColor: STORE.colors.background,
    paddingHorizontal: 15,
    fontSize: 15,
    color: STORE.colors.text,
  },

  messageBox: {
    marginBottom: 16,
  },

  errorText: {
    fontSize: 14,
    color: "#B3261E",
    lineHeight: 20,
  },

  successText: {
    fontSize: 14,
    color: "#287A3E",
    lineHeight: 20,
  },

  loginButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: STORE.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  loginButtonText: {
    color: STORE.colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  linkButton: {
    alignSelf: "center",
    marginTop: 18,
  },

  linkText: {
    fontSize: 14,
    color: STORE.colors.primary,
    fontWeight: "600",
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 22,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: STORE.colors.border,
  },

  dividerText: {
    fontSize: 12,
    color: STORE.colors.mutedText,
    marginHorizontal: 12,
    fontWeight: "600",
  },

  googleButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STORE.colors.border,
    backgroundColor: STORE.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  googleG: {
    fontSize: 19,
    fontWeight: "700",
    color: "#4285F4",
    marginRight: 10,
  },

  googleButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: STORE.colors.text,
  },

  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 25,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: STORE.colors.border,
  },

  signupText: {
    fontSize: 14,
    color: STORE.colors.mutedText,
  },

  signupLink: {
    fontSize: 14,
    color: STORE.colors.primary,
    fontWeight: "700",
    marginLeft: 5,
  },
});