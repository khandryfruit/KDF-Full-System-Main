import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";

const BG     = "#080D1A";
const CARD   = "#0F1729";
const GOLD   = "#F59E0B";
const BORDER = "rgba(255,255,255,0.07)";
const RED    = "#EF4444";

function MenuItem({ icon, label, value, color = "rgba(255,255,255,0.7)", onPress, danger }: {
  icon: string; label: string; value?: string; color?: string;
  onPress?: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={styles.menuItem}
    >
      <View style={[styles.menuIcon, { backgroundColor: danger ? `${RED}18` : "rgba(255,255,255,0.06)" }]}>
        <Feather name={icon as any} size={16} color={danger ? RED : color} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: RED }]}>{label}</Text>
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.2)" style={{ marginLeft: "auto" }} /> : null}
    </TouchableOpacity>
  );
}

export default function AdminProfile() {
  const { adminUser, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const getRoleColor = (role: string) => {
    if (role === "super_admin") return "#F59E0B";
    if (role === "admin") return "#3B82F6";
    return "#10B981";
  };
  const formatRole = (role: string) =>
    (role ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const roleColor = getRoleColor(adminUser?.role ?? "");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Profile Hero */}
      <LinearGradient colors={["#0F1729", "#080D1A"]} style={styles.hero}>
        <View style={[styles.avatarWrap, { borderColor: `${roleColor}40` }]}>
          <LinearGradient colors={[`${roleColor}40`, `${roleColor}20`]} style={styles.avatarGrad}>
            <Text style={styles.avatarTxt}>{adminUser?.name?.charAt(0) ?? "A"}</Text>
          </LinearGradient>
        </View>
        <Text style={styles.heroName}>{adminUser?.name ?? "Admin"}</Text>
        <Text style={styles.heroEmail}>{adminUser?.email ?? ""}</Text>
        <View style={[styles.rolePill, { backgroundColor: `${roleColor}18`, borderColor: `${roleColor}30` }]}>
          <Feather name="shield" size={12} color={roleColor} />
          <Text style={[styles.roleTxt, { color: roleColor }]}>{formatRole(adminUser?.role ?? "")}</Text>
        </View>
      </LinearGradient>

      {/* Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <MenuItem icon="user" label="Name" value={adminUser?.name ?? "—"} />
          <MenuItem icon="mail" label="Email" value={adminUser?.email ?? "—"} />
          <MenuItem icon="shield" label="Role" value={formatRole(adminUser?.role ?? "")} color={roleColor} />
        </View>
      </View>

      {/* App Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <MenuItem icon="sliders" label="Module Controls" onPress={() => router.push("/(admin)/modules" as any)} color={GOLD} />
          <MenuItem icon="bell" label="Notifications" onPress={() => {}} color="#F97316" />
        </View>
      </View>

      {/* Sign Out */}
      <View style={[styles.section, { marginTop: 8 }]}>
        <View style={styles.card}>
          <MenuItem icon="log-out" label="Sign Out" onPress={handleLogout} danger />
        </View>
      </View>

      <Text style={styles.version}>Khan Baba Admin · v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  hero: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: BORDER },
  avatarWrap: { width: 90, height: 90, borderRadius: 28, borderWidth: 2.5, marginBottom: 16, overflow: "hidden" },
  avatarGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  heroName: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  heroEmail: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  roleTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },

  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  card: { backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER, overflow: "hidden" },

  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  menuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontFamily: "Inter_500Medium" },
  menuValue: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: "auto" },

  version: { color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 32 },
});
