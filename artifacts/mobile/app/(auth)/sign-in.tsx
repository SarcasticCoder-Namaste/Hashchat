import { useSignIn, useSignUp } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type Mode = "signin" | "signup" | "verify";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn, setActive: setSignInActive } = useSignIn();
  const { signUp, setActive: setSignUpActive } = useSignUp();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    if (!signIn || busy) return;
    setBusy(true);
    try {
      const r = await signIn.create({ identifier: email, password });
      if (r.status === "complete" && setSignInActive) {
        await setSignInActive({ session: r.createdSessionId });
      } else {
        Alert.alert("Sign in incomplete", "Additional steps required.");
      }
    } catch (e) {
      Alert.alert(
        "Sign in failed",
        (e as { errors?: { message: string }[] }).errors?.[0]?.message ??
          "Check your email and password.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp() {
    if (!signUp || busy) return;
    setBusy(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setMode("verify");
    } catch (e) {
      Alert.alert(
        "Sign up failed",
        (e as { errors?: { message: string }[] }).errors?.[0]?.message ??
          "Try a different email.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!signUp || busy) return;
    setBusy(true);
    try {
      const r = await signUp.attemptEmailAddressVerification({ code });
      if (r.status === "complete" && setSignUpActive) {
        await setSignUpActive({ session: r.createdSessionId });
      } else {
        Alert.alert("Verification incomplete");
      }
    } catch (e) {
      Alert.alert(
        "Verification failed",
        (e as { errors?: { message: string }[] }).errors?.[0]?.message ??
          "Invalid code.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["#7c3aed", "#db2777"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 60 }]}
      >
        <Text style={styles.brand}>#</Text>
        <Text style={styles.title}>HashChat</Text>
        <Text style={styles.subtitle}>Find your people. Talk hashtags.</Text>
      </LinearGradient>

      <View style={[styles.form, { backgroundColor: colors.background }]}>
        {mode !== "verify" ? (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            />
            <Text
              style={[
                styles.label,
                { color: colors.mutedForeground, marginTop: 12 },
              ]}
            >
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            />
            <Pressable
              disabled={busy}
              onPress={mode === "signin" ? handleSignIn : handleSignUp}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
              style={styles.linkBtn}
            >
              <Text style={[styles.link, { color: colors.primary }]}>
                {mode === "signin"
                  ? "New to HashChat? Create an account"
                  : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              We sent a code to {email}
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  textAlign: "center",
                  fontSize: 22,
                  letterSpacing: 4,
                },
              ]}
            />
            <Pressable
              disabled={busy}
              onPress={handleVerify}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.primaryText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Verify
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "flex-start",
    gap: 4,
  },
  brand: { fontSize: 56, fontFamily: "Inter_700Bold", color: "#fff" },
  title: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  subtitle: { fontSize: 16, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  form: { flex: 1, padding: 24 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { marginTop: 16, alignItems: "center" },
  link: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
