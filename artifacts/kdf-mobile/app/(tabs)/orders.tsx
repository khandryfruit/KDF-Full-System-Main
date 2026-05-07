import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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
import { sortByPriority, getPriorityInfo } from "@/utils/priority";

const C = colors.light;
const NAV_EXTRA = Platform.OS === "android" ? 84 : 100;

const FILTERS = [
  { key: "all",              label: "All",       icon: "layers"       },
  { key: "assigned",         label: "Assigned",  icon: "package"      },
  { key: "picked",           label: "Picked",    icon: "archive"      },
  { key: "out_for_delivery", label: "On Route",  icon: "truck"        },
  { key: "delivered",        label: "Done",      icon: "check-circle" },
  { key: "failed",           label: "Failed",    icon: "x-circle"     },
] as const;

const TERMINAL = new Set(["delivered", "failed", "returned"]);

/* ─── Premium Order Card ─── */
function OrderCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc = getStatusColor(d.status);
  const sb = getStatusBg(d.status);
  const cod = Number(d.cod_amount ?? 0);
  const isActive = !TERMINAL.has(d.status);
  const priority = getPriorityInfo(d.assigned_at);
  const isCritical = isActive && ["critical", "high"].includes(priority.priority);

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string" ? JSON.parse(d.shipping_address) : d.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  const items: any[] = (() => {
    try {
      const li = typeof d.line_items === "string" ? JSON.parse(d.line_items) : d.line_items;
      return Array.isArray(li) ? li : [];
    } catch { return []; }
  })();

  const openMaps = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(`https://maps.google.com/?q=${q}`);
  };
  const callCustomer = () => Linking.openURL(`tel:${d.customer_phone}`);
  const waCustomer = () => {
    const ph = String(d.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(`السلام علیکم! میں آپ کا KDF NUTS آرڈر #${d.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`);
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };
  const navigate = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`);
  };

  return (
    <TouchableOpacity
      style={[styles.card, isCritical && styles.cardCritical]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Accent bar */}
      <LinearGradient
        colors={isCritical ? ["#EF4444", "#DC2626"] : [sc, sc + "88"]}
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
            {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
          </View>
          <Feather name="chevron-right" size={14} color="#C0C8D8" style={{ marginLeft: "auto" }} />
        </View>

        {/* Customer */}
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Contact & Address */}
        {!!d.customer_phone && (
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
              <Feather name="phone" size={10} color="#6B7A99" />
            </View>
            <Text style={styles.infoTxt}>{d.customer_phone}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: "#EFF6FF" }]}>
            <Feather name="map-pin" size={10} color="#3B82F6" />
          </View>
          <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
        </View>

        {/* Items */}
        {items.length > 0 && (
          <View style={styles.infoRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: "#F5F3FF" }]}>
              <Feather name="box" size={10} color="#7C3AED" />
            </View>
            <Text style={styles.itemsTxt} numberOfLines={1}>
              {items.slice(0, 2).map((i: any) => `${i.quantity ?? 1}× ${i.title ?? i.name ?? "Item"}`).join(" · ")}
              {items.length > 2 ? ` +${items.length - 2}` : ""}
            </Text>
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
              size={12}
              color={d.is_paid ? "#059669" : "#D97706"}
            />
            <Text style={[styles.codTxt, { color: d.is_paid ? "#059669" : "#D97706" }]}>
              {d.is_paid ? "PAID" : `Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.actionBtns}>
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#EFF6FF" }]}
                onPress={callCustomer}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="phone-call" size={13} color="#2563EB" />
              </TouchableOpacity>
            )}
            {!!d.customer_phone && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#F0FDF4" }]}
                onPress={waCustomer}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="message-circle" size={13} color="#16A34A" />
              </TouchableOpacity>
            )}
            {!!addr && addr !== "—" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#FFF7ED" }]}
                onPress={navigate}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="navigation" size={13} color="#EA580C" />
              </TouchableOpacity>
            )}
            {!!addr && addr !== "—" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#EFF6FF" }]}
                onPress={openMaps}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="map" size={13} color="#1D4ED8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─── Screen ─── */
export default function OrdersScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-deliveries", filter],
    queryFn: async () => {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const r = await riderFetch(`/rider/deliveries${qs}`, token);
      return r.json();
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const rawDeliveries: any[] = data?.deliveries ?? [];
  const deliveries = sortByPriority(rawDeliveries);
  const urgentCount = deliveries.filter(d =>
    !TERMINAL.has(d.status) &&
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Header */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>My Deliveries</Text>
            <Text style={styles.headerSub}>
              {isLoading ? "Loading..." : `${deliveries.length} orders`}
              {urgentCount > 0 ? ` · ` : ""}
              {urgentCount > 0 && <Text style={{ color: "#EF4444" }}>{urgentCount} urgent</Text>}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); refetch(); }}
            style={styles.refreshBtn}
          >
            <Feather name="refresh-cw" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={i => i.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const fColor = item.key === "all" ? "#00C562" : getStatusColor(item.key);
            return (
              <TouchableOpacity
                style={[styles.filterPill, active && { backgroundColor: fColor + "22", borderColor: fColor }]}
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
              >
                <Feather name={item.icon as any} size={11} color={active ? fColor : "rgba(255,255,255,0.45)"} />
                <Text style={[styles.filterTxt, { color: active ? fColor : "rgba(255,255,255,0.45)" }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </LinearGradient>

      {/* Urgent banner */}
      {urgentCount > 0 && (
        <View style={styles.urgentBanner}>
          <Feather name="alert-octagon" size={14} color="#EF4444" />
          <Text style={styles.urgentTxt}>
            {urgentCount} {urgentCount === 1 ? "order requires" : "orders require"} immediate attention
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={styles.loadingTxt}>Loading deliveries...</Text>
        </View>
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={d => String(d.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + NAV_EXTRA }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
          renderItem={({ item }) => (
            <OrderCard
              d={item}
              onPress={() => { Haptics.selectionAsync(); router.push(`/order/${item.id}` as any); }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Feather name="inbox" size={38} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No orders found</Text>
              <Text style={styles.emptyTxt}>
                {filter === "all"
                  ? "No deliveries assigned yet."
                  : `No ${getStatusLabel(filter).toLowerCase()} deliveries.`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F4F9" },

  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 16,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },

  filterList: { paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2, gap: 8 },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  filterTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#FECACA",
  },
  urgentTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#B91C1C", flex: 1 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular", fontSize: 13 },

  list: { padding: 14, gap: 12 },

  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 20, overflow: "hidden",
    shadowColor: "#1A2B4A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09, shadowRadius: 12, elevation: 5,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.04)",
  },
  cardCritical: {
    shadowColor: "#EF4444", shadowOpacity: 0.2, shadowRadius: 16, elevation: 8,
    borderColor: "#FECACA",
  },
  accentBar: { width: 5 },
  cardBody: { flex: 1, padding: 14, gap: 6 },

  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderIdRow: { flexDirection: "row", alignItems: "baseline", gap: 1 },
  orderHash: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#94A3B8" },
  orderId: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#3B82F6" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },

  custName: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  infoIconWrap: { width: 18, height: 18, borderRadius: 5, backgroundColor: "#F1F4F9", alignItems: "center", justifyContent: "center" },
  infoTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },
  itemsTxt: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7A99", fontStyle: "italic" },

  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  codChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  codTxt: { fontSize: 12, fontFamily: "Inter_700Bold" },

  actionBtns: { flexDirection: "row", gap: 7 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#F1F4F9", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#0D1F3C" },
  emptyTxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99", textAlign: "center", paddingHorizontal: 32 },
});
