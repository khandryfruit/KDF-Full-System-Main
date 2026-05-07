import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
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

const C    = colors.light;
const BASE = BASE_URL;

const WORKFLOW: Array<{ status: string; label: string; icon: string; color: string }> = [
  { status: "picked",           label: "Picked Up",  icon: "archive",      color: C.statusPicked },
  { status: "out_for_delivery", label: "On Route",   icon: "truck",        color: C.statusOnRoute },
  { status: "delivered",        label: "Delivered",  icon: "check-circle", color: C.statusDelivered },
  { status: "failed",           label: "Failed",     icon: "x-circle",     color: C.statusFailed },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionCardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
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
      return [a?.address1, a?.address2, a?.city, a?.province, a?.country].filter(Boolean).join(", ");
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

  const openMaps    = () => {
    const q = encodeURIComponent(addr);
    Linking.openURL(Platform.OS === "ios" ? `maps:?q=${q}` : `geo:0,0?q=${q}`)
      .catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
  };
  const callCustomer = () => { Linking.openURL(`tel:${delivery?.customer_phone}`); };
  const waCustomer   = () => {
    const ph  = String(delivery?.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg  = encodeURIComponent(
      `السلام علیکم! میں آپ کا KDF NUTS آرڈر #${delivery?.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  const openInvoice = async () => {
    const url = `${BASE}/api/rider/deliveries/${id}/invoice?token=${token}`;
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
  };

  const shareInvoice = async () => {
    const items_str = items.slice(0, 5).map((i: any) =>
      `  • ${i.quantity ?? 1}× ${i.title ?? i.name ?? "Item"}${i.variant_title ? ` (${i.variant_title})` : ""}`
    ).join("\n");
    const msg = `*KDF NUTS — Order Invoice*\n\nOrder: #${delivery?.shopify_order_number}\nCustomer: ${delivery?.customer_name}\nPhone: ${delivery?.customer_phone}\nAddress: ${addr}\n\n*Items:*\n${items_str}\n\n*Payment:* ${delivery?.is_paid ? "PAID" : `COD Rs. ${Number(delivery?.cod_amount ?? 0).toLocaleString()}`}\n\nView invoice: ${BASE}/api/rider/deliveries/${id}/invoice?token=${token}`;
    Share.share({ message: msg, title: `KDF Invoice #${delivery?.shopify_order_number}` });
  };

  const waInvoice = () => {
    const ph  = String(delivery?.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg  = encodeURIComponent(
      `*KDF NUTS — Order #${delivery?.shopify_order_number}*\n\nDear ${delivery?.customer_name},\nYour invoice: ${BASE}/api/rider/deliveries/${id}/invoice?token=${token}`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  const confirmStatus = (status: string) => {
    const action = WORKFLOW.find(w => w.status === status);
    Alert.alert(
      "Update Status",
      `Mark this order as "${action?.label}"?`,
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
    setCheckedItems(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.primary} size="large" />
        <Text style={{ color: C.mutedForeground, fontFamily: "Inter_400Regular" }}>Loading order...</Text>
      </View>
    );
  }

  if (error || !delivery) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Feather name="alert-triangle" size={36} color={C.statusFailed} />
        <Text style={{ color: C.text, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Order not found</Text>
        <TouchableOpacity style={styles.backFallback} onPress={() => router.back()}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sc         = getStatusColor(delivery.status);
  const cod        = Number(delivery.cod_amount ?? 0);
  const dc         = Number(delivery.delivery_charge ?? 0);
  const isTerminal = ["delivered", "returned"].includes(delivery.status);
  const isActive   = !["delivered", "failed", "returned"].includes(delivery.status);
  const allChecked = items.length > 0 && checkedItems.size === items.length;

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === "web" ? 67 : 0, paddingBottom: Platform.OS === "web" ? 34 : 0 }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerOrderNum}>#{delivery.shopify_order_number ?? delivery.id}</Text>
          <Text style={styles.headerCust} numberOfLines={1}>{delivery.customer_name}</Text>
        </View>
        <View style={[styles.headerStatus, { backgroundColor: sc }]}>
          <Text style={styles.headerStatusTxt}>{getStatusLabel(delivery.status)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Priority + Countdown Banner (active orders only) ── */}
        {isActive && <PriorityBanner assignedAt={delivery.assigned_at} />}

        {/* Payment Card */}
        <View style={[styles.paymentCard, { borderColor: delivery.is_paid ? C.statusDelivered : C.cod }]}>
          <View style={[styles.paymentIcon, { backgroundColor: delivery.is_paid ? C.statusDeliveredBg : C.codBg }]}>
            <Feather name={delivery.is_paid ? "check-circle" : "dollar-sign"} size={26} color={delivery.is_paid ? C.statusDelivered : C.cod} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentLabel}>{delivery.is_paid ? "PAID ORDER" : "CASH ON DELIVERY"}</Text>
            <Text style={[styles.paymentAmount, { color: delivery.is_paid ? C.statusDelivered : C.cod }]}>
              Rs. {cod.toLocaleString()}
            </Text>
            {dc > 0 && (
              <Text style={styles.paymentDelivery}>Delivery charge: Rs. {dc.toLocaleString()}</Text>
            )}
          </View>
        </View>

        {/* Customer */}
        <SectionCard title="Customer">
          <Text style={styles.custBigName}>{delivery.customer_name}</Text>
          {!!delivery.customer_phone && (
            <Text style={styles.custPhone}>{delivery.customer_phone}</Text>
          )}
          <View style={styles.actionBtns}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#E3F2FD" }]} onPress={callCustomer}>
              <Feather name="phone-call" size={17} color="#1565C0" />
              <Text style={[styles.actionBtnTxt, { color: "#1565C0" }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#E8F5E9" }]} onPress={waCustomer}>
              <Feather name="message-circle" size={17} color={C.whatsapp} />
              <Text style={[styles.actionBtnTxt, { color: C.whatsappDark }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* Address */}
        <SectionCard title="Delivery Address">
          <Text style={styles.addrTxt}>{addr || "—"}</Text>
          {!!addr && (
            <TouchableOpacity style={styles.mapsBtn} onPress={openMaps}>
              <Feather name="map" size={14} color={C.primary} />
              <Text style={styles.mapsBtnTxt}>Open in Google Maps</Text>
              <Feather name="external-link" size={13} color={C.primary} />
            </TouchableOpacity>
          )}
        </SectionCard>

        {/* Products — packing checklist */}
        {items.length > 0 && (
          <SectionCard title={`Products to Pack (${items.length} item${items.length !== 1 ? "s" : ""})`}>
            <View style={styles.packHint}>
              <Feather name="info" size={12} color={C.mutedForeground} />
              <Text style={styles.packHintTxt}>Tap each item to mark as packed</Text>
            </View>
            {allChecked && (
              <View style={styles.allPackedBanner}>
                <Feather name="check-circle" size={14} color={C.statusDelivered} />
                <Text style={styles.allPackedTxt}>All items packed — ready to go!</Text>
              </View>
            )}
            {items.map((item: any, idx: number) => {
              const checked = checkedItems.has(idx);
              const weight  = item.variant_title ?? item.sku ?? "";
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.productRow, checked && styles.productRowChecked]}
                  onPress={() => toggleItem(idx)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.productCheck, {
                    borderColor: checked ? C.statusDelivered : C.border,
                    backgroundColor: checked ? C.statusDeliveredBg : "#fff",
                  }]}>
                    {checked && <Feather name="check" size={12} color={C.statusDelivered} />}
                  </View>
                  <View style={[styles.qtyBadge, { backgroundColor: C.primaryLight }]}>
                    <Text style={[styles.qtyTxt, { color: C.primaryDark }]}>{item.quantity ?? 1}×</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productName, checked && { color: C.mutedForeground, textDecorationLine: "line-through" }]} numberOfLines={2}>
                      {item.title ?? item.name ?? "Item"}
                    </Text>
                    {!!weight && <Text style={styles.productVariant}>{weight}</Text>}
                  </View>
                  {!!item.price && (
                    <Text style={styles.productPrice}>Rs. {Number(item.price).toLocaleString()}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </SectionCard>
        )}

        {/* Notes */}
        {(!!delivery.notes || !!delivery.order_notes) && (
          <SectionCard title="Notes">
            <Text style={styles.notesTxt}>{delivery.notes || delivery.order_notes}</Text>
          </SectionCard>
        )}

        {/* Invoice */}
        <SectionCard title="Invoice">
          <View style={styles.invoiceBtns}>
            <TouchableOpacity style={[styles.invoiceBtn, { backgroundColor: C.primaryLight }]} onPress={openInvoice}>
              <Feather name="file-text" size={16} color={C.primaryDark} />
              <Text style={[styles.invoiceBtnTxt, { color: C.primaryDark }]}>View Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invoiceBtn, { backgroundColor: "#E8F5E9" }]} onPress={waInvoice}>
              <Feather name="message-circle" size={16} color={C.whatsappDark} />
              <Text style={[styles.invoiceBtnTxt, { color: C.whatsappDark }]}>WA Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invoiceBtn, { backgroundColor: "#E3F2FD" }]} onPress={shareInvoice}>
              <Feather name="share-2" size={16} color="#1565C0" />
              <Text style={[styles.invoiceBtnTxt, { color: "#1565C0" }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>

        {/* Status Workflow */}
        {!isTerminal ? (
          <SectionCard title="Update Status">
            <View style={styles.workflowGrid}>
              {WORKFLOW.map(w => {
                const isCurrent = delivery.status === w.status;
                const isPast = (() => {
                  const order = ["assigned", "picked", "out_for_delivery", "delivered", "failed"];
                  return order.indexOf(w.status) < order.indexOf(delivery.status);
                })();
                return (
                  <TouchableOpacity
                    key={w.status}
                    style={[
                      styles.workflowBtn,
                      { borderColor: w.color },
                      isCurrent && { backgroundColor: w.color },
                      isPast     && { opacity: 0.45, borderStyle: "dashed" },
                    ]}
                    onPress={() => !isPast && confirmStatus(w.status)}
                    disabled={statusMut.isPending || isPast}
                    activeOpacity={0.75}
                  >
                    {statusMut.isPending && isCurrent
                      ? <ActivityIndicator size="small" color={isCurrent ? "#fff" : w.color} />
                      : <Feather name={w.icon as any} size={20} color={isCurrent ? "#fff" : w.color} />
                    }
                    <Text style={[styles.workflowTxt, { color: isCurrent ? "#fff" : w.color }]}>{w.label}</Text>
                    {isPast && <Feather name="check" size={12} color={w.color} style={{ position: "absolute", top: 6, right: 8 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>
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
  centered:   { justifyContent: "center", alignItems: "center", gap: 12 },
  backFallback: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },

  header: {
    backgroundColor: C.headerBg, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 12,
  },
  backBtn:          { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  headerOrderNum:   { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  headerCust:       { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 2 },
  headerStatus:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  headerStatusTxt:  { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  scroll: { padding: 16, gap: 12 },

  paymentCard: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 2,
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  paymentIcon:     { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  paymentLabel:    { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, letterSpacing: 0.8, textTransform: "uppercase" },
  paymentAmount:   { fontSize: 28, fontFamily: "Inter_700Bold", marginTop: 2 },
  paymentDelivery: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 2 },

  sectionCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 0,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionCardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },

  custBigName: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.text },
  custPhone:   { fontSize: 15, fontFamily: "Inter_500Medium", color: C.primary, marginTop: 3, marginBottom: 12 },
  actionBtns:  { flexDirection: "row", gap: 10 },
  actionBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 10, borderRadius: 10 },
  actionBtnTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  addrTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, lineHeight: 22, marginBottom: 10 },
  mapsBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: C.primaryLight, borderRadius: 10, alignSelf: "flex-start" },
  mapsBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

  packHint:      { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  packHintTxt:   { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, fontStyle: "italic" },
  allPackedBanner: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.statusDeliveredBg, borderRadius: 8, padding: 10, marginBottom: 8 },
  allPackedTxt:  { color: C.statusDelivered, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  productRow:        { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  productRowChecked: { opacity: 0.7 },
  productCheck:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  qtyBadge:          { minWidth: 30, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  qtyTxt:            { fontSize: 12, fontFamily: "Inter_700Bold" },
  productName:       { fontSize: 13, fontFamily: "Inter_500Medium", color: C.text, lineHeight: 18 },
  productVariant:    { fontSize: 11, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 1 },
  productPrice:      { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.text },

  notesTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, lineHeight: 21 },

  invoiceBtns: { flexDirection: "row", gap: 8 },
  invoiceBtn:  { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10 },
  invoiceBtnTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  workflowGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  workflowBtn:  {
    flex: 1, minWidth: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 2, backgroundColor: "#fff",
  },
  workflowTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  terminalBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, borderWidth: 1 },
  terminalTxt:    { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium" },
});
