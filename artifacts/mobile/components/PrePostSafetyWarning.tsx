import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useCheckModeration } from "@workspace/api-client-react";

interface Props {
  text: string;
}

const DEBOUNCE_MS = 600;
const MIN_LEN = 6;

export function PrePostSafetyWarning({ text }: Props) {
  const colors = useColors();
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{
    flagged: boolean;
    message: string | null;
    categories: string[];
  } | null>(null);

  const check = useCheckModeration();

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => setPending(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    check
      .mutateAsync({ data: { text: pending } })
      .then((r) => {
        if (cancelled) return;
        setResult({
          flagged: !!r.flagged,
          message: r.message ?? null,
          categories: Array.isArray(r.categories) ? r.categories : [],
        });
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const isDark = colors.background !== "#ffffff";

  if (!result || !result.flagged) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.wrap,
        {
          borderColor: "rgba(245, 158, 11, 0.45)",
          backgroundColor: isDark
            ? "rgba(245, 158, 11, 0.15)"
            : "rgba(254, 243, 199, 0.9)",
        },
      ]}
      testID="pre-post-safety-warning"
    >
      <Feather
        name="alert-triangle"
        size={14}
        color={isDark ? "#fcd34d" : "#b45309"}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            styles.title,
            { color: isDark ? "#fcd34d" : "#b45309" },
          ]}
        >
          {result.message ?? "This post may violate community rules."}
        </Text>
        {result.categories.length > 0 ? (
          <Text
            style={[
              styles.sub,
              { color: isDark ? "#fcd34d" : "#92400e" },
            ]}
          >
            Flags: {result.categories.join(", ")}
          </Text>
        ) : null}
        <Text
          style={[styles.sub, { color: isDark ? "#fcd34d" : "#92400e" }]}
        >
          You can still post — just take a second to review.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, opacity: 0.9 },
});
