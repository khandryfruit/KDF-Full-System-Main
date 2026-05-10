import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

const BG   = "#080D1A";
const CARD = "#0F1729";
const GOLD = "#F59E0B";

export default function LoginScreen() {
  const { login } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("Email and password required"); return; }
    setLoading(true);
    setError("");
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (result.ok) {
      router.replace("/(tabs)");
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <LinearGradient colors={["#080D1A", "#0A1020", "#080D1A"]} style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.center}>
          {/* Logo */}
          <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.logoWrap}>
            <Feather name="shield" size={32} color="#fff" />
          </LinearGradient>
          <Text style={styles.brand}>Khan Baba Admin</Text>
          <Text style={styles.tagline}>Super Admin Control Panel</Text>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorTxt}>{error}</Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.inputWrap}>
              <Feather name="mail" size={16} color="rgba(255,255,255,0.35)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Admin email"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            {/* Password */}
            <View style={styles.inputWrap}>
              <Feather name="lock" size={16} color="rgba(255,255,255,0.35)" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                <Feather name={showPass ? "eye-off" : "eye"} size={16} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            >
              <LinearGradient colors={["#F59E0B", "#D97706"]} style={styles.loginGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Feather name="log-in" size={18} color="#fff" /><Text style={styles.loginTxt}>Sign In to Admin</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Khan Baba Dry Fruits · Admin Only</Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  flex:     { flex: 1 },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },

  logoWrap: { width: 80, height: 80, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  brand:    { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  tagline:  { color: "rgba(255,255,255,0.35)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 32 },

  card:      { width: "100%", backgroundColor: CARD, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  cardTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 20 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF444418", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#EF444430" },
  errorTxt: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },

  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#0A0F1E", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14 },
  inputIcon: { paddingLeft: 14 },
  input:     { flex: 1, color: "#fff", fontFamily: "Inter_400Regular", fontSize: 15, paddingHorizontal: 12, paddingVertical: 14 },
  eyeBtn:    { padding: 14 },

  loginBtn:  { marginTop: 8, borderRadius: 16, overflow: "hidden" },
  loginGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  loginTxt:  { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  footer: { color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 32 },
});
