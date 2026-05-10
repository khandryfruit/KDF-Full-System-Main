import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import React, { useState } from "react";
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

const NAV_EXTRA = Platform.OS === "android" ? 96 : 108;

function InfoRow({
  icon, label, value, accent, last,
}: { icon: string; label: string; value?: string | null; accent?: string; last?: boolean }) {
  if (!value) return null;
  return (
    <>
      <View style={styles.infoRow}>
        <View style={[styles.infoIconBox, { backgroundColor: (accent ?? "#6B7A99") + "18" }]}>
          <Feather name={icon as any} size={15} color={accent ?? "#6B7A99"} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
        <Feather name="chevron-right" size={14} color="#CBD5E0" />
      </View>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxVal, { color: accent }]}>{value}</Text>
      <Text style={styles.statBoxLbl}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { rider, token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifState, setNotifState] = useState<"idle" | "sending" | "sent" | "denied">("idle");
  const [pushToken, setPushToken] = useState<string | null>(null);

  /* Check push permission + token on mount */
  React.useEffect(() => {
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") {
        try {
          const t = await Notifications.getExpoPushTokenAsync({
            projectId: "f5433930-a95c-4ac1-857f-dfdafc2fe4d1",
          });
          setPushToken(t.data);
        } catch { /* simulator/web */ }
      }
    })();
  }, []);

  const testNotification = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== "granted") { setNotifState("denied"); setTimeout(() => setNotifState("idle"), 3000); return; }
    }
    setNotifState("sending");
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🛵 نیا آرڈر آیا!",
          body: "Order #TEST-001 — Rs. 2,500 COD — Test notification is working!",
          sound: true,
          data: { test: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 1,
        },
      });
      setNotifState("sent");
      setTimeout(() => setNotifState("idle"), 4000);
    } catch {
      setNotifState("idle");
    }
  };

  const { data } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 30_000,
  });

  const s           = data?.stats ?? {};
  const initials    = (rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const delivered   = Number(s.total_delivered ?? 0);
  const failed      = Number(s.failed ?? 0);
  const successRate = (delivered + failed) > 0
    ? Math.round((delivered / (delivered + failed)) * 100)
    : 0;
  const todayEarned = Number(s.earnings_today ?? 0);
  const totalEarned = Number(s.total_earnings ?? 0);

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
      {/* ── HERO ── */}
      <LinearGradient
        colors={["#060E1C", "#0A1A35", "#071A10"]}
        locations={[0, 0.55, 1]}
        style={[styles.hero, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 20 }]}
      >
        {/* Top bar */}
        <View style={styles.heroTopBar}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <View style={styles.onlinePill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineTxt}>Online</Text>
          </View>
        </View>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <LinearGradient colors={["#00C562", "#009F4F"]} style={styles.avatar}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </LinearGradient>
          <View style={styles.avatarStatus} />
        </View>

        <Text style={styles.heroName}>{rider?.name}</Text>

        {!!rider?.delivery_area && (
          <View style={styles.heroChip}>
            <Feather name="map-pin" size={11} color="#00C562" />
            <Text style={styles.heroChipTxt}>{rider.delivery_area}</Text>
          </View>
        )}
        {!!rider?.vehicle_type && (
          <Text style={styles.vehicleTxt}>{rider.vehicle_type}</Text>
        )}

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <StatBox label="Today"     value={s.assigned_today ?? 0}  accent="#fff" />
          <View style={styles.statsBarDivider} />
          <StatBox label="Delivered" value={s.delivered_today ?? 0} accent="#4ADE80" />
          <View style={styles.statsBarDivider} />
          <StatBox label="On Route"  value={s.on_route ?? 0}        accent="#60A5FA" />
          <View style={styles.statsBarDivider} />
          <StatBox label="Earned"
            value={todayEarned >= 1000 ? `${Math.round(todayEarned / 1000)}k` : todayEarned}
            accent="#FBBF24"
          />
        </View>
      </LinearGradient>

      {/* ── BODY ── */}
      <View style={styles.body}>

        {/* Earnings banner */}
        <LinearGradient colors={["#047857", "#059669"]} style={styles.earningsBanner}>
          <View style={styles.earningsBannerLeft}>
            <Text style={styles.earningsBannerLbl}>All Time Earnings</Text>
            <Text style={styles.earningsBannerVal}>Rs. {totalEarned.toLocaleString()}</Text>
          </View>
          <View style={styles.earningsBannerDivider} />
          <View style={styles.earningsBannerRight}>
            <Text style={styles.earningsBannerLbl}>COD Pending</Text>
            <Text style={[styles.earningsBannerVal, { color: "#FDE68A", fontSize: 20 }]}>
              Rs. {Number(s.cod_pending ?? 0).toLocaleString()}
            </Text>
          </View>
        </LinearGradient>

        {/* Lifetime performance */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "#EFF6FF" }]}>
              <Feather name="award" size={15} color="#3B82F6" />
            </View>
            <Text style={styles.cardTitle}>Lifetime Performance</Text>
          </View>
          <View style={styles.perfGrid}>
            <View style={[styles.perfTile, { backgroundColor: "#ECFDF5" }]}>
              <Text style={[styles.perfTileVal, { color: "#10B981" }]}>{delivered}</Text>
              <Text style={[styles.perfTileLbl, { color: "#065F46" }]}>Delivered</Text>
            </View>
            <View style={[styles.perfTile, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.perfTileVal, { color: "#EF4444" }]}>{failed}</Text>
              <Text style={[styles.perfTileLbl, { color: "#991B1B" }]}>Failed</Text>
            </View>
            <View style={[styles.perfTile, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.perfTileVal, { color: "#3B82F6" }]}>{successRate}%</Text>
              <Text style={[styles.perfTileLbl, { color: "#1E3A5F" }]}>Success</Text>
            </View>
          </View>
        </View>

        {/* Rider Info */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "#F5F3FF" }]}>
              <Feather name="user" size={15} color="#7C3AED" />
            </View>
            <Text style={styles.cardTitle}>Rider Info</Text>
          </View>
          <InfoRow icon="phone"          label="Phone Number"   value={rider?.phone}               accent="#3B82F6" />
          <InfoRow icon="message-circle" label="WhatsApp"       value={rider?.whatsapp_number}     accent="#16A34A" />
          <InfoRow icon="credit-card"    label="CNIC"           value={rider?.cnic}                accent="#7C3AED" />
          <InfoRow icon="dollar-sign"    label="Charge / Order"
            value={rider?.delivery_charge_per_order != null ? `Rs. ${rider.delivery_charge_per_order}` : null}
            accent="#D97706"
            last
          />
        </View>

        {/* App Info */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "#F0F9FF" }]}>
              <Feather name="info" size={15} color="#0EA5E9" />
            </View>
            <Text style={styles.cardTitle}>App Info</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: "#F0F9FF" }]}>
              <Feather name="smartphone" size={15} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Version</Text>
              <Text style={styles.infoValue}>KDF Rider Lahore v2.0</Text>
            </View>
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: "#ECFDF5" }]}>
              <Feather name="refresh-cw" size={15} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Auto-sync</Text>
              <Text style={styles.infoValue}>Every 10 seconds</Text>
            </View>
          </View>
        </View>

        {/* ── Notification Settings ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardHeadIcon, { backgroundColor: "#FFF7ED" }]}>
              <Feather name="bell" size={15} color="#F97316" />
            </View>
            <Text style={styles.cardTitle}>Notifications</Text>
            <View style={[styles.notifStatusPill,
              { backgroundColor: pushToken ? "#ECFDF5" : "#FEF2F2",
                borderColor: pushToken ? "#BBF7D0" : "#FECACA" }]}>
              <View style={[styles.notifDot, { backgroundColor: pushToken ? "#22C55E" : "#F87171" }]} />
              <Text style={[styles.notifStatusTxt, { color: pushToken ? "#15803D" : "#B91C1C" }]}>
                {pushToken ? "Push Active" : "Not Registered"}
              </Text>
            </View>
          </View>

          {/* Push token preview */}
          {pushToken && (
            <View style={styles.tokenBox}>
              <Feather name="shield" size={12} color="#22C55E" />
              <Text style={styles.tokenTxt} numberOfLines={1}>{pushToken.slice(0, 40)}…</Text>
            </View>
          )}

          {/* Status rows */}
          <View style={styles.notifInfoRow}>
            <Feather name="volume-2" size={13} color="#6B7280" />
            <Text style={styles.notifInfoTxt}>Custom chime sound — نیا آرڈر notification tone</Text>
          </View>
          <View style={styles.notifInfoRow}>
            <Feather name="zap" size={13} color="#6B7280" />
            <Text style={styles.notifInfoTxt}>Haptic vibration on every new order</Text>
          </View>
          <View style={styles.notifInfoRow}>
            <Feather name="refresh-cw" size={13} color="#6B7280" />
            <Text style={styles.notifInfoTxt}>Auto-poll every 12 seconds when app is open</Text>
          </View>

          {/* Test button */}
          <TouchableOpacity
            style={[styles.testNotifBtn,
              notifState === "sent"    && { backgroundColor: "#ECFDF5", borderColor: "#86EFAC" },
              notifState === "denied"  && { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
              notifState === "sending" && { opacity: 0.7 },
            ]}
            onPress={testNotification}
            disabled={notifState === "sending"}
            activeOpacity={0.8}
          >
            <Feather
              name={notifState === "sent" ? "check-circle" : notifState === "denied" ? "x-circle" : "bell"}
              size={16}
              color={notifState === "sent" ? "#16A34A" : notifState === "denied" ? "#DC2626" : "#F97316"}
            />
            <Text style={[styles.testNotifTxt,
              notifState === "sent"   && { color: "#16A34A" },
              notifState === "denied" && { color: "#DC2626" },
            ]}>
              {notifState === "sending" ? "بھیجا جا رہا ہے…"
               : notifState === "sent"  ? "✅ Notification آ گئی!"
               : notifState === "denied" ? "⚠ Permission نہیں ملی"
               : "Test Notification بھیجیں"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <View style={styles.logoutIcon}>
            <Feather name="log-out" size={18} color="#EF4444" />
          </View>
          <Text style={styles.logoutTxt}>Sign Out</Text>
          <Feather name="arrow-right" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F3F8" },
  content: { gap: 0 },

  /* Hero */
  hero: { paddingHorizontal: 20, paddingBottom: 26, alignItems: "center" },

  heroTopBar: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", width: "100%", marginBottom: 24,
  },
  heroLogo: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#fff" },
  onlinePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,197,98,0.16)", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,197,98,0.28)",
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },
  onlineTxt: { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  avatarWrap: { position: "relative", marginBottom: 16 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#00C562", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 18, elevation: 12,
  },
  avatarTxt: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  avatarStatus: {
    position: "absolute", bottom: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#4ADE80", borderWidth: 3, borderColor: "#0A1628",
  },

  heroName: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 10 },
  heroChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,197,98,0.14)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: "rgba(0,197,98,0.25)", marginBottom: 5,
  },
  heroChipTxt: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_500Medium" },
  vehicleTxt: { color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 20 },

  statsBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18, paddingVertical: 14, paddingHorizontal: 8,
    width: "100%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  statsBarDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.1)" },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statBoxVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statBoxLbl: {
    color: "rgba(255,255,255,0.38)", fontSize: 9,
    fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5,
  },

  /* Body */
  body: { padding: 14, gap: 12 },

  /* Earnings banner */
  earningsBanner: {
    borderRadius: 22, padding: 22,
    flexDirection: "row", alignItems: "center",
    shadowColor: "#059669", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  earningsBannerLeft: { flex: 1 },
  earningsBannerDivider: { width: 1, height: 42, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 18 },
  earningsBannerRight: { flex: 1, alignItems: "flex-end" },
  earningsBannerLbl: {
    color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
  },
  earningsBannerVal: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },

  /* Cards */
  card: {
    backgroundColor: "#fff", borderRadius: 20, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, gap: 14,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeadIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  /* Performance grid */
  perfGrid: { flexDirection: "row", gap: 10 },
  perfTile: { flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 16, gap: 5 },
  perfTileVal: { fontSize: 28, fontFamily: "Inter_700Bold" },
  perfTileLbl: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },

  /* Info rows */
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  infoIconBox: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#94A3B8" },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#0D1F3C", marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: "#F0F3F8" },

  /* Notification card */
  notifStatusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, marginLeft: "auto",
  },
  notifDot: { width: 7, height: 7, borderRadius: 4 },
  notifStatusTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  tokenBox: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#F0FDF4", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "#BBF7D0",
  },
  tokenTxt: { flex: 1, fontSize: 10, fontFamily: "Inter_400Regular", color: "#166534" },
  notifInfoRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 5,
  },
  notifInfoTxt: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", flex: 1 },
  testNotifBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#FFF7ED", borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: "#FED7AA",
    marginTop: 4,
  },
  testNotifTxt: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#F97316",
  },

  /* Logout */
  logoutBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: "#FECACA",
    shadowColor: "#EF4444", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  logoutIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" },
  logoutTxt: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
});
