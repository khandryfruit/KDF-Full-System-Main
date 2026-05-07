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

const NAV_EXTRA = Platform.OS === "android" ? 84 : 100;

function MetaChip({ icon, label, value, accent, bg }: {
  icon: string; label: string; value: string | number; accent: string; bg: string;
}) {
  return (
    <View style={[styles.metaChip, { backgroundColor: bg, borderColor: accent + "30" }]}>
      <View style={[styles.metaChipIcon, { backgroundColor: accent + "18" }]}>
        <Feather name={icon as any} size={14} color={accent} />
      </View>
      <Text style={[styles.metaChipValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metaChipLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, value, accent, bold }: {
  label: string; value: string; accent?: string; bold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && { fontFamily: "Inter_600SemiBold", color: "#0D1F3C" }]}>{label}</Text>
      <Text style={[styles.summaryValue, accent ? { color: accent } : {}, bold && { fontSize: 16, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
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
  const todayEarned    = Number(s.earnings_today ?? 0);
  const totalEarned    = Number(s.total_earnings ?? 0);
  const codPending     = Number(s.cod_pending ?? 0);
  const delivered      = Number(s.total_delivered ?? 0);
  const deliveredToday = Number(s.delivered_today ?? 0);
  const failed         = Number(s.failed ?? 0);
  const perOrder       = deliveredToday > 0 ? Math.round(todayEarned / deliveredToday) : 0;
  const successRate    = (delivered + failed) > 0
    ? Math.round((delivered / (delivered + failed)) * 100)
    : 0;

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Header */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 16 }]}
      >
        <Text style={styles.headerTitle}>Earnings</Text>
        <Text style={styles.headerSub}>Your financial summary</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + NAV_EXTRA }]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#00C562" colors={["#00C562"]} />
        }
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#00C562" size="large" />
            <Text style={styles.loadingTxt}>Loading earnings...</Text>
          </View>
        ) : (
          <>
            {/* Today Hero */}
            <LinearGradient colors={["#059669", "#047857", "#065F46"]} style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.heroLabel}>Today's Earnings</Text>
                  <Text style={styles.heroAmount}>Rs. {todayEarned.toLocaleString()}</Text>
                </View>
                <View style={styles.heroBigIcon}>
                  <Feather name="dollar-sign" size={44} color="rgba(255,255,255,0.15)" />
                </View>
              </View>
              <View style={styles.heroStats}>
                <View style={styles.heroStatItem}>
                  <Feather name="package" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.heroStatTxt}>{deliveredToday} delivered</Text>
                </View>
                {perOrder > 0 && (
                  <View style={styles.heroStatDivider} />
                )}
                {perOrder > 0 && (
                  <View style={styles.heroStatItem}>
                    <Feather name="trending-up" size={13} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.heroStatTxt}>Rs. {perOrder}/order</Text>
                  </View>
                )}
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStatItem}>
                  <Feather name="award" size={13} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.heroStatTxt}>{successRate}% success</Text>
                </View>
              </View>
            </LinearGradient>

            {/* COD Alert */}
            {codPending > 0 && (
              <View style={styles.codAlert}>
                <LinearGradient colors={["#FFFBEB", "#FEF3C7"]} style={StyleSheet.absoluteFill} borderRadius={18} />
                <View style={styles.codAlertIcon}>
                  <Feather name="alert-circle" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.codAlertTitle}>COD Collection Pending</Text>
                  <Text style={styles.codAlertAmount}>Rs. {codPending.toLocaleString()}</Text>
                  <Text style={styles.codAlertSub}>Admin کو فوری جمع کروائیں</Text>
                </View>
              </View>
            )}

            {/* Today chips */}
            <Text style={styles.sectionTitle}>Today's Performance</Text>
            <View style={styles.chipsGrid}>
              <MetaChip icon="package"      label="Assigned"  value={s.assigned_today ?? 0}  accent="#3B82F6" bg="#EFF6FF" />
              <MetaChip icon="check-circle" label="Delivered" value={deliveredToday}          accent="#10B981" bg="#ECFDF5" />
              <MetaChip icon="x-circle"     label="Failed"    value={failed}                  accent="#EF4444" bg="#FEF2F2" />
              <MetaChip icon="clock"        label="Pending"   value={s.pending ?? 0}          accent="#F59E0B" bg="#FFFBEB" />
            </View>

            {/* Financial Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryCardHeader}>
                <Feather name="bar-chart-2" size={16} color="#00C562" />
                <Text style={styles.summaryCardTitle}>Financial Summary</Text>
              </View>
              <SummaryRow label="Today's Earnings" value={`Rs. ${todayEarned.toLocaleString()}`} accent="#059669" bold />
              <View style={styles.divider} />
              <SummaryRow label="Total Earned (All Time)" value={`Rs. ${totalEarned.toLocaleString()}`} accent="#0D2137" bold />
              <View style={styles.divider} />
              <SummaryRow
                label="COD Pending"
                value={`Rs. ${codPending.toLocaleString()}`}
                accent={codPending > 0 ? "#D97706" : "#6B7A99"}
              />
            </View>

            {/* Delivery Stats */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryCardHeader}>
                <Feather name="truck" size={16} color="#3B82F6" />
                <Text style={styles.summaryCardTitle}>Delivery Record</Text>
              </View>
              <SummaryRow label="Total Delivered" value={String(delivered)} accent="#10B981" bold />
              <View style={styles.divider} />
              <SummaryRow label="Today Delivered" value={String(deliveredToday)} accent="#059669" />
              <View style={styles.divider} />
              <SummaryRow label="Failed" value={String(failed)} accent={failed > 0 ? "#EF4444" : "#6B7A99"} />
              <View style={styles.divider} />
              <SummaryRow label="Success Rate" value={`${successRate}%`} accent={successRate >= 90 ? "#10B981" : successRate >= 70 ? "#F59E0B" : "#EF4444"} bold />
            </View>

            {/* Tips */}
            <View style={styles.tipsCard}>
              <LinearGradient colors={["#ECFDF5", "#F0FFF4"]} style={StyleSheet.absoluteFill} borderRadius={18} />
              <View style={[styles.tipsIcon, { backgroundColor: "#D1FAE5" }]}>
                <Feather name="zap" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={styles.tipTitle}>Tips to earn more</Text>
                <Text style={styles.tipRow}>💰 COD فوری admin کو دیں</Text>
                <Text style={styles.tipRow}>📦 ہر delivery کے بعد status update کریں</Text>
                <Text style={styles.tipRow}>⭐ زیادہ deliveries = زیادہ earnings!</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F4F9" },

  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },

  scroll: { padding: 16, gap: 14 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular" },

  heroCard: {
    borderRadius: 24, padding: 22,
    shadowColor: "#059669", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 },
  heroAmount: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold" },
  heroBigIcon: { opacity: 0.5, marginTop: 4 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 4 },
  heroStatItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroStatTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_500Medium" },
  heroStatDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 },

  codAlert: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 18, padding: 16, overflow: "hidden",
    borderWidth: 1.5, borderColor: "#FCD34D",
  },
  codAlertIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  codAlertTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5 },
  codAlertAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#D97706", marginTop: 2 },
  codAlertSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 3 },

  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaChip: {
    width: "47%", flexGrow: 1,
    borderRadius: 16, padding: 14, gap: 6,
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  metaChipIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metaChipValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  metaChipLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#6B7A99", textTransform: "uppercase", letterSpacing: 0.3 },

  summaryCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  summaryCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  summaryCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99" },
  summaryValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#6B7A99" },
  divider: { height: 1, backgroundColor: "#F1F4F9" },

  tipsCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 18, padding: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  tipsIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tipTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#065F46", marginBottom: 4 },
  tipRow: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#047857", lineHeight: 20 },
});
