import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { riderFetch, useAuth } from "@/context/AuthContext";
import {
  buildInvoiceWhatsAppMessage,
  fetchPublicInvoiceShareUrl,
  whatsAppUrlForPhone,
} from "@/lib/invoiceShare";

export default function RiderInvoiceScreen() {
  const { deliveryId, customerPhone } = useLocalSearchParams<{
    deliveryId: string;
    customerPhone?: string;
  }>();
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [publicUrl, setPublicUrl] = useState("");
  const [waMessage, setWaMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deliveryId || !token) return;
      try {
        const [url, delRes] = await Promise.all([
          fetchPublicInvoiceShareUrl(deliveryId, token),
          riderFetch(`/rider/deliveries/${deliveryId}`, token),
        ]);
        if (cancelled) return;
        setPublicUrl(url);

        if (delRes.ok) {
          const delivery = await delRes.json();
          const items: unknown[] = (() => {
            try {
              const src = delivery.order_items ?? delivery.line_items;
              const arr = typeof src === "string" ? JSON.parse(src) : src;
              return Array.isArray(arr) ? arr : [];
            } catch {
              return [];
            }
          })();
          const addr = (() => {
            try {
              const a =
                typeof delivery.shipping_address === "string"
                  ? JSON.parse(delivery.shipping_address)
                  : delivery.shipping_address;
              return [a?.address1, a?.address2, a?.city, a?.province].filter(Boolean).join(", ");
            } catch {
              return delivery.delivery_address ?? "";
            }
          })();

          setWaMessage(
            buildInvoiceWhatsAppMessage({
              orderNumber: String(delivery.shopify_order_number ?? deliveryId),
              customerName: delivery.customer_name,
              customerPhone: delivery.customer_phone,
              address: addr,
              items: items as Parameters<typeof buildInvoiceWhatsAppMessage>[0]["items"],
              codAmount: Number(delivery.cod_amount ?? 0),
              isPaid: Boolean(delivery.is_paid),
              deliveryCharge: Number(delivery.delivery_charge ?? 0),
              invoiceUrl: url,
            }),
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          Alert.alert("Invoice", e?.message ?? "Could not load invoice.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deliveryId, token]);

  const sendWhatsApp = () => {
    if (!customerPhone) {
      Alert.alert("No phone", "Customer phone number is not available.");
      return;
    }
    if (!waMessage) {
      Alert.alert("Please wait", "Invoice link is still loading.");
      return;
    }
    Linking.openURL(whatsAppUrlForPhone(customerPhone, waMessage));
  };

  const shareInvoice = () => {
    if (!waMessage) {
      Alert.alert("Please wait", "Invoice link is still loading.");
      return;
    }
    Share.share({ message: waMessage, title: "KDF Invoice" });
  };

  if (!publicUrl) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#00B85A" />
        <Text style={[styles.err, { marginTop: 16 }]}>Loading invoice…</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Delivery Invoice</Text>
        <TouchableOpacity onPress={shareInvoice} style={styles.iconBtn}>
          <Feather name="share-2" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.waBtn} onPress={sendWhatsApp}>
          <Feather name="message-circle" size={18} color="#fff" />
          <Text style={styles.waBtnTxt}>Send Invoice on WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#00B85A" />
        </View>
      ) : null}

      <WebView
        source={{ uri: publicUrl }}
        onLoadEnd={() => setLoading(false)}
        style={styles.web}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D2137" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  title: { flex: 1, color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  actions: { paddingHorizontal: 12, paddingBottom: 8 },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#075E54",
    borderRadius: 12,
    paddingVertical: 12,
  },
  waBtnTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  web: { flex: 1, backgroundColor: "#fff" },
  loader: { ...StyleSheet.absoluteFillObject, top: 120, justifyContent: "center", alignItems: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0D2137" },
  err: { color: "#fff", marginBottom: 12 },
  link: { color: "#00B85A", fontFamily: "Inter_600SemiBold" },
});
