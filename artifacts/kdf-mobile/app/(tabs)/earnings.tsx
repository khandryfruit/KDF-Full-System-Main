import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { riderFetch, useAuth } from "@/context/AuthContext";
import colors from "@/constants/colors";

const C = colors.light;

function EarningRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <View style={styles.earningRow}>
      <Text style={[styles.earningLabel, bold && { fontFamily: "Inter_700Bold", color: C.text }]}>{label}</Text>
      <Text style={[styles.earningValue, color ? { color } : {}, bold && { fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

export default function EarningsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 30_000,
  });

  const s = data?.stats ?? {};
  const todayEarned = Number(s.earnings_today ?? 0);
  const totalEarned = Number(s.total_earnings ?? 0);
  const codPending  = Number(s.cod_pending ?? 0);
  const delivered   = Number(s.total_delivered ?? 0);
  const deliveredToday = Number(s.delivered_today ?? 0);
  const perOrder    = deliveredToday > 0 ? Math.round(todayEarned / deliveredToday) : 0;

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Header */}
      <LinearGradient colors={["#0D2137", "#162540"]} style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 12 }]}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSub}>Your payment summary</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.primary} colors={[C.primary]} />}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={C.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Today's earning hero */}
            <LinearGradient colors={["#00B85A", "#007A3D"]} style={styles.todayCard}>
              <View style={styles.todayInner}>
                <Text style={styles.todayLabel}>Today's Earnings</Text>
                <Text style={styles.todayAmount}>Rs. {todayEarned.toLocaleString()}</Text>
                <View style={styles.todayMeta}>
                  <View style={styles.todayMetaItem}>
                    <Feather name="package" size={13} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.todayMetaTxt}>{deliveredToday} delivered</Text>
                  </View>
                  {perOrder > 0 && (
                    <View style={styles.todayMetaItem}>
                      <Feather name="trending-up" size={13} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.todayMetaTxt}>Rs. {perOrder}/order</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.todayIcon}>
                <Feather name="dollar-sign" size={40} color="rgba(255,255,255,0.2)" />
              </View>
            </LinearGradient>

            {/* COD Alert */}
            {codPending > 0 && (
              <View style={styles.codAlert}>
                <View style={styles.codAlertIcon}>
                  <Feather name="alert-circle" size={20} color="#FF6F00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codAlertTitle}>COD Collection Pending</Text>
                  <Text style={styles.codAlertAmount}>Rs. {codPending.toLocaleString()}</Text>
                  <Text style={styles.codAlertSub}>Collect from customers and submit to admin</Text>
                </View>
              </View>
            )}

            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Financial Summary</Text>
              <EarningRow label="Today's Earnings" value={`Rs. ${todayEarned.toLocaleString()}`} color={C.primary} bold />
              <View style={styles.divider} />
              <EarningRow label="Total Earned (All Time)" value={`Rs. ${totalEarned.toLocaleString()}`} color={C.primaryDark} bold />
              <View style={styles.divider} />
              <EarningRow label="COD Pending Collection" value={`Rs. ${codPending.toLocaleString()}`} color={codPending > 0 ? "#FF6F00" : C.statusDelivered} />
            </View>

            {/* Delivery Stats */}
            <View style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Delivery Performance</Text>
              <EarningRow label="Today Assigned" value={String(s.assigned_today ?? 0)} />
              <View style={styles.divider} />
              <EarningRow label="Today Delivered" value={String(deliveredToday)} color={C.statusDelivered} />
              <View style={styles.divider} />
              <EarningRow label="Today Failed" value={String(s.failed ?? 0)} color={s.failed > 0 ? C.statusFailed : C.mutedForeground} />
              <View style={styles.divider} />
              <EarningRow label="Total Delivered (All Time)" value={String(delivered)} color={C.primary} bold />
            </View>

            {/* Tips */}
            <View style={styles.tipsCard}>
              <Feather name="info" size={16} color={C.primary} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.tipTitle}>Payment Tips</Text>
                <Text style={styles.tipTxt}>• COD جمع کریں اور فوری admin کو دیں</Text>
                <Text style={styles.tipTxt}>• ہر ڈیلیوری کے بعد status update کریں</Text>
                <Text style={styles.tipTxt}>• زیادہ deliveries = زیادہ earnings!</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub:   { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  scroll: { padding: 16, gap: 14 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  todayCard: {
    borderRadius: 20, padding: 22, flexDirection: "row", alignItems: "center",
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  todayInner: { flex: 1 },
  todayLabel:  { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  todayAmount: { color: "#fff", fontSize: 34, fontFamily: "Inter_700Bold", marginBottom: 10 },
  todayMeta:   { flexDirection: "row", gap: 16 },
  todayMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  todayMetaTxt:  { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_500Medium" },
  todayIcon:   { opacity: 0.6 },

  codAlert: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#FFF8E1", borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: "#FFE0B2",
  },
  codAlertIcon:   { width: 38, height: 38, borderRadius: 10, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  codAlertTitle:  { fontSize: 13, fontFamily: "Inter_700Bold", color: "#E65100" },
  codAlertAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FF6F00", marginTop: 2 },
  codAlertSub:    { fontSize: 11, fontFamily: "Inter_400Regular", color: "#BF360C", marginTop: 3 },

  summaryCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 },

  earningRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11 },
  earningLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.text },
  earningValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.mutedForeground },
  divider: { height: 1, backgroundColor: C.border },

  tipsCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: C.primaryLight, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "rgba(0,184,90,0.2)",
  },
  tipTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: C.primaryDark, marginBottom: 4 },
  tipTxt:   { fontSize: 12, fontFamily: "Inter_400Regular", color: C.primaryDark },
});
