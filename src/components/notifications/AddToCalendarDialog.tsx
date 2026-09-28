import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarPlus, X } from "lucide-react-native";
import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import { STORE_LOCALE } from "@/constants/store";

type AddToCalendarDialogProps = {
  orderId: string;
  orderNumber: string;
  orderCreatedAt: string;
};

export default function AddToCalendarDialog({
  orderId,
  orderNumber,
  orderCreatedAt,
}: AddToCalendarDialogProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date>(new Date(orderCreatedAt));

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [startTime, setStartTime] = useState<Date>(() => {
    const created = new Date(orderCreatedAt);

    return Number.isNaN(created.getTime()) ? new Date() : created;
  });

  const [endTime, setEndTime] = useState<Date>(() => {
    const created = new Date(orderCreatedAt);

    if (Number.isNaN(created.getTime())) {
      return new Date(Date.now() + 60 * 60 * 1000);
    }

    return new Date(created.getTime() + 60 * 60 * 1000);
  });

  const openDialog = () => {
    const created = new Date(orderCreatedAt);

    if (!Number.isNaN(created.getTime())) {
      setDate(created);
      setStartTime(created);
      setEndTime(new Date(created.getTime() + 60 * 60 * 1000));
    }

    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setVisible(true);
  };

  const closeDialog = () => {
    setShowDatePicker(false);
    setShowStartPicker(false);
    setShowEndPicker(false);
    setVisible(false);
  };

  const handleAddToCalendar = async () => {
    if (endTime <= startTime) {
      Alert.alert("Invalid time", "End time must be later than start time.");
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      Alert.alert(
        "Not signed in",
        "Please sign in again before adding the order to Google Calendar.",
      );
      return;
    }
    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_WEB_API_URL}/api/auth/google-calendar/add`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            order_id: orderId,
            start: startTime.toISOString(),
            end: endTime.toISOString(),
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to add the order to Google Calendar.",
        );
      }

      Alert.alert(
        "Added to Google Calendar",
        `Order ${orderNumber} has been added to your Google Calendar.`,
        [
          {
            text: "Done",
            onPress: closeDialog,
          },
        ],
      );
    } catch (error) {
      console.error("Calendar event creation failed:", error);

      Alert.alert(
        "Unable to add to Google Calendar",
        error instanceof Error
          ? error.message
          : "Google Calendar could not create the event.",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: Date) => {
    return value.toLocaleDateString(STORE_LOCALE, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (value: Date) => {
    return value.toLocaleTimeString(STORE_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

 const updateDate = (selectedDate: Date | undefined) => {
  setShowDatePicker(false);

  if (!selectedDate) {
    return;
  }

  setDate(selectedDate);

  setStartTime((current) => {
    const updated = new Date(current);

    updated.setFullYear(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );

    return updated;
  });

  setEndTime((current) => {
    const updated = new Date(current);

    updated.setFullYear(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );

    return updated;
  });
};

  const updateStartTime = (selectedTime: Date | undefined) => {
    setShowStartPicker(false);

    if (!selectedTime) {
      return;
    }

    setStartTime(selectedTime);
  };

  const updateEndTime = (selectedTime: Date | undefined) => {
    setShowEndPicker(false);

    if (!selectedTime) {
      return;
    }

    setEndTime(selectedTime);
  };

  return (
    <>
      {/* OPEN BUTTON */}

      <Pressable
        onPress={openDialog}
        style={({ pressed }) => [
          styles.calendarButton,
          pressed && styles.pressed,
        ]}
      >
        <CalendarPlus size={17} color="#8B6B35" />

        <Text style={styles.calendarButtonText}>Add to Google Calendar</Text>
      </Pressable>

      {/* DIALOG */}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closeDialog}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            {/* HEADER */}

            <View style={styles.header}>
              <View style={styles.headerTextContainer}>
                <View style={styles.titleRow}>
                  <CalendarPlus size={21} color="#8B6B35" />

                  <Text style={styles.title}>Add to Google Calendar</Text>
                </View>

                <Text style={styles.orderNumber}>Order {orderNumber}</Text>
              </View>

              <Pressable
                onPress={closeDialog}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
              >
                <X size={21} color="#756D60" />
              </Pressable>
            </View>

            {/* DATE */}

            <View style={styles.section}>
              <Text style={styles.label}>Date</Text>

              <Pressable
                onPress={() => {
                  setShowStartPicker(false);
                  setShowEndPicker(false);
                  setShowDatePicker((current) => !current);
                }}
                style={({ pressed }) => [
                  styles.inputButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.inputText}>{formatDate(date)}</Text>
              </Pressable>

              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onValueChange={(_, selectedDate) => updateDate(selectedDate)}
                />
              )}
            </View>

            {/* TIMES */}

            <View style={styles.timeRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.label}>Start time</Text>

                <Pressable
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowEndPicker(false);
                    setShowStartPicker((current) => !current);
                  }}
                  style={({ pressed }) => [
                    styles.inputButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.inputText}>{formatTime(startTime)}</Text>
                </Pressable>
              </View>

              <View style={styles.timeColumn}>
                <Text style={styles.label}>End time</Text>

                <Pressable
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowStartPicker(false);
                    setShowEndPicker((current) => !current);
                  }}
                  style={({ pressed }) => [
                    styles.inputButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.inputText}>{formatTime(endTime)}</Text>
                </Pressable>
              </View>
            </View>

            {showStartPicker && (
              <DateTimePicker
                value={startTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, selectedTime) => updateStartTime(selectedTime)}
              />
            )}

            {showEndPicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, selectedTime) => updateEndTime(selectedTime)}
              />
            )}

            <Text style={styles.helperText}>
              The order creation date and time are suggested automatically. You
              can change them before adding the event.
            </Text>

            {/* BUTTONS */}

            <View style={styles.buttonRow}>
              <Pressable
                onPress={closeDialog}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleAddToCalendar()}
                disabled={loading}
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.pressed,
                  loading && styles.disabledButton,
                ]}
              >
                <CalendarPlus size={17} color="#FFFDF8" />

                <Text style={styles.addButtonText}>
                  {loading ? "Adding..." : "Add to Calendar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.5,
  },
  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9C28C",
    backgroundColor: "#FFF9EA",
  },

  calendarButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8B6B35",
  },

  pressed: {
    opacity: 0.7,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  dialog: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 20,
    backgroundColor: "#FFFDF8",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  headerTextContainer: {
    flex: 1,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#2B2721",
  },

  orderNumber: {
    marginTop: 5,
    fontSize: 13,
    color: "#756D60",
  },

  closeButton: {
    padding: 4,
    marginLeft: 10,
  },

  section: {
    marginTop: 20,
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: "#3A342C",
  },

  inputButton: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D9CDB8",
    backgroundColor: "#FFFDF8",
    paddingHorizontal: 13,
    justifyContent: "center",
  },

  inputText: {
    fontSize: 14,
    color: "#2B2721",
    fontWeight: "600",
  },

  timeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 15,
  },

  timeColumn: {
    flex: 1,
  },

  helperText: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 17,
    color: "#81786A",
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },

  cancelButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#D9CDB8",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5F574C",
  },

  addButton: {
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: 11,
    backgroundColor: "#8B6B35",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  addButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFDF8",
  },
});
