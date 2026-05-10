import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adminFetch, useAuth } from "@/context/AuthContext";

const BG     = "#080D1A";
const CARD   = "#0F1729";
const GOLD   = "#F59E0B";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const BORDER = "rgba(255,255,255,0.07)";

function Stat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function RiderCard({ rider, onToggle }: { rider: any; onToggle: () => void }) {
  const isOnline = rider.is_online;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: isOnline ? "#059669" : "#374151" }]}>
          <Text style={styles.avatarTxt}>{rider.name?.charAt(0) ?? "R"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.riderName}>{rider.name}</Text>
          <Text style={styles.riderPhone}>{rider.phone}</Text>
          {rider.delivery_area ? (
            <Text style={styles.riderArea}><Feather name="map-pin" size={10} /> {rider.delivery_area}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.75}
          style={[styles.toggleBtn, {
            backgroundColor: isOnline ? `${RED}18` : `${GREEN}18`,
            borderColor:     isOnline ? `${RED}30` : `${GREEN}30`,
          }]}
        >
          <View style={[styles.toggleDot, { backgroundColor: isOnline ? RED : GREEN }]} />
          <Text style={[styles.toggleTxt, { color: isOnline ? RED : GREEN }]}>
            {isOnline ? "Online" : "Offline"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.statsRow}>
        <Stat label="Active"     value={rider.active_orders ?? 0}   color={GOLD} />
        <Stat label="Today"      value={rider.delivered_today ?? 0} color={GREEN} />
        <Stat label="Cash Limit" value={`Rs.${Number(rider.cash_limit ?? 50000).toLocaleString()}`} color="rgba(255,255,255,0.5)" />
        {rider.has_push && (
          <View style={styles.pushBadge}>
            <Feather name="smartphone" size={11} color="#3B82F6" />
            <Text style={styles.pushTxt}>Push</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function AdminRiders() {
  const { token } = useAuth();
  const insets    = useSafeAreaInsets();
  const [riders,       setRiders]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [autoAssigning,setAutoAssigning]= useState(false);
  const [lastResult,   setLastResult]   = useState<string | null>(null);

  const fetchRiders = useCallback(async () => {
    try {
      const res = await adminFetch("/admin/riders/live-dashboard", token);
      if (res.ok) {
        const data = await res.json();
        setRiders(data.activeRiders ?? []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);
  const onRefresh = () => { setRefreshing(true); fetchRiders(); };

  const toggleOnline = async (rider: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await adminFetch(`/admin/riders/${rider.id}/toggle-online`, token, {
        method: "PATCH",
        body: JSON.stringify({ is_online: !rider.is_online }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRiders(prev => prev.map(r => r.id === rider.id ? { ...r, is_online: !rider.is_online } : r));
      }
    } catch {}
  };

  const autoAssign = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAutoAssigning(true);
    setLastResult(null);
    try {
      const res  = await adminFetch("/admin/riders/auto-assign", token, { method: "POST", body: JSON.stringify({ limit: 50 }) });
      const data = await res.json();
      if (res.ok && data.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLastResult(`✅ ${data.assigned} orders assigned across ${data.riders_used} rider(s)`);
        fetchRiders();
      } else {
        setLastResult(data.message || data.error || "Auto-assign failed");
      }
    } catch { setLastResult("Network error"); }
    setAutoAssigning(false);
  };

  const onlineCount = riders.filter(r => r.is_online).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Riders</Text>
          <Text style={styles.subtitle}>
            <Text style={{ color: GREEN }}>{onlineCount} online</Text>
            {" · "}{riders.length} total
          </Text>
        </View>
        <TouchableOpacity onPress={autoAssign} disabled={autoAssigning} activeOpacity={0.8}
          style={[styles.autoBtn, autoAssigning && { opacity: 0.6 }]}>
          {autoAssigning
            ? <ActivityIndicator color={GOLD} size="small" />
            : <><Feather name="zap" size={15} color={GOLD} /><Text style={styles.autoBtnTxt}>Auto-Assign</Text></>
          }
        </TouchableOpacity>
      </View>

      {lastResult ? (
        <View style={[styles.resultBanner, {
          backgroundColor: lastResult.startsWith("✅") ? `${GREEN}18` : `${RED}18`,
          borderColor:     lastResult.startsWith("✅") ? `${GREEN}30` : `${RED}30`,
        }]}>
          <Text style={[styles.resultTxt, { color: lastResult.startsWith("✅") ? GREEN : RED }]}>{lastResult}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={riders}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <RiderCard rider={item} onToggle={() => toggleOnline(item)} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="users" size={40} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTxt}>No active riders</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: BG },
  header:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: BORDER },
  title:    { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  autoBtn:  { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${GOLD}18`, borderWidth: 1, borderColor: `${GOLD}30`, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14 },
  autoBtnTxt: { color: GOLD, fontSize: 13, fontFamily: "Inter_700Bold" },
  resultBanner: { marginHorizontal: 16, marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  resultTxt:    { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  card:     { backgroundColor: CARD, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  cardTop:  { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar:   { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarTxt:{ color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  riderName:{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  riderPhone:{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  riderArea:{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  toggleBtn:{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  toggleDot:{ width: 7, height: 7, borderRadius: 4 },
  toggleTxt:{ fontSize: 12, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  stat:     { alignItems: "center", gap: 2 },
  statVal:  { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLbl:  { color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase" },
  pushBadge:{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto", backgroundColor: "#3B82F618", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  pushTxt:  { color: "#3B82F6", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  empty:    { alignItems: "center", gap: 12, paddingTop: 60 },
  emptyTxt: { color: "rgba(255,255,255,0.25)", fontSize: 14, fontFamily: "Inter_400Regular" },
});
