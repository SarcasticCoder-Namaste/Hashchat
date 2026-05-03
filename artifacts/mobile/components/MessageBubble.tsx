import { AudioModule, createAudioPlayer } from "expo-audio";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import type { Message } from "@workspace/api-client-react";

interface Props {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
}

export function MessageBubble({ message, isMine, showAvatar }: Props) {
  const colors = useColors();
  const bg = isMine ? colors.bubbleMine : colors.bubbleOther;
  const fg = isMine ? colors.bubbleMineText : colors.bubbleOtherText;
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isGif = !!message.imageUrl && /(\.gif$|giphy|tenor)/i.test(message.imageUrl);

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
      <View style={{ maxWidth: "78%", gap: 4 }}>
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
        {message.content ? (
          <View
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
      </View>
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
});
