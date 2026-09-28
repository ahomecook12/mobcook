import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { STORE } from "@/constants/store";
import { supabase } from "@/lib/supabase";

type SocialLink = {
  id: string;
  name: string;
  url: string;
  icon_url: string;
};

export default function SocialScreen() {
  const router = useRouter();

  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------
  // CONTACT FORM
  // ---------------------------------------------------------

  const [contactOpen, setContactOpen] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const [sending, setSending] = useState(false);

  // ---------------------------------------------------------
  // LOAD SOCIAL LINKS
  // ---------------------------------------------------------

  useEffect(() => {
    loadSocialLinks();
  }, []);

  async function loadSocialLinks() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("storefront_settings")
        .select("social_enabled, social_links")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data?.social_enabled) {
        setSocialLinks([]);
        return;
      }

      const links = Array.isArray(data.social_links)
        ? (data.social_links as SocialLink[])
        : [];

      setSocialLinks(
        links.filter((link) => link.url?.trim()),
      );
    } catch (error) {
      console.error("Load social links error:", error);
      setSocialLinks([]);
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // OPEN SOCIAL LINK
  // ---------------------------------------------------------

async function openSocialLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.error("Open social link error:", error);

    Alert.alert(
      "Unable to open link",
      "Could not open this social media link.",
    );
  }
}

    // ---------------------------------------------------------
  // CONTACT FORM
  // ---------------------------------------------------------

async function sendMessage() {
  if (!name.trim()) {
    Alert.alert("Contact Us", "Please enter your name.");
    return;
  }

  if (!email.trim()) {
    Alert.alert("Contact Us", "Please enter your email address.");
    return;
  }

  if (!message.trim()) {
    Alert.alert("Contact Us", "Please enter a message.");
    return;
  }

  setSending(true);

  try {
    const apiUrl = process.env.EXPO_PUBLIC_WEB_API_URL;

    if (!apiUrl) {
      throw new Error("Contact service is not configured.");
    }

    const response = await fetch(`${apiUrl}/api/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        subject: `Message from ${STORE.name}`,
        message: message.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Contact API response:", response.status, data);

      throw new Error(
        data?.error || "Could not send your message.",
      );
    }

    Alert.alert(
      "Message sent ❤️",
      "Your message has been sent successfully. Thank you!",
      [
        {
          text: "OK",
          onPress: () => {
            setName("");
            setEmail("");
            setMessage("");
            setContactOpen(false);
          },
        },
      ],
    );
  } catch (error) {
    console.error("Contact form error:", error);

    Alert.alert(
      "Message not sent",
      error instanceof Error
        ? error.message
        : "Sorry, your message could not be sent. Please try again.",
    );
  } finally {
    setSending(false);
  }
}
  // ---------------------------------------------------------
  // LOADING
  // ---------------------------------------------------------

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
            Loading social links...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------
  // PAGE
  // ---------------------------------------------------------

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Stay Connected</Text>

          <Text style={styles.subtitle}>
            Follow {STORE.name} or get in touch with us
            directly.
          </Text>
        </View>

        {/* SOCIAL LINKS */}

        {socialLinks.length > 0 ? (
          <View style={styles.linksContainer}>
            {socialLinks.map((link) => (
              <Pressable
                key={link.id}
                style={({ pressed }) => [
                  styles.socialCard,
                  pressed && styles.socialCardPressed,
                ]}
                onPress={() => openSocialLink(link.url)}
              >
                {/* ICON */}

                <View style={styles.iconRing}>
                  {link.icon_url ? (
                    <Image
                      source={{
                        uri: link.icon_url,
                      }}
                      style={styles.socialIcon}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={styles.socialIconPlaceholder}
                    >
                      <Text
                        style={
                          styles.socialIconPlaceholderText
                        }
                      >
                        {link.name
                          ?.charAt(0)
                          ?.toUpperCase() || "✦"}
                      </Text>
                    </View>
                  )}
                </View>

                {/* TEXT */}

                <View style={styles.socialText}>
                  <Text style={styles.socialName}>
                    {link.name || "Social Media"}
                  </Text>

                  <Text
                    style={styles.socialUrl}
                    numberOfLines={1}
                  >
                    {link.url}
                  </Text>
                </View>

                <Text style={styles.arrow}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* CONTACT US */}

        <Pressable
          style={({ pressed }) => [
            styles.contactCard,
            pressed && styles.socialCardPressed,
          ]}
          onPress={() => setContactOpen(true)}
        >
          <View style={styles.contactIcon}>
            <Text style={styles.contactIconText}>✉</Text>
          </View>

          <View style={styles.socialText}>
            <Text style={styles.socialName}>
              Contact Us
            </Text>

            <Text style={styles.contactDescription}>
              Having trouble or have a question? Send us a
              message.
            </Text>
          </View>

          <Text style={styles.arrow}>›</Text>
        </Pressable>

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {STORE.name}
          </Text>

          <Text style={styles.footerSubtext}>
            Beautiful things, thoughtfully brought together
            for you.
          </Text>
        </View>
      </ScrollView>

      {/* =====================================================
          CONTACT MODAL
      ====================================================== */}



      <Modal
        visible={contactOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!sending) {
            setContactOpen(false);
          }
        }}
      >
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScrollContent}
              >
                {/* MODAL HEADER */}

                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderText}>
                    <Text style={styles.modalEyebrow}>
                      GET IN TOUCH
                    </Text>

                    <Text style={styles.modalTitle}>
                      Contact Us
                    </Text>
                  </View>

                  <Pressable
                    style={styles.closeButton}
                    onPress={() => {
                      if (!sending) {
                        setContactOpen(false);
                      }
                    }}
                    disabled={sending}
                  >
                    <Text style={styles.closeText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={styles.modalDescription}>
                  Having trouble with WhatsApp, phone, or anything
                  else? Send us a message and we'll get back to
                  you.
                </Text>

                {/* NAME */}

                <View style={styles.field}>
                  <Text style={styles.label}>Name</Text>

                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor="#aaa49a"
                    autoCapitalize="words"
                    editable={!sending}
                    style={styles.input}
                  />
                </View>

                {/* EMAIL */}

                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>

                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor="#aaa49a"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!sending}
                    style={styles.input}
                  />
                </View>

                {/* MESSAGE */}

                <View style={styles.field}>
                  <Text style={styles.label}>Message</Text>

                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="How can we help?"
                    placeholderTextColor="#aaa49a"
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    editable={!sending}
                    style={[
                      styles.input,
                      styles.messageInput,
                    ]}
                  />
                </View>

                {/* BUTTONS */}

                <View style={styles.modalActions}>
                  <Pressable
                    style={[
                      styles.cancelButton,
                      sending && styles.disabledButton,
                    ]}
                    onPress={() => setContactOpen(false)}
                    disabled={sending}
                  >
                    <Text style={styles.cancelText}>
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.sendButton,
                      sending && styles.disabledSendButton,
                    ]}
                    onPress={sendMessage}
                    disabled={sending}
                  >
                    {sending ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.sendText}>
                        Send Message
                      </Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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

  header: {
    marginBottom: 24,
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
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    color: "#716d66",
  },

  linksContainer: {
    gap: 12,
  },

  socialCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf9",
  },

  socialCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },

  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 2,
    backgroundColor: "#806638",
  },

  socialIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#faf8f3",
  },

  socialIconPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eee7da",
  },

  socialIconPlaceholderText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6d5630",
  },

  socialText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },

  socialName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#403d38",
  },

  socialUrl: {
    marginTop: 4,
    fontSize: 11,
    color: "#888177",
  },

  arrow: {
    fontSize: 28,
    fontWeight: "300",
    color: "#806638",
    marginRight: 2,
  },

  contactCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d8d5cf",
    backgroundColor: "#fffdf9",
  },

  contactIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eee7da",
    borderWidth: 1,
    borderColor: "#d1c5ad",
  },

  contactIconText: {
    fontSize: 25,
    color: "#6d5630",
  },

  contactDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: "#888177",
  },

  footer: {
    alignItems: "center",
    marginTop: 36,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e3dfd7",
  },

  footerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#514d47",
  },

  footerSubtext: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    color: "#888177",
  },

  // --------------------------------------------------------
  // MODAL
  // --------------------------------------------------------

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 20,
  },
  keyboardAvoidingView: {
    flex: 1,
  },

  modalScrollContent: {
    paddingBottom: 10,
  },
  modalCard: {
    maxHeight: "90%",
    width: "100%",
    borderRadius: 20,
    backgroundColor: "#fffdf9",
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  modalHeaderText: {
    flex: 1,
  },

  modalEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    color: STORE.colors.primary,
    letterSpacing: 1,
  },

  modalTitle: {
    marginTop: 3,
    fontSize: 24,
    fontWeight: "700",
    color: "#292824",
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1eee8",
  },

  closeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#514d47",
  },

  modalDescription: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 20,
    color: "#777169",
  },

  field: {
    marginTop: 15,
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

  messageInput: {
    minHeight: 115,
    textAlignVertical: "top",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },

  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d1cdc5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },

  cancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#514d47",
  },

  sendButton: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#292824",
  },

  sendText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },

  disabledButton: {
    opacity: 0.5,
  },

  disabledSendButton: {
    opacity: 0.7,
  },
});
