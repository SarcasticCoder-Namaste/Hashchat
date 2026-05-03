import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { useVotePoll, type Poll, type PollOption } from "@workspace/api-client-react";

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h left`;
  const d = Math.floor(h / 24);
  return `${d}d left`;
}

export function PollCard({ poll, onVoted }: { poll: Poll; onVoted?: () => void }) {
  const colors = useColors();
  const vote = useVotePoll({ mutation: { onSuccess: () => onVoted?.() } });
  const mode = poll.mode ?? "single";
  const hasVoted = (poll.myVoteOptionIds?.length ?? 0) > 0;
  const closed = poll.isExpired;
  const showResults = hasVoted || closed;

  const [multiSel, setMultiSel] = useState<number[]>([]);
  const [rankOrder, setRankOrder] = useState<number[]>(() =>
    poll.options.map((o) => o.id),
  );
  useEffect(() => {
    setRankOrder((prev) => {
      const ids = poll.options.map((o) => o.id);
      const filtered = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !filtered.includes(id));
      return [...filtered, ...missing];
    });
  }, [poll.options]);

  const totalVotes = poll.totalVotes;

  function moveRank(idx: number, dir: -1 | 1) {
    const next = [...rankOrder];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRankOrder(next);
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={`poll-${poll.id}`}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <View
          style={[
            styles.icon,
            { backgroundColor: colors.accent },
          ]}
        >
          <Feather name="bar-chart-2" size={14} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            Poll by {poll.creatorName}
            {mode !== "single"
              ? ` · ${mode === "multi" ? `Multi-select (up to ${poll.maxSelections})` : "Ranked choice"}`
              : ""}
          </Text>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 14,
              fontFamily: "Inter_600SemiBold",
              marginTop: 2,
            }}
          >
            {poll.question}
          </Text>
        </View>
        {poll.expiresAt && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="clock" size={11} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {timeUntil(poll.expiresAt)}
            </Text>
          </View>
        )}
      </View>

      {showResults ? (
        <ResultsBars
          options={poll.options}
          totalVotes={totalVotes}
          highlight={(o) => o.votedByMe}
        />
      ) : mode === "single" ? (
        <View style={{ gap: 6 }}>
          {poll.options.map((o) => (
            <Pressable
              key={o.id}
              onPress={() =>
                vote.mutate({ id: poll.id, data: { optionId: o.id } })
              }
              disabled={vote.isPending}
              style={[
                styles.choice,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
              testID={`button-vote-${o.id}`}
            >
              <Text style={{ color: colors.foreground, fontSize: 14 }}>
                {o.text}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : mode === "multi" ? (
        <View style={{ gap: 6 }}>
          {poll.options.map((o) => {
            const checked = multiSel.includes(o.id);
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  if (checked) {
                    setMultiSel(multiSel.filter((id) => id !== o.id));
                  } else if (multiSel.length < poll.maxSelections) {
                    setMultiSel([...multiSel, o.id]);
                  }
                }}
                style={[
                  styles.choice,
                  {
                    borderColor: checked ? colors.primary : colors.border,
                    backgroundColor: checked ? colors.accent : colors.background,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  },
                ]}
                testID={`checkbox-vote-${o.id}`}
              >
                <Feather
                  name={checked ? "check-square" : "square"}
                  size={16}
                  color={checked ? colors.primary : colors.mutedForeground}
                />
                <Text style={{ color: colors.foreground, fontSize: 14, flex: 1 }}>
                  {o.text}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() =>
              multiSel.length > 0 &&
              vote.mutate({ id: poll.id, data: { optionIds: multiSel } })
            }
            disabled={vote.isPending || multiSel.length === 0}
            style={[
              styles.submit,
              {
                backgroundColor:
                  multiSel.length === 0 ? colors.muted : colors.primary,
              },
            ]}
            testID={`button-submit-multi-${poll.id}`}
          >
            <Text
              style={{
                color:
                  multiSel.length === 0
                    ? colors.mutedForeground
                    : colors.primaryForeground,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Submit ({multiSel.length}/{poll.maxSelections})
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            Reorder — top is most preferred.
          </Text>
          {rankOrder.map((id, idx) => {
            const o = poll.options.find((opt) => opt.id === id);
            if (!o) return null;
            return (
              <View
                key={id}
                style={[
                  styles.choice,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  },
                ]}
                testID={`rank-item-${o.id}`}
              >
                <Text
                  style={{
                    color: colors.mutedForeground,
                    fontSize: 12,
                    width: 18,
                  }}
                >
                  {idx + 1}.
                </Text>
                <Text style={{ color: colors.foreground, fontSize: 14, flex: 1 }}>
                  {o.text}
                </Text>
                <Pressable
                  onPress={() => moveRank(idx, -1)}
                  hitSlop={6}
                  disabled={idx === 0}
                  style={{ padding: 4, opacity: idx === 0 ? 0.4 : 1 }}
                  testID={`button-rank-up-${o.id}`}
                >
                  <Feather name="chevron-up" size={16} color={colors.foreground} />
                </Pressable>
                <Pressable
                  onPress={() => moveRank(idx, 1)}
                  hitSlop={6}
                  disabled={idx === rankOrder.length - 1}
                  style={{
                    padding: 4,
                    opacity: idx === rankOrder.length - 1 ? 0.4 : 1,
                  }}
                  testID={`button-rank-down-${o.id}`}
                >
                  <Feather
                    name="chevron-down"
                    size={16}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
            );
          })}
          <Pressable
            onPress={() =>
              vote.mutate({
                id: poll.id,
                data: { rankedOptionIds: rankOrder },
              })
            }
            disabled={vote.isPending}
            style={[styles.submit, { backgroundColor: colors.primary }]}
            testID={`button-submit-ranked-${poll.id}`}
          >
            {vote.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                Submit ranking
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        {closed ? " · Final results" : ""}
      </Text>
    </View>
  );
}

function ResultsBars({
  options,
  totalVotes,
  highlight,
}: {
  options: PollOption[];
  totalVotes: number;
  highlight: (o: PollOption) => boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      {options.map((o) => {
        const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
        const active = highlight(o);
        return (
          <View key={o.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: colors.foreground,
                  fontSize: 13,
                  fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                }}
              >
                {o.text}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {pct}% · {o.votes}
              </Text>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.muted,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  backgroundColor: active
                    ? colors.primary
                    : colors.mutedForeground,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  submit: {
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
