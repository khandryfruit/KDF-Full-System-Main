import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BASE_URL, riderFetch, useAuth } from "@/context/AuthContext";
import colors, { getStatusColor, getStatusBg, getStatusLabel } from "@/constants/colors";
import { PriorityBanner } from "@/components/PriorityTimer";

const C = colors.light;
const BASE = BASE_URL;

const WORKFLOW: Array<{ status: string; label: string; icon: string; color: string }> = [
  { status: "picked",           label: "Picked Up",  icon: "archive",      color: C.statusPicked    },
  { status: "out_for_delivery", label: "On Route",   icon: "truck",        color: C.statusOnRoute   },
  { status: "delivered",        label: "Delivered",  icon: "check-circle", color: C.statusDelivered },
  { status: "failed",           label: "Failed",     icon: "x-circle",     color: C.statusFailed    },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const qc        = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery", id],
    queryFn: async () => {
      const r = await riderFetch(`/rider/deliveries/${id}`, token);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const statusMut = useMutation({
    mutationFn: async (status: string) => {
      const r = await riderFetch(`/rider/deliveries/${id}/status`, token, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["delivery", id] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries-all"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
    },
    onError: (e: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e.message);
    },
  });

  const delivery = data?.delivery;

  const addr = (() => {
    if (!delivery) return "";
    try {
      const a = typeof delivery.shipping_address === "string"
        ? JSON.parse(delivery.shipping_address)
        : delivery.shipping_address;
      return [a?.address1, a?.address2, a?.city, a?.province].filter(Boolean).join(", ");
    } catch { return delivery.delivery_address ?? ""; }
  })();

  const items: any[] = (() => {
    if (!delivery) return [];
    const src = delivery.order_items || delivery.line_items;
    try {
      const arr = typeof src === "string" ? JSON.parse(src) : src;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  })();

  const openMaps = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(Platform.OS === "ios" ? `maps:?q=${q}` : `geo:0,0?q=${q}`)
      .catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
  };

  const openGoogleMaps = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(`https://maps.google.com/?q=${q}`);
  };

  const navigate = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`);
  };

  const callCustomer = () => Linking.openURL(`tel:${delivery?.customer_phone}`);

  const waCustomer = () => {
    const ph = String(delivery?.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(
      `السلام علیکم! میں آپ کا KDF NUTS آرڈر #${delivery?.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  const openInvoice = async () => {
    const url = `${BASE}/api/rider/deliveries/${id}/invoice?token=${token}`;
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
  };

  const shareInvoice = async () => {
    const itemsStr = items.slice(0, 5).map((i: any) =>
      `  • ${i.quantity ?? 1}× ${i.title ?? i.name ?? "Item"}${i.variant_title ? ` (${i.variant_title})` : ""}`
    ).join("\n");
    const msg = `*KDF NUTS — Order Invoice*\n\nOrder: #${delivery?.shopify_order_number}\nCustomer: ${delivery?.customer_name}\nPhone: ${delivery?.customer_phone}\nAddress: ${addr}\n\n*Items:*\n${itemsStr}\n\n*Payment:* ${delivery?.is_paid ? "PAID" : `COD Rs. ${Number(delivery?.cod_amount ?? 0).toLocaleString()}`}`;
    Share.share({ message: msg, title: `KDF Invoice #${delivery?.shopify_order_number}` });
  };

  const waInvoice = () => {
    const ph = String(delivery?.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(
      `*KDF NUTS — Order #${delivery?.shopify_order_number}*\n\nDear ${delivery?.customer_name},\nYour invoice: ${BASE}/api/rider/deliveries/${id}/invoice?token=${token}`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  const confirmStatus = (status: string) => {
    const action = WORKFLOW.find(w => w.status === status);
    Alert.alert(
      "Update Status",
      `Mark as "${action?.label}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            statusMut.mutate(status);
          },
        },
      ]
    );
  };

  const toggleItem = (idx: number) => {
    Haptics.selectionAsync();
    setCheckedItems(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  if (isLoading) {
    return (
      <LinearGradient colors={["#0D2137", "#0F2A47"]} style={[styles.fullCenter, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#00B85A" size="large" />
        <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", marginTop: 12 }}>Loading order...</Text>
      </LinearGradient>
    );
  }

  if (error || !delivery) {
    return (
      <LinearGradient colors={["#0D2137", "#0F2A47"]} style={[styles.fullCenter, { paddingTop: insets.top }]}>
        <Feather name="alert-triangle" size={40} color="#EF4444" />
        <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 12 }}>Order not found</Text>
        <TouchableOpacity style={styles.backFallback} onPress={() => router.back()}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const sc         = getStatusColor(delivery.status);
  const cod        = Number(delivery.cod_amount ?? 0);
  const dc         = Number(delivery.delivery_charge ?? 0);
  const isTerminal = ["delivered", "returned"].includes(delivery.status);
  const isActive   = !["delivered", "failed", "returned"].includes(delivery.status);
  const allChecked = items.length > 0 && checkedItems.size === items.length;

  return (
    <View style={[styles.root, { paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Premium Header */}
      <LinearGradient colors={["#0D2137", "#0F2A47"]} style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 10 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerOrderNum}>Order #{delivery.shopify_order_number ?? delivery.id}</Text>
            <Text style={styles.headerCust} numberOfLines={1}>{delivery.customer_name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc }]}>
            <Text style={styles.statusBadgeTxt}>{getStatusLabel(delivery.status)}</Text>
          </View>
        </View>

        {/* Quick action strip */}
        <View style={styles.quickStrip}>
          <TouchableOpacity style={styles.quickStripBtn} onPress={callCustomer}>
            <View style={[styles.quickStripIcon, { backgroundColor: "#1565C0" }]}>
              <Feather name="phone-call" size={16} color="#fff" />
            </View>
            <Text style={styles.quickStripTxt}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickStripBtn} onPress={waCustomer}>
            <View style={[styles.quickStripIcon, { backgroundColor: "#075E54" }]}>
              <Feather name="message-circle" size={16} color="#fff" />
            </View>
            <Text style={styles.quickStripTxt}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickStripBtn} onPress={navigate}>
            <View style={[styles.quickStripIcon, { backgroundColor: "#00B85A" }]}>
              <Feather name="navigation" size={16} color="#fff" />
            </View>
            <Text style={styles.quickStripTxt}>Navigate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickStripBtn} onPress={openGoogleMaps}>
            <View style={[styles.quickStripIcon, { backgroundColor: "#1A73E8" }]}>
              <Feather name="map" size={16} color="#fff" />
            </View>
            <Text style={styles.quickStripTxt}>Maps</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Priority Banner */}
        {isActive && <PriorityBanner assignedAt={delivery.assigned_at} />}

        {/* Payment Hero Card */}
        <View style={[styles.payCard, {
          borderColor: delivery.is_paid ? C.statusDelivered : C.cod,
          backgroundColor: delivery.is_paid ? "#F0FDF4" : "#FFFBEB",
        }]}>
          <View style={[styles.payIcon, { backgroundColor: delivery.is_paid ? C.statusDeliveredBg : C.codBg }]}>
            <Feather name={delivery.is_paid ? "check-circle" : "dollar-sign"} size={28} color={delivery.is_paid ? C.statusDelivered : C.cod} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.payLabel, { color: delivery.is_paid ? C.statusDelivered : C.cod }]}>
              {delivery.is_paid ? "PAID ORDER" : "CASH ON DELIVERY"}
            </Text>
            <Text style={[styles.payAmount, { color: delivery.is_paid ? C.statusDelivered : C.cod }]}>
              Rs. {cod.toLocaleString()}
            </Text>
            {dc > 0 && (
              <Text style={styles.payDelivery}>+ Delivery: Rs. {dc.toLocaleString()}</Text>
            )}
          </View>
        </View>

        {/* Address */}
        <Section title="Delivery Address">
          <Text style={styles.addrTxt}>{addr || "—"}</Text>
          {!!addr && (
            <View style={styles.mapBtnRow}>
              <TouchableOpacity style={[styles.mapBtn, { flex: 1 }]} onPress={navigate}>
                <Feather name="navigation" size={14} color="#fff" />
                <Text style={styles.mapBtnTxt}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mapBtnOutline, { flex: 1 }]} onPress={openGoogleMaps}>
                <Feather name="map" size={14} color={C.primary} />
                <Text style={[styles.mapBtnTxt, { color: C.primary }]}>Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        {/* Products Checklist */}
        {items.length > 0 && (
          <Section title={`Products (${items.length} item${items.length !== 1 ? "s" : ""})`}>
            <View style={styles.packHint}>
              <Feather name="info" size={11} color={C.mutedForeground} />
              <Text style={styles.packHintTxt}>Pack کریں اور tick کریں</Text>
            </View>
            {allChecked && (
              <View style={styles.allPackedBanner}>
                <Feather name="check-circle" size={14} color={C.statusDelivered} />
                <Text style={styles.allPackedTxt}>تمام items pack — روانہ ہونے کے لیے تیار!</Text>
              </View>
            )}
            {items.map((item: any, idx: number) => {
              const checked = checkedItems.has(idx);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.productRow, checked && styles.productRowDone]}
                  onPress={() => toggleItem(idx)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, { borderColor: checked ? C.statusDelivered : C.border, backgroundColor: checked ? C.statusDeliveredBg : "#fff" }]}>
                    {checked && <Feather name="check" size={12} color={C.statusDelivered} />}
                  </View>
                  <View style={[styles.qtyBadge, { backgroundColor: C.primaryLight }]}>
                    <Text style={[styles.qtyTxt, { color: C.primaryDark }]}>{item.quantity ?? 1}×</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, checked && { color: C.mutedForeground, textDecorationLine: "line-through" }]} numberOfLines={2}>
                      {item.title ?? item.name ?? "Item"}
                    </Text>
                    {!!(item.variant_title ?? item.sku) && (
                      <Text style={styles.productVariant}>{item.variant_title ?? item.sku}</Text>
                    )}
                  </View>
                  {!!item.price && (
                    <Text style={styles.productPrice}>Rs. {Number(item.price).toLocaleString()}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </Section>
        )}

        {/* Notes */}
        {(!!delivery.notes || !!delivery.order_notes) && (
          <Section title="Order Notes">
            <View style={styles.notesBox}>
              <Feather name="file-text" size={14} color={C.mutedForeground} />
              <Text style={styles.notesTxt}>{delivery.notes || delivery.order_notes}</Text>
            </View>
          </Section>
        )}

        {/* Invoice Actions */}
        <Section title="Invoice & Sharing">
          <View style={styles.invoiceGrid}>
            <TouchableOpacity style={styles.invBtn} onPress={openInvoice}>
              <Feather name="file-text" size={18} color={C.primaryDark} />
              <Text style={[styles.invBtnTxt, { color: C.primaryDark }]}>View Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invBtn, { backgroundColor: "#E8F5E9" }]} onPress={waInvoice}>
              <Feather name="message-circle" size={18} color={C.whatsappDark} />
              <Text style={[styles.invBtnTxt, { color: C.whatsappDark }]}>WA Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invBtn, { backgroundColor: "#E3F2FD" }]} onPress={shareInvoice}>
              <Feather name="share-2" size={18} color="#1565C0" />
              <Text style={[styles.invBtnTxt, { color: "#1565C0" }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* Status Workflow */}
        {!isTerminal ? (
          <Section title="Update Delivery Status">
            <View style={styles.workflowGrid}>
              {WORKFLOW.map(w => {
                const isCurrent = delivery.status === w.status;
                const statusOrder = ["assigned", "picked", "out_for_delivery", "delivered", "failed"];
                const isPast = statusOrder.indexOf(w.status) < statusOrder.indexOf(delivery.status);
                return (
                  <TouchableOpacity
                    key={w.status}
                    style={[
                      styles.wfBtn,
                      { borderColor: w.color },
                      isCurrent && { backgroundColor: w.color },
                      isPast && styles.wfBtnDone,
                    ]}
                    onPress={() => !isPast && confirmStatus(w.status)}
                    disabled={statusMut.isPending || isPast}
                    activeOpacity={0.78}
                  >
                    {statusMut.isPending && isCurrent
                      ? <ActivityIndicator size="small" color={isCurrent ? "#fff" : w.color} />
                      : <Feather name={w.icon as any} size={20} color={isCurrent ? "#fff" : isPast ? w.color : w.color} />
                    }
                    <Text style={[styles.wfTxt, { color: isCurrent ? "#fff" : w.color }]}>{w.label}</Text>
                    {isPast && <Feather name="check" size={12} color={w.color} style={styles.wfCheck} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>
        ) : (
          <View style={[styles.terminalBanner, { backgroundColor: getStatusBg(delivery.status), borderColor: sc + "40" }]}>
            <Feather name="check-circle" size={18} color={sc} />
            <Text style={[styles.terminalTxt, { color: sc }]}>
              Order {getStatusLabel(delivery.status).toLowerCase()} — no further action needed.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.background },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backFallback: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 12 },

  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, gap: 12,
  },
  backBtn:       { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerOrderNum: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  headerCust:    { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 2 },
  statusBadge:   { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10 },
  statusBadgeTxt: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  quickStrip: { flexDirection: "row", paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2 },
  quickStripBtn: { flex: 1, alignItems: "center", gap: 5 },
  quickStripIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickStripTxt: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  scroll: { padding: 14, gap: 12 },

  payCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 18, borderRadius: 18, borderWidth: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  payIcon:    { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  payLabel:   { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  payAmount:  { fontSize: 30, fontFamily: "Inter_700Bold", marginTop: 3 },
  payDelivery: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 3 },

  section: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },

  addrTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, lineHeight: 22, marginBottom: 12 },
  mapBtnRow: { flexDirection: "row", gap: 10 },
  mapBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.primary, paddingVertical: 10, borderRadius: 12 },
  mapBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.primaryLight, paddingVertical: 10, borderRadius: 12 },
  mapBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },

  packHint:      { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 },
  packHintTxt:   { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, fontStyle: "italic" },
  allPackedBanner: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.statusDeliveredBg, borderRadius: 10, padding: 10, marginBottom: 10 },
  allPackedTxt:  { color: C.statusDelivered, fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },

  productRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  productRowDone: { opacity: 0.65 },
  checkbox:      { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  qtyBadge:      { minWidth: 32, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  qtyTxt:        { fontSize: 12, fontFamily: "Inter_700Bold" },
  productName:   { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.text, lineHeight: 18 },
  productVariant: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 1 },
  productPrice:  { fontSize: 13, fontFamily: "Inter_700Bold", color: C.text },

  notesBox: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  notesTxt: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, lineHeight: 21 },

  invoiceGrid: { flexDirection: "row", gap: 8 },
  invBtn:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: C.primaryLight },
  invBtnTxt:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  workflowGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  wfBtn: {
    flex: 1, minWidth: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 2, backgroundColor: "#fff",
    position: "relative",
  },
  wfBtnDone: { opacity: 0.5, borderStyle: "dashed" },
  wfTxt:     { fontSize: 13, fontFamily: "Inter_700Bold" },
  wfCheck:   { position: "absolute", top: 7, right: 10 },

  terminalBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 16, borderWidth: 1 },
  terminalTxt:    { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
