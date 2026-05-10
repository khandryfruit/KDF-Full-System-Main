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

const NAV_EXTRA = Platform.OS === "android" ? 96 : 108;

function PerformanceChip({
  icon, label, value, accent, bg,
}: { icon: string; label: string; value: string | number; accent: string; bg: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: accent + "28" }]}>
      <View style={[styles.chipIcon, { backgroundColor: accent + "18" }]}>
        <Feather name={icon as any} size={14} color={accent} />
      </View>
      <Text style={[styles.chipValue, { color: accent }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

function RowItem({
  label, value, accent, bold, last,
}: { label: string; value: string; accent?: string; bold?: boolean; last?: boolean }) {
  return (
    <>
      <View style={styles.rowItem}>
        <Text style={[styles.rowLabel, bold && styles.rowLabelBold]}>{label}</Text>
        <Text style={[
          styles.rowValue,
          accent ? { color: accent } : {},
          bold ? styles.rowValueBold : {},
        ]}>
          {value}
        </Text>
      </View>
      {!last && <View style={styles.rowDivider} />}
    </>
  );
}

export default function EarningsScreen() {
  const { token } = useAuth();
  const insets    = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-stats"],
    queryFn: async () => { const r = await riderFetch("/rider/stats", token); return r.json(); },
    refetchInterval: 30_000,
  });

  const s              = data?.stats ?? {};
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

      {/* ── HEADER ── */}
      <LinearGradient
        colors={["#060E1C", "#0A1A35"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 18 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Earnings</Text>
            <Text style={styles.headerSub}>Your financial summary</Text>
          </View>
          <View style={styles.headerBadge}>
            <Feather name="trending-up" size={16} color="#00C562" />
            <Text style={styles.headerBadgeTxt}>Live</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + NAV_EXTRA }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor="#00C562"
            colors={["#00C562"]}
          />
        }
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#00C562" size="large" />
            <Text style={styles.loadingTxt}>Loading earnings...</Text>
          </View>
        ) : (
          <>
            {/* ── TODAY HERO ── */}
            <LinearGradient colors={["#047857", "#059669", "#10B981"]} locations={[0, 0.5, 1]} style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroLeft}>
                  <Text style={styles.heroLbl}>Today's Earnings</Text>
                  <Text style={styles.heroAmount}>Rs. {todayEarned.toLocaleString()}</Text>
                  <View style={styles.heroMeta}>
                    <View style={styles.heroMetaItem}>
                      <Feather name="package" size={11} color="rgba(255,255,255,0.7)" />
                      <Text style={styles.heroMetaTxt}>{deliveredToday} delivered</Text>
                    </View>
                    {perOrder > 0 && (
                      <>
                        <View style={styles.heroMetaDivider} />
                        <View style={styles.heroMetaItem}>
                          <Feather name="trending-up" size={11} color="rgba(255,255,255,0.7)" />
                          <Text style={styles.heroMetaTxt}>Rs. {perOrder}/order</Text>
                        </View>
                      </>
                    )}
                    <View style={styles.heroMetaDivider} />
                    <View style={styles.heroMetaItem}>
                      <Feather name="award" size={11} color="#FDE68A" />
                      <Text style={[styles.heroMetaTxt, { color: "#FDE68A" }]}>{successRate}% success</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroRing}>
                  <Text style={styles.heroRingPct}>{successRate}%</Text>
                  <Text style={styles.heroRingLbl}>Rate</Text>
                </View>
              </View>

              {/* All-time strip */}
              <View style={styles.heroStrip}>
                <View style={styles.heroStripItem}>
                  <Text style={styles.heroStripVal}>Rs. {totalEarned.toLocaleString()}</Text>
                  <Text style={styles.heroStripLbl}>All Time</Text>
                </View>
                <View style={styles.heroStripDivider} />
                <View style={styles.heroStripItem}>
                  <Text style={styles.heroStripVal}>{delivered}</Text>
                  <Text style={styles.heroStripLbl}>Total Delivered</Text>
                </View>
                <View style={styles.heroStripDivider} />
                <View style={styles.heroStripItem}>
                  <Text style={[styles.heroStripVal, codPending > 0 && { color: "#FDE68A" }]}>
                    Rs. {codPending.toLocaleString()}
                  </Text>
                  <Text style={styles.heroStripLbl}>COD Due</Text>
                </View>
              </View>
            </LinearGradient>

            {/* ── COD ALERT ── */}
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

            {/* ── TODAY CHIPS ── */}
            <Text style={styles.sectionTitle}>Today's Performance</Text>
            <View style={styles.chipsGrid}>
              <PerformanceChip icon="package"      label="Assigned"  value={s.assigned_today ?? 0} accent="#3B82F6" bg="#EFF6FF" />
              <PerformanceChip icon="check-circle" label="Delivered" value={deliveredToday}         accent="#10B981" bg="#ECFDF5" />
              <PerformanceChip icon="x-circle"     label="Failed"    value={failed}                 accent="#EF4444" bg="#FEF2F2" />
              <PerformanceChip icon="clock"        label="Pending"   value={s.pending ?? 0}         accent="#F59E0B" bg="#FFFBEB" />
            </View>

            {/* ── FINANCIAL SUMMARY ── */}
            <View style={styles.summaryCard}>
              <View style={styles.cardHead}>
                <View style={[styles.cardHeadIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Feather name="bar-chart-2" size={15} color="#059669" />
                </View>
                <Text style={styles.cardHeadTitle}>Financial Summary</Text>
              </View>
              <RowItem label="Today's Earnings"    value={`Rs. ${todayEarned.toLocaleString()}`}  accent="#059669" bold />
              <RowItem label="Total Earned (All)"  value={`Rs. ${totalEarned.toLocaleString()}`}  accent="#0D2137" bold />
              <RowItem label="COD Pending"
                value={`Rs. ${codPending.toLocaleString()}`}
                accent={codPending > 0 ? "#D97706" : "#6B7A99"}
                last
              />
            </View>

            {/* ── DELIVERY RECORD ── */}
            <View style={styles.summaryCard}>
              <View style={styles.cardHead}>
                <View style={[styles.cardHeadIcon, { backgroundColor: "#EFF6FF" }]}>
                  <Feather name="truck" size={15} color="#3B82F6" />
                </View>
                <Text style={styles.cardHeadTitle}>Delivery Record</Text>
              </View>
              <RowItem label="Total Delivered"   value={String(delivered)}      accent="#10B981" bold />
              <RowItem label="Today Delivered"   value={String(deliveredToday)} accent="#059669" />
              <RowItem label="Failed"            value={String(failed)}         accent={failed > 0 ? "#EF4444" : "#6B7A99"} />
              <RowItem label="Success Rate"
                value={`${successRate}%`}
                accent={successRate >= 90 ? "#10B981" : successRate >= 70 ? "#F59E0B" : "#EF4444"}
                bold
                last
              />
            </View>

            {/* ── TIPS ── */}
            <View style={styles.tipsCard}>
              <LinearGradient colors={["#ECFDF5", "#D1FAE5"]} style={StyleSheet.absoluteFill} borderRadius={20} />
              <View style={[styles.tipsIconWrap, { backgroundColor: "#A7F3D0" }]}>
                <Feather name="zap" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.tipsTitle}>Tips to earn more</Text>
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
  root: { flex: 1, backgroundColor: "#F0F3F8" },

  /* Header */
  header: { paddingHorizontal: 20, paddingBottom: 22 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3 },
  headerBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,197,98,0.15)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(0,197,98,0.25)",
  },
  headerBadgeTxt: { color: "#00C562", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  scroll: { padding: 14, gap: 14 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  loadingTxt: { color: "#6B7A99", fontFamily: "Inter_400Regular" },

  /* Hero */
  heroCard: {
    borderRadius: 24, padding: 22, gap: 20,
    shadowColor: "#059669", shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32, shadowRadius: 20, elevation: 12,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroLeft: { flex: 1 },
  heroLbl: {
    color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_500Medium",
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
  },
  heroAmount: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", marginBottom: 12 },
  heroMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 0 },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroMetaTxt: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_500Medium" },
  heroMetaDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: 10 },
  heroRing: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroRingPct: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  heroRingLbl: { color: "rgba(255,255,255,0.55)", fontSize: 8, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },

  heroStrip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6,
  },
  heroStripItem: { flex: 1, alignItems: "center", gap: 3 },
  heroStripVal: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  heroStripLbl: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.4 },
  heroStripDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.15)" },

  /* COD Alert */
  codAlert: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 18, padding: 16, overflow: "hidden",
    borderWidth: 1.5, borderColor: "#FCD34D",
  },
  codAlertIcon: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center",
  },
  codAlertTitle: {
    fontSize: 11, fontFamily: "Inter_700Bold", color: "#92400E",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  codAlertAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#D97706", marginTop: 3 },
  codAlertSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#B45309", marginTop: 3 },

  /* Section */
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  /* Chips */
  chipsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    width: "47%", flexGrow: 1,
    borderRadius: 18, padding: 14, gap: 6, borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  chipIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chipValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  chipLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#6B7A99", textTransform: "uppercase", letterSpacing: 0.3 },

  /* Summary card */
  summaryCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  cardHeadIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardHeadTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#0D1F3C" },

  rowItem: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 13,
  },
  rowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7A99" },
  rowLabelBold: { fontFamily: "Inter_600SemiBold", color: "#0D1F3C" },
  rowValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#6B7A99" },
  rowValueBold: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rowDivider: { height: 1, backgroundColor: "#F0F3F8" },

  /* Tips */
  tipsCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    borderRadius: 20, padding: 18, overflow: "hidden",
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  tipsIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tipsTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#065F46", marginBottom: 2 },
  tipRow: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#047857", lineHeight: 20 },
});
