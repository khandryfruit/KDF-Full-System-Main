import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import {
  buildInvoiceWhatsAppMessage,
  buildRiderInvoiceUrl,
  whatsAppUrlForPhone,
} from "@/lib/invoiceShare";

const C = colors.light;

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

/* ── Smart Google Maps Navigation ── */
async function smartNavigate(address: string) {
  if (!address) return;
  const q = encodeURIComponent(address);

  const urls = {
    // Google Maps app turn-by-turn navigation
    androidNav:  `google.navigation:q=${q}`,
    iosGmaps:    `comgooglemaps://?daddr=${q}&directionsmode=driving`,
    // Universal fallback
    browser:     `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
  };

  if (Platform.OS === "android") {
    // Try Google Maps navigation deep link first
    const canUseGmaps = await Linking.canOpenURL(urls.androidNav).catch(() => false);
    if (canUseGmaps) {
      await Linking.openURL(urls.androidNav);
      return;
    }
    // Fallback to browser Google Maps
    await Linking.openURL(urls.browser);
  } else if (Platform.OS === "ios") {
    // Try Google Maps iOS app
    const canUseGmaps = await Linking.canOpenURL(urls.iosGmaps).catch(() => false);
    if (canUseGmaps) {
      await Linking.openURL(urls.iosGmaps);
      return;
    }
    // Try Apple Maps
    const appleMapsUrl = `maps:?daddr=${q}&dirflg=d`;
    const canUseApple = await Linking.canOpenURL(appleMapsUrl).catch(() => false);
    if (canUseApple) {
      await Linking.openURL(appleMapsUrl);
      return;
    }
    // Browser fallback
    await Linking.openURL(urls.browser);
  } else {
    await Linking.openURL(urls.browser);
  }
}

/* ── Open in Google Maps (view only, no navigation) ── */
async function openInMaps(address: string) {
  if (!address) return;
  const q = encodeURIComponent(address);
  const urls = {
    android: `geo:0,0?q=${q}`,
    ios:     `maps:?q=${q}`,
    browser: `https://maps.google.com/?q=${q}`,
  };
  if (Platform.OS === "android") {
    const canOpen = await Linking.canOpenURL(urls.android).catch(() => false);
    if (canOpen) { await Linking.openURL(urls.android); return; }
  } else if (Platform.OS === "ios") {
    const canOpen = await Linking.canOpenURL(urls.ios).catch(() => false);
    if (canOpen) { await Linking.openURL(urls.ios); return; }
  }
  await Linking.openURL(urls.browser);
}

export default function OrderDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const qc        = useQueryClient();
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [proofUri, setProofUri]         = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);

  /* ── Verification Query (check if proof already uploaded) ── */
  const { data: verData, refetch: refetchVer } = useQuery({
    queryKey: ["delivery-verification", id],
    queryFn:  async () => {
      const r = await riderFetch(`/rider/deliveries/${id}/verification`, token);
      if (r.status === 404) return null;
      return r.json();
    },
    enabled: !!id && !!token,
  });

  /* ── Take + Upload Proof Photo ── */
  const takeAndUploadProof = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Permission Required", "Please allow camera access to upload delivery proof.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality:    0.55,
        base64:     true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      const locPerm = await Location.requestForegroundPermissionsAsync();
      if (locPerm.status !== "granted") {
        Alert.alert("Location required", "Turn on location so delivery proof includes GPS for dispute protection.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      setProofUri(result.assets[0].uri);
      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const device = {
        brand: Device.brand ?? undefined,
        modelName: Device.modelName ?? undefined,
        osName: Device.osName,
        osVersion: Device.osVersion,
        appVersion: Constants.expoConfig?.version ?? undefined,
      };

      const r = await riderFetch(`/rider/deliveries/${id}/verification`, token, {
        method: "POST",
        body:   JSON.stringify({
          photo_base64: result.assets[0].base64,
          mime_type:    "image/jpeg",
          latitude:     pos.coords.latitude,
          longitude:    pos.coords.longitude,
          location_accuracy_m: pos.coords.accuracy ?? null,
          device,
        }),
      });
      if (!r.ok) {
        let msg = "Upload failed";
        try {
          const j = await r.json();
          msg = (j as any).error ?? msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchVer();
      Alert.alert("✅ Uploaded", "Delivery proof photo uploaded successfully.");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e.message ?? "Could not upload photo");
    } finally {
      setUploading(false);
    }
  };

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
      if (!r.ok) {
        let msg = "Failed";
        try {
          const e = await r.json() as { error?: string; detail?: string };
          msg = e.error ?? e.detail ?? msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["delivery", id] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries-all"] });
      qc.invalidateQueries({ queryKey: ["rider-deliveries-tasks"] });
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

  const invoiceUrl = token && id ? buildRiderInvoiceUrl(BASE_URL, id, token) : "";

  const invoiceSharePayload = {
    orderNumber: String(delivery?.shopify_order_number ?? id ?? ""),
    customerName: delivery?.customer_name,
    customerPhone: delivery?.customer_phone,
    address: addr,
    items,
    codAmount: Number(delivery?.cod_amount ?? 0),
    isPaid: Boolean(delivery?.is_paid),
    deliveryCharge: Number(delivery?.delivery_charge ?? 0),
    invoiceUrl,
  };

  /* ── Actions ── */
  const navigate      = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); smartNavigate(addr); };
  const openMapsView  = () => openInMaps(addr);
  const callCustomer  = () => Linking.openURL(`tel:${delivery?.customer_phone}`);

  const waCustomer = () => {
    const ph = String(delivery?.customer_phone ?? "").replace(/\D/g, "");
    const intl = ph.startsWith("92") ? ph : ph.startsWith("0") ? `92${ph.slice(1)}` : ph;
    const msg = encodeURIComponent(
      `السلام علیکم! میں آپ کا KDF NUTS آرڈر #${delivery?.shopify_order_number} ڈیلیور کرنے آ رہا ہوں۔`
    );
    Linking.openURL(`https://wa.me/${intl}?text=${msg}`);
  };

  const openInvoice = () => {
    if (!id || !token) return;
    const waMsg = encodeURIComponent(buildInvoiceWhatsAppMessage(invoiceSharePayload));
    router.push({
      pathname: "/order/invoice",
      params: {
        deliveryId: String(id),
        customerPhone: delivery?.customer_phone ?? "",
        waMessage: waMsg,
      },
    } as any);
  };

  const shareInvoice = async () => {
    const msg = buildInvoiceWhatsAppMessage(invoiceSharePayload);
    Share.share({ message: msg, title: `KDF Invoice #${delivery?.shopify_order_number}` });
  };

  const sendInvoiceWhatsApp = () => {
    const ph = delivery?.customer_phone;
    if (!ph) {
      Alert.alert("No phone", "Customer phone number is missing.");
      return;
    }
    const msg = buildInvoiceWhatsAppMessage(invoiceSharePayload);
    Linking.openURL(whatsAppUrlForPhone(ph, msg));
  };

  const confirmStatus = (status: string) => {
    const action = WORKFLOW.find(w => w.status === status);
    /* Picked Up / On Route → direct update, no confirmation needed */
    if (status === "picked" || status === "out_for_delivery") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      statusMut.mutate(status);
      return;
    }
    /* Delivered / Failed → confirm before acting */
    Alert.alert(
      status === "delivered" ? "✅ Mark as Delivered?" : "❌ Mark as Failed?",
      status === "delivered"
        ? "کیا آپ نے یہ آرڈر deliver کر دیا ہے؟"
        : "کیا یہ delivery fail ہو گئی؟",
      [
        { text: "واپس جائیں", style: "cancel" },
        {
          text: status === "delivered" ? "✅ Delivered" : "❌ Failed",
          style: status === "delivered" ? "default" : "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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
      {/* ── Premium Header ── */}
      <LinearGradient
        colors={["#080F1E", "#0D1F3C"]}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) + 10 }]}
      >
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

        {/* ── 4 Quick Action Buttons ── */}
        <View style={styles.quickStrip}>
          <TouchableOpacity style={styles.quickStripBtn} onPress={callCustomer}>
            <View style={[styles.quickIcon, { backgroundColor: "#1565C0" }]}>
              <Feather name="phone-call" size={17} color="#fff" />
            </View>
            <Text style={styles.quickTxt}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickStripBtn} onPress={waCustomer}>
            <View style={[styles.quickIcon, { backgroundColor: "#075E54" }]}>
              <Feather name="message-circle" size={17} color="#fff" />
            </View>
            <Text style={styles.quickTxt}>WhatsApp</Text>
          </TouchableOpacity>

          {/* Big Navigate Button */}
          <TouchableOpacity style={[styles.quickStripBtn, { flex: 2 }]} onPress={navigate}>
            <View style={[styles.quickIcon, { backgroundColor: "#00B85A", width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" }]}>
              <Feather name="navigation" size={22} color="#fff" />
            </View>
            <Text style={[styles.quickTxt, { color: "#4ADE80", fontFamily: "Inter_700Bold" }]}>Navigate</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickStripBtn} onPress={openMapsView}>
            <View style={[styles.quickIcon, { backgroundColor: "#1A73E8" }]}>
              <Feather name="map" size={17} color="#fff" />
            </View>
            <Text style={styles.quickTxt}>Maps</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Priority Banner */}
        {isActive && <PriorityBanner assignedAt={delivery.assigned_at} />}

        {/* ── Payment Hero Card ── */}
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
            {dc > 0 && <Text style={styles.payDelivery}>+ Delivery: Rs. {dc.toLocaleString()}</Text>}
          </View>
        </View>

        {/* ── Address + Navigation ── */}
        <Section title="Delivery Address">
          <Text style={styles.addrTxt}>{addr || "—"}</Text>
          {!!addr && (
            <>
              {/* Big navigate button */}
              <TouchableOpacity style={styles.navigateHero} onPress={navigate} activeOpacity={0.85}>
                <LinearGradient colors={["#00B85A", "#007A3C"]} style={styles.navigateHeroGrad}>
                  <View style={styles.navigateHeroIcon}>
                    <Feather name="navigation" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navigateHeroTitle}>Start Navigation</Text>
                    <Text style={styles.navigateHeroSub}>Google Maps میں کھولیں · Turn-by-turn</Text>
                  </View>
                  <Feather name="arrow-right" size={18} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary: View on map */}
              <TouchableOpacity style={styles.mapViewBtn} onPress={openMapsView}>
                <Feather name="map" size={14} color={C.primary} />
                <Text style={styles.mapViewTxt}>View on Map</Text>
              </TouchableOpacity>
            </>
          )}
        </Section>

        {/* ── Products Checklist ── */}
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

        {/* ── Notes ── */}
        {(!!delivery.notes || !!delivery.order_notes) && (
          <Section title="Order Notes">
            <View style={styles.notesBox}>
              <Feather name="file-text" size={14} color={C.mutedForeground} />
              <Text style={styles.notesTxt}>{delivery.notes || delivery.order_notes}</Text>
            </View>
          </Section>
        )}

        {/* ── Delivery Proof (Paid Orders / Pre-Delivery Verification) ── */}
        {(delivery.is_paid || ["out_for_delivery", "picked", "assigned"].includes(delivery.status)) && !isTerminal && (
          <Section title="📸 Delivery Proof">
            {verData?.verification ? (
              /* Already uploaded */
              <View>
                <View style={styles.proofUploadedBanner}>
                  <Feather name="check-circle" size={16} color="#059669" />
                  <Text style={styles.proofUploadedTxt}>Proof photo uploaded ✓</Text>
                </View>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${verData.verification.photo_base64}` }}
                  style={styles.proofImage}
                  resizeMode="cover"
                />
                <Text style={styles.proofDateTxt}>
                  Uploaded: {new Date(verData.verification.created_at).toLocaleString("en-PK")}
                </Text>
              </View>
            ) : (
              /* Not yet uploaded */
              <View>
                {proofUri ? (
                  <View>
                    <Image source={{ uri: proofUri }} style={styles.proofImage} resizeMode="cover" />
                    {uploading && (
                      <View style={styles.proofUploadingOverlay}>
                        <ActivityIndicator color="#00C562" size="large" />
                        <Text style={styles.proofUploadingTxt}>Uploading...</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.proofEmptyBox}>
                    <Feather name="camera" size={28} color="#94A3B8" />
                    <Text style={styles.proofEmptyTxt}>
                      {delivery.is_paid ? "Paid order — delivery proof required" : "Take a delivery proof photo"}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.proofCameraBtn, uploading && { opacity: 0.6 }]}
                  onPress={takeAndUploadProof}
                  disabled={uploading}
                  activeOpacity={0.82}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Feather name="camera" size={16} color="#fff" />
                        <Text style={styles.proofCameraBtnTxt}>
                          {proofUri ? "Retake Photo" : "Take Proof Photo"}
                        </Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            )}
          </Section>
        )}

        {/* ── Invoice ── */}
        <Section title="Invoice & Sharing">
          {/* Invoice URL display */}
          <View style={styles.invoiceUrlBox}>
            <Feather name="link" size={13} color="#6B7A99" />
            <Text style={styles.invoiceUrlTxt} numberOfLines={1}>
              {invoiceUrl.replace("https://", "")}
            </Text>
          </View>

          <View style={styles.invoiceGrid}>
            <TouchableOpacity style={[styles.invBtn, { backgroundColor: "#E3F2FD" }]} onPress={openInvoice}>
              <Feather name="file-text" size={18} color="#1565C0" />
              <Text style={[styles.invBtnTxt, { color: "#1565C0" }]}>View Invoice</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invBtn, { backgroundColor: "#E8F5E9" }]} onPress={sendInvoiceWhatsApp}>
              <Feather name="message-circle" size={18} color="#075E54" />
              <Text style={[styles.invBtnTxt, { color: "#075E54" }]}>Send Invoice (WA)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.invBtn, { backgroundColor: C.primaryLight }]} onPress={shareInvoice}>
              <Feather name="share-2" size={18} color={C.primaryDark} />
              <Text style={[styles.invBtnTxt, { color: C.primaryDark }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </Section>

        {/* ── Accept Order Hero CTA (only for assigned) ── */}
        {delivery.status === "assigned" && (
          <View style={styles.acceptHeroCard}>
            <View style={styles.acceptHeroIconWrap}>
              <Feather name="package" size={28} color="#00C562" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.acceptHeroTitle}>نیا آرڈر ملا ہے!</Text>
              <Text style={styles.acceptHeroSub}>Accept کریں اور pickup کے لیے روانہ ہوں</Text>
            </View>
            <TouchableOpacity
              style={[styles.acceptHeroBtn, statusMut.isPending && { opacity: 0.6 }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                statusMut.mutate("picked");
              }}
              disabled={statusMut.isPending}
              activeOpacity={0.82}
            >
              {statusMut.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Feather name="check" size={18} color="#fff" />
                    <Text style={styles.acceptHeroBtnTxt}>Accept</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Status Workflow ── */}
        {!isTerminal ? (
          <Section title="Update Delivery Status">
            <View style={styles.workflowStack}>
              {WORKFLOW.map((w, idx) => {
                const isCurrent = delivery.status === w.status;
                const statusOrder = ["assigned", "picked", "out_for_delivery", "delivered", "failed"];
                const isPast = statusOrder.indexOf(w.status) < statusOrder.indexOf(delivery.status);
                const isLoading = statusMut.isPending;

                return (
                  <TouchableOpacity
                    key={w.status}
                    style={[
                      styles.wfBtn,
                      { borderColor: w.color, backgroundColor: isCurrent ? w.color : "#fff" },
                      isPast && styles.wfBtnDone,
                    ]}
                    onPress={() => { if (!isPast && !isLoading) confirmStatus(w.status); }}
                    activeOpacity={isPast ? 1 : 0.75}
                  >
                    {/* Left icon */}
                    <View style={[
                      styles.wfIconWrap,
                      { backgroundColor: isCurrent ? "rgba(255,255,255,0.25)" : w.color + "18" },
                    ]}>
                      {isLoading && isCurrent
                        ? <ActivityIndicator size="small" color={isCurrent ? "#fff" : w.color} />
                        : isPast
                          ? <Feather name="check" size={18} color={w.color} />
                          : <Feather name={w.icon as any} size={18} color={isCurrent ? "#fff" : w.color} />
                      }
                    </View>

                    {/* Label + hint */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.wfTxt, { color: isCurrent ? "#fff" : w.color }]}>
                        {w.label}
                      </Text>
                      {isCurrent && (
                        <Text style={styles.wfCurrentHint}>Current Status</Text>
                      )}
                      {isPast && (
                        <Text style={[styles.wfCurrentHint, { color: w.color }]}>Done ✓</Text>
                      )}
                      {!isCurrent && !isPast && (
                        <Text style={[styles.wfCurrentHint, { color: w.color + "99" }]}>
                          {w.status === "picked" ? "Tap to mark picked up" :
                           w.status === "out_for_delivery" ? "Tap when on route" :
                           w.status === "delivered" ? "Tap when delivered" : "Tap if failed"}
                        </Text>
                      )}
                    </View>

                    {/* Right arrow */}
                    {!isPast && (
                      <Feather
                        name="chevron-right"
                        size={18}
                        color={isCurrent ? "rgba(255,255,255,0.7)" : w.color + "88"}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Returned option */}
            {!["returned"].includes(delivery.status) && (
              <TouchableOpacity
                style={styles.returnedBtn}
                onPress={() => {
                  Alert.alert(
                    "↩️ Return Order?",
                    "کیا یہ آرڈر واپس آ گیا ہے؟",
                    [
                      { text: "نہیں", style: "cancel" },
                      { text: "↩️ Returned", style: "destructive", onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); statusMut.mutate("returned"); } },
                    ]
                  );
                }}
              >
                <Feather name="rotate-ccw" size={14} color="#8B5CF6" />
                <Text style={styles.returnedTxt}>Mark as Returned</Text>
              </TouchableOpacity>
            )}
          </Section>
        ) : (
          <View style={[styles.terminalBanner, { backgroundColor: getStatusBg(delivery.status), borderColor: sc + "40" }]}>
            <Feather name={delivery.status === "delivered" ? "check-circle" : "info"} size={18} color={sc} />
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
  root:       { flex: 1, backgroundColor: "#F1F4F9" },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  backFallback: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 12 },

  header: { paddingBottom: 0 },
  headerRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, gap: 12,
  },
  backBtn:        { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerOrderNum: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  headerCust:     { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 2 },
  statusBadge:    { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10 },
  statusBadgeTxt: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

  quickStrip: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingBottom: 18, paddingTop: 4, gap: 8 },
  quickStripBtn: { flex: 1, alignItems: "center", gap: 5 },
  quickIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  quickTxt:  { color: "rgba(255,255,255,0.65)", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  scroll: { padding: 14, gap: 12 },

  payCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 18, borderRadius: 18, borderWidth: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  payIcon:     { width: 58, height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  payLabel:    { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  payAmount:   { fontSize: 30, fontFamily: "Inter_700Bold", marginTop: 3 },
  payDelivery: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.mutedForeground, marginTop: 3 },

  section: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", color: C.mutedForeground, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },

  addrTxt: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.text, lineHeight: 22, marginBottom: 14 },

  /* Navigate hero button */
  navigateHero: { borderRadius: 16, overflow: "hidden", marginBottom: 10 },
  navigateHeroGrad: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
  },
  navigateHeroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  navigateHeroTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  navigateHeroSub:   { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  mapViewBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: C.primaryLight },
  mapViewTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.primary },

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

  invoiceUrlBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12,
  },
  invoiceUrlTxt: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7A99" },

  invoiceGrid: { flexDirection: "row", gap: 8 },
  invBtn:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 12 },
  invBtnTxt:   { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  workflowStack: { gap: 10 },
  wfBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 16, paddingHorizontal: 16,
    borderRadius: 16, borderWidth: 2, backgroundColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  wfBtnDone:    { opacity: 0.55 },
  wfIconWrap:   { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  wfTxt:        { fontSize: 15, fontFamily: "Inter_700Bold" },
  wfCurrentHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginTop: 2 },

  returnedBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, marginTop: 10, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "#F5F3FF", borderWidth: 1, borderColor: "#DDD6FE",
  },
  returnedTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#7C3AED" },

  terminalBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 16, borderWidth: 1 },
  terminalTxt:    { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  /* Accept Hero CTA */
  acceptHeroCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#003D1A", borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: "#00C562",
    shadowColor: "#00C562", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  acceptHeroIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: "rgba(0,197,98,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(0,197,98,0.3)",
  },
  acceptHeroTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  acceptHeroSub:   { color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  acceptHeroBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#00C562", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  acceptHeroBtnTxt: { color: "#002D16", fontSize: 13, fontFamily: "Inter_700Bold" },

  /* Delivery Proof */
  proofUploadedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10, marginBottom: 12,
  },
  proofUploadedTxt: { color: "#059669", fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  proofImage: {
    width: "100%", height: 180, borderRadius: 12, marginBottom: 8,
    backgroundColor: "#F1F5F9",
  },
  proofDateTxt: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#94A3B8", textAlign: "center" },
  proofEmptyBox: {
    alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1,
    borderColor: "#E2E8F0", borderStyle: "dashed", paddingVertical: 28, marginBottom: 12,
  },
  proofEmptyTxt: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#94A3B8", textAlign: "center" },
  proofCameraBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#0F172A", borderRadius: 12, paddingVertical: 13, marginTop: 6,
  },
  proofCameraBtnTxt: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  proofUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 12,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  proofUploadingTxt: { color: "#00C562", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
