import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { RemoteAudio } from "@/components/RemoteAudio";
import { useColors } from "@/hooks/useColors";
import { useGroupCall } from "@/hooks/useGroupCall";
import {
  getGetCallQueryKey,
  useDemoteToListener,
  useGetCall,
  useJoinCall,
  useLeaveCall,
  useLowerHand,
  usePromoteToSpeaker,
  useRaiseHand,
  type Call,
  type CallParticipant,
} from "@workspace/api-client-react";

interface Props {
  visible: boolean;
  callId: number | null;
  onClose: () => void;
  title?: string;
}

export function VoiceRoomModal({ visible, callId, onClose, title }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const meId = user?.id ?? "";
  const joinedRef = useRef(false);

  const callQ = useGetCall(callId ?? 0, {
    query: {
      queryKey: callId != null ? getGetCallQueryKey(callId) : ["call-disabled"],
      enabled: visible && callId != null,
      refetchInterval: visible ? 2500 : false,
    },
  });

  const join = useJoinCall();
  const leave = useLeaveCall();
  const raise = useRaiseHand({
    mutation: { onSuccess: () => invalidateCall() },
  });
  const lower = useLowerHand({
    mutation: { onSuccess: () => invalidateCall() },
  });
  const promote = usePromoteToSpeaker({
    mutation: { onSuccess: () => invalidateCall() },
  });
  const demote = useDemoteToListener({
    mutation: { onSuccess: () => invalidateCall() },
  });

  function invalidateCall() {
    if (callId != null) {
      qc.invalidateQueries({ queryKey: getGetCallQueryKey(callId) });
    }
  }

  // Auto-join the call once when the modal opens.
  useEffect(() => {
    if (!visible || callId == null) return;
    if (joinedRef.current) return;
    joinedRef.current = true;
    join.mutate(
      { id: callId },
      {
        onError: () =>
          Alert.alert("Could not join voice room", "Please try again."),
        onSuccess: () => invalidateCall(),
      },
    );
    return () => {
      // Reset on close so we re-join next time
      joinedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, callId]);

  const call: Call | undefined = callQ.data;
  const me = useMemo(
    () => call?.participants.find((p) => p.userId === meId),
    [call, meId],
  );
  const myRole = me?.role ?? "speaker";
  const handIsRaised = !!me?.handRaisedAt;
  const amHost = myRole === "host";
  const amSpeaker = myRole === "speaker" || myRole === "host";

  // Live audio: connects this device to other participants' WebRTC streams.
  // Only enable once we know our role from the server (otherwise we'd briefly
  // request mic permission as a default-speaker before being placed as a
  // listener in voice rooms).
  const groupCall = useGroupCall({
    callId,
    myUserId: meId,
    enabled: visible && callId != null && !!isSignedIn && !!me,
    isSpeaker: amSpeaker,
    onEnd: () => {
      // The call has ended on the server side — fall back to closing the
      // modal so the user isn't stuck on a dead room.
      handleHangup();
    },
  });

  const joined = call?.participants.filter((p) => p.state === "joined") ?? [];
  const speakers = joined.filter((p) => p.role !== "listener");
  const listeners = joined.filter((p) => p.role === "listener");

  function handleHangup() {
    if (callId != null) {
      leave.mutate(
        { id: callId },
        {
          onSettled: () => {
            invalidateCall();
            joinedRef.current = false;
            onClose();
          },
        },
      );
    } else {
      onClose();
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleHangup}
    >
      <View
        style={[
          styles.wrap,
          { backgroundColor: colors.background, paddingTop: insets.top + 8 },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {title ?? "Voice room"}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {joined.length} joined · {call?.status ?? "connecting"}
            </Text>
          </View>
          <Pressable onPress={handleHangup} hitSlop={10} style={styles.iconBtn}>
            <Feather name="x" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Hidden audio sinks for each remote speaker (web only; native
            auto-plays through the device output). */}
        {groupCall.remotePeers.map((peer) => (
          <RemoteAudio key={peer.userId} stream={peer.stream} />
        ))}

        {!call ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Speakers ({speakers.length})
            </Text>
            <View style={{ gap: 8 }}>
              {speakers.map((p) => (
                <SpeakerTile
                  key={p.userId}
                  participant={p}
                  isMe={p.userId === meId}
                  isMutedSelf={p.userId === meId && groupCall.muted}
                  canDemote={amHost && p.role !== "host" && p.userId !== meId}
                  onDemote={() =>
                    callId != null &&
                    demote.mutate({ id: callId, userId: p.userId })
                  }
                />
              ))}
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Listeners ({listeners.length})
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {listeners.length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  No listeners yet.
                </Text>
              ) : (
                listeners.map((p) => (
                  <ListenerChip
                    key={p.userId}
                    participant={p}
                    isMe={p.userId === meId}
                    canPromote={amHost && !!p.handRaisedAt && p.userId !== meId}
                    onPromote={() =>
                      callId != null &&
                      promote.mutate({ id: callId, userId: p.userId })
                    }
                  />
                ))
              )}
            </View>
            {groupCall.error ? (
              <Text style={{ color: colors.destructive, fontSize: 12, lineHeight: 16 }}>
                {amSpeaker
                  ? `Microphone unavailable: ${groupCall.error}. You can still hear others.`
                  : `Audio error: ${groupCall.error}`}
              </Text>
            ) : null}
          </ScrollView>
        )}

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          {myRole === "listener" ? (
            <Pressable
              onPress={() =>
                callId != null &&
                (handIsRaised
                  ? lower.mutate({ id: callId })
                  : raise.mutate({ id: callId }))
              }
              style={[
                styles.bigBtn,
                {
                  backgroundColor: handIsRaised
                    ? colors.accentPink
                    : colors.muted,
                },
              ]}
              disabled={raise.isPending || lower.isPending}
            >
              <Feather
                name="thumbs-up"
                size={18}
                color={handIsRaised ? "#fff" : colors.foreground}
              />
              <Text
                style={{
                  color: handIsRaised ? "#fff" : colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                {handIsRaised ? "Lower hand" : "Raise hand"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={groupCall.toggleMute}
              disabled={!groupCall.ready}
              style={[
                styles.bigBtn,
                {
                  backgroundColor: groupCall.muted
                    ? colors.destructive
                    : colors.muted,
                  opacity: groupCall.ready ? 1 : 0.6,
                },
              ]}
            >
              <Feather
                name={groupCall.muted ? "mic-off" : "mic"}
                size={18}
                color={groupCall.muted ? "#fff" : colors.foreground}
              />
              <Text
                style={{
                  color: groupCall.muted ? "#fff" : colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                }}
              >
                {!groupCall.ready
                  ? "Connecting…"
                  : groupCall.muted
                    ? "Unmute"
                    : amHost
                      ? "Mute (host)"
                      : "Mute"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleHangup}
            style={[styles.hangup, { backgroundColor: colors.destructive }]}
          >
            <Feather name="phone-off" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SpeakerTile({
  participant,
  isMe,
  isMutedSelf,
  canDemote,
  onDemote,
}: {
  participant: CallParticipant;
  isMe: boolean;
  isMutedSelf: boolean;
  canDemote: boolean;
  onDemote: () => void;
}) {
  const colors = useColors();
  const isHost = participant.role === "host";
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Avatar
        url={participant.avatarUrl}
        name={participant.displayName}
        size={36}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
          {participant.displayName}
          {isMe ? " (you)" : ""}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Feather
            name={isMutedSelf ? "mic-off" : isHost ? "radio" : "mic"}
            size={11}
            color={colors.mutedForeground}
          />
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {isMutedSelf ? "Muted" : isHost ? "Host" : "Speaker"}
          </Text>
        </View>
      </View>
      {canDemote && (
        <Pressable
          onPress={onDemote}
          hitSlop={6}
          style={[styles.smallBtn, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>
            Move to listener
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function ListenerChip({
  participant,
  isMe,
  canPromote,
  onPromote,
}: {
  participant: CallParticipant;
  isMe: boolean;
  canPromote: boolean;
  onPromote: () => void;
}) {
  const colors = useColors();
  const handUp = !!participant.handRaisedAt;
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: handUp ? "#fbbf24" : colors.muted,
          borderColor: colors.border,
        },
      ]}
    >
      {handUp && <Feather name="thumbs-up" size={11} color="#1f1f29" />}
      <Text
        style={{
          color: handUp ? "#1f1f29" : colors.foreground,
          fontSize: 12,
          fontFamily: "Inter_500Medium",
        }}
      >
        {participant.displayName}
        {isMe ? " (you)" : ""}
      </Text>
      {canPromote && (
        <Pressable onPress={onPromote} hitSlop={6}>
          <Text
            style={{
              color: "#1f1f29",
              fontSize: 11,
              fontFamily: "Inter_700Bold",
              marginLeft: 4,
            }}
          >
            Promote
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bigBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
  },
  hangup: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});
