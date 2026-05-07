import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
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

function StatCard({
  icon, label, value, color, bg,
}: {
  icon: string; label: string; value: string | number; color: string; bg: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DeliveryCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc    = getStatusColor(d.status);
  const sb    = getStatusBg(d.status);
  const isActive = !["delivered", "failed", "returned"].includes(d.status);

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
      return a?.address1 ?? d.delivery_address ?? "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  const items = (() => {
    try {
      const li = typeof d.line_items === "string" ? JSON.parse(d.line_items) : d.line_items;
      return Array.isArray(li) ? li.length : 0;
    } catch { return 0; }
  })();

  return (
    <TouchableOpacity style={styles.deliveryCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.deliveryLeft, { backgroundColor: sc }]} />
      <View style={{ flex: 1, padding: 14, gap: 4 }}>
        <View style={styles.deliveryRow}>
          <Text style={styles.orderNum}>#{d.shopify_order_number ?? d.id}</Text>
          <View style={[styles.statusPill, { backgroundColor: sb }]}>
            <Text style={[styles.statusPillTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
          </View>
          {isActive && (
            <View style={{ marginLeft: 4 }}>
              <PriorityBadge assignedAt={d.assigned_at} />
            </View>
          )}
        </View>
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>
        <Text style={styles.addrTxt} numberOfLines={1}>{addr}</Text>

        {/* Countdown line for active orders */}
        {isActive && d.assigned_at && (
          <CountdownLine assignedAt={d.assigned_at} />
        )}

        <View style={styles.deliveryMeta}>
          {items > 0 && (
            <View style={styles.metaChip}>
              <Feather name="box" size={10} color={C.mutedForeground} />
              <Text style={styles.metaTxt}>{items} item{items !== 1 ? "s" : ""}</Text>
            </View>
          )}
          <View style={styles.metaChip}>
            <Feather name={d.is_paid ? "check-circle" : "dollar-sign"} size={10} color={d.is_paid ? C.statusDelivered : C.cod} />
            <Text style={[styles.metaTxt, { color: d.is_paid ? C.statusDelivered : C.cod }]}>
              {d.is_paid ? "Paid" : `Rs. ${Number(d.cod_amount ?? 0).toLocaleString()} COD`}
            </Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={C.mutedForeground} style={{ alignSelf: "center", marginRight: 14 }} />
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { rider, token } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const topPad    = insets.top + (Platform.OS === "web" ? 67 : 0);

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

  const s         = statsData?.stats ?? {};
  const allDels   = delData?.deliveries ?? [];

  // Sort active deliveries by urgency
  const active = sortByPriority(
    allDels.filter((d: any) => ["assigned", "picked", "out_for_delivery"].includes(d.status))
  );

  // Critical/high count for alert banner
  const criticalCount = active.filter((d: any) =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const isLoading = sl || dl;
  const refetch   = () => { rs(); rd(); };

  const hour    = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr  = new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "short" });

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Dark header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.riderName}>{rider?.name}</Text>
          <Text style={styles.dateStr}>{dateStr}</Text>
        </View>
        <TouchableOpacity style={styles.avatar} onPress={() => router.push("/(tabs)/profile" as any)}>
          <Text style={styles.avatarTxt}>
            {(rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />}
      >
        {/* Earnings banner */}
        <View style={styles.earningsBanner}>
          <View>
            <Text style={styles.earnLabel}>Today's Earnings</Text>
            <Text style={styles.earnAmount}>Rs. {Number(s.earnings_today ?? 0).toLocaleString()}</Text>
          </View>
          <View style={styles.earnRight}>
            <Text style={styles.earnLabel}>Total Earned</Text>
            <Text style={styles.earnTotal}>Rs. {Number(s.total_earnings ?? 0).toLocaleString()}</Text>
          </View>
        </View>

        {/* Stats grid */}
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.loadingTxt}>Loading...</Text>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <StatCard icon="package"      label="Assigned Today" value={s.assigned_today ?? 0}  color={C.statusAssigned}   bg={C.statusAssignedBg} />
            <StatCard icon="clock"        label="Pending"        value={s.pending ?? 0}           color={C.statusPicked}     bg={C.statusPickedBg} />
            <StatCard icon="truck"        label="On Route"       value={s.on_route ?? 0}          color={C.statusOnRoute}    bg={C.statusOnRouteBg} />
            <StatCard icon="check-circle" label="Delivered"      value={s.total_delivered ?? 0}   color={C.statusDelivered}  bg={C.statusDeliveredBg} />
            <StatCard icon="x-circle"     label="Failed"         value={s.failed ?? 0}            color={C.statusFailed}     bg={C.statusFailedBg} />
            <StatCard icon="dollar-sign"  label="COD Pending"    value={`Rs. ${Math.round(Number(s.cod_pending ?? 0) / 1000)}k`} color={C.cod} bg={C.codBg} />
          </View>
        )}

        {/* COD alert */}
        {Number(s.cod_pending ?? 0) > 0 && (
          <View style={styles.codAlert}>
            <Feather name="alert-circle" size={15} color={C.cod} />
            <Text style={styles.codAlertTxt}>
              Collect <Text style={{ fontFamily: "Inter_700Bold" }}>Rs. {Number(s.cod_pending).toLocaleString()}</Text> COD from customers
            </Text>
          </View>
        )}

        {/* Urgent delivery alert */}
        {criticalCount > 0 && (
          <View style={styles.criticalAlert}>
            <Feather name="alert-octagon" size={16} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.criticalAlertTitle}>
                {criticalCount} Urgent {criticalCount === 1 ? "Delivery" : "Deliveries"}
              </Text>
              <Text style={styles.criticalAlertSub}>Immediate action required</Text>
            </View>
            <TouchableOpacity onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.push("/(tabs)/orders" as any); }}>
              <Text style={styles.criticalAlertLink}>View →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active deliveries */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Text style={styles.sectionTitle}>Active Deliveries</Text>
            {active.length > 0 && (
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}>
                <Text style={styles.seeAll}>View all →</Text>
              </TouchableOpacity>
            )}
          </View>

          {active.length === 0 ? (
            <View style={styles.emptyBox}>
              <Feather name="check-circle" size={36} color={C.statusDelivered} />
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
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: {
    backgroundColor: C.headerBg, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 20, gap: 12,
  },
  greeting:   { color: "rgba(255,255,255,0.65)", fontSize: 13, fontFamily: "Inter_400Regular" },
  riderName:  { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  dateStr:    { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.2)",
  },
  avatarTxt: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },

  scroll: { paddingHorizontal: 16, paddingTop: 0 },

  earningsBanner: {
    backgroundColor: C.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: 16, marginBottom: 14,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  earnLabel:  { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  earnAmount: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  earnRight:  { alignItems: "flex-end" },
  earnTotal:  { color: "rgba(255,255,255,0.9)", fontSize: 18, fontFamily: "Inter_600SemiBold" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 24, justifyContent: "center" },
  loadingTxt: { color: C.mutedForeground, fontFamily: "Inter_400Regular" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  statCard: {
    width: "31%", backgroundColor: C.card, borderRadius: 14, padding: 12,
    borderLeftWidth: 3, gap: 5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statIcon:  { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: C.text },
  statLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 0.3 },

  codAlert: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.codBg,
    borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: "#FFE0B2",
  },
  codAlertTxt: { flex: 1, color: "#E65100", fontSize: 13, fontFamily: "Inter_400Regular" },

  criticalAlert: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff5f5", borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1.5, borderColor: "#fecaca",
  },
  criticalAlertTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#b91c1c" },
  criticalAlertSub:   { fontSize: 11, fontFamily: "Inter_400Regular", color: "#ef4444", marginTop: 1 },
  criticalAlertLink:  { fontSize: 13, fontFamily: "Inter_700Bold", color: "#dc2626" },

  section:    { marginBottom: 8 },
  sectionHdr: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: C.text },
  seeAll:     { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  deliveryList: {
    backgroundColor: C.card, borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  deliveryCard: { flexDirection: "row", alignItems: "stretch", borderBottomWidth: 1, borderBottomColor: C.border },
  deliveryLeft: { width: 4 },
  deliveryRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  orderNum:     { fontSize: 11, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 0.5 },
  statusPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  custName:     { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text },
  addrTxt:      { fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  deliveryMeta: { flexDirection: "row", gap: 10, marginTop: 2 },
  metaChip:     { flexDirection: "row", alignItems: "center", gap: 4 },
  metaTxt:      { fontSize: 11, fontFamily: "Inter_500Medium", color: C.mutedForeground },

  showMoreBtn: { alignItems: "center", paddingVertical: 14, backgroundColor: C.muted },
  showMoreTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  emptyBox:   { alignItems: "center", paddingVertical: 40, gap: 8, backgroundColor: C.card, borderRadius: 16 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyTxt:   { fontSize: 13, fontFamily: "Inter_400Regular", color: C.mutedForeground },
});
