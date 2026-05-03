import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { PollCard } from "@/components/PollCard";
import { PollCreatorModal, type PollScope } from "@/components/PollCreatorModal";
import { useColors } from "@/hooks/useColors";
import {
  getGetConversationPollsQueryKey,
  getGetRoomPollsQueryKey,
  useGetConversationPolls,
  useGetRoomPolls,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  visible: boolean;
  onClose: () => void;
  scope: PollScope;
}

export function PollsModal({ visible, onClose, scope }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [creatorOpen, setCreatorOpen] = useState(false);

  const roomKey =
    scope.kind === "room" ? getGetRoomPollsQueryKey(scope.tag) : ["disabled-room"];
  const convKey =
    scope.kind === "conversation"
      ? getGetConversationPollsQueryKey(scope.conversationId)
      : ["disabled-conv"];

  const roomQ = useGetRoomPolls(scope.kind === "room" ? scope.tag : "", {
    query: {
      queryKey: roomKey,
      enabled: visible && scope.kind === "room",
      refetchInterval: visible ? 10_000 : false,
    },
  });
  const convQ = useGetConversationPolls(
    scope.kind === "conversation" ? scope.conversationId : 0,
    {
      query: {
        queryKey: convKey,
        enabled: visible && scope.kind === "conversation",
        refetchInterval: visible ? 10_000 : false,
      },
    },
  );

  const polls = (scope.kind === "room" ? roomQ.data : convQ.data) ?? [];
  const loading = scope.kind === "room" ? roomQ.isLoading : convQ.isLoading;

  function refresh() {
    if (scope.kind === "room") {
      qc.invalidateQueries({ queryKey: roomKey });
    } else {
      qc.invalidateQueries({ queryKey: convKey });
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.background, paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.header}>
          <Feather name="bar-chart-2" size={18} color={colors.foreground} />
          <Text style={[styles.title, { color: colors.foreground }]}>Polls</Text>
          <Pressable
            onPress={() => setCreatorOpen(true)}
            hitSlop={10}
            style={styles.iconBtn}
            testID="button-new-poll"
          >
            <Feather name="plus" size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : polls.length === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            title="No polls yet"
            subtitle="Tap + to create one."
          />
        ) : (
          <FlatList
            data={polls}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{
              padding: 16,
              gap: 10,
              paddingBottom: insets.bottom + 24,
            }}
            renderItem={({ item }) => (
              <PollCard poll={item} onVoted={refresh} />
            )}
          />
        )}
        <PollCreatorModal
          visible={creatorOpen}
          onClose={() => setCreatorOpen(false)}
          scope={scope}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  title: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
