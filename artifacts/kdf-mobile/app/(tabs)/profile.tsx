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
import colors from "@/constants/colors";

const C = colors.light;

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Feather name={icon as any} size={14} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatBubble({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statBubble}>
      <Text style={[styles.statBubbleVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statBubbleLbl}>{label}</Text>
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

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, {
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 90),
      }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Header */}
      <LinearGradient
        colors={["#0D2137", "#0F2A47"]}
        style={[styles.hero, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20 }]}
      >
        {/* Logo + avatar */}
        <View style={styles.heroTop}>
          <Image source={require("../../assets/images/icon.png")} style={styles.heroLogo} resizeMode="contain" />
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarTxt}>{initials}</Text>
          </View>
        </View>

        <Text style={styles.heroName}>{rider?.name}</Text>

        <View style={styles.heroBadgeRow}>
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBadgeTxt}>Active Rider</Text>
          </View>
          {!!rider?.vehicle_type && (
            <View style={styles.vehicleBadge}>
              <Feather name="truck" size={11} color="rgba(255,255,255,0.7)" />
              <Text style={styles.vehicleBadgeTxt}>{rider.vehicle_type}</Text>
            </View>
          )}
        </View>

        {!!rider?.delivery_area && (
          <View style={styles.areaBadge}>
            <Feather name="map-pin" size={12} color={C.primary} />
            <Text style={styles.areaBadgeTxt}>{rider.delivery_area}</Text>
          </View>
        )}

        {/* Today stats bubbles */}
        <View style={styles.statsBubbleRow}>
          <StatBubble label="Today" value={s.assigned_today ?? 0} />
          <StatBubble label="Delivered" value={s.delivered_today ?? 0} color={C.statusDelivered} />
          <StatBubble label="On Route" value={s.on_route ?? 0} color={C.statusOnRoute} />
          <StatBubble label="Earned" value={`Rs.${Math.round(Number(s.earnings_today ?? 0) / 1000)}k`} color={C.primary} />
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={styles.body}>
        {/* Today Earnings Card */}
        <LinearGradient colors={["#00B85A", "#007A3D"]} style={styles.earningsCard}>
          <View>
            <Text style={styles.earningsLabel}>Total Earnings (All Time)</Text>
            <Text style={styles.earningsVal}>Rs. {Number(s.total_earnings ?? 0).toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.earningsLabel}>COD Pending</Text>
            <Text style={styles.earningsCod}>Rs. {Number(s.cod_pending ?? 0).toLocaleString()}</Text>
          </View>
        </LinearGradient>

        {/* Rider Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rider Info</Text>
          <InfoRow icon="phone"       label="Phone"          value={rider?.phone} />
          <InfoRow icon="message-circle" label="WhatsApp"    value={rider?.whatsapp_number} />
          <InfoRow icon="credit-card" label="CNIC"           value={rider?.cnic} />
          <InfoRow icon="dollar-sign" label="Charge/Order"   value={rider?.delivery_charge_per_order != null ? `Rs. ${rider.delivery_charge_per_order}` : null} />
        </View>

        {/* Overall Stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lifetime Performance</Text>
          <View style={styles.statRowItem}>
            <Text style={styles.statRowLabel}>Total Delivered</Text>
            <Text style={[styles.statRowVal, { color: C.primary }]}>{s.total_delivered ?? 0}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statRowItem}>
            <Text style={styles.statRowLabel}>Total Failed</Text>
            <Text style={[styles.statRowVal, { color: s.failed > 0 ? C.statusFailed : C.mutedForeground }]}>{s.failed ?? 0}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statRowItem}>
            <Text style={styles.statRowLabel}>Success Rate</Text>
            <Text style={[styles.statRowVal, { color: C.statusDelivered }]}>
              {s.total_delivered > 0
                ? `${Math.round((s.total_delivered / (s.total_delivered + (s.failed ?? 0))) * 100)}%`
                : "—"
              }
            </Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Feather name="log-out" size={18} color="#EF4444" />
          <Text style={styles.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>KDF Rider Lahore v2.0 · Auto-syncs every 10s</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  content: { gap: 0 },

  hero: { paddingHorizontal: 20, paddingBottom: 24, alignItems: "center" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 16 },
  heroLogo: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#fff" },
  heroAvatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.2)",
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  heroAvatarTxt: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  heroName: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 10 },

  heroBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,184,90,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(0,184,90,0.3)",
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  activeBadgeTxt: { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  vehicleBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  vehicleBadgeTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  areaBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 16 },
  areaBadgeTxt: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },

  statsBubbleRow: {
    flexDirection: "row", gap: 0,
    backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14,
    width: "100%", overflow: "hidden",
  },
  statBubble: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statBubbleVal: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  statBubbleLbl: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },

  body: { padding: 14, gap: 12 },

  earningsCard: {
    borderRadius: 18, padding: 18,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    shadowColor: C.primary, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  earningsLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 3 },
  earningsVal:   { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  earningsCod:   { color: "rgba(255,255,255,0.9)", fontSize: 18, fontFamily: "Inter_600SemiBold" },

  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  infoIconWrap: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text, marginTop: 1 },

  statRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11 },
  statRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.text },
  statRowVal:   { fontSize: 16, fontFamily: "Inter_700Bold", color: C.text },
  statDivider:  { height: 1, backgroundColor: C.border },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#FEF2F2", borderRadius: 16, paddingVertical: 15,
    borderWidth: 1.5, borderColor: "#FECACA",
  },
  logoutTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  version: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground },
});
