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

import { supabase } from "@/lib/supabase";
import { STORE } from "@/constants/store";

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleForgotPassword() {
    setError("");
    setSuccess("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              "arunaskitchen://auth/reset-password",
          },
        );

      if (resetError) {
        throw resetError;
      }

      setSuccess(
        "If an account exists for this email, we have sent a password reset link. Please check your inbox.",
      );
    } catch (err: any) {
      console.error(
        "Password reset error:",
        err,
      );

      setError(
        err?.message ||
          "Unable to send the password reset email. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={
          Platform.OS === "ios" ? 0 : 20
        }
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandSection}>
            <Text style={styles.brandName}>
              {STORE.name}
            </Text>

            <View style={styles.goldLine} />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>
              Forgot your password?
            </Text>

            <Text style={styles.subtitle}>
              Enter your email address and we'll send you
              a link to reset your password.
            </Text>

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
                returnKeyType="done"
                style={styles.input}
                editable={!loading}
              />
            </View>

            {error ? (
              <View style={styles.messageBox}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.messageBox}>
                <Text style={styles.successText}>
                  {success}
                </Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleForgotPassword}
              disabled={loading}
              style={({ pressed }) => [
                styles.resetButton,
                pressed &&
                  styles.buttonPressed,
                loading &&
                  styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator
                  color={STORE.colors.surface}
                />
              ) : (
                <Text
                  style={
                    styles.resetButtonText
                  }
                >
                  Send reset link
                </Text>
              )}
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>
                Remember your password?
              </Text>

              <Pressable
                onPress={() =>
                  router.replace("/auth/login")
                }
                disabled={loading}
              >
                <Text style={styles.loginLink}>
                  Sign in
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
    lineHeight: 21,
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

  resetButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: STORE.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  resetButtonText: {
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

  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 25,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: STORE.colors.border,
  },

  loginText: {
    fontSize: 14,
    color: STORE.colors.mutedText,
  },

  loginLink: {
    fontSize: 14,
    color: STORE.colors.primary,
    fontWeight: "700",
    marginLeft: 5,
  },
});