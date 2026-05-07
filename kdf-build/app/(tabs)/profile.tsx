import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
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
      <View style={styles.infoIcon}>
        <Feather name={icon as any} size={14} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
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
  const initials = (rider?.name ?? "R").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

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
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 90) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarTxt}>{initials}</Text>
        </View>
        <Text style={styles.heroName}>{rider?.name}</Text>
        <View style={styles.heroBadge}>
          <View style={styles.activeDot} />
          <Text style={styles.heroBadgeTxt}>Active Rider</Text>
        </View>
        {!!rider?.delivery_area && (
          <View style={styles.areaChip}>
            <Feather name="map-pin" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.areaChipTxt}>{rider.delivery_area}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rider Info</Text>
        <InfoRow icon="phone" label="Phone" value={rider?.phone} />
        <InfoRow icon="message-circle" label="WhatsApp" value={rider?.whatsapp_number} />
        <InfoRow icon="truck" label="Vehicle" value={rider?.vehicle_type} />
        <InfoRow icon="map-pin" label="Area" value={rider?.delivery_area} />
        <InfoRow icon="credit-card" label="CNIC" value={rider?.cnic} />
        <InfoRow icon="dollar-sign" label="Charge/Order" value={rider?.delivery_charge_per_order != null ? `Rs. ${rider.delivery_charge_per_order}` : null} />
      </View>

      {/* Today's Performance */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today</Text>
        <StatRow label="Assigned" value={s.assigned_today ?? 0} />
        <StatRow label="Pending" value={s.pending ?? 0} color={C.statusPicked} />
        <StatRow label="On Route" value={s.on_route ?? 0} color={C.statusOnRoute} />
        <StatRow label="Delivered" value={s.delivered_today ?? 0} color={C.statusDelivered} />
        <View style={styles.divider} />
        <StatRow label="Today's Earnings" value={`Rs. ${Number(s.earnings_today ?? 0).toLocaleString()}`} color={C.primary} />
      </View>

      {/* Overall */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Overall</Text>
        <StatRow label="Total Delivered" value={s.total_delivered ?? 0} color={C.primary} />
        <StatRow label="Total Failed" value={s.failed ?? 0} color={C.statusFailed} />
        <View style={styles.divider} />
        <StatRow label="Total Earnings" value={`Rs. ${Number(s.total_earnings ?? 0).toLocaleString()}`} color={C.primary} />
        <StatRow label="COD Pending" value={`Rs. ${Number(s.cod_pending ?? 0).toLocaleString()}`} color={C.cod} />
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Feather name="log-out" size={17} color={C.statusFailed} />
        <Text style={styles.logoutTxt}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>KDF Rider App v1.0 • Auto-syncs every 10s</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 16, gap: 14 },

  hero: {
    backgroundColor: C.headerBg, marginHorizontal: -16, paddingHorizontal: 16,
    paddingTop: 24, paddingBottom: 28, alignItems: "center", gap: 8,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, marginBottom: 6,
  },
  avatarCircle: {
    width: 74, height: 74, borderRadius: 37, backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.2)",
    marginBottom: 4,
  },
  avatarTxt: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold" },
  heroName: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  heroBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  heroBadgeTxt: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  areaChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  areaChipTxt: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular" },

  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  infoIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primaryLight, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium", color: C.text, marginTop: 1 },

  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.text },
  statValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 6 },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#FFEBEE", borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#FFCDD2",
  },
  logoutTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.statusFailed },
  version: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, paddingBottom: 4 },
});
