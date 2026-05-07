import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { riderFetch, useAuth } from "@/context/AuthContext";
import colors, { getStatusColor, getStatusBg, getStatusLabel } from "@/constants/colors";
import { PriorityBadge, CountdownLine } from "@/components/PriorityTimer";
import { sortByPriority, getPriorityInfo } from "@/utils/priority";

const C = colors.light;

function StatCard({ icon, label, value, color, bg }: {
  icon: string; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={17} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DeliveryCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc = getStatusColor(d.status);
  const sb = getStatusBg(d.status);
  const isActive = !["delivered", "failed", "returned"].includes(d.status);
  const cod = Number(d.cod_amount ?? 0);

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  return (
    <TouchableOpacity style={styles.deliveryCard} onPress={onPress} activeOpacity={0.78}>
      <View style={[styles.accentBar, { backgroundColor: sc }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={styles.orderNum}>#{d.shopify_order_number ?? d.id}</Text>
          <View style={[styles.statusPill, { backgroundColor: sb }]}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
          </View>
          {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
          <Feather name="chevron-right" size={15} color={C.border} style={{ marginLeft: "auto" }} />
        </View>

        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        <View style={styles.infoRow}>
          <Feather name="map-pin" size={11} color={C.mutedForeground} />
          <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
        </View>

        {isActive && d.assigned_at && <CountdownLine assignedAt={d.assigned_at} />}

        <View style={[styles.cardFooter, { backgroundColor: d.is_paid ? "#E8F5E9" : "#FFF8E1" }]}>
          <Feather name={d.is_paid ? "check-circle" : "dollar-sign"} size={12} color={d.is_paid ? C.statusDelivered : C.cod} />
          <Text style={[styles.codTxt, { color: d.is_paid ? C.statusDelivered : C.cod }]}>
            {d.is_paid ? "PAID" : `COD: Rs. ${cod.toLocaleString()}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { rider, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const { data: statsData, isLoading: sl, refetch: rs } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const { data: delData, isLoading: dl, refetch: rd } = useQuery({
    queryKey: ["rider-deliveries-all"],
    queryFn: async () => { const r = await riderFetch("/rider/deliveries", token); return r.json(); },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const s = statsData?.stats ?? {};
  const allDels = delData?.deliveries ?? [];
  const active = sortByPriority(
    allDels.filter((d: any) => ["assigned", "picked", "out_for_delivery"].includes(d.status))
  );
  const criticalCount = active.filter((d: any) =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const isLoading = sl || dl;
  const refetch = () => { rs(); rd(); };

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "آرام کریں" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Premium Header */}
      <LinearGradient colors={["#0D2137", "#0F2A47"]} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.logoMiniWrap}>
              <Image source={require("../../assets/images/icon.png")} style={styles.logoMini} resizeMode="contain" />
            </View>
            <View>
              <Text style={styles.greetingTxt}>{greeting} 👋</Text>
              <Text style={styles.riderName}>{rider?.name}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
          >
            <Text style={styles.avatarTxt}>
              {(rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Earnings Strip */}
        <View style={styles.earningStrip}>
          <View style={styles.earningItem}>
            <Text style={styles.earningItemLabel}>Today's Earnings</Text>
            <Text style={styles.earningItemVal}>Rs. {Number(s.earnings_today ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.earningDivider} />
          <View style={styles.earningItem}>
            <Text style={styles.earningItemLabel}>Active Orders</Text>
            <Text style={styles.earningItemVal}>{active.length}</Text>
          </View>
          <View style={styles.earningDivider} />
          <View style={styles.earningItem}>
            <Text style={styles.earningItemLabel}>Delivered Today</Text>
            <Text style={styles.earningItemVal}>{s.delivered_today ?? 0}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />}
      >
        {/* Urgent alert */}
        {criticalCount > 0 && (
          <TouchableOpacity
            style={styles.urgentAlert}
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.push("/(tabs)/orders" as any); }}
            activeOpacity={0.85}
          >
            <View style={styles.urgentIcon}>
              <Feather name="alert-octagon" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentTitle}>{criticalCount} Urgent {criticalCount === 1 ? "Delivery" : "Deliveries"}</Text>
              <Text style={styles.urgentSub}>فوری توجہ درکار ہے — ابھی دیکھیں</Text>
            </View>
            <Feather name="arrow-right" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* COD alert */}
        {Number(s.cod_pending ?? 0) > 0 && (
          <View style={styles.codAlert}>
            <Feather name="dollar-sign" size={16} color="#FF6F00" />
            <Text style={styles.codAlertTxt}>
              COD جمع کریں: <Text style={{ fontFamily: "Inter_700Bold" }}>Rs. {Number(s.cod_pending).toLocaleString()}</Text>
            </Text>
          </View>
        )}

        {/* Stats Grid */}
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loadingTxt}>Loading...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Today's Stats</Text>
            <View style={styles.statsGrid}>
              <StatCard icon="package"      label="Assigned"  value={s.assigned_today ?? 0}  color={C.statusAssigned}  bg={C.statusAssignedBg} />
              <StatCard icon="truck"        label="On Route"  value={s.on_route ?? 0}         color={C.statusOnRoute}   bg={C.statusOnRouteBg} />
              <StatCard icon="check-circle" label="Delivered" value={s.delivered_today ?? 0}  color={C.statusDelivered} bg={C.statusDeliveredBg} />
              <StatCard icon="clock"        label="Pending"   value={s.pending ?? 0}          color={C.statusPicked}    bg={C.statusPickedBg} />
              <StatCard icon="x-circle"     label="Failed"    value={s.failed ?? 0}           color={C.statusFailed}    bg={C.statusFailedBg} />
              <StatCard icon="dollar-sign"  label="COD"       value={`${Math.round(Number(s.cod_pending ?? 0) / 1000)}k`} color={C.cod} bg={C.codBg} />
            </View>
          </>
        )}

        {/* Active Deliveries */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Deliveries</Text>
          {active.length > 0 && (
            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}>
              <Text style={styles.seeAll}>View all →</Text>
            </TouchableOpacity>
          )}
        </View>

        {active.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <Feather name="check-circle" size={32} color={C.statusDelivered} />
            </View>
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptyTxt}>No active deliveries right now.</Text>
          </View>
        ) : (
          <View style={styles.deliveryList}>
            {active.slice(0, 6).map((d: any) => (
              <DeliveryCard
                key={d.id}
                d={d}
                onPress={() => { Haptics.selectionAsync(); router.push(`/order/${d.id}` as any); }}
              />
            ))}
            {active.length > 6 && (
              <TouchableOpacity style={styles.showMoreBtn} onPress={() => router.push("/(tabs)/orders" as any)}>
                <Text style={styles.showMoreTxt}>Show {active.length - 6} more orders</Text>
                <Feather name="arrow-right" size={14} color={C.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 18, paddingBottom: 0 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMiniWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#00B85A", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  logoMini: { width: 36, height: 36, borderRadius: 8 },
  greetingTxt: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_400Regular" },
  riderName:   { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 1 },
  avatarBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.2)",
  },
  avatarTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },

  earningStrip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14,
    marginBottom: 18, marginTop: 4,
  },
  earningItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  earningItemLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 },
  earningItemVal:   { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  earningDivider: { width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.1)" },

  scroll: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },

  urgentAlert: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#DC2626", borderRadius: 16, padding: 14,
    shadowColor: "#DC2626", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  urgentIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  urgentTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  urgentSub:   { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  codAlert: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFF8E1", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#FFE0B2",
  },
  codAlertTxt: { flex: 1, color: "#E65100", fontSize: 13, fontFamily: "Inter_400Regular" },

  loadingBox: { alignItems: "center", gap: 10, paddingVertical: 32 },
  loadingTxt: { color: C.mutedForeground, fontFamily: "Inter_400Regular" },

  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: C.text },
  seeAll: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "30.5%", flexGrow: 1,
    backgroundColor: C.card, borderRadius: 14, padding: 13,
    borderTopWidth: 3, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statIcon:  { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 0.3 },

  deliveryList: { gap: 10 },
  deliveryCard: {
    flexDirection: "row", backgroundColor: C.card, borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  accentBar: { width: 4 },
  cardContent: { flex: 1, padding: 13, gap: 5 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  orderNum: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 0.5 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  custName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  infoTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginTop: 2 },
  codTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },

  showMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: C.card, borderRadius: 14 },
  showMoreTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  emptyBox: { alignItems: "center", paddingVertical: 36, gap: 8, backgroundColor: C.card, borderRadius: 18 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.statusDeliveredBg, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyTxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.mutedForeground },
});
