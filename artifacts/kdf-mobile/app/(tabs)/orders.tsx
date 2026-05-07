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

const FILTERS = [
  { key: "all",              label: "All",       icon: "layers"       },
  { key: "assigned",         label: "Assigned",  icon: "package"      },
  { key: "picked",           label: "Picked",    icon: "archive"      },
  { key: "out_for_delivery", label: "On Route",  icon: "truck"        },
  { key: "delivered",        label: "Done",      icon: "check-circle" },
  { key: "failed",           label: "Failed",    icon: "x-circle"     },
] as const;

const TERMINAL = new Set(["delivered", "failed", "returned"]);

function OrderCard({ d, onPress }: { d: any; onPress: () => void }) {
  const sc = getStatusColor(d.status);
  const sb = getStatusBg(d.status);
  const cod = Number(d.cod_amount ?? 0);
  const isActive = !TERMINAL.has(d.status);

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

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.78}>
      {/* Left accent */}
      <View style={[styles.cardAccent, { backgroundColor: sc }]} />

      <View style={styles.cardBody}>
        {/* Header row */}
        <View style={styles.cardHeaderRow}>
          <Text style={styles.orderNum}>#{d.shopify_order_number ?? d.id}</Text>
          <View style={[styles.statusPill, { backgroundColor: sb }]}>
            <View style={[styles.statusDot, { backgroundColor: sc }]} />
            <Text style={[styles.statusTxt, { color: sc }]}>{getStatusLabel(d.status)}</Text>
          </View>
          {isActive && <PriorityBadge assignedAt={d.assigned_at} />}
        </View>

        {/* Customer */}
        <Text style={styles.custName} numberOfLines={1}>{d.customer_name}</Text>

        {/* Phone & address */}
        <View style={styles.infoRow}>
          <Feather name="phone" size={11} color={C.mutedForeground} />
          <Text style={styles.infoTxt}>{d.customer_phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Feather name="map-pin" size={11} color={C.mutedForeground} />
          <Text style={styles.infoTxt} numberOfLines={1}>{addr}</Text>
        </View>

        {/* Items preview */}
        {items.length > 0 && (
          <View style={styles.infoRow}>
            <Feather name="box" size={11} color={C.mutedForeground} />
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

        {/* Footer: COD + quick actions */}
        <View style={styles.cardFooter}>
          <View style={[styles.codChip, { backgroundColor: d.is_paid ? C.statusDeliveredBg : C.codBg }]}>
            <Feather name={d.is_paid ? "check-circle" : "dollar-sign"} size={11} color={d.is_paid ? C.statusDelivered : C.cod} />
            <Text style={[styles.codTxt, { color: d.is_paid ? C.statusDelivered : C.cod }]}>
              {d.is_paid ? "PAID" : `Rs. ${cod.toLocaleString()}`}
            </Text>
          </View>

          {/* Quick action buttons */}
          <View style={styles.quickBtns}>
            {!!d.customer_phone && (
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: "#E3F2FD" }]} onPress={callCustomer}>
                <Feather name="phone-call" size={13} color="#1565C0" />
              </TouchableOpacity>
            )}
            {!!d.customer_phone && (
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: "#E8F5E9" }]} onPress={waCustomer}>
                <Feather name="message-circle" size={13} color={C.whatsappDark} />
              </TouchableOpacity>
            )}
            {!!addr && addr !== "—" && (
              <TouchableOpacity style={[styles.quickBtn, { backgroundColor: C.primaryLight }]} onPress={openMaps}>
                <Feather name="map" size={13} color={C.primaryDark} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <Feather name="chevron-right" size={15} color={C.border} style={{ alignSelf: "center", marginRight: 12 }} />
    </TouchableOpacity>
  );
}

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
        colors={["#0D2137", "#0F2A47"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 14 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>My Deliveries</Text>
            <Text style={styles.headerSub}>
              {isLoading ? "Loading..." : `${deliveries.length} orders`}
              {urgentCount > 0 ? ` · ${urgentCount} urgent` : ""}
            </Text>
          </View>
          <TouchableOpacity onPress={() => { Haptics.selectionAsync(); refetch(); }} style={styles.refreshBtn}>
            <Feather name="refresh-cw" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

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
            return (
              <TouchableOpacity
                style={[styles.filterPill, active && { backgroundColor: fColor, borderColor: fColor }]}
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
              >
                <Feather name={item.icon as any} size={11} color={active ? "#fff" : "rgba(255,255,255,0.6)"} />
                <Text style={[styles.filterTxt, { color: active ? "#fff" : "rgba(255,255,255,0.6)" }]}>{item.label}</Text>
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
            {urgentCount} {urgentCount === 1 ? "order requires" : "orders require"} immediate action
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
              <View style={styles.emptyIcon}>
                <Feather name="inbox" size={36} color={C.border} />
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
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, marginBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub:   { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  refreshBtn:  { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },

  filterBar: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, gap: 8 },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  filterTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#FECACA",
  },
  urgentTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#B91C1C", flex: 1 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: C.mutedForeground, fontFamily: "Inter_400Regular" },

  list: { padding: 12, gap: 10 },

  card: {
    flexDirection: "row", backgroundColor: C.card, borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },
  cardAccent: { width: 5 },
  cardBody:   { flex: 1, padding: 13, gap: 5 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  orderNum:   { fontSize: 11, fontFamily: "Inter_700Bold", color: C.primary, letterSpacing: 0.5 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusTxt:  { fontSize: 10, fontFamily: "Inter_700Bold" },
  custName:   { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.text },
  infoRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  infoTxt:    { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground },
  itemsTxt:   { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, fontStyle: "italic" },

  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  codChip:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  codTxt:     { fontSize: 12, fontFamily: "Inter_700Bold" },
  quickBtns:  { flexDirection: "row", gap: 6 },
  quickBtn:   { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  emptyWrap:  { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: C.muted, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyTxt:   { fontSize: 13, fontFamily: "Inter_400Regular", color: C.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
});
