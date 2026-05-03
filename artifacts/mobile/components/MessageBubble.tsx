import { AudioModule, createAudioPlayer } from "expo-audio";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { PollCard } from "@/components/PollCard";
import { useColors } from "@/hooks/useColors";
import {
  useMuteUserInRoom,
  type Message,
} from "@workspace/api-client-react";

interface Props {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  roomTag?: string;
  onLongPress?: (message: Message) => void;
  translation?: { language: string; text: string } | null;
  onClearTranslation?: (messageId: number) => void;
}

const MUTE_DURATIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "8 hours", hours: 8 },
  { label: "24 hours", hours: 24 },
  { label: "Forever", hours: null },
];

export function MessageBubble({
  message,
  isMine,
  showAvatar,
  roomTag,
  onLongPress,
  translation,
  onClearTranslation,
}: Props) {
  const colors = useColors();
  const muteInRoom = useMuteUserInRoom();
  const canMuteInRoom = !!roomTag && !isMine && !!message.senderId;

  function promptMuteInRoom() {
    if (!canMuteInRoom || !roomTag) return;
    Alert.alert(
      `Mute @${message.senderName} in #${roomTag}?`,
      "You won't see their messages here for the chosen duration.",
      [
        ...MUTE_DURATIONS.map((d) => ({
          text: d.label,
          onPress: () => {
            muteInRoom.mutate(
              {
                tag: roomTag,
                id: message.senderId,
                data: { durationHours: d.hours },
              },
              {
                onSuccess: () => {
                  Alert.alert(
                    "Muted",
                    d.hours === null
                      ? `@${message.senderName} is muted in #${roomTag} until you unmute them.`
                      : `@${message.senderName} is muted in #${roomTag} for ${d.label.toLowerCase()}.`,
                  );
                },
                onError: () => {
                  Alert.alert("Could not mute", "Please try again.");
                },
              },
            );
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  }
  const bg = isMine ? colors.bubbleMine : colors.bubbleOther;
  const fg = isMine ? colors.bubbleMineText : colors.bubbleOtherText;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isGif = !!message.imageUrl && /(\.gif$|giphy|tenor)/i.test(message.imageUrl);
  const hasContent = !!message.content;
  const hasPoll = !!message.poll;

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isMine ? "flex-end" : "flex-start" },
      ]}
    >
      {!isMine && showAvatar ? (
        <Avatar url={message.senderAvatarUrl} name={message.senderName} size={28} />
      ) : !isMine ? (
        <View style={{ width: 28 }} />
      ) : null}
      <Pressable
        onLongPress={canMuteInRoom ? promptMuteInRoom : undefined}
        delayLongPress={350}
        style={{ maxWidth: "78%", gap: 4 }}
        accessibilityHint={
          canMuteInRoom ? "Long press to mute this user in this room" : undefined
        }
        testID={`msg-bubble-${message.id}`}
      >
        {!isMine && showAvatar ? (
          <Text style={[styles.name, { color: colors.mutedForeground }]}>
            {message.senderName}
          </Text>
        ) : null}
        {message.imageUrl ? (
          <Image
            source={{ uri: message.imageUrl }}
            style={{
              width: 220,
              height: isGif ? 180 : 240,
              borderRadius: 16,
              backgroundColor: colors.muted,
            }}
            contentFit="cover"
          />
        ) : null}
        {message.audioUrl ? (
          <AudioPill url={message.audioUrl} mine={isMine} />
        ) : null}
        {hasPoll ? <PollCard poll={message.poll!} /> : null}
        {hasContent ? (
          <Pressable
            onLongPress={
              onLongPress ? () => onLongPress(message) : undefined
            }
            delayLongPress={350}
            style={[
              styles.bubble,
              {
                backgroundColor: bg,
                borderBottomRightRadius: isMine ? 4 : 18,
                borderBottomLeftRadius: isMine ? 18 : 4,
              },
            ]}
          >
            <Text style={[styles.text, { color: fg }]}>{message.content}</Text>
          </Pressable>
        ) : null}
        {translation && hasContent ? (
          <View
            style={[
              styles.translation,
              {
                backgroundColor: colors.accent,
                borderColor: colors.border,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Feather name="globe" size={11} color={colors.primary} />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 10,
                  fontFamily: "Inter_600SemiBold",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Translated · {translation.language}
              </Text>
              {onClearTranslation && (
                <Pressable
                  onPress={() => onClearTranslation(message.id)}
                  hitSlop={6}
                  style={{ marginLeft: "auto" }}
                  testID={`button-clear-translation-${message.id}`}
                >
                  <Text
                    style={{
                      color: colors.mutedForeground,
                      fontSize: 11,
                      fontFamily: "Inter_500Medium",
                    }}
                  >
                    Show original
                  </Text>
                </Pressable>
              )}
            </View>
            <Text
              style={{
                color: colors.foreground,
                fontSize: 14,
                fontFamily: "Inter_400Regular",
                lineHeight: 19,
                marginTop: 4,
              }}
              testID={`translation-text-${message.id}`}
            >
              {translation.text}
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            styles.time,
            {
              color: colors.mutedForeground,
              textAlign: isMine ? "right" : "left",
            },
          ]}
        >
          {time}
        </Text>
      </Pressable>
    </View>
  );
}

function AudioPill({ url, mine }: { url: string; mine: boolean }) {
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  const [player, setPlayer] = useState<ReturnType<typeof createAudioPlayer> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      player?.remove();
    };
  }, [player]);

  async function toggle() {
    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      });
      let p = player;
      if (!p) {
        p = createAudioPlayer({ uri: url });
        setPlayer(p);
      }
      if (playing) {
        p.pause();
        setPlaying(false);
      } else {
        p.play();
        setPlaying(true);
      }
    } catch {
      // ignore
    }
  }

  return (
    <Pressable
      onPress={toggle}
      style={[
        styles.audio,
        {
          backgroundColor: mine ? colors.bubbleMine : colors.bubbleOther,
        },
      ]}
    >
      <Feather
        name={playing ? "pause" : "play"}
        size={18}
        color={mine ? colors.bubbleMineText : colors.bubbleOtherText}
      />
      <Text
        style={{
          color: mine ? colors.bubbleMineText : colors.bubbleOtherText,
          fontFamily: "Inter_500Medium",
          fontSize: 14,
        }}
      >
        Voice message
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
    alignItems: "flex-end",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  text: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20 },
  time: { fontSize: 11, fontFamily: "Inter_400Regular" },
  name: { fontSize: 12, fontFamily: "Inter_500Medium", marginLeft: 4 },
  audio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 160,
  },
  translation: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
