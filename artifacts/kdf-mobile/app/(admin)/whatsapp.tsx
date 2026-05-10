import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
const WGREEN = "#22C55E";
const BORDER = "rgba(255,255,255,0.07)";

function ConvCard({ conv }: { conv: any }) {
  return (
    <View style={styles.convCard}>
      <LinearGradient colors={[`${WGREEN}30`, `${WGREEN}10`]} style={styles.convAvatar}>
        <Feather name="message-circle" size={20} color={WGREEN} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.convName}>{conv.customer_name || conv.phone_number || "Unknown"}</Text>
        <Text style={styles.convMsg} numberOfLines={1}>{conv.last_message || "—"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {conv.unread_count > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadTxt}>{conv.unread_count}</Text>
          </View>
        )}
        <Text style={styles.convTime}>{timeAgo(conv.last_message_at || conv.created_at)}</Text>
      </View>
    </View>
  );
}

function StatPill({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statPill, { borderColor: `${color}25`, backgroundColor: `${color}10` }]}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminWhatsApp() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [convs, setConvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await adminFetch("/admin/wa/conversations?limit=40", token);
      if (res.ok) {
        const d = await res.json();
        setConvs(d.conversations ?? d.data ?? []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const unread = convs.filter((c: any) => c.unread_count > 0).length;
  const total  = convs.length;
  const replied = convs.filter((c: any) => !c.unread_count).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <LinearGradient colors={["#22C55E", "#16A34A"]} style={styles.waIcon}>
            <Feather name="message-circle" size={18} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.title}>WhatsApp Inbox</Text>
            <Text style={styles.subtitle}>
              {unread > 0
                ? <Text style={{ color: WGREEN }}>{unread} unread</Text>
                : "All caught up"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => { setRefreshing(true); fetchData(); }}
          style={styles.refreshBtn}
        >
          <Feather name="refresh-cw" size={16} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatPill icon="message-circle" label="Total"   value={total}   color={WGREEN} />
        <StatPill icon="bell"           label="Unread"  value={unread}  color={GOLD} />
        <StatPill icon="check-circle"   label="Replied" value={replied} color="#3B82F6" />
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={convs}
          keyExtractor={item => String(item.id ?? item.phone_number)}
          renderItem={({ item }) => <ConvCard conv={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
              tintColor={GOLD}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="message-circle" size={40} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTxt}>No conversations yet</Text>
              <Text style={styles.emptySubTxt}>WhatsApp messages will appear here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1)    return "now";
  if (diff < 60)   return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  header:  {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  waIcon:  { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  title:   { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle:{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular" },
  refreshBtn: {
    padding: 9, backgroundColor: `${GOLD}18`, borderRadius: 12, borderWidth: 1, borderColor: `${GOLD}30`,
  },

  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  statPill: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
    padding: 10, borderRadius: 14, borderWidth: 1,
  },
  statVal:   { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular" },

  convCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: CARD, borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  convAvatar:  { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  convName:    { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  convMsg:     { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  unreadBadge: {
    backgroundColor: WGREEN, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  unreadTxt: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  convTime:  { color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "Inter_400Regular" },

  empty:       { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyTxt:    { color: "rgba(255,255,255,0.25)", fontSize: 14, fontFamily: "Inter_400Regular" },
  emptySubTxt: { color: "rgba(255,255,255,0.15)", fontSize: 12, fontFamily: "Inter_400Regular" },
});
