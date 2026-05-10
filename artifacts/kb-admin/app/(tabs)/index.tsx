import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adminFetch, useAuth } from "@/context/AuthContext";

const BG     = "#080D1A";
const CARD   = "#0F1729";
const GOLD   = "#F59E0B";
const GOLD2  = "#FCD34D";
const BORDER = "rgba(255,255,255,0.07)";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const BLUE   = "#3B82F6";

function KpiCard({ icon, label, value, sub, color, onPress }: {
  icon: string; label: string; value: string | number; sub?: string; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} style={[styles.kpi, { borderColor: `${color}22` }]}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={[styles.kpiSub, { color }]}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

function StatRow({ label, value, color = "#fff" }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.qaBtn, { borderColor: `${color}20` }]}>
      <View style={[styles.qaIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function getStatusColor(s: string) {
  const map: Record<string, string> = {
    delivered: "#10B981", assigned: "#F59E0B", picked: "#3B82F6",
    out_for_delivery: "#8B5CF6", failed: "#EF4444", returned: "#F97316", near_customer: "#06B6D4",
  };
  return map[s] ?? "#6B7280";
}
function formatStatus(s: string) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

export default function AdminDashboard() {
  const { adminUser, token } = useAuth();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await adminFetch("/admin/riders/live-dashboard", token);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    fetchDashboard();
    pollRef.current = setInterval(fetchDashboard, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchDashboard]);

  const onRefresh = () => { setRefreshing(true); fetchDashboard(); };

  const stats    = data?.stats ?? {};
  const riders   = (data?.activeRiders ?? []) as any[];
  const activity = (data?.recentActivity ?? []) as any[];
  const onlineRiders = riders.filter((r: any) => r.is_online).length;

  const getRoleColor = (role: string) => {
    if (role === "super_admin") return "#F59E0B";
    if (role === "admin") return "#3B82F6";
    return "#10B981";
  };
  const formatRole = (role: string) => role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#0F1729", "#080D1A"]} style={styles.header}>
        <View>
          <Text style={styles.greeting}>Khan Baba Admin</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Text style={styles.userName}>{adminUser?.name ?? "Admin"}</Text>
            <View style={[styles.roleBadge, { backgroundColor: `${getRoleColor(adminUser?.role ?? "")}20`, borderColor: `${getRoleColor(adminUser?.role ?? "")}40` }]}>
              <Text style={[styles.roleText, { color: getRoleColor(adminUser?.role ?? "") }]}>
                {formatRole(adminUser?.role ?? "")}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveTxt}>LIVE</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
      >
        {loading ? (
          <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 60 }} />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard icon="navigation" label="Active Riders" value={stats.active_riders ?? 0}
                sub={`${onlineRiders} online`} color={GREEN}
                onPress={() => router.push("/(tabs)/riders" as any)} />
              <KpiCard icon="package" label="Unassigned" value={stats.unassigned ?? 0}
                sub="orders pending" color={stats.unassigned > 0 ? RED : GREEN}
                onPress={() => router.push("/(tabs)/orders" as any)} />
              <KpiCard icon="check-circle" label="Delivered Today" value={stats.delivered_today ?? 0} color={BLUE} />
              <KpiCard icon="dollar-sign" label="COD Today"
                value={`Rs.${Number(stats.cod_collected_today ?? 0).toLocaleString()}`} color={GOLD} />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="truck" size={15} color={GOLD} />
                <Text style={styles.cardTitle}>Live Delivery Status</Text>
              </View>
              <StatRow label="Assigned"        value={stats.assigned ?? 0}        color={GOLD2} />
              <StatRow label="Picked Up"       value={stats.picked ?? 0}          color={BLUE} />
              <StatRow label="Out for Delivery" value={stats.out_for_delivery ?? 0} color={GREEN} />
              <StatRow label="Near Customer"   value={stats.near_customer ?? 0}   color="#A78BFA" />
              <StatRow label="Failed Today"    value={stats.failed_today ?? 0}    color={stats.failed_today > 0 ? RED : "rgba(255,255,255,0.3)"} />
            </View>

            {riders.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="users" size={15} color={GOLD} />
                  <Text style={styles.cardTitle}>Riders Overview</Text>
                  <TouchableOpacity onPress={() => router.push("/(tabs)/riders" as any)} style={styles.seeAll}>
                    <Text style={styles.seeAllTxt}>See all</Text>
                    <Feather name="chevron-right" size={12} color={GOLD} />
                  </TouchableOpacity>
                </View>
                {riders.slice(0, 4).map((r: any) => (
                  <View key={r.id} style={styles.riderRow}>
                    <View style={[styles.riderAvatar, { backgroundColor: r.is_online ? "#059669" : "#374151" }]}>
                      <Text style={styles.riderAvatarTxt}>{r.name?.charAt(0) ?? "R"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.riderName}>{r.name}</Text>
                      <Text style={styles.riderArea}>{r.delivery_area || "All Lahore"}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 3 }}>
                      <View style={[styles.onlinePill, { backgroundColor: r.is_online ? "#05966915" : "#37415115", borderColor: r.is_online ? "#05966930" : "#37415130" }]}>
                        <View style={[styles.onlineDot, { backgroundColor: r.is_online ? "#10B981" : "#6B7280" }]} />
                        <Text style={[styles.onlineTxt, { color: r.is_online ? "#10B981" : "#6B7280" }]}>
                          {r.is_online ? "Online" : "Offline"}
                        </Text>
                      </View>
                      <Text style={styles.riderStat}>{r.active_orders ?? 0} active · {r.delivered_today ?? 0} done</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activity.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="activity" size={15} color={GOLD} />
                  <Text style={styles.cardTitle}>Recent Activity</Text>
                </View>
                {activity.slice(0, 6).map((a: any) => (
                  <View key={a.id} style={styles.actRow}>
                    <View style={[styles.actDot, { backgroundColor: getStatusColor(a.status) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actOrder}>{a.shopify_order_number} — {a.customer_name}</Text>
                      <Text style={styles.actRider}>{a.rider_name} · {formatStatus(a.status)}</Text>
                    </View>
                    <Text style={styles.actTime}>{timeAgo(a.updated_at)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="zap" size={15} color={GOLD} />
                <Text style={styles.cardTitle}>Quick Actions</Text>
              </View>
              <View style={styles.actionsGrid}>
                <QuickAction icon="navigation"  label="Auto-Assign Orders" color={GREEN}      onPress={() => router.push("/(tabs)/riders" as any)} />
                <QuickAction icon="sliders"     label="Module Controls"    color="#A78BFA"    onPress={() => router.push("/(tabs)/modules" as any)} />
                <QuickAction icon="shopping-bag" label="View Orders"       color={BLUE}       onPress={() => router.push("/(tabs)/orders" as any)} />
                <QuickAction icon="message-circle" label="WhatsApp Inbox"  color="#22C55E"    onPress={() => router.push("/(tabs)/whatsapp" as any)} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  greeting:  { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Inter_500Medium", letterSpacing: 1, textTransform: "uppercase" },
  userName:  { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  roleText:  { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  liveIndicator: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.1)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)" },
  liveDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
  liveTxt:   { color: "#10B981", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  scroll:    { flex: 1 },
  kpiGrid:   { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 12 },
  kpi:       { flex: 1, minWidth: "45%", backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, alignItems: "center", gap: 6 },
  kpiIcon:   { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kpiValue:  { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  kpiLabel:  { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  kpiSub:    { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  card:      { marginHorizontal: 16, marginBottom: 14, backgroundColor: CARD, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: BORDER },
  cardHeader:{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  cardTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  seeAll:    { flexDirection: "row", alignItems: "center", gap: 4 },
  seeAllTxt: { color: GOLD, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  statLabel: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular" },
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  riderRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  riderAvatar:    { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  riderAvatarTxt: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  riderName:  { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  riderArea:  { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  onlineDot:  { width: 6, height: 6, borderRadius: 3 },
  onlineTxt:  { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  riderStat:  { color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "Inter_400Regular" },
  actRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  actDot:     { width: 8, height: 8, borderRadius: 4 },
  actOrder:   { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  actRider:   { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  actTime:    { color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Inter_400Regular" },
  actionsGrid:{ flexDirection: "row", flexWrap: "wrap", gap: 10 },
  qaBtn:      { flex: 1, minWidth: "45%", backgroundColor: "#0D1527", borderRadius: 16, padding: 14, alignItems: "center", gap: 8, borderWidth: 1 },
  qaIcon:     { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  qaLabel:    { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
