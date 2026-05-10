import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

const RIDER_GREEN = "#00C562";

export default function LoginScreen() {
  const { rider, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone,    setPhone]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  if (rider) {
    router.replace("/(tabs)");
    return null;
  }

  const handleLogin = async () => {
    setError("");
    if (!phone.trim()) { setError("Phone number درج کریں"); return; }
    if (!password)     { setError("Password درج کریں"); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(phone.trim(), password);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setError(result.error ?? "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <LinearGradient
      colors={["#0D2137", "#0A3D2E", "#0D2137"]}
      locations={[0, 0.5, 1]}
      style={styles.root}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, {
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 40,
            paddingBottom: insets.bottom + 40,
          }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <View style={[styles.logoRing, { borderColor: `${RIDER_GREEN}30`, shadowColor: RIDER_GREEN }]}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandName}>KDF RIDER LAHORE</Text>
            <Text style={styles.brandSub}>Khan Baba Dry Fruits</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${RIDER_GREEN}18`, borderColor: `${RIDER_GREEN}30` }]}>
              <View style={[styles.roleDot, { backgroundColor: RIDER_GREEN }]} />
              <Text style={[styles.roleLabel, { color: RIDER_GREEN }]}>🚴 Rider Portal</Text>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Rider Login</Text>
            <Text style={styles.subHeading}>Phone number & password درج کریں</Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorTxt}>{error}</Text>
              </View>
            )}

            {/* Phone */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={[styles.inputRow, { borderColor: phone ? `${RIDER_GREEN}40` : "#E5E7EB" }]}>
                <View style={[styles.iconWrap, { backgroundColor: `${RIDER_GREEN}12` }]}>
                  <Feather name="phone" size={15} color={RIDER_GREEN} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="03xx-xxxxxxx"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  value={phone}
                  onChangeText={v => { setPhone(v); setError(""); }}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${RIDER_GREEN}12` }]}>
                  <Feather name="lock" size={15} color={RIDER_GREEN} />
                </View>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                  <Feather name={showPass ? "eye-off" : "eye"} size={15} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#00D466", "#00B85A"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.loginBtnGrad}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Feather name="log-in" size={16} color="#fff" /><Text style={styles.loginBtnTxt}>Sign In</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerHint}>Password بھول گئے؟ Admin سے رابطہ کریں</Text>
          <Text style={styles.version}>KDF Rider Lahore · v2.1</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },

  logoWrap: { alignItems: "center", marginBottom: 32, gap: 6 },
  logoRing: {
    width: 120, height: 120, borderRadius: 34, borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  logoImg:   { width: 100, height: 100, borderRadius: 28 },
  brandName: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  brandSub:  { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 6,
  },
  roleDot:   { width: 7, height: 7, borderRadius: 4 },
  roleLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  card: {
    width: "100%", maxWidth: 420, backgroundColor: "#fff",
    borderRadius: 24, padding: 28,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 28, elevation: 16,
  },
  heading:    { fontSize: 24, fontFamily: "Inter_700Bold", color: "#0D2137", marginBottom: 4 },
  subHeading: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99", marginBottom: 22 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorTxt: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  fieldWrap: { marginBottom: 16 },
  label:     { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 7 },
  inputRow:  {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F9FAFB", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingRight: 12, height: 52, overflow: "hidden",
  },
  iconWrap:  {
    width: 44, height: "100%", alignItems: "center", justifyContent: "center",
    borderRightWidth: 1, borderRightColor: "#E5E7EB",
  },
  input:     {
    flex: 1, fontSize: 14, fontFamily: "Inter_400Regular",
    color: "#111827", paddingHorizontal: 12, height: "100%",
  },
  eyeBtn:    { padding: 6 },

  loginBtn:         { borderRadius: 16, overflow: "hidden", marginTop: 10 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnGrad:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54 },
  loginBtnTxt:      { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  footerHint: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 22, textAlign: "center" },
  version:    { color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },
});
