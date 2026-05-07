import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

const FILTERS = [
  { key: "all",              label: "All",       icon: "layers"       },
  { key: "assigned",         label: "Assigned",  icon: "package"      },
  { key: "picked",           label: "Picked",    icon: "archive"      },
  { key: "out_for_delivery", label: "On Route",  icon: "truck"        },
  { key: "delivered",        label: "Delivered", icon: "check-circle" },
  { key: "failed",           label: "Failed",    icon: "x-circle"     },
] as const;

const TERMINAL = new Set(["delivered", "failed", "returned"]);

function OrderCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc  = getStatusColor(d.status);
  const sb  = getStatusBg(d.status);
  const cod = Number(d.cod_amount ?? 0);
  const isActive = !TERMINAL.has(d.status);

  const addr = (() => {
    try {
      const a = typeof d.shipping_address === "string"
        ? JSON.parse(d.shipping_address)
        : d.shipping_address;
      return [a?.address1, a?.city].filter(Boolean).join(", ") || d.delivery_address || "—";
    } catch { return d.delivery_address ?? "—"; }
  })();

  const items = (() => {
    try {
      const li = typeof d.line_items === "string" ? JSON.parse(d.line_items) : d.line_items;
      return Array.isArray(li) ? li : [];
    } catch { return []; }
  })();

  const timeStr = d.assigned_at
    ? new Date(d.assigned_at).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.cardAccent, { backgroundColor: sc }]} />
      <View style={styles.cardBody}>

        {/* Row 1: order# + status pill + priority badge */}
        <View style={styles.row}>
          <Text style={styles.orderNum}>#{d.shopify_order_number ?? d.id}</Text>
          <View style={[styles.statusPill, { backgroundColor: sb }]}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
        </View>

        {/* Row 2: customer name */}
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Row 3: phone */}
        <View style={styles.iconRow}>
          <Feather name="phone" size={11} color={C.mutedForeground} />
          <Text style={styles.iconTxt}>{d.customer_phone}</Text>
        </View>

        {/* Row 4: address */}
        <View style={styles.iconRow}>
          <Feather name="map-pin" size={11} color={C.mutedForeground} />
          <Text style={styles.iconTxt} numberOfLines={1}>{addr}</Text>
        </View>

        {/* Row 5: items */}
        {items.length > 0 && (
          <View style={styles.itemsPreview}>
            <Feather name="box" size={11} color={C.mutedForeground} />
            <Text style={styles.itemsPreviewTxt} numberOfLines={1}>
              {items.slice(0, 2).map((i: any) => `${i.quantity ?? 1}× ${i.title ?? i.name ?? "Item"}`).join(" • ")}
              {items.length > 2 ? ` +${items.length - 2} more` : ""}
            </Text>
          </View>
        )}

        {/* Row 6: countdown (active orders only) */}
        {isActive && d.assigned_at && (
          <View style={{ marginTop: 2 }}>
            <CountdownLine assignedAt={d.assigned_at} />
          </View>
        )}

        {/* Row 7: COD footer + assigned time */}
        <View style={[styles.cardFooter, { backgroundColor: d.is_paid ? C.statusDeliveredBg : C.codBg }]}>
          <View style={styles.row}>
            <Feather
              name={d.is_paid ? "check-circle" : "dollar-sign"}
              size={13}
              color={d.is_paid ? C.statusDelivered : C.cod}
            />
            <Text style={[styles.codTxt, { color: d.is_paid ? C.statusDelivered : C.cod }]}>
              {d.is_paid ? "PAID" : `COD: Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>
          {!!timeStr && <Text style={styles.timeTxt}>Assigned {timeStr}</Text>}
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={C.border} style={{ alignSelf: "center", marginRight: 14 }} />
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const { token } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-deliveries", filter],
    queryFn: async () => {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const r  = await riderFetch(`/rider/deliveries${qs}`, token);
      return r.json();
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const rawDeliveries: any[] = data?.deliveries ?? [];
  // Sort by urgency: critical → high → medium → low, terminal last
  const deliveries = sortByPriority(rawDeliveries);

  // Count critical/high for header alert
  const urgentCount = deliveries.filter(d =>
    !TERMINAL.has(d.status) &&
    ["critical", "high"].includes(getPriorityInfo(d.assigned_at).priority)
  ).length;

  return (
    <View style={[
      styles.root,
      { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0), paddingBottom: Platform.OS === "web" ? 34 : 0 },
    ]}>
      {/* Dark header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Deliveries</Text>
          <Text style={styles.headerSub}>
            {isLoading ? "Loading..." : `${deliveries.length} orders`}
            {urgentCount > 0 ? ` · ${urgentCount} urgent` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Urgent alert banner */}
      {urgentCount > 0 && (
        <View style={styles.urgentBanner}>
          <Feather name="alert-octagon" size={14} color="#ef4444" />
          <Text style={styles.urgentBannerTxt}>
            {urgentCount} {urgentCount === 1 ? "order requires" : "orders require"} immediate attention
          </Text>
        </View>
      )}

      {/* Filter pills */}
      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.key}
        contentContainerStyle={styles.filterBar}
        renderItem={({ item }) => {
          const active = filter === item.key;
          const fColor = item.key === "all" ? C.primary : getStatusColor(item.key);
          const fBg    = item.key === "all" ? C.primaryLight : getStatusBg(item.key);
          return (
            <TouchableOpacity
              style={[styles.filterPill, active && { backgroundColor: fColor }]}
              onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
            >
              <Feather name={item.icon as any} size={12} color={active ? "#fff" : fColor} />
              <Text style={[styles.filterTxt, { color: active ? "#fff" : fColor }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={styles.loadingTxt}>Loading deliveries...</Text>
        </View>
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={d => String(d.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />
          }
          renderItem={({ item }) => (
            <OrderCard
              d={item}
              onPress={() => { Haptics.selectionAsync(); router.push(`/order/${item.id}` as any); }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="inbox" size={52} color={C.border} />
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
  root: { flex: 1, backgroundColor: C.background },

  header: {
    backgroundColor: C.headerBg, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSub:   { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  refreshBtn:  { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },

  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff5f5", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#fecaca",
  },
  urgentBannerTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#b91c1c", flex: 1 },

  filterBar: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  filterTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  centered:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: C.mutedForeground, fontFamily: "Inter_400Regular" },

  list: { paddingHorizontal: 12, paddingTop: 4, gap: 10 },

  card: {
    backgroundColor: C.card, borderRadius: 16, flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  cardAccent: { width: 5 },
  cardBody:   { flex: 1, paddingTop: 13, paddingLeft: 12, paddingBottom: 0, gap: 4 },
  row:        { flexDirection: "row", alignItems: "center", gap: 6 },
  orderNum:   { fontSize: 11, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 0.5 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusTxt:  { fontSize: 10, fontFamily: "Inter_700Bold" },
  custName:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text },
  iconRow:    { flexDirection: "row", alignItems: "center", gap: 5 },
  iconTxt:    { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  itemsPreview:    { flexDirection: "row", alignItems: "center", gap: 5 },
  itemsPreviewTxt: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, fontStyle: "italic" },
  cardFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 9, marginTop: 8,
  },
  codTxt:  { fontSize: 13, fontFamily: "Inter_700Bold", marginLeft: 4 },
  timeTxt: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground },

  emptyWrap:  { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyTxt:   { fontSize: 13, fontFamily: "Inter_400Regular", color: C.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
});
