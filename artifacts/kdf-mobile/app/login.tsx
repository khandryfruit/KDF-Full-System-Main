import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const { rider, login } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (rider) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    setError("");
    if (!phone.trim()) { setError("Phone number درج کریں"); return; }
    if (!password) { setError("Password درج کریں"); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await login(phone.trim(), password);
    setLoading(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else {
      setError(result.error ?? "Login failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <LinearGradient colors={["#0D2137", "#0A3D2E", "#0D2137"]} locations={[0, 0.5, 1]} style={styles.root}>
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
            <View style={styles.logoImageContainer}>
              <Image
                source={require("../assets/images/icon.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandSub}>Rider Portal</Text>
            <View style={styles.poweredBadge}>
              <View style={styles.poweredDot} />
              <Text style={styles.poweredTxt}>Live Delivery Platform</Text>
            </View>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Sign In</Text>
            <Text style={styles.subHeading}>Enter your credentials to continue</Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Phone */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputIconWrap}>
                  <Feather name="phone" size={15} color="#00B85A" />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="03xx-xxxxxxx"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputIconWrap}>
                  <Feather name="lock" size={15} color="#00B85A" />
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
              <LinearGradient colors={["#00D466", "#00B85A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtnGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Feather name="log-in" size={16} color="#fff" />
                      <Text style={styles.loginBtnText}>Sign In</Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>Password بھول گئے؟ Admin سے رابطہ کریں</Text>
          <Text style={styles.version}>KDF Rider Lahore v2.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24 },

  logoWrap: { alignItems: "center", marginBottom: 32 },
  logoImageContainer: {
    width: 130, height: 130, borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#00B85A", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
  },
  logoImage: { width: 120, height: 120, borderRadius: 20 },
  brandSub: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontFamily: "Inter_500Medium", letterSpacing: 1.5, marginBottom: 8 },
  poweredBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,184,90,0.15)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,184,90,0.3)" },
  poweredDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#00D466" },
  poweredTxt: { color: "#00D466", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  card: {
    width: "100%", maxWidth: 420, backgroundColor: "#fff",
    borderRadius: 24, padding: 28,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 28, elevation: 16,
  },
  heading: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#0D2137", marginBottom: 4 },
  subHeading: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7A99", marginBottom: 22 },

  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#374151", marginBottom: 7 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F9FAFB", borderRadius: 14,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    paddingRight: 12, height: 52, overflow: "hidden",
  },
  inputIconWrap: {
    width: 44, height: "100%", alignItems: "center", justifyContent: "center",
    backgroundColor: "#F0FDF6", borderRightWidth: 1, borderRightColor: "#E5E7EB",
  },
  input: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular",
    color: "#111827", paddingHorizontal: 12, height: "100%",
  },
  eyeBtn: { padding: 6 },

  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 10 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54 },
  loginBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  hint: { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 22, textAlign: "center" },
  version: { color: "rgba(255,255,255,0.25)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },
});
