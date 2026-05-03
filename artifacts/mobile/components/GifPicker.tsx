import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import {
  searchGifs,
  type Gif,
} from "@workspace/api-client-react";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function GifPicker({ visible, onClose, onSelect }: Props) {
  const colors = useColors();
  const [q, setQ] = useState("trending");
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    searchGifs({ q, limit: 24 })
      .then((r) => {
        if (!cancelled) setItems(r.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.wrap, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>GIFs</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View
          style={[
            styles.search,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search GIFs"
            placeholderTextColor={colors.mutedForeground}
            style={{
              flex: 1,
              color: colors.foreground,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              paddingVertical: 8,
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.url);
                  onClose();
                }}
                style={{ flex: 1 }}
              >
                <Image
                  source={{ uri: item.previewUrl ?? item.url }}
                  style={{
                    width: "100%",
                    aspectRatio: 1,
                    borderRadius: 12,
                    backgroundColor: colors.muted,
                  }}
                  contentFit="cover"
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text
                style={{
                  color: colors.mutedForeground,
                  textAlign: "center",
                  marginTop: 40,
                  fontFamily: "Inter_400Regular",
                }}
              >
                No GIFs
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
