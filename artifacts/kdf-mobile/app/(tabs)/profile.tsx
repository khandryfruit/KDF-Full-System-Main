import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { riderFetch, useAuth } from "@/context/AuthContext";

const NAV_EXTRA = Platform.OS === "android" ? 84 : 100;

function InfoItem({ icon, label, value, accent }: {
  icon: string; label: string; value?: string | null; accent?: string;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoItem}>
      <View style={[styles.infoIconBox, { backgroundColor: (accent ?? "#6B7A99") + "18" }]}>
        <Feather name={icon as any} size={15} color={accent ?? "#6B7A99"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function PerfStat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <View style={styles.perfStat}>
      <Text style={[styles.perfVal, { color: accent }]}>{value}</Text>
      <Text style={styles.perfLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { rider, token, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const { data } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 30000,
  });

  const s = data?.stats ?? {};
  const initials = (rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const delivered = Number(s.total_delivered ?? 0);
  const failed    = Number(s.failed ?? 0);
  const successRate = (delivered + failed) > 0
    ? Math.round((delivered / (delivered + failed)) * 100)
    : 0;

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: logout },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + NAV_EXTRA }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C", "#0A2A1A"]}
        locations={[0, 0.6, 1]}
        style={[styles.hero, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20 }]}
      >
        <View style={styles.heroTopRow}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTxt}>Active Rider</Text>
          </View>
        </View>

        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
          </View>
        </View>

        <Text style={styles.heroName}>{rider?.name}</Text>

        {!!rider?.delivery_area && (
          <View style={styles.areaRow}>
            <Feather name="map-pin" size={12} color="#00C562" />
            <Text style={styles.areaTxt}>{rider.delivery_area}</Text>
          </View>
        )}

        {!!rider?.vehicle_type && (
          <View style={styles.vehicleRow}>
            <Feather name="truck" size={11} color="rgba(255,255,255,0.4)" />
            <Text style={styles.vehicleTxt}>{rider.vehicle_type}</Text>
          </View>
        )}

        {/* Today mini stats */}
        <View style={styles.heroStatsBar}>
          <PerfStat label="Today"     value={s.assigned_today ?? 0}  accent="#fff" />
          <View style={styles.statsBarDivider} />
          <PerfStat label="Delivered" value={s.delivered_today ?? 0} accent="#4ADE80" />
          <View style={styles.statsBarDivider} />
          <PerfStat label="On Route"  value={s.on_route ?? 0}        accent="#60A5FA" />
          <View style={styles.statsBarDivider} />
          <PerfStat label="Earned"    value={`${Math.round(Number(s.earnings_today ?? 0) / 1000)}k`} accent="#FBBF24" />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {/* Earnings Card */}
        <LinearGradient colors={["#059669", "#047857"]} style={styles.earningsCard}>
          <View>
            <Text style={styles.earningsCardLabel}>All Time Earnings</Text>
            <Text style={styles.earningsCardVal}>Rs. {Number(s.total_earnings ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.earningsCardRight}>
            <Text style={styles.earningsCardLabel}>COD Pending</Text>
            <Text style={styles.earningsCardCod}>Rs. {Number(s.cod_pending ?? 0).toLocaleString()}</Text>
          </View>
        </LinearGradient>

        {/* Performance Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="award" size={16} color="#3B82F6" />
            <Text style={styles.cardTitle}>Lifetime Performance</Text>
          </View>
          <View style={styles.perfGrid}>
            <View style={[styles.perfItem, { backgroundColor: "#ECFDF5" }]}>
              <Text style={[styles.perfBig, { color: "#10B981" }]}>{delivered}</Text>
              <Text style={[styles.perfItemLabel, { color: "#065F46" }]}>Delivered</Text>
            </View>
            <View style={[styles.perfItem, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.perfBig, { color: "#EF4444" }]}>{failed}</Text>
              <Text style={[styles.perfItemLabel, { color: "#991B1B" }]}>Failed</Text>
            </View>
            <View style={[styles.perfItem, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.perfBig, { color: "#3B82F6" }]}>{successRate}%</Text>
              <Text style={[styles.perfItemLabel, { color: "#1E3A5F" }]}>Success</Text>
            </View>
          </View>
        </View>

        {/* Rider Info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="user" size={16} color="#8B5CF6" />
            <Text style={styles.cardTitle}>Rider Info</Text>
          </View>
          <InfoItem icon="phone"       label="Phone Number"   value={rider?.phone}           accent="#3B82F6" />
          <InfoItem icon="message-circle" label="WhatsApp"    value={rider?.whatsapp_number} accent="#16A34A" />
          <InfoItem icon="credit-card" label="CNIC"           value={rider?.cnic}            accent="#7C3AED" />
          <InfoItem icon="dollar-sign" label="Charge/Order"   value={rider?.delivery_charge_per_order != null ? `Rs. ${rider.delivery_charge_per_order}` : null} accent="#D97706" />
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={18} color="#EF4444" />
          </View>
          <Text style={styles.logoutTxt}>Sign Out</Text>
          <Feather name="chevron-right" size={16} color="#EF4444" />
        </TouchableOpacity>

        <Text style={styles.version}>KDF Rider Lahore v2.0 · Auto-syncs every 10s</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F4F9" },
  content: { gap: 0 },

  hero: { paddingHorizontal: 20, paddingBottom: 24, alignItems: "center" },

  heroTopRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", marginBottom: 20,
  },
  heroLogo: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#fff" },
  activePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,197,98,0.18)", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,197,98,0.3)",
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  activeTxt: { color: "#4ADE80", fontSize: 11, fontFamily: "Inter_600SemiBold" },

  avatarWrap: { position: "relative", marginBottom: 14 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#00C562", alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#00C562", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 10,
  },
  avatarTxt: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold" },
  onlineBadge: {
    position: "absolute", bottom: 2, right: 2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#0D1F3C", alignItems: "center", justifyContent: "center",
  },
  onlineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#4ADE80" },

  heroName: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 8 },
  areaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  areaTxt: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontFamily: "Inter_400Regular" },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 18 },
  vehicleTxt: { color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "Inter_400Regular" },

  heroStatsBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8,
    width: "100%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  statsBarDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.1)" },

  perfStat: { flex: 1, alignItems: "center", gap: 4 },
  perfVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  perfLabel: { color: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },

  body: { padding: 14, gap: 12 },

  earningsCard: {
    borderRadius: 20, padding: 20,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    shadowColor: "#059669", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
  },
  earningsCardLabel: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  earningsCardVal: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  earningsCardRight: { alignItems: "flex-end" },
  earningsCardCod: { color: "#FDE68A", fontSize: 18, fontFamily: "Inter_700Bold" },

  card: {
    backgroundColor: "#fff", borderRadius: 20, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
    gap: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  perfGrid: { flexDirection: "row", gap: 10 },
  perfItem: { flex: 1, alignItems: "center", borderRadius: 14, paddingVertical: 14, gap: 4 },
  perfBig: { fontSize: 26, fontFamily: "Inter_700Bold" },
  perfItemLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },

  infoItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F4F9" },
  infoIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#94A3B8" },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0D1F3C", marginTop: 1 },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: "#FECACA",
    shadowColor: "#EF4444", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  logoutIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" },
  logoutTxt: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EF4444" },

  version: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: "#94A3B8", paddingVertical: 4 },
});
