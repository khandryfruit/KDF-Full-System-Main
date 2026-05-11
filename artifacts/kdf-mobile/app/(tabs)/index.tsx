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
  Switch,
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
const NAV_EXTRA = Platform.OS === "android" ? 96 : 108;

/* ─── Mini Stat Tile ─── */
function StatTile({
  label, value, icon, accent, bg,
}: { label: string; value: string | number; icon: string; accent: string; bg: string }) {
  return (
    <View style={[styles.statTile, { backgroundColor: bg, borderColor: accent + "25" }]}>
      <View style={[styles.statIconBox, { backgroundColor: accent + "1A" }]}>
        <Feather name={icon as any} size={15} color={accent} />
      </View>
      <Text style={[styles.statVal, { color: accent }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

/* ─── Delivery Card ─── */
function DeliveryCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc       = getStatusColor(d.status);
  const sb       = getStatusBg(d.status);
  const isActive = !["delivered", "failed", "returned"].includes(d.status);
  const cod      = Number(d.cod_amount ?? 0);
  const priority = getPriorityInfo(d.assigned_at);
  const isCrit   = ["critical", "high"].includes(priority.priority) && isActive;

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string"
        ? JSON.parse(d.shipping_address)
        : d.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  const callCustomer = () => {
    if (d.customer_phone) require("react-native").Linking.openURL(`tel:${d.customer_phone}`);
  };
  const waCustomer = () => {
    if (!d.customer_phone) return;
    const ph = String(d.customer_phone).replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(`السلام علیکم! میں آپ کا KDF NUTS آرڈر #${d.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`);
    require("react-native").Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };
  const navigate = () => {
    const q = encodeURIComponent(addr);
    require("react-native").Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, isCrit && styles.cardCritical]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Left accent stripe */}
      <LinearGradient
        colors={isCrit ? ["#EF4444", "#DC2626"] : [sc, sc + "55"]}
        style={styles.cardStripe}
      />

      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTopRow}>
          <View style={styles.orderNumRow}>
            <Text style={styles.orderHash}>#</Text>
            <Text style={styles.orderNum}>{d.shopify_order_number ?? d.id}</Text>
          </View>
          <View style={styles.badgesRow}>
            <View style={[styles.statusPill, { backgroundColor: sb }]}>
              <View style={[styles.dot, { backgroundColor: sc }]} />
              <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
            </View>
            {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
          </View>
          <Feather name="chevron-right" size={13} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        {/* Customer */}
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Address */}
        {!!addr && addr !== "—" && (
          <View style={styles.addrRow}>
            <View style={[styles.miniIconBox, { backgroundColor: "#EFF6FF" }]}>
              <Feather name="map-pin" size={10} color="#3B82F6" />
            </View>
            <Text style={styles.addrTxt} numberOfLines={1}>{addr}</Text>
          </View>
        )}

        {/* Countdown */}
        {isActive && d.assigned_at && (
          <View style={{ marginTop: 2 }}>
            <CountdownLine assignedAt={d.assigned_at} />
          </View>
        )}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={[styles.codChip, {
            backgroundColor: d.is_paid ? "#ECFDF5" : "#FFFBEB",
            borderColor: d.is_paid ? "#6EE7B7" : "#FCD34D",
          }]}>
            <Feather
              name={d.is_paid ? "check-circle" : "dollar-sign"}
              size={11}
              color={d.is_paid ? "#059669" : "#D97706"}
            />
            <Text style={[styles.codTxt, { color: d.is_paid ? "#059669" : "#D97706" }]}>
              {d.is_paid ? "PAID" : `COD Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          <View style={styles.actionRow}>
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#EFF6FF" }]}
                onPress={(e) => { e.stopPropagation(); callCustomer(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="phone-call" size={12} color="#2563EB" />
              </TouchableOpacity>
            )}
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#F0FDF4" }]}
                onPress={(e) => { e.stopPropagation(); waCustomer(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="message-circle" size={12} color="#16A34A" />
              </TouchableOpacity>
            )}
            {!!addr && addr !== "—" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#FFF7ED" }]}
                onPress={(e) => { e.stopPropagation(); navigate(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="navigation" size={12} color="#EA580C" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Main Dashboard ─── */
export default function DashboardScreen() {
  const { rider, token, isOnline, toggleOnline } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const topPad    = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [toggling, setToggling] = React.useState(false);

  const handleToggleOnline = async (val: boolean) => {
    if (toggling) return;
    Haptics.impactAsync(val ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    setToggling(true);
    await toggleOnline(val);
    setToggling(false);
  };

  const { data: statsData, isLoading: sl, refetch: rs } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const { data: delData, isLoading: dl, refetch: rd } = useQuery({
    queryKey: ["rider-deliveries-dashboard"],
    queryFn: async () => { const r = await riderFetch("/rider/deliveries?period=dashboard", token); return r.json(); },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const s       = statsData?.stats ?? {};
  const allDels = delData?.deliveries ?? [];

  /* In-progress: picked/on-route — need IMMEDIATE attention */
  const inProgress = [...allDels
    .filter((d: any) => ["picked", "out_for_delivery", "near_customer", "delayed", "rescheduled"].includes(d.status))]
    .sort((a: any, b: any) => new Date(b.assigned_at ?? 0).getTime() - new Date(a.assigned_at ?? 0).getTime());

  /* Today's assigned — new orders awaiting pickup */
  const todayAssigned = [...allDels
    .filter((d: any) => d.status === "assigned")]
    .sort((a: any, b: any) => new Date(b.assigned_at ?? 0).getTime() - new Date(a.assigned_at ?? 0).getTime());

  const active = [...inProgress, ...todayAssigned];

  const criticalCount = inProgress.filter((d: any) =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const isLoading = sl || dl;
  const refetch   = () => { rs(); rd(); };

  const hour     = new Date().getHours();
  const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const initials = (rider?.name ?? "R").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const todayEarnings = Number(s.earnings_today ?? 0);
  const codPending    = Number(s.cod_pending ?? 0);
  const codCollected  = Number(s.cod_collected_today ?? 0);

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>

      {/* ── HEADER ── */}
      <LinearGradient
        colors={["#060E1C", "#0A1A35", "#071A10"]}
        locations={[0, 0.55, 1]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        {/* Top bar */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.greetTxt}>{greeting} 👋</Text>
              <Text style={styles.riderName} numberOfLines={1}>{rider?.name}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient colors={["#00C562", "#00A050"]} style={styles.avatarGrad}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </LinearGradient>
            <View style={[styles.onlineDot, { backgroundColor: isOnline ? "#4ADE80" : "#94A3B8" }]} />
          </TouchableOpacity>
        </View>

        {/* ── ONLINE / OFFLINE TOGGLE ── */}
        <TouchableOpacity
          style={[styles.onlineToggleBar, isOnline ? styles.onlineToggleBarOn : styles.onlineToggleBarOff]}
          onPress={() => handleToggleOnline(!isOnline)}
          activeOpacity={0.85}
          disabled={toggling}
        >
          <View style={[styles.onlineToggleLeft, { opacity: toggling ? 0.6 : 1 }]}>
            <View style={[styles.onlineStatusDot, { backgroundColor: isOnline ? "#4ADE80" : "#94A3B8" }]} />
            <View>
              <Text style={styles.onlineToggleTitle}>
                {isOnline ? "آنلائن — نئے آرڈر مل رہے ہیں" : "آف لائن — آرڈر نہیں ملیں گے"}
              </Text>
              <Text style={styles.onlineToggleSub}>
                {isOnline ? "Auto-assign ON ✓" : "Tap to go Online"}
              </Text>
            </View>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: "rgba(148,163,184,0.35)", true: "rgba(74,222,128,0.45)" }}
            thumbColor={isOnline ? "#4ADE80" : "#94A3B8"}
            ios_backgroundColor="rgba(148,163,184,0.35)"
            disabled={toggling}
          />
        </TouchableOpacity>

        {/* Earnings hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroLbl}>Today's Earnings</Text>
            <Text style={styles.heroAmount}>
              Rs.{" "}
              {isLoading ? (
                <Text style={{ fontSize: 24 }}>...</Text>
              ) : (
                todayEarnings.toLocaleString()
              )}
            </Text>
            <View style={styles.heroMeta}>
              <View style={styles.heroMetaItem}>
                <Feather name="package" size={11} color="rgba(255,255,255,0.55)" />
                <Text style={styles.heroMetaTxt}>{s.delivered_today ?? 0} delivered</Text>
              </View>
              <View style={styles.heroMetaDivider} />
              <View style={styles.heroMetaItem}>
                <Feather name="zap" size={11} color="rgba(255,255,255,0.55)" />
                <Text style={styles.heroMetaTxt}>{inProgress.length} in-progress</Text>
              </View>
              {codCollected > 0 && (
                <>
                  <View style={styles.heroMetaDivider} />
                  <View style={styles.heroMetaItem}>
                    <Feather name="dollar-sign" size={11} color="#4ADE80" />
                    <Text style={[styles.heroMetaTxt, { color: "#4ADE80" }]}>
                      Rs. {codCollected.toLocaleString()}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.heroRight}>
            <View style={styles.heroRingWrap}>
              <Text style={styles.heroRingNum}>{s.assigned_today ?? 0}</Text>
              <Text style={styles.heroRingLbl}>TODAY</Text>
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
            tintColor="#00C562"
            colors={["#00C562"]}
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
            <LinearGradient colors={["#DC2626", "#991B1B"]} style={StyleSheet.absoluteFill} borderRadius={18} />
            <View style={styles.urgentIcon}>
              <Feather name="alert-octagon" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.urgentTitle}>
                {criticalCount} Urgent {criticalCount === 1 ? "Delivery" : "Deliveries"}
              </Text>
              <Text style={styles.urgentSub}>فوری توجہ درکار ہے</Text>
            </View>
            <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        )}

        {/* ── COD SETTLEMENT BANNER ── */}
        {codPending > 0 && (
          <TouchableOpacity
            style={styles.codBanner}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.push("/(tabs)/profile" as any);
            }}
          >
            <View style={styles.codBannerIcon}>
              <Feather name="alert-circle" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.codBannerLabel}>💰 COD Settlement باقی ہے</Text>
              <Text style={styles.codBannerAmount}>Rs. {codPending.toLocaleString()}</Text>
              <Text style={styles.codBannerSub}>Admin کو جمع کروائیں</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View style={styles.codBannerBadge}>
                <Text style={styles.codBannerBadgeTxt}>Pending</Text>
              </View>
              <Feather name="chevron-right" size={14} color="#92400E" />
            </View>
          </TouchableOpacity>
        )}

        {/* ── STATS GRID ── */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#00C562" size="large" />
            <Text style={styles.loadingTxt}>Loading dashboard...</Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Today's Overview</Text>
            </View>
            <View style={styles.statsGrid}>
              <StatTile label="Assigned"  value={s.assigned_today ?? 0}  icon="package"      accent="#3B82F6" bg="#EFF6FF" />
              <StatTile label="On Route"  value={s.on_route ?? 0}         icon="truck"        accent="#8B5CF6" bg="#F5F3FF" />
              <StatTile label="Delivered" value={s.delivered_today ?? 0}  icon="check-circle" accent="#10B981" bg="#ECFDF5" />
              <StatTile label="Pending"   value={s.pending ?? 0}          icon="clock"        accent="#F59E0B" bg="#FFFBEB" />
              <StatTile label="Failed"    value={s.failed ?? 0}           icon="x-circle"     accent="#EF4444" bg="#FEF2F2" />
              <StatTile
                label="COD Due"
                value={codPending >= 1000 ? `${Math.round(codPending / 1000)}k` : (codPending || 0).toString()}
                icon="dollar-sign"
                accent="#F97316"
                bg="#FFF7ED"
              />
            </View>
          </>
        )}

        {/* ── IN PROGRESS (Picked / On Route) ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>🚚 In Progress</Text>
          {inProgress.length > 0 && (
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}
            >
              <Text style={styles.viewAllTxt}>View all</Text>
              <Feather name="arrow-right" size={12} color="#00C562" />
            </TouchableOpacity>
          )}
        </View>

        {inProgress.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Feather name="check-circle" size={38} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptySubtxt}>کوئی active delivery نہیں</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {inProgress.slice(0, 5).map((d: any) => (
              <DeliveryCard
                key={d.id}
                d={d}
                onPress={() => { Haptics.selectionAsync(); router.push(`/order/${d.id}` as any); }}
              />
            ))}
            {inProgress.length > 5 && (
              <TouchableOpacity style={styles.moreBtn} onPress={() => router.push("/(tabs)/orders" as any)}>
                <Text style={styles.moreBtnTxt}>+{inProgress.length - 5} مزید in-progress orders</Text>
                <Feather name="arrow-right" size={14} color="#00C562" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── TODAY'S NEW ASSIGNED ORDERS ── */}
        {todayAssigned.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>📦 Today's New Orders</Text>
              <TouchableOpacity
                style={styles.viewAllBtn}
                onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}
              >
                <Text style={styles.viewAllTxt}>See all {todayAssigned.length}</Text>
                <Feather name="arrow-right" size={12} color="#00C562" />
              </TouchableOpacity>
            </View>

            {/* Summary tap card */}
            <TouchableOpacity
              style={styles.todayCard}
              onPress={() => { Haptics.selectionAsync(); router.push("/(tabs)/orders" as any); }}
              activeOpacity={0.84}
            >
              <View style={styles.todayCardBadge}>
                <Text style={styles.todayCardBadgeNum}>{todayAssigned.length}</Text>
                <Text style={styles.todayCardBadgeLbl}>آرڈر</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayCardTitle}>آج کے نئے آرڈر</Text>
                <Text style={styles.todayCardSub}>
                  Rs.{" "}
                  {todayAssigned
                    .reduce((s: number, d: any) => s + Number(d.cod_amount ?? 0), 0)
                    .toLocaleString()}{" "}
                  COD pending pickup
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#00C562" />
            </TouchableOpacity>

            {/* Show first 3 assigned orders */}
            <View style={styles.cardList}>
              {todayAssigned.slice(0, 3).map((d: any) => (
                <DeliveryCard
                  key={d.id}
                  d={d}
                  onPress={() => { Haptics.selectionAsync(); router.push(`/order/${d.id}` as any); }}
                />
              ))}
              {todayAssigned.length > 3 && (
                <TouchableOpacity style={styles.moreBtn} onPress={() => router.push("/(tabs)/orders" as any)}>
                  <Text style={styles.moreBtnTxt}>+{todayAssigned.length - 3} مزید نئے آرڈر دیکھیں</Text>
                  <Feather name="arrow-right" size={14} color="#00C562" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F3F8" },

  /* Header */
  header: { paddingHorizontal: 18, paddingBottom: 24 },

  headerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 20,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoImg: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "#fff",
  },
  greetTxt: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Inter_400Regular" },
  riderName: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 2, maxWidth: 190 },

  avatarBtn: { position: "relative" },
  avatarGrad: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.2)",
  },
  avatarTxt: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2.5, borderColor: "#060E1C",
  },

  /* Online / Offline toggle bar */
  onlineToggleBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 18, paddingVertical: 13, paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  onlineToggleBarOn: {
    backgroundColor: "rgba(74,222,128,0.10)",
    borderColor: "rgba(74,222,128,0.35)",
  },
  onlineToggleBarOff: {
    backgroundColor: "rgba(148,163,184,0.08)",
    borderColor: "rgba(148,163,184,0.2)",
  },
  onlineToggleLeft: {
    flexDirection: "row", alignItems: "center", gap: 12, flex: 1,
  },
  onlineStatusDot: {
    width: 12, height: 12, borderRadius: 6,
    shadowColor: "#4ADE80", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },
  onlineToggleTitle: {
    color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold",
  },
  onlineToggleSub: {
    color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2,
  },

  /* Hero card */
  heroCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.075)",
    borderRadius: 22, padding: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  heroLeft: { flex: 1 },
  heroLbl: {
    color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 5,
  },
  heroAmount: { color: "#fff", fontSize: 34, fontFamily: "Inter_700Bold", marginBottom: 12 },
  heroMeta: { flexDirection: "row", alignItems: "center" },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroMetaTxt: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_400Regular" },
  heroMetaDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.18)", marginHorizontal: 10 },
  heroRight: { paddingLeft: 16 },
  heroRingWrap: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 3, borderColor: "rgba(0,197,98,0.4)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,197,98,0.1)",
  },
  heroRingNum: { color: "#00C562", fontSize: 24, fontFamily: "Inter_700Bold" },
  heroRingLbl: { color: "rgba(255,255,255,0.35)", fontSize: 7, fontFamily: "Inter_700Bold", letterSpacing: 1 },

  /* Scroll */
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },

  /* Sections */
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewAllTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#00C562" },

  /* Urgent */
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 18, padding: 16, overflow: "hidden",
  },
  urgentIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
  },
  urgentTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  urgentSub: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  /* COD Banner */
  codBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FFFBEB", borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: "#FCD34D",
  },
  codBannerIcon: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center",
  },
  codBannerLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#92400E" },
  codBannerAmount: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#D97706", marginTop: 1 },
  codBannerSub: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 2 },
  codBannerBadge: {
    backgroundColor: "#FDE68A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  codBannerBadgeTxt: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#92400E" },

  /* Stats */
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statTile: {
    width: "30.5%", flexGrow: 1,
    borderRadius: 18, padding: 14, gap: 6,
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLbl: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#6B7A99", textTransform: "uppercase", letterSpacing: 0.4 },

  /* Loading */
  loadingWrap: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular", fontSize: 13 },

  /* Card list */
  cardList: { gap: 10 },

  /* Card */
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 20, overflow: "hidden",
    shadowColor: "#1A2B4A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09, shadowRadius: 14, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  cardCritical: {
    shadowColor: "#EF4444", shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
    borderColor: "#FECACA",
  },
  cardStripe: { width: 5 },
  cardBody: { flex: 1, padding: 14, gap: 6 },

  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderNumRow: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  orderHash: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#94A3B8" },
  orderNum: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#3B82F6" },

  badgesRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.3 },

  custName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  addrRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniIconBox: { width: 18, height: 18, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  addrTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },

  cardFooter: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginTop: 4,
  },
  codChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  codTxt: { fontSize: 11, fontFamily: "Inter_700Bold" },
  actionRow: { flexDirection: "row", gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  /* More */
  moreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 16, paddingVertical: 15,
    borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  moreBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#00C562" },

  /* Empty */
  emptyCard: {
    alignItems: "center", paddingVertical: 48, paddingHorizontal: 20,
    backgroundColor: "#fff", borderRadius: 22, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  emptyIconWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#065F46" },
  emptySubtxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6EE7B7" },

  /* Today's Orders summary card */
  todayCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#fff", borderRadius: 20, padding: 16,
    borderWidth: 1.5, borderColor: "#D1FAE5",
    shadowColor: "#10B981", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  todayCardBadge: {
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: "#ECFDF5", borderWidth: 2, borderColor: "#6EE7B7",
    alignItems: "center", justifyContent: "center",
  },
  todayCardBadgeNum: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#059669" },
  todayCardBadgeLbl: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#34D399", letterSpacing: 0.5 },
  todayCardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },
  todayCardSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7A99", marginTop: 2 },
});
