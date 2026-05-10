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

export default function LoginScreen() {
  const { userRole, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Already logged in → redirect */
  if (userRole === "admin") {
    router.replace("/(admin)");
    return null;
  }
  if (userRole === "rider") {
    router.replace("/(tabs)");
    return null;
  }

  const isEmail = identifier.includes("@");
  const loginHint = isEmail ? "Admin / Super Admin" : "Rider";
  const loginColor = isEmail ? "#F59E0B" : "#00C562";

  const handleLogin = async () => {
    setError("");
    if (!identifier.trim()) {
      setError("Email ya Phone number درج کریں");
      return;
    }
    if (!password) {
      setError("Password درج کریں");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* AuthContext sets userRole — _layout will redirect automatically */
    } else {
      setError(result.error ?? "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <LinearGradient
      colors={isEmail ? ["#0A0F1E", "#1A0E00", "#0A0F1E"] : ["#0D2137", "#0A3D2E", "#0D2137"]}
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
            <View style={[styles.logoRing, { borderColor: `${loginColor}30`, shadowColor: loginColor }]}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandName}>KDF NUTS</Text>
            <Text style={styles.brandSub}>Khan Baba Dry Fruits</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${loginColor}18`, borderColor: `${loginColor}30` }]}>
              <View style={[styles.roleDot, { backgroundColor: loginColor }]} />
              <Text style={[styles.roleLabel, { color: loginColor }]}>
                {identifier.trim() ? loginHint + " Login" : "Rider / Admin Portal"}
              </Text>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Welcome Back</Text>
            <Text style={styles.subHeading}>
              {isEmail ? "Admin email & password درج کریں" : "Phone number & password درج کریں"}
            </Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorTxt}>{error}</Text>
              </View>
            )}

            {/* Identifier */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Email یا Phone</Text>
              <View style={[styles.inputRow, { borderColor: identifier ? `${loginColor}40` : "#E5E7EB" }]}>
                <View style={[styles.iconWrap, { backgroundColor: `${loginColor}12` }]}>
                  <Feather name={isEmail ? "mail" : "phone"} size={15} color={loginColor} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="admin@kdfnuts.com  یا  03xx-xxxxxxx"
                  placeholderTextColor="#9CA3AF"
                  keyboardType={isEmail ? "email-address" : "phone-pad"}
                  autoCapitalize="none"
                  value={identifier}
                  onChangeText={v => { setIdentifier(v); setError(""); }}
                  returnKeyType="next"
                />
              </View>
              <Text style={[styles.hint, { color: loginColor }]}>
                {isEmail ? "🛡  Admin access detected" : "🚴  Rider access mode"}
              </Text>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <View style={[styles.iconWrap, { backgroundColor: `${loginColor}12` }]}>
                  <Feather name="lock" size={15} color={loginColor} />
                </View>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Enter password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={15} color="#9CA3AF" />
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
                colors={isEmail ? ["#F59E0B", "#D97706"] : ["#00D466", "#00B85A"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.loginBtnGrad}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="log-in" size={16} color="#fff" />
                      <Text style={styles.loginBtnTxt}>Sign In</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerHint}>
            {isEmail ? "Admin access — admin@kdfnuts.com" : "Password بھول گئے؟ Admin سے رابطہ کریں"}
          </Text>
          <Text style={styles.version}>Khan Baba Super App · v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },

  logoWrap: { alignItems: "center", marginBottom: 32, gap: 6 },
  logoRing: {
    width: 120, height: 120, borderRadius: 34, borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },
  logoImg: { width: 100, height: 100, borderRadius: 28 },
  brandName: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  brandSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginTop: 6,
  },
  roleDot: { width: 7, height: 7, borderRadius: 4 },
  roleLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  card: {
    width: "100%", maxWidth: 420, backgroundColor: "#fff",
    borderRadius: 24, padding: 28,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 28, elevation: 16,
  },
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#0D2137", marginBottom: 4 },
  subHeading: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99", marginBottom: 22 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorTxt: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 7 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F9FAFB", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingRight: 12, height: 52, overflow: "hidden",
  },
  iconWrap: {
    width: 44, height: "100%", alignItems: "center", justifyContent: "center",
    borderRightWidth: 1, borderRightColor: "#E5E7EB",
  },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Inter_400Regular",
    color: "#111827", paddingHorizontal: 12, height: "100%",
  },
  eyeBtn: { padding: 6 },
  hint: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 5 },

  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 10 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54 },
  loginBtnTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  footerHint: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 22, textAlign: "center" },
  version: { color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },
});
