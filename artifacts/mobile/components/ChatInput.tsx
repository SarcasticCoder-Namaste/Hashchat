import { Feather } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GifPicker } from "@/components/GifPicker";
import { useColors } from "@/hooks/useColors";
import { uploadFile } from "@/lib/upload";

interface Send {
  content: string;
  imageUrl?: string;
  audioUrl?: string;
  gifUrl?: string;
}

interface Props {
  onSend: (data: Send) => Promise<void> | void;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, sending, placeholder = "Message" }: Props) {
  const colors = useColors();
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    try {
      await onSend({ content: text });
    } catch {
      setDraft(text);
    }
  }

  async function pickImage() {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to send images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const ext = (asset.uri.split(".").pop() ?? "jpg").toLowerCase();
      const path = await uploadFile(
        asset.uri,
        `image-${Date.now()}.${ext}`,
        asset.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
      );
      await onSend({ content: "", imageUrl: path });
    } catch (e) {
      Alert.alert("Upload failed", String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function toggleRecord() {
    if (Platform.OS === "web") {
      Alert.alert("Voice not supported", "Voice messages work on iOS/Android.");
      return;
    }
    if (recording) {
      try {
        await recorder.stop();
        const uri = recorder.uri;
        setRecording(false);
        if (!uri) return;
        setUploading(true);
        const path = await uploadFile(
          uri,
          `voice-${Date.now()}.m4a`,
          "audio/m4a",
        );
        await onSend({ content: "", audioUrl: path });
      } catch (e) {
        Alert.alert("Recording failed", String((e as Error).message ?? e));
      } finally {
        setUploading(false);
      }
    } else {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Allow microphone access.");
          return;
        }
        await AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
      } catch (e) {
        Alert.alert("Recording failed", String((e as Error).message ?? e));
      }
    }
  }

  async function handleGif(url: string) {
    try {
      await onSend({ content: "", gifUrl: url, imageUrl: url });
    } catch {
      // ignore
    }
  }

  const canSend = draft.trim().length > 0 && !sending;
  const busy = uploading || sending;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.background, borderTopColor: colors.border },
      ]}
    >
      <Pressable onPress={pickImage} disabled={busy} hitSlop={6} style={styles.iconBtn}>
        <Feather name="image" size={22} color={colors.mutedForeground} />
      </Pressable>
      <Pressable onPress={() => setGifOpen(true)} disabled={busy} hitSlop={6} style={styles.iconBtn}>
        <Text style={[styles.gifText, { color: colors.mutedForeground }]}>
          GIF
        </Text>
      </Pressable>
      <View
        style={[
          styles.field,
          { backgroundColor: colors.muted, borderColor: colors.border },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          style={{
            flex: 1,
            color: colors.foreground,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            paddingVertical: 8,
            maxHeight: 120,
          }}
          multiline
        />
      </View>
      {canSend ? (
        <Pressable
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          disabled={busy}
        >
          {sending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Feather
              name="arrow-up"
              size={18}
              color={colors.primaryForeground}
            />
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={toggleRecord}
          disabled={uploading}
          style={[
            styles.sendBtn,
            {
              backgroundColor: recording ? colors.destructive : colors.primary,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Feather
              name={recording ? "square" : "mic"}
              size={18}
              color={colors.primaryForeground}
            />
          )}
        </Pressable>
      )}
      <GifPicker
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onSelect={handleGif}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    flex: 1,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: "center",
  },
  gifText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
