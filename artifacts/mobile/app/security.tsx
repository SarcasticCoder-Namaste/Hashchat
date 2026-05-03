import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  getGetMyTwoFactorQueryKey,
  getListMySessionsQueryKey,
  useDisableMyTwoFactor,
  useEnableMyTwoFactor,
  useGetMyTwoFactor,
  useListMySessions,
  useRevokeMySession,
  useSetupMyTwoFactor,
} from "@workspace/api-client-react";

export default function SecurityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const status = useGetMyTwoFactor({
    query: { queryKey: getGetMyTwoFactorQueryKey() },
  });
  const sessions = useListMySessions({
    query: {
      queryKey: getListMySessionsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupOtpauthUrl, setSetupOtpauthUrl] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const setup = useSetupMyTwoFactor({
    mutation: {
      onSuccess: (r) => {
        setSetupSecret(r.secret);
        setSetupOtpauthUrl(r.otpauthUrl);
      },
      onError: () => Alert.alert("Could not start setup"),
    },
  });
  const enable = useEnableMyTwoFactor({
    mutation: {
      onSuccess: (r) => {
        setBackupCodes(r.backupCodes);
        setSetupSecret(null);
        setSetupOtpauthUrl(null);
        setEnrollCode("");
        qc.invalidateQueries({ queryKey: getGetMyTwoFactorQueryKey() });
      },
      onError: () => Alert.alert("Code didn't match — try again"),
    },
  });
  const disable = useDisableMyTwoFactor({
    mutation: {
      onSuccess: () => {
        setDisableCode("");
        setBackupCodes(null);
        qc.invalidateQueries({ queryKey: getGetMyTwoFactorQueryKey() });
      },
      onError: () => Alert.alert("Code didn't match"),
    },
  });
  const revoke = useRevokeMySession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMySessionsQueryKey() });
      },
      onError: () => Alert.alert("Could not revoke"),
    },
  });

  const enabled = !!status.data?.enabled;
  const remaining = status.data?.backupCodesRemaining ?? 0;

  async function copySecret() {
    if (!setupSecret) return;
    try {
      await Clipboard.setStringAsync(setupSecret);
    } catch {
      // ignore
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 32,
        gap: 16,
      }}
    >
      <Stack.Screen options={{ title: "Security" }} />

      {/* 2FA card */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        testID="security-2fa-card"
      >
        <View style={styles.cardHeader}>
          <View
            style={[styles.iconBubble, { backgroundColor: "rgba(16,185,129,0.15)" }]}
          >
            <Feather name="shield" size={18} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Two-factor authentication
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Protect your account with a one-time code from your authenticator
              app (Google Authenticator, 1Password, Authy, etc.).
            </Text>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: enabled
                  ? "rgba(16,185,129,0.15)"
                  : colors.muted,
              },
            ]}
            testID={enabled ? "2fa-status-on" : "2fa-status-off"}
          >
            <Text
              style={[
                styles.badgeText,
                { color: enabled ? "#10b981" : colors.mutedForeground },
              ]}
            >
              {enabled ? "On" : "Off"}
            </Text>
          </View>
        </View>

        {!enabled && !setupSecret ? (
          <Pressable
            onPress={() => setup.mutate()}
            disabled={setup.isPending}
            style={[
              styles.btnOutline,
              { borderColor: colors.border, opacity: setup.isPending ? 0.6 : 1 },
            ]}
            testID="button-setup-2fa"
          >
            {setup.isPending ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <Feather name="shield" size={14} color={colors.foreground} />
            )}
            <Text style={[styles.btnOutlineText, { color: colors.foreground }]}>
              Set up two-factor
            </Text>
          </Pressable>
        ) : null}

        {setupSecret && setupOtpauthUrl ? (
          <View
            style={[
              styles.subBox,
              { borderColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Copy this secret into your authenticator app, then enter the
              6-digit code below.
            </Text>
            <Pressable
              onPress={copySecret}
              style={[styles.codeBox, { backgroundColor: colors.muted }]}
            >
              <Text
                style={[styles.codeText, { color: colors.foreground }]}
                testID="2fa-secret"
                selectable
              >
                {setupSecret}
              </Text>
              <Feather name="copy" size={14} color={colors.mutedForeground} />
            </Pressable>
            <View style={[styles.codeBox, { backgroundColor: colors.muted }]}>
              <Text
                style={[styles.codeTextSmall, { color: colors.mutedForeground }]}
                selectable
              >
                {setupOtpauthUrl}
              </Text>
            </View>
            <View style={styles.row}>
              <TextInput
                value={enrollCode}
                onChangeText={(v) =>
                  setEnrollCode(v.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    width: 110,
                  },
                ]}
                testID="input-2fa-enroll-code"
              />
              <Pressable
                onPress={() => enable.mutate({ data: { code: enrollCode } })}
                disabled={enrollCode.length !== 6 || enable.isPending}
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: colors.primary,
                    opacity:
                      enrollCode.length !== 6 || enable.isPending ? 0.5 : 1,
                  },
                ]}
                testID="button-enable-2fa"
              >
                {enable.isPending ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : null}
                <Text
                  style={[
                    styles.btnPrimaryText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Verify & enable
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSetupSecret(null);
                  setSetupOtpauthUrl(null);
                  setEnrollCode("");
                }}
                style={styles.btnGhost}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {backupCodes ? (
          <View
            style={[
              styles.subBox,
              {
                borderColor: "rgba(245,158,11,0.45)",
                backgroundColor: "rgba(245,158,11,0.10)",
              },
            ]}
            testID="2fa-backup-codes"
          >
            <Text style={[styles.cardTitle, { color: "#b45309" }]}>
              Save these backup codes
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Each code works once. Store them somewhere safe — they're the only
              way to disable 2FA if you lose your authenticator.
            </Text>
            <View style={styles.codeGrid}>
              {backupCodes.map((c) => (
                <View
                  key={c}
                  style={[styles.codePill, { backgroundColor: colors.background }]}
                >
                  <Text
                    selectable
                    style={[styles.codeText, { color: colors.foreground }]}
                  >
                    {c}
                  </Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => setBackupCodes(null)} style={styles.btnGhost}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                I've saved them
              </Text>
            </Pressable>
          </View>
        ) : null}

        {enabled && !backupCodes ? (
          <View style={[styles.subBox, { borderColor: colors.border }]}>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Backup codes remaining:{" "}
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {remaining}
              </Text>
            </Text>
            <View style={styles.row}>
              <TextInput
                value={disableCode}
                onChangeText={(v) =>
                  setDisableCode(v.replace(/[^A-Za-z0-9-]/g, "").slice(0, 12))
                }
                placeholder="6-digit or backup"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    flex: 1,
                  },
                ]}
                testID="input-2fa-disable-code"
              />
              <Pressable
                onPress={() => disable.mutate({ data: { code: disableCode } })}
                disabled={disableCode.length < 6 || disable.isPending}
                style={[
                  styles.btnOutline,
                  {
                    borderColor: colors.border,
                    opacity:
                      disableCode.length < 6 || disable.isPending ? 0.5 : 1,
                  },
                ]}
                testID="button-disable-2fa"
              >
                {disable.isPending ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : null}
                <Text
                  style={[styles.btnOutlineText, { color: colors.foreground }]}
                >
                  Turn off
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {/* Sessions card */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        testID="security-sessions-card"
      >
        <View style={styles.cardHeader}>
          <View
            style={[styles.iconBubble, { backgroundColor: "rgba(139,92,246,0.15)" }]}
          >
            <Feather name="smartphone" size={18} color="#8b5cf6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Active sessions
            </Text>
            <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
              Devices that have accessed your account recently. Revoke anything
              you don't recognize.
            </Text>
          </View>
        </View>

        {sessions.isLoading ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              Loading sessions…
            </Text>
          </View>
        ) : (sessions.data?.length ?? 0) === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            No sessions found.
          </Text>
        ) : (
          <View style={{ gap: 8 }} testID="sessions-list">
            {sessions.data!.map((s) => (
              <View
                key={s.id}
                style={[
                  styles.sessionRow,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
                testID={`session-${s.id}`}
              >
                <Feather name="key" size={14} color={colors.mutedForeground} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.sessionTitleRow}>
                    <Text
                      style={[styles.sessionTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {s.deviceLabel}
                    </Text>
                    {s.current ? (
                      <View
                        style={[styles.tinyBadge, { backgroundColor: "rgba(16,185,129,0.15)" }]}
                      >
                        <Text style={[styles.tinyBadgeText, { color: "#10b981" }]}>
                          Current
                        </Text>
                      </View>
                    ) : null}
                    {s.revokedAt ? (
                      <View
                        style={[styles.tinyBadge, { backgroundColor: colors.muted }]}
                      >
                        <Text
                          style={[
                            styles.tinyBadgeText,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Revoked
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={{ color: colors.mutedForeground, fontSize: 11 }}
                    numberOfLines={1}
                  >
                    Last seen {new Date(s.lastSeenAt).toLocaleString()}
                    {s.ipRegion ? ` · ${s.ipRegion}` : ""}
                  </Text>
                </View>
                {!s.current && !s.revokedAt ? (
                  <Pressable
                    onPress={() => revoke.mutate({ id: s.id })}
                    disabled={revoke.isPending}
                    style={styles.btnGhost}
                    testID={`button-revoke-session-${s.id}`}
                  >
                    <Feather
                      name="trash-2"
                      size={14}
                      color={colors.destructive}
                    />
                    <Text style={{ color: colors.destructive, fontSize: 12 }}>
                      Revoke
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  cardSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  subBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  codeText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  codeTextSmall: { fontFamily: "Inter_400Regular", fontSize: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  btnPrimaryText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnOutline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnOutlineText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  btnGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  codeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  codePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: "47%",
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  sessionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, maxWidth: 180 },
  tinyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tinyBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
});
