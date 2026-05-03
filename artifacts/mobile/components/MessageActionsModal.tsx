import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useTranslateMessage } from "@workspace/api-client-react";

const LANGS: { label: string; code: string }[] = [
  { label: "Spanish", code: "es" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Portuguese", code: "pt" },
  { label: "Italian", code: "it" },
  { label: "Japanese", code: "ja" },
  { label: "Korean", code: "ko" },
  { label: "Chinese (Simplified)", code: "zh" },
  { label: "Hindi", code: "hi" },
  { label: "Arabic", code: "ar" },
  { label: "English", code: "en" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  messageId: number | null;
  onTranslated: (
    messageId: number,
    language: string,
    text: string,
  ) => void;
}

export function MessageActionsModal({
  visible,
  onClose,
  messageId,
  onTranslated,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [pickingLang, setPickingLang] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = useTranslateMessage({
    mutation: {
      onSuccess: (resp) => {
        if (messageId != null) {
          onTranslated(messageId, resp.language, resp.text);
        }
        setPickingLang(false);
        onClose();
      },
      onError: () => setError("Translation failed. Try again."),
    },
  });

  function close() {
    setPickingLang(false);
    setError(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          {!pickingLang ? (
            <>
              <View
                style={{
                  alignSelf: "center",
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  marginBottom: 8,
                }}
              />
              <Pressable
                style={styles.row}
                onPress={() => {
                  setError(null);
                  setPickingLang(true);
                }}
                testID="button-translate-message"
              >
                <Feather name="globe" size={18} color={colors.foreground} />
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Inter_500Medium",
                    fontSize: 15,
                  }}
                >
                  Translate…
                </Text>
              </Pressable>
              <Pressable style={styles.row} onPress={close}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontFamily: "Inter_500Medium",
                    fontSize: 15,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => setPickingLang(false)}
                  hitSlop={6}
                >
                  <Feather
                    name="chevron-left"
                    size={20}
                    color={colors.foreground}
                  />
                </Pressable>
                <Text
                  style={{
                    color: colors.foreground,
                    fontFamily: "Inter_700Bold",
                    fontSize: 16,
                  }}
                >
                  Translate to…
                </Text>
                {translate.isPending && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              {error && (
                <Text
                  style={{
                    color: colors.destructive,
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  {error}
                </Text>
              )}
              <ScrollView style={{ maxHeight: 320 }}>
                {LANGS.map((l) => (
                  <Pressable
                    key={l.code}
                    style={styles.row}
                    onPress={() => {
                      if (messageId == null) return;
                      setError(null);
                      translate.mutate({
                        id: messageId,
                        data: { language: l.code },
                      });
                    }}
                    disabled={translate.isPending}
                    testID={`button-translate-lang-${l.code}`}
                  >
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: "Inter_500Medium",
                        fontSize: 15,
                      }}
                    >
                      {l.label}
                    </Text>
                    <Text
                      style={{
                        marginLeft: "auto",
                        color: colors.mutedForeground,
                        fontSize: 12,
                      }}
                    >
                      {l.code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
});
