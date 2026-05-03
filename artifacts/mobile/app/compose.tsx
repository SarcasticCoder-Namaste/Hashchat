import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { uploadFile } from "@/lib/upload";
import {
  getGetForYouFeedQueryKey,
  useCreatePost,
  type CreatePostBody,
} from "@workspace/api-client-react";

const MAX_LEN = 500;

function extractHashtags(text: string): string[] {
  const matches = text.matchAll(/#([a-zA-Z0-9]+)/g);
  const seen = new Set<string>();
  for (const m of matches) {
    const tag = m[1].toLowerCase();
    if (tag) seen.add(tag);
    if (seen.size >= 10) break;
  }
  return Array.from(seen);
}

export default function ComposeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [content, setContent] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const create = useCreatePost({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetForYouFeedQueryKey() });
        router.back();
      },
      onError: (err) => {
        Alert.alert("Could not post", String((err as Error).message ?? err));
      },
    },
  });

  const hashtags = useMemo(() => extractHashtags(content), [content]);
  const remaining = MAX_LEN - content.length;
  const tooLong = content.length > MAX_LEN;
  const canPost =
    !create.isPending &&
    !uploading &&
    !tooLong &&
    (content.trim().length > 0 || imagePath !== null);

  async function pickImage(useCamera: boolean) {
    if (uploading) return;
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert(
        "Permission needed",
        useCamera
          ? "Allow camera access to take a photo."
          : "Allow photo access to attach an image.",
      );
      return;
    }
    const res = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
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
      setImagePath(path);
      setImagePreview(asset.uri);
    } catch (e) {
      Alert.alert("Upload failed", String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    if (!canPost) return;
    const body: CreatePostBody = {
      content: content.trim(),
      hashtags,
      imageUrls: imagePath ? [imagePath] : [],
      imageAlts: imagePath ? [""] : [],
    };
    create.mutate({ data: body });
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Text style={[styles.cancel, { color: colors.foreground }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>
          New post
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canPost}
          style={[
            styles.postBtn,
            {
              backgroundColor: canPost ? colors.primary : colors.muted,
              opacity: canPost ? 1 : 0.6,
            },
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text
              style={[
                styles.postBtnText,
                {
                  color: canPost
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              Post
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 100,
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="What's happening?"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.textInput, { color: colors.foreground }]}
            multiline
            autoFocus
            maxLength={MAX_LEN + 100}
          />

          {imagePreview ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: imagePreview }}
                style={styles.image}
                contentFit="cover"
              />
              <Pressable
                onPress={() => {
                  setImagePath(null);
                  setImagePreview(null);
                }}
                hitSlop={8}
                style={styles.removeImageBtn}
              >
                <Feather name="x" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : null}

          {hashtags.length > 0 ? (
            <View style={styles.tagRow}>
              {hashtags.map((t) => (
                <View
                  key={t}
                  style={[styles.tag, { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={[styles.tagText, { color: colors.accentForeground }]}
                  >
                    #{t}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Tip: type #hashtags inline to tag your post.
            </Text>
          )}
        </ScrollView>

        <View
          style={[
            styles.toolbar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <Pressable
            onPress={() => pickImage(false)}
            disabled={uploading || imagePath !== null}
            hitSlop={6}
            style={styles.iconBtn}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Feather
                name="image"
                size={22}
                color={
                  imagePath !== null
                    ? colors.mutedForeground
                    : colors.foreground
                }
              />
            )}
          </Pressable>
          <Pressable
            onPress={() => pickImage(true)}
            disabled={uploading || imagePath !== null}
            hitSlop={6}
            style={styles.iconBtn}
          >
            <Feather
              name="camera"
              size={22}
              color={
                imagePath !== null
                  ? colors.mutedForeground
                  : colors.foreground
              }
            />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Text
            style={[
              styles.counter,
              {
                color: tooLong
                  ? colors.destructive
                  : remaining < 50
                    ? "#d97706"
                    : colors.mutedForeground,
              },
            ]}
          >
            {remaining}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { paddingVertical: 6 },
  cancel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  postBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 70,
    alignItems: "center",
  },
  postBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  textInput: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    lineHeight: 25,
    minHeight: 120,
    textAlignVertical: "top",
  },
  imageWrap: { position: "relative" },
  image: {
    width: "100%",
    height: 240,
    borderRadius: 14,
    backgroundColor: "#0001",
  },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tagText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  counter: { fontSize: 13, fontFamily: "Inter_500Medium", paddingRight: 4 },
});
