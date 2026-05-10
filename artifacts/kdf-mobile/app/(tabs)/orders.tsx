import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type SectionKey = "new" | "active" | "completed" | "failed" | "returned";
type PeriodKey  = "today" | "yesterday" | "week" | "month" | "all";

const SECTIONS: { key: SectionKey; label: string; icon: string; statuses: string[] }[] = [
  { key: "new",       label: "نئے آرڈر",  icon: "bell",         statuses: ["assigned"] },
  { key: "active",    label: "Active",    icon: "zap",          statuses: ["picked", "out_for_delivery", "near_customer"] },
  { key: "completed", label: "Delivered", icon: "check-circle", statuses: ["delivered"] },
  { key: "failed",    label: "Failed",    icon: "x-circle",     statuses: ["failed"] },
  { key: "returned",  label: "Returned",  icon: "rotate-ccw",   statuses: ["returned"] },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today",     label: "Today"    },
  { key: "yesterday", label: "Yesterday"},
  { key: "week",      label: "7 Days"   },
  { key: "month",     label: "Month"    },
  { key: "all",       label: "All Time" },
];

const SECTION_COLORS: Record<SectionKey, { accent: string; bg: string; light: string }> = {
  new:       { accent: "#DC2626", bg: "#FEF2F2",  light: "#FEE2E2" },
  active:    { accent: "#3B82F6", bg: "#EFF6FF",  light: "#DBEAFE" },
  completed: { accent: "#10B981", bg: "#ECFDF5",  light: "#D1FAE5" },
  failed:    { accent: "#EF4444", bg: "#FEF2F2",  light: "#FEE2E2" },
  returned:  { accent: "#8B5CF6", bg: "#F5F3FF",  light: "#EDE9FE" },
};

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
function ActiveCard({ d, onPress, token, qc }: { d: any; onPress: () => void; token: string | null; qc: any }) {
  const sc       = getStatusColor(d.status);
  const sb       = getStatusBg(d.status);
  const cod      = Number(d.cod_amount ?? 0);
  const priority = getPriorityInfo(d.assigned_at);
  const isCrit   = ["critical", "high"].includes(priority.priority);
  const isNew    = d.status === "assigned";
  const addr     = parseAddr(d);

  /* Glow animation for newly assigned orders */
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const glowLoop  = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (isNew) {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
        ])
      );
      glowLoop.current.start();
    } else {
      glowLoop.current?.stop();
      glowAnim.setValue(0);
    }
    return () => glowLoop.current?.stop();
  }, [isNew]);

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(0,197,98,0)", "rgba(0,197,98,0.55)"],
  });
  const glowElevation = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [5, 14] });

  /* Accept mutation — moves status assigned → picked */
  const acceptMut = useMutation({
    mutationFn: async () => {
      const r = await riderFetch(`/rider/deliveries/${d.id}/status`, token, {
        method: "PUT",
        body:   JSON.stringify({ status: "picked" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries-tasks"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e.message);
    },
  });

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
    <Animated.View
      style={[
        styles.card,
        isCrit && styles.cardCritical,
        isNew && {
          borderColor: glowColor,
          borderWidth: 2,
          shadowColor: "#00C562",
          shadowOpacity: glowElevation.interpolate({ inputRange: [5, 14], outputRange: [0.1, 0.45] }),
          shadowRadius: glowElevation,
          elevation: glowElevation,
        },
      ]}
    >
      <TouchableOpacity style={{ flex: 1, flexDirection: "row" }} onPress={onPress} activeOpacity={0.82}>
        <LinearGradient
          colors={isNew ? ["#00C562", "#007A3D"] : isCrit ? ["#EF4444", "#DC2626"] : [sc, sc + "88"]}
          style={styles.accentBar}
        />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.orderIdRow}>
              <Text style={styles.orderHash}>#</Text>
              <Text style={[styles.orderId, isNew && { color: "#00A552" }]}>{d.shopify_order_number ?? d.id}</Text>
            </View>
            <View style={styles.badgeRow}>
              {isNew ? (
                <View style={[styles.statusPill, { backgroundColor: "#D1FAE5" }]}>
                  <View style={[styles.statusDot, { backgroundColor: "#00C562" }]} />
                  <Text style={[styles.statusTxt, { color: "#00A552" }]}>نیا آرڈر</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, { backgroundColor: sb }]}>
                  <View style={[styles.statusDot, { backgroundColor: sc }]} />
                  <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
                </View>
              )}
              <PriorityBadge assignedAt={d.assigned_at} />
            </View>
            <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
          </View>

          <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

          {!!addr && addr !== "—" && (
            <View style={styles.infoRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: "#EFF6FF" }]}>
                <Feather name="map-pin" size={10} color="#3B82F6" />
              </View>
              <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: "#F5F3FF" }]}>
              <Feather name="clock" size={10} color="#7C3AED" />
            </View>
            <Text style={styles.infoTxt}>Assigned: {formatDate(d.assigned_at)}</Text>
          </View>

          {d.assigned_at && (
            <View style={{ marginTop: 2 }}>
              <CountdownLine assignedAt={d.assigned_at} />
            </View>
          )}

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

      {/* Accept quick button — only for assigned orders */}
      {isNew && (
        <TouchableOpacity
          style={styles.acceptQuickBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            acceptMut.mutate();
          }}
          disabled={acceptMut.isPending}
          activeOpacity={0.82}
        >
          {acceptMut.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.acceptQuickTxt}>قبول</Text>
              </>
          }
        </TouchableOpacity>
      )}
    </Animated.View>
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
      <LinearGradient colors={["#10B981", "#059669"]} style={styles.accentBar} />
      <View style={styles.cardBody}>
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

/* ─── Section Tab ─── */
function SectionTab({
  section, activeKey, count, onPress,
}: { section: typeof SECTIONS[0]; activeKey: SectionKey; count: number; onPress: () => void }) {
  const active = section.key === activeKey;
  const col    = SECTION_COLORS[section.key];

  return (
    <TouchableOpacity
      style={[styles.sectionTab, active && { backgroundColor: col.accent + "20", borderColor: col.accent }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Feather name={section.icon as any} size={14} color={active ? col.accent : "rgba(255,255,255,0.4)"} />
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

/* ─── Period Tab ─── */
function PeriodTab({ period, active, onPress }: { period: typeof PERIODS[0]; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.periodTab, active && styles.periodTabActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.periodTabTxt, active && styles.periodTabTxtActive]}>{period.label}</Text>
    </TouchableOpacity>
  );
}

/* ─── Empty State ─── */
function EmptyState({ section, period }: { section: SectionKey; period: PeriodKey }) {
  const col = SECTION_COLORS[section];
  const icons: Record<SectionKey, string> = { new: "bell", active: "zap", completed: "check-circle", failed: "x-circle", returned: "rotate-ccw" };
  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? "this period";
  const msgs: Record<SectionKey, string> = {
    new:       "کوئی نئے آرڈر نہیں\nآج کے نئے آرڈر یہاں آئیں گے",
    active:    "کوئی active delivery نہیں",
    completed: `No deliveries in ${periodLabel}`,
    failed:    `No failed orders in ${periodLabel}`,
    returned:  `No returned orders in ${periodLabel}`,
  };
  const titles: Record<SectionKey, string> = {
    new:       "کوئی نئے آرڈر نہیں",
    active:    "All Clear!",
    completed: "Nothing Here",
    failed:    "Nothing Here",
    returned:  "Nothing Here",
  };
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: col.bg }]}>
        <Feather name={icons[section] as any} size={34} color={col.accent} />
      </View>
      <Text style={styles.emptyTitle}>{titles[section]}</Text>
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
  const [activeSection, setActiveSection] = useState<SectionKey>("new");
  const [activePeriod,  setActivePeriod]  = useState<PeriodKey>("today");
  const [search,        setSearch]        = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;

  /* "new" section fetches only last-7-day assigned orders (avoids flooding with 400+ old assignments)
     "active" section fetches all in-progress orders from last 45 days
     History sections use the user-selected period */
  const apiPeriod = activeSection === "new" ? "new" : activeSection === "active" ? "active" : activePeriod;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["rider-deliveries-tasks", apiPeriod, activeSection],
    queryFn: async () => {
      const r = await riderFetch(`/rider/deliveries?period=${apiPeriod}`, token);
      return r.json();
    },
    refetchInterval: (activeSection === "new" || activeSection === "active") ? 8_000 : 30_000,
    refetchIntervalInBackground: false,
  });

  const allDeliveries: any[] = data?.deliveries ?? [];

  const sortNewest = (arr: any[]) =>
    [...arr].sort((a, b) => new Date(b.assigned_at ?? 0).getTime() - new Date(a.assigned_at ?? 0).getTime());

  const sortDelivered = (arr: any[]) =>
    [...arr].sort((a, b) => new Date(b.delivered_at ?? b.assigned_at ?? 0).getTime() - new Date(a.delivered_at ?? a.assigned_at ?? 0).getTime());

  const sections = {
    new:       sortNewest(allDeliveries.filter(d => d.status === "assigned")),
    active:    sortNewest(allDeliveries.filter(d => ["picked", "out_for_delivery", "near_customer", "delayed", "rescheduled"].includes(d.status))),
    completed: sortDelivered(allDeliveries.filter(d => d.status === "delivered")),
    failed:    sortNewest(allDeliveries.filter(d => d.status === "failed")),
    returned:  sortNewest(allDeliveries.filter(d => d.status === "returned")),
  };

  const raw = sections[activeSection];

  /* Client-side search: order #, customer name, phone, address */
  const filtered = search.trim()
    ? raw.filter(d => {
        const q = search.trim().toLowerCase();
        return (
          String(d.shopify_order_number ?? d.id).toLowerCase().includes(q) ||
          (d.customer_name  ?? "").toLowerCase().includes(q) ||
          (d.customer_phone ?? "").toLowerCase().includes(q) ||
          (d.delivery_address ?? "").toLowerCase().includes(q)
        );
      })
    : raw;
  const current = filtered;
  const newOrdersCount = sections.new.length;
  const urgentCount = sections.active.filter(d =>
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  const switchSection = useCallback((key: SectionKey) => {
    Haptics.selectionAsync();
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    setActiveSection(key);
    setSearch(""); /* clear search when switching tabs */
  }, [slideAnim]);

  const switchPeriod = useCallback((key: PeriodKey) => {
    Haptics.selectionAsync();
    setActivePeriod(key);
  }, []);

  const openOrder = (id: number) => {
    Haptics.selectionAsync();
    router.push(`/order/${id}` as any);
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeSection === "new" || activeSection === "active") {
      return <ActiveCard d={item} onPress={() => openOrder(item.id)} token={token} qc={qc} />;
    }
    if (activeSection === "completed") {
      return <CompletedCard d={item} onPress={() => openOrder(item.id)} />;
    }
    return <TerminalCard d={item} onPress={() => openOrder(item.id)} section={activeSection === "failed" ? "failed" : "returned"} />;
  }, [activeSection, token]);

  const completedEarnings = sections.completed.reduce((s, d) => s + Number(d.delivery_charge ?? 0), 0);
  const completedCOD      = sections.completed.filter(d => !d.is_paid).reduce((s, d) => s + Number(d.cod_amount ?? 0), 0);

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>My Orders</Text>
            <Text style={styles.headerSub}>
              {isLoading ? "Loading..." : `${allDeliveries.length} orders`}
              {newOrdersCount > 0 && <Text style={{ color: "#FCA5A5" }}> · {newOrdersCount} نئے</Text>}
              {urgentCount > 0 && <Text style={{ color: "#FCA5A5" }}> · {urgentCount} urgent</Text>}
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

        {/* Search bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={14} color="rgba(255,255,255,0.45)" />
            <TextInput
              style={styles.searchInput}
              placeholder="آرڈر #، نام، یا فون نمبر"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x-circle" size={15} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
          {search.trim().length > 0 && (
            <View style={styles.searchCountBadge}>
              <Text style={styles.searchCountTxt}>{current.length}</Text>
            </View>
          )}
        </View>

        {/* Period filter — shown for history sections only */}
        {activeSection !== "new" && activeSection !== "active" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodList}
          >
            {PERIODS.map(p => (
              <PeriodTab
                key={p.key}
                period={p}
                active={activePeriod === p.key}
                onPress={() => switchPeriod(p.key)}
              />
            ))}
          </ScrollView>
        )}
      </LinearGradient>

      {/* ── NEW ORDERS floating banner (shown when viewing other sections) ── */}
      {activeSection !== "new" && newOrdersCount > 0 && (
        <TouchableOpacity
          style={styles.newOrdersBanner}
          onPress={() => switchSection("new")}
          activeOpacity={0.88}
        >
          <View style={styles.newOrdersBannerDot} />
          <Feather name="bell" size={14} color="#fff" />
          <Text style={styles.newOrdersBannerTxt}>
            {newOrdersCount} نئے آرڈر آئے — دیکھنے کے لیے یہاں ٹیپ کریں
          </Text>
          <View style={styles.newOrdersBadge}>
            <Text style={styles.newOrdersBadgeTxt}>{newOrdersCount}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Urgent Banner (active section) ── */}
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
            {SECTIONS.find(s => s.key === activeSection)?.label}
            {activeSection !== "new" && activeSection !== "active" && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12 }}>
                {" "}· {PERIODS.find(p => p.key === activePeriod)?.label}
              </Text>
            )}
          </Text>
        </View>
        <Text style={[styles.sectionCount, { color: SECTION_COLORS[activeSection].accent }]}>
          {current.length} {current.length === 1 ? "order" : "orders"}
        </Text>
      </View>

      {/* ── Completed Summary Row ── */}
      {activeSection === "completed" && sections.completed.length > 0 && (
        <View style={styles.completedStatsRow}>
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>{sections.completed.length}</Text>
            <Text style={styles.completedStatLabel}>Delivered</Text>
          </View>
          <View style={styles.completedStatDivider} />
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>Rs. {completedEarnings.toLocaleString()}</Text>
            <Text style={styles.completedStatLabel}>Earnings</Text>
          </View>
          <View style={styles.completedStatDivider} />
          <View style={styles.completedStat}>
            <Text style={styles.completedStatVal}>Rs. {completedCOD.toLocaleString()}</Text>
            <Text style={styles.completedStatLabel}>COD</Text>
          </View>
        </View>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={SECTION_COLORS[activeSection].accent} size="large" />
          <Text style={styles.loadingTxt}>Loading orders...</Text>
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
            ListEmptyComponent={<EmptyState section={activeSection} period={activePeriod} />}
          />
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F3F8" },

  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },

  refreshBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },

  /* Section tabs */
  tabList: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  sectionTab: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  sectionTabTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  countBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, minWidth: 22, alignItems: "center" },
  countTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },

  /* Search bar */
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 9,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14, paddingHorizontal: 12, height: 40,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  searchInput: {
    flex: 1, color: "#fff", fontSize: 13,
    fontFamily: "Inter_400Regular", height: 40,
  },
  searchCountBadge: {
    backgroundColor: "#00C562", borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5, minWidth: 34, alignItems: "center",
  },
  searchCountTxt: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  /* Period tabs */
  periodList: { paddingHorizontal: 16, paddingBottom: 14, gap: 7 },
  periodTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  periodTabActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.4)",
  },
  periodTabTxt: { fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.4)" },
  periodTabTxtActive: { color: "#fff", fontFamily: "Inter_700Bold" },

  /* NEW ORDERS banner */
  newOrdersBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#DC2626", paddingHorizontal: 16, paddingVertical: 11,
    position: "relative", overflow: "hidden",
  },
  newOrdersBannerDot: {
    position: "absolute", left: -6, top: -6, width: 40, height: 40,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)",
  },
  newOrdersBannerTxt: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff", flex: 1,
  },
  newOrdersBadge: {
    backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  newOrdersBadgeTxt: {
    fontSize: 11, fontFamily: "Inter_700Bold", color: "#DC2626",
  },

  /* Urgent */
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FEF2F2", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#FEE2E2",
  },
  urgentTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#DC2626", flex: 1 },

  /* Section label */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 11,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHeaderTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  sectionCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  /* Completed summary */
  completedStatsRow: {
    flexDirection: "row", backgroundColor: "#fff",
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: "#F0F3F8",
  },
  completedStat: { flex: 1, alignItems: "center" },
  completedStatDivider: { width: 1, backgroundColor: "#E5E7EB", marginVertical: 4 },
  completedStatVal: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#10B981" },
  completedStatLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#6B7A99", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.3 },

  /* Loading */
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular", fontSize: 13 },

  /* List */
  list: { padding: 14, gap: 11 },

  /* Cards */
  card: {
    flexDirection: "row", backgroundColor: "#fff",
    borderRadius: 22, overflow: "hidden",
    shadowColor: "#1A2B4A", shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09, shadowRadius: 14, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  cardCritical: {
    shadowColor: "#EF4444", shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
    borderColor: "#FECACA",
  },
  completedCard: { opacity: 0.96 },
  accentBar: { width: 5 },
  cardBody: { flex: 1, padding: 14, gap: 7 },

  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderIdRow: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  orderHash: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#94A3B8" },
  orderId: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.3 },

  custName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoIconWrap: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  infoTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },

  completedMetaRow: { flexDirection: "row", gap: 16, marginTop: 2 },
  completedMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  completedMetaLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#94A3B8" },
  completedMetaVal: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#475569" },

  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  codChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  codTxt: { fontSize: 11, fontFamily: "Inter_700Bold" },
  actionBtns: { flexDirection: "row", gap: 7 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  /* Accept quick button (on assigned cards) */
  acceptQuickBtn: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00C562",
    gap: 4,
    paddingVertical: 10,
  },
  acceptQuickTxt: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  earningsChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#F5F3FF", borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  earningsTxt: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#7C3AED" },

  /* Empty */
  emptyWrap: { alignItems: "center", paddingVertical: 64, paddingHorizontal: 24, gap: 12 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#0D1F3C" },
  emptyTxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94A3B8", textAlign: "center", lineHeight: 20 },
});
