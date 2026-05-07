import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { riderFetch, useAuth } from "@/context/AuthContext";
import colors, { getStatusColor, getStatusBg, getStatusLabel } from "@/constants/colors";
import { PriorityBadge, CountdownLine } from "@/components/PriorityTimer";
import { getPriorityInfo } from "@/utils/priority";

const C = colors.light;
const NAV_EXTRA = Platform.OS === "android" ? 84 : 100;

type SectionKey = "active" | "completed" | "failed" | "returned";

const SECTIONS: { key: SectionKey; label: string; icon: string; statuses: string[] }[] = [
  { key: "active",    label: "Active",    icon: "zap",          statuses: ["assigned", "picked", "out_for_delivery"] },
  { key: "completed", label: "Completed", icon: "check-circle", statuses: ["delivered"] },
  { key: "failed",    label: "Failed",    icon: "x-circle",     statuses: ["failed"] },
  { key: "returned",  label: "Returned",  icon: "rotate-ccw",   statuses: ["returned"] },
];

const SECTION_COLORS: Record<SectionKey, { accent: string; bg: string; light: string }> = {
  active:    { accent: "#3B82F6", bg: "#EFF6FF",  light: "#DBEAFE" },
  completed: { accent: "#10B981", bg: "#ECFDF5",  light: "#D1FAE5" },
  failed:    { accent: "#EF4444", bg: "#FEF2F2",  light: "#FEE2E2" },
  returned:  { accent: "#8B5CF6", bg: "#F5F3FF",  light: "#EDE9FE" },
};

/* ─── Helpers ─── */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `Today ${formatTime(iso)}`;
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short" }) + " " + formatTime(iso);
}

function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parseAddr(d: any): string {
  try {
    const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
    return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
  } catch { return d.delivery_address ?? "—"; }
}

/* ─── Active Task Card ─── */
function ActiveCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc       = getStatusColor(d.status);
  const sb       = getStatusBg(d.status);
  const cod      = Number(d.cod_amount ?? 0);
  const priority = getPriorityInfo(d.assigned_at);
  const isCrit   = ["critical", "high"].includes(priority.priority);
  const addr     = parseAddr(d);

  const callCustomer = () => { Haptics.selectionAsync(); Linking.openURL(`tel:${d.customer_phone}`); };
  const waCustomer = () => {
    Haptics.selectionAsync();
    const ph = String(d.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(`السلام علیکم! میں آپ کا KDF NUTS آرڈر #${d.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`);
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };
  const navigate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const q = encodeURIComponent(addr);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`);
  };

  return (
    <TouchableOpacity
      style={[styles.card, isCrit && styles.cardCritical]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <LinearGradient
        colors={isCrit ? ["#EF4444", "#DC2626"] : [sc, sc + "88"]}
        style={styles.accentBar}
      />
      <View style={styles.cardBody}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderHash}>#</Text>
            <Text style={styles.orderId}>{d.shopify_order_number ?? d.id}</Text>
          </View>
          <View style={styles.badgeRow}>
            <View style={[styles.statusPill, { backgroundColor: sb }]}>
              <View style={[styles.statusDot, { backgroundColor: sc }]} />
              <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
            </View>
            <PriorityBadge assignedAt={d.assigned_at} />
          </View>
          <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Address */}
        {!!addr && addr !== "—" && (
          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: "#EFF6FF" }]}>
              <Feather name="map-pin" size={10} color="#3B82F6" />
            </View>
            <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
          </View>
        )}

        {/* Time assigned */}
        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: "#F5F3FF" }]}>
            <Feather name="clock" size={10} color="#7C3AED" />
          </View>
          <Text style={styles.infoTxt}>Assigned: {formatDate(d.assigned_at)}</Text>
        </View>

        {/* Countdown */}
        {d.assigned_at && (
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
            <Feather name={d.is_paid ? "check-circle" : "dollar-sign"} size={12} color={d.is_paid ? "#059669" : "#D97706"} />
            <Text style={[styles.codTxt, { color: d.is_paid ? "#059669" : "#D97706" }]}>
              {d.is_paid ? "PAID" : `Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          <View style={styles.actionBtns}>
            {!!d.customer_phone && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#EFF6FF" }]} onPress={callCustomer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="phone-call" size={13} color="#2563EB" />
              </TouchableOpacity>
            )}
            {!!d.customer_phone && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#F0FDF4" }]} onPress={waCustomer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="message-circle" size={13} color="#16A34A" />
              </TouchableOpacity>
            )}
            {!!addr && addr !== "—" && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#FFF7ED" }]} onPress={navigate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="navigation" size={13} color="#EA580C" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Completed Task Card ─── */
function CompletedCard({ d, onPress }: { d: any; onPress: () => void }) {
  const cod      = Number(d.cod_amount ?? 0);
  const earnings = Number(d.delivery_charge ?? 0);
  const addr     = parseAddr(d);
  const duration = formatDuration(d.assigned_at, d.delivered_at);

  return (
    <TouchableOpacity style={[styles.card, styles.completedCard]} onPress={onPress} activeOpacity={0.82}>
      {/* Green accent */}
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.accentBar} />
      <View style={styles.cardBody}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderHash}>#</Text>
            <Text style={[styles.orderId, { color: "#10B981" }]}>{d.shopify_order_number ?? d.id}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: "#D1FAE5" }]}>
            <Feather name="check-circle" size={10} color="#10B981" />
            <Text style={[styles.statusTxt, { color: "#10B981" }]}>Delivered</Text>
          </View>
          <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {!!addr && addr !== "—" && (
          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: "#ECFDF5" }]}>
              <Feather name="map-pin" size={10} color="#10B981" />
            </View>
            <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
          </View>
        )}

        {/* Delivered time */}
        <View style={styles.completedMetaRow}>
          <View style={styles.completedMetaItem}>
            <Feather name="clock" size={11} color="#6B7A99" />
            <Text style={styles.completedMetaLabel}>Delivered</Text>
            <Text style={styles.completedMetaVal}>{formatDate(d.delivered_at)}</Text>
          </View>
          {duration !== "—" && (
            <View style={styles.completedMetaItem}>
              <Feather name="activity" size={11} color="#6B7A99" />
              <Text style={styles.completedMetaLabel}>Duration</Text>
              <Text style={styles.completedMetaVal}>{duration}</Text>
            </View>
          )}
        </View>

        {/* Footer — COD + Earnings */}
        <View style={styles.cardFooter}>
          <View style={[styles.codChip, {
            backgroundColor: d.is_paid ? "#ECFDF5" : "#FFFBEB",
            borderColor: d.is_paid ? "#6EE7B7" : "#FCD34D",
          }]}>
            <Feather name={d.is_paid ? "check-circle" : "dollar-sign"} size={12} color={d.is_paid ? "#059669" : "#D97706"} />
            <Text style={[styles.codTxt, { color: d.is_paid ? "#059669" : "#D97706" }]}>
              {d.is_paid ? "PAID" : `COD Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          {earnings > 0 && (
            <View style={styles.earningsChip}>
              <Feather name="trending-up" size={11} color="#7C3AED" />
              <Text style={styles.earningsTxt}>+Rs. {earnings.toLocaleString()}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Terminal Card (Failed / Returned) ─── */
function TerminalCard({ d, onPress, section }: { d: any; onPress: () => void; section: SectionKey }) {
  const sc    = getStatusColor(d.status);
  const sb    = getStatusBg(d.status);
  const cod   = Number(d.cod_amount ?? 0);
  const col   = SECTION_COLORS[section];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient colors={[col.accent, col.accent + "88"]} style={styles.accentBar} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderHash}>#</Text>
            <Text style={[styles.orderId, { color: col.accent }]}>{d.shopify_order_number ?? d.id}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: sb }]}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
          </View>
          <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: col.bg }]}>
            <Feather name="clock" size={10} color={col.accent} />
          </View>
          <Text style={styles.infoTxt}>
            Assigned: {formatDate(d.assigned_at)}
            {d.updated_at ? `  •  Updated: ${formatDate(d.updated_at)}` : ""}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.codChip, { backgroundColor: sb, borderColor: sc + "40" }]}>
            <Feather name="dollar-sign" size={12} color={sc} />
            <Text style={[styles.codTxt, { color: sc }]}>
              {d.is_paid ? "PAID" : `Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Section Tab Button ─── */
function SectionTab({
  section, activeKey, count, onPress,
}: { section: typeof SECTIONS[0]; activeKey: SectionKey; count: number; onPress: () => void }) {
  const active  = section.key === activeKey;
  const col     = SECTION_COLORS[section.key];

  return (
    <TouchableOpacity
      style={[styles.sectionTab, active && { backgroundColor: col.accent + "20", borderColor: col.accent }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Feather
        name={section.icon as any}
        size={14}
        color={active ? col.accent : "rgba(255,255,255,0.4)"}
      />
      <Text style={[styles.sectionTabTxt, { color: active ? col.accent : "rgba(255,255,255,0.45)" }]}>
        {section.label}
      </Text>
      {count > 0 && (
        <View style={[styles.countBadge, { backgroundColor: active ? col.accent : "rgba(255,255,255,0.15)" }]}>
          <Text style={[styles.countTxt, { color: active ? "#fff" : "rgba(255,255,255,0.6)" }]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/* ─── Empty State ─── */
function EmptyState({ section }: { section: SectionKey }) {
  const col   = SECTION_COLORS[section];
  const icons: Record<SectionKey, string> = { active: "zap", completed: "check-circle", failed: "x-circle", returned: "rotate-ccw" };
  const msgs: Record<SectionKey, string> = {
    active:    "کوئی active delivery نہیں",
    completed: "ابھی تک کوئی delivery مکمل نہیں",
    failed:    "کوئی failed delivery نہیں",
    returned:  "کوئی returned delivery نہیں",
  };
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: col.bg }]}>
        <Feather name={icons[section] as any} size={34} color={col.accent} />
      </View>
      <Text style={styles.emptyTitle}>{section === "active" ? "All Clear!" : "Nothing Here"}</Text>
      <Text style={styles.emptyTxt}>{msgs[section]}</Text>
    </View>
  );
}

/* ─── MAIN SCREEN ─── */
export default function TasksScreen() {
  const { token } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const qc        = useQueryClient();
  const [activeSection, setActiveSection] = useState<SectionKey>("active");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["rider-deliveries-tasks"],
    queryFn: async () => {
      const r = await riderFetch("/rider/deliveries", token);
      return r.json();
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const allDeliveries: any[] = data?.deliveries ?? [];

  /* Sort helper: newest assigned_at first */
  const sortNewest = (arr: any[]) =>
    [...arr].sort((a, b) => new Date(b.assigned_at ?? 0).getTime() - new Date(a.assigned_at ?? 0).getTime());

  /* Sort completed: newest delivered_at first */
  const sortDelivered = (arr: any[]) =>
    [...arr].sort((a, b) => new Date(b.delivered_at ?? b.assigned_at ?? 0).getTime() - new Date(a.delivered_at ?? a.assigned_at ?? 0).getTime());

  const sections = {
    active:    sortNewest(allDeliveries.filter(d => ["assigned", "picked", "out_for_delivery"].includes(d.status))),
    completed: sortDelivered(allDeliveries.filter(d => d.status === "delivered")),
    failed:    sortNewest(allDeliveries.filter(d => d.status === "failed")),
    returned:  sortNewest(allDeliveries.filter(d => d.status === "returned")),
  };

  const current = sections[activeSection];
  const urgentCount = sections.active.filter(d =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const switchSection = useCallback((key: SectionKey) => {
    Haptics.selectionAsync();
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    setActiveSection(key);
  }, [slideAnim]);

  const openOrder = (id: number) => {
    Haptics.selectionAsync();
    router.push(`/order/${id}` as any);
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeSection === "active") {
      return <ActiveCard d={item} onPress={() => openOrder(item.id)} />;
    }
    if (activeSection === "completed") {
      return <CompletedCard d={item} onPress={() => openOrder(item.id)} />;
    }
    return <TerminalCard d={item} onPress={() => openOrder(item.id)} section={activeSection} />;
  }, [activeSection]);

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* ── Premium Header ── */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}
      >
        {/* Title row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Task Manager</Text>
            <Text style={styles.headerSub}>
              {isLoading ? "Loading..." : `${allDeliveries.length} total tasks`}
              {urgentCount > 0 && (
                <Text style={{ color: "#EF4444" }}> · {urgentCount} urgent</Text>
              )}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => { Haptics.selectionAsync(); refetch(); qc.invalidateQueries({ queryKey: ["rider-stats"] }); }}
          >
            {isFetching
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="refresh-cw" size={16} color="#fff" />
            }
          </TouchableOpacity>
        </View>

        {/* Section tabs */}
        <FlatList
          data={SECTIONS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={s => s.key}
          contentContainerStyle={styles.tabList}
          renderItem={({ item }) => (
            <SectionTab
              section={item}
              activeKey={activeSection}
              count={sections[item.key].length}
              onPress={() => switchSection(item.key)}
            />
          )}
        />
      </LinearGradient>

      {/* ── Urgent Banner (Active only) ── */}
      {activeSection === "active" && urgentCount > 0 && (
        <View style={styles.urgentBanner}>
          <Feather name="alert-octagon" size={14} color="#EF4444" />
          <Text style={styles.urgentTxt}>
            {urgentCount} {urgentCount === 1 ? "order requires" : "orders require"} immediate attention
          </Text>
        </View>
      )}

      {/* ── Section Label ── */}
      <View style={[styles.sectionHeader, { backgroundColor: SECTION_COLORS[activeSection].bg }]}>
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionDot, { backgroundColor: SECTION_COLORS[activeSection].accent }]} />
          <Text style={[styles.sectionHeaderTitle, { color: SECTION_COLORS[activeSection].accent }]}>
            {SECTIONS.find(s => s.key === activeSection)?.label} Tasks
          </Text>
        </View>
        <Text style={[styles.sectionCount, { color: SECTION_COLORS[activeSection].accent }]}>
          {current.length} {current.length === 1 ? "order" : "orders"}
        </Text>
      </View>

      {/* ── Completed Stats Row ── */}
      {activeSection === "completed" && sections.completed.length > 0 && (
        <View style={styles.completedStatsRow}>
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>{sections.completed.length}</Text>
            <Text style={styles.completedStatLabel}>Delivered</Text>
          </View>
          <View style={styles.completedStatDivider} />
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>
              Rs. {sections.completed.reduce((sum, d) => sum + Number(d.delivery_charge ?? 0), 0).toLocaleString()}
            </Text>
            <Text style={styles.completedStatLabel}>Earnings</Text>
          </View>
          <View style={styles.completedStatDivider} />
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>
              Rs. {sections.completed.filter(d => !d.is_paid).reduce((sum, d) => sum + Number(d.cod_amount ?? 0), 0).toLocaleString()}
            </Text>
            <Text style={styles.completedStatLabel}>COD Collected</Text>
          </View>
        </View>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={SECTION_COLORS[activeSection].accent} size="large" />
          <Text style={styles.loadingTxt}>Loading tasks...</Text>
        </View>
      ) : (
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          <FlatList
            data={current}
            keyExtractor={d => String(d.id)}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + NAV_EXTRA }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isFetching && !isLoading}
                onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ["rider-stats"] }); }}
                tintColor={SECTION_COLORS[activeSection].accent}
                colors={[SECTION_COLORS[activeSection].accent]}
              />
            }
            renderItem={renderItem}
            ListEmptyComponent={<EmptyState section={activeSection} />}
          />
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F4F9" },

  /* Header */
  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub:   { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },

  /* Section Tabs */
  tabList: { paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2, gap: 8 },
  sectionTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  sectionTabTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  countBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5,
  },
  countTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },

  /* Section Label */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 9,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHeaderTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  sectionCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Urgent Banner */
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#FECACA",
  },
  urgentTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#B91C1C", flex: 1 },

  /* Completed Stats */
  completedStatsRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#E2E8F0",
  },
  completedStat: { flex: 1, alignItems: "center" },
  completedStatVal: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#10B981" },
  completedStatLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#6B7A99", marginTop: 2 },
  completedStatDivider: { width: 1, height: 30, backgroundColor: "#E2E8F0" },

  /* Loading / Centered */
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular", fontSize: 13 },

  /* List */
  list: { padding: 14, gap: 12 },

  /* Cards */
  card: {
    flexDirection: "row", backgroundColor: "#fff",
    borderRadius: 20, overflow: "hidden",
    shadowColor: "#1A2B4A", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09, shadowRadius: 12, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  cardCritical: {
    shadowColor: "#EF4444", shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
    borderColor: "#FECACA",
  },
  completedCard: {
    borderColor: "#D1FAE5",
  },
  accentBar: { width: 5 },
  cardBody:  { flex: 1, padding: 14, gap: 6 },

  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderIdRow: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  orderHash:  { fontSize: 10, fontFamily: "Inter_700Bold", color: "#94A3B8" },
  orderId:    { fontSize: 13, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  badgeRow:   { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusTxt:  { fontSize: 10, fontFamily: "Inter_700Bold" },

  custName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  infoRow:     { flexDirection: "row", alignItems: "center", gap: 7 },
  infoIconWrap:{ width: 18, height: 18, borderRadius: 5, backgroundColor: "#F1F4F9", alignItems: "center", justifyContent: "center" },
  infoTxt:     { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },

  /* Completed meta */
  completedMetaRow: {
    flexDirection: "row", gap: 16, marginTop: 4, marginBottom: 2,
    backgroundColor: "#F8FFF9", borderRadius: 10, padding: 10,
  },
  completedMetaItem: { flex: 1, gap: 2 },
  completedMetaLabel: { fontSize: 10, fontFamily: "Inter_500Medium", color: "#6B7A99", flexDirection: "row" },
  completedMetaVal:   { fontSize: 13, fontFamily: "Inter_700Bold", color: "#065F46" },

  /* Footer */
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  codChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  codTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },

  earningsChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: "#F5F3FF", borderWidth: 1, borderColor: "#DDD6FE",
  },
  earningsTxt: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#7C3AED" },

  actionBtns: { flexDirection: "row", gap: 7 },
  actionBtn:  { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  /* Empty */
  emptyWrap:     { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 4, backgroundColor: "#F1F4F9" },
  emptyTitle:    { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#0D1F3C" },
  emptyTxt:      { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99", textAlign: "center", paddingHorizontal: 32 },
});
