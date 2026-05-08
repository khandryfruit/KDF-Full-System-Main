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

const NAV_EXTRA = Platform.OS === "android" ? 84 : 100;

/* ─── Stat Card ─── */
function StatCard({ label, value, icon, accent, bg }: {
  label: string; value: string | number; icon: string; accent: string; bg: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, borderColor: accent + "30" }]}>
      <View style={[styles.statIconWrap, { backgroundColor: accent + "20" }]}>
        <Feather name={icon as any} size={16} color={accent} />
      </View>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ─── Premium Delivery Card ─── */
function DeliveryCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc      = getStatusColor(d.status);
  const sb      = getStatusBg(d.status);
  const isActive = !["delivered", "failed", "returned"].includes(d.status);
  const cod     = Number(d.cod_amount ?? 0);
  const priority = getPriorityInfo(d.assigned_at);
  const isCritical = ["critical", "high"].includes(priority.priority) && isActive;

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  return (
    <TouchableOpacity
      style={[styles.card, isCritical && styles.cardCritical]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Left gradient accent */}
      <LinearGradient
        colors={isCritical ? ["#EF4444", "#DC2626"] : [sc, sc + "99"]}
        style={styles.cardAccent}
      />

      <View style={styles.cardInner}>
        {/* Top row */}
        <View style={styles.cardTopRow}>
          <View style={styles.orderNumWrap}>
            <Text style={styles.orderNumHash}>#</Text>
            <Text style={styles.orderNum}>{d.shopify_order_number ?? d.id}</Text>
          </View>
          <View style={styles.cardBadgesRow}>
            <View style={[styles.statusPill, { backgroundColor: sb }]}>
              <View style={[styles.statusDot, { backgroundColor: sc }]} />
              <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
            </View>
            {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
          </View>
          <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        {/* Customer name */}
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Address */}
        <View style={styles.addrRow}>
          <View style={styles.addrIconWrap}>
            <Feather name="map-pin" size={10} color={C.primary} />
          </View>
          <Text style={styles.addrTxt} numberOfLines={1}>{addr}</Text>
        </View>

        {/* Countdown */}
        {isActive && d.assigned_at && (
          <View style={{ marginTop: 2, marginBottom: 2 }}>
            <CountdownLine assignedAt={d.assigned_at} />
          </View>
        )}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={[styles.codBadge, {
            backgroundColor: d.is_paid ? "#ECFDF5" : "#FFFBEB",
            borderColor: d.is_paid ? "#6EE7B7" : "#FCD34D",
          }]}>
            <Feather
              name={d.is_paid ? "check-circle" : "dollar-sign"}
              size={11}
              color={d.is_paid ? "#059669" : "#D97706"}
            />
            <Text style={[styles.codTxt, { color: d.is_paid ? "#059669" : "#D97706" }]}>
              {d.is_paid ? "PAID" : `COD: Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          {/* Quick actions */}
          <View style={styles.quickRow}>
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: "#EFF6FF" }]}
                onPress={(e) => { e.stopPropagation(); require("react-native").Linking.openURL(`tel:${d.customer_phone}`); }}
              >
                <Feather name="phone-call" size={12} color="#2563EB" />
              </TouchableOpacity>
            )}
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.miniBtn, { backgroundColor: "#F0FDF4" }]}
                onPress={(e) => {
                  e.stopPropagation();
                  const ph = String(d.customer_phone ?? "").replace(/\D/g, "");
                  const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
                  require("react-native").Linking.openURL(`https://wa.me/${intl}`);
                }}
              >
                <Feather name="message-circle" size={12} color="#16A34A" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Main Screen ─── */
export default function DashboardScreen() {
  const { rider } = useAuth();
  const { token } = useAuth();
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
  /* Active tasks — newest assigned_at first */
  const active = [...allDels
    .filter((d: any) => ["assigned", "picked", "out_for_delivery"].includes(d.status))]
    .sort((a: any, b: any) => new Date(b.assigned_at ?? 0).getTime() - new Date(a.assigned_at ?? 0).getTime());
  const criticalCount = active.filter((d: any) =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const isLoading = sl || dl;
  const refetch = () => { rs(); rd(); };

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const initials = (rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const todayEarnings   = Number(s.earnings_today ?? 0);
  const codPending      = Number(s.cod_pending ?? 0);
  const codCollected    = Number(s.cod_collected_today ?? 0);

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* ── PREMIUM HEADER ── */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C", "#0A2A1A"]}
        locations={[0, 0.6, 1]}
        style={[styles.header, { paddingTop: topPad + 14 }]}
      >
        {/* Top bar */}
        <View style={styles.headerTopBar}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrap}>
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <View>
              <Text style={styles.greetTxt}>{greeting} 👋</Text>
              <Text style={styles.riderNameTxt} numberOfLines={1}>{rider?.name}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.avatarTxt}>{initials}</Text>
            <View style={styles.onlineDot} />
          </TouchableOpacity>
        </View>

        {/* Earnings Hero */}
        <View style={styles.earningsHero}>
          <View style={styles.earningsHeroLeft}>
            <Text style={styles.earningsHeroLabel}>Today's Earnings</Text>
            <Text style={styles.earningsHeroAmount}>
              Rs. {isLoading ? "..." : todayEarnings.toLocaleString()}
            </Text>
            <View style={styles.earningsHeroMeta}>
              <View style={styles.earningsMetaItem}>
                <Feather name="package" size={11} color="rgba(255,255,255,0.6)" />
                <Text style={styles.earningsMetaTxt}>{s.delivered_today ?? 0} delivered</Text>
              </View>
              <View style={styles.earningsMetaDivider} />
              <View style={styles.earningsMetaItem}>
                <Feather name="activity" size={11} color="rgba(255,255,255,0.6)" />
                <Text style={styles.earningsMetaTxt}>{active.length} active</Text>
              </View>
              {codCollected > 0 && (
                <>
                  <View style={styles.earningsMetaDivider} />
                  <View style={styles.earningsMetaItem}>
                    <Feather name="dollar-sign" size={11} color="#4ADE80" />
                    <Text style={[styles.earningsMetaTxt, { color: "#4ADE80" }]}>
                      Rs. {codCollected.toLocaleString()} COD
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
          <View style={styles.earningsHeroRight}>
            <View style={styles.earningsMiniStat}>
              <Text style={styles.earningsMiniVal}>{s.assigned_today ?? 0}</Text>
              <Text style={styles.earningsMiniLbl}>Today</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + NAV_EXTRA }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        {/* ── URGENT ALERT ── */}
        {criticalCount > 0 && (
          <TouchableOpacity
            style={styles.urgentBanner}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.push("/(tabs)/orders" as any);
            }}
            activeOpacity={0.88}
          >
            <LinearGradient colors={["#DC2626", "#B91C1C"]} style={StyleSheet.absoluteFill} borderRadius={18} />
            <View style={styles.urgentIconWrap}>
              <Feather name="alert-octagon" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentTitle}>{criticalCount} Urgent {criticalCount === 1 ? "Delivery" : "Deliveries"}</Text>
              <Text style={styles.urgentSub}>فوری توجہ درکار ہے</Text>
            </View>
            <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        )}

        {/* ── COD ALERT ── */}
        {codPending > 0 && (
          <View style={styles.codBanner}>
            <View style={styles.codBannerIcon}>
              <Feather name="dollar-sign" size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.codBannerLabel}>COD جمع باقی ہے</Text>
              <Text style={styles.codBannerAmount}>Rs. {codPending.toLocaleString()}</Text>
            </View>
            <Feather name="info" size={14} color="#D97706" />
          </View>
        )}

        {/* ── STATS GRID ── */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loadingTxt}>Loading your dashboard...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionHeading}>Today's Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Assigned"  value={s.assigned_today ?? 0}  icon="package"      accent="#3B82F6" bg="#EFF6FF" />
              <StatCard label="On Route"  value={s.on_route ?? 0}         icon="truck"        accent="#8B5CF6" bg="#F5F3FF" />
              <StatCard label="Delivered" value={s.delivered_today ?? 0}  icon="check-circle" accent="#10B981" bg="#ECFDF5" />
              <StatCard label="Pending"   value={s.pending ?? 0}          icon="clock"        accent="#F59E0B" bg="#FFFBEB" />
              <StatCard label="Failed"    value={s.failed ?? 0}           icon="x-circle"     accent="#EF4444" bg="#FEF2F2" />
              <StatCard
                label="COD Due"
                value={codPending >= 1000 ? `${Math.round(codPending / 1000)}k` : codPending.toString()}
                icon="dollar-sign"
                accent="#F97316"
                bg="#FFF7ED"
              />
            </View>
          </>
        )}

        {/* ── ACTIVE DELIVERIES ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Active Deliveries</Text>
          {active.length > 0 && (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}
              style={styles.viewAllBtn}
            >
              <Text style={styles.viewAllTxt}>View all</Text>
              <Feather name="arrow-right" size={13} color={C.primary} />
            </TouchableOpacity>
          )}
        </View>

        {active.length === 0 ? (
          <View style={styles.emptyCard}>
            <LinearGradient colors={["#ECFDF5", "#F0FFF4"]} style={styles.emptyGrad}>
              <View style={styles.emptyIconWrap}>
                <Feather name="check-circle" size={36} color="#10B981" />
              </View>
              <Text style={styles.emptyTitle}>All Clear!</Text>
              <Text style={styles.emptySubtxt}>کوئی active delivery نہیں</Text>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.cardList}>
            {active.slice(0, 7).map((d: any) => (
              <DeliveryCard
                key={d.id}
                d={d}
                onPress={() => { Haptics.selectionAsync(); router.push(`/order/${d.id}` as any); }}
              />
            ))}
            {active.length > 7 && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => router.push("/(tabs)/orders" as any)}
              >
                <Text style={styles.showMoreTxt}>+{active.length - 7} مزید orders</Text>
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
  root: { flex: 1, backgroundColor: "#F1F4F9" },

  /* Header */
  header: {
    paddingHorizontal: 18,
    paddingBottom: 22,
  },
  headerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 11 },
  logoWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#00C562", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  logoImg: { width: 40, height: 40, borderRadius: 10 },
  greetTxt: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular" },
  riderNameTxt: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 1, maxWidth: 180 },

  avatarBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#00C562",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.25)",
  },
  avatarTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: "#4ADE80", borderWidth: 2, borderColor: "#0A1628",
  },

  /* Earnings Hero */
  earningsHero: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  earningsHeroLeft: { flex: 1 },
  earningsHeroLabel: {
    color: "rgba(255,255,255,0.55)", fontSize: 11,
    fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
  },
  earningsHeroAmount: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold", marginBottom: 10 },
  earningsHeroMeta: { flexDirection: "row", alignItems: "center", gap: 0 },
  earningsMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  earningsMetaTxt: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular" },
  earningsMetaDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 10 },
  earningsHeroRight: { alignItems: "flex-end" },
  earningsMiniStat: { alignItems: "center" },
  earningsMiniVal: { color: "#00C562", fontSize: 28, fontFamily: "Inter_700Bold" },
  earningsMiniLbl: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },

  /* Scroll */
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, gap: 14 },

  /* Urgent */
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 18, padding: 15, overflow: "hidden",
  },
  urgentIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
  },
  urgentTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  urgentSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* COD Banner */
  codBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFBEB", borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: "#FCD34D",
  },
  codBannerIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  codBannerLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#92400E" },
  codBannerAmount: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#D97706", marginTop: 1 },

  /* Loading */
  loadingWrap: { alignItems: "center", paddingVertical: 36, gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular", fontSize: 13 },

  /* Sections */
  sectionHeading: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAllTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  /* Stats */
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "30.5%", flexGrow: 1,
    borderRadius: 16, padding: 14,
    borderWidth: 1.5, gap: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  statIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#6B7A99", textTransform: "uppercase", letterSpacing: 0.3 },

  /* Cards */
  cardList: { gap: 12 },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 20, overflow: "hidden",
    shadowColor: "#1A2B4A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  cardCritical: {
    shadowColor: "#EF4444", shadowOpacity: 0.2, shadowRadius: 14, elevation: 8,
    borderColor: "#FECACA",
  },
  cardAccent: { width: 5 },
  cardInner: { flex: 1, padding: 14, gap: 6 },

  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderNumWrap: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  orderNumHash: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#94A3B8" },
  orderNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  cardBadgesRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },

  custName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  addrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  addrIconWrap: { width: 18, height: 18, borderRadius: 5, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  addrTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },

  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  codBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  codTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },
  quickRow: { flexDirection: "row", gap: 7 },
  miniBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },

  /* Show More */
  showMoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16,
    borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  showMoreTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  /* Empty */
  emptyCard: { borderRadius: 20, overflow: "hidden" },
  emptyGrad: { alignItems: "center", paddingVertical: 44, paddingHorizontal: 20, gap: 10 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#065F46" },
  emptySubtxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6EE7B7" },
});
