import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adminFetch, useAuth } from "@/context/AuthContext";

const BG     = "#080D1A";
const CARD   = "#0F1729";
const GOLD   = "#F59E0B";
const BORDER = "rgba(255,255,255,0.07)";

const STATUS_TABS = [
  { key: "all",       label: "All" },
  { key: "pending",   label: "Pending" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  fulfilled: "#10B981", pending: "#F59E0B", cancelled: "#EF4444",
  "partially fulfilled": "#3B82F6", unfulfilled: "#F59E0B",
};

function statusColor(s: string) { return STATUS_COLORS[s?.toLowerCase()] ?? "#6B7280"; }
function statusLabel(s: string) {
  if (!s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function OrderCard({ order }: { order: any }) {
  const sc = statusColor(order.fulfillment_status || order.status);
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderTop}>
        <View>
          <Text style={styles.orderNum}>{order.order_number || `#${order.id}`}</Text>
          <Text style={styles.orderCustomer}>{order.customer_name || "—"}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${sc}18`, borderColor: `${sc}30` }]}>
          <Text style={[styles.statusTxt, { color: sc }]}>{statusLabel(order.fulfillment_status || order.status)}</Text>
        </View>
      </View>
      <View style={styles.orderMeta}>
        <View style={styles.metaItem}>
          <Feather name="map-pin" size={11} color="rgba(255,255,255,0.35)" />
          <Text style={styles.metaTxt} numberOfLines={1}>{order.shipping_city || order.city || "—"}</Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="dollar-sign" size={11} color={GOLD} />
          <Text style={[styles.metaTxt, { color: GOLD, fontFamily: "Inter_700Bold" }]}>
            Rs.{Number(order.total_price ?? 0).toLocaleString()}
          </Text>
        </View>
        <Text style={styles.metaTime}>{timeAgo(order.created_at)}</Text>
      </View>
    </View>
  );
}

export default function AdminOrders() {
  const { token } = useAuth();
  const insets    = useSafeAreaInsets();
  const [orders,    setOrders]    = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [search,    setSearch]    = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(true);

  const fetchOrders = useCallback(async (p = 1, reset = false) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20" });
      if (search.trim()) params.set("search", search.trim());
      if (activeTab !== "all") params.set("fulfillmentStatus", activeTab);
      const res = await adminFetch(`/admin/shopify/orders?${params}`, token);
      if (res.ok) {
        const data   = await res.json();
        const fetched = data.orders ?? data.data ?? [];
        setOrders(prev => reset ? fetched : [...prev, ...fetched]);
        setHasMore(fetched.length === 20);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token, search, activeTab]);

  useEffect(() => {
    setLoading(true); setPage(1);
    fetchOrders(1, true);
  }, [search, activeTab]);

  const loadMore  = () => { if (!hasMore || loading) return; const next = page + 1; setPage(next); fetchOrders(next); };
  const onRefresh = () => { setRefreshing(true); setPage(1); fetchOrders(1, true); };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.count}>{orders.length} loaded</Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={15} color="rgba(255,255,255,0.3)" style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search order # or customer..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")} style={{ padding: 10 }}>
            <Feather name="x" size={14} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabs}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabTxt, activeTab === tab.key && styles.tabTxtActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && orders.length === 0 ? (
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={40} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTxt}>No orders found</Text>
            </View>
          }
          ListFooterComponent={
            hasMore && orders.length > 0
              ? <ActivityIndicator color={GOLD} style={{ marginVertical: 20 }} />
              : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: BG },
  header:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  title:     { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  count:     { color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "Inter_400Regular" },
  searchWrap:{ flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  searchInput:{ flex: 1, color: "#fff", fontFamily: "Inter_400Regular", fontSize: 14, paddingHorizontal: 10, paddingVertical: 12 },
  tabs:      { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 14, padding: 4, gap: 4 },
  tab:       { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: `${GOLD}20` },
  tabTxt:    { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabTxtActive: { color: GOLD },
  orderCard: { backgroundColor: CARD, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  orderTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  orderNum:  { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  orderCustomer: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusTxt:     { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  orderMeta:     { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem:      { flexDirection: "row", alignItems: "center", gap: 4 },
  metaTxt:       { color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular" },
  metaTime:      { color: "rgba(255,255,255,0.25)", fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: "auto" },
  empty:         { alignItems: "center", gap: 12, paddingTop: 60 },
  emptyTxt:      { color: "rgba(255,255,255,0.25)", fontSize: 14, fontFamily: "Inter_400Regular" },
});
