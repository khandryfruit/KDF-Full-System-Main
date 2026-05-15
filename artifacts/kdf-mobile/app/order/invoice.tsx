import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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

import { BASE_URL, useAuth } from "@/context/AuthContext";
import { buildRiderInvoiceUrl } from "@/lib/invoiceShare";

export default function RiderInvoiceScreen() {
  const { deliveryId, customerPhone, waMessage } = useLocalSearchParams<{
    deliveryId: string;
    customerPhone?: string;
    waMessage?: string;
  }>();
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const invoiceUrl = useMemo(() => {
    if (!deliveryId || !token) return "";
    return buildRiderInvoiceUrl(BASE_URL, deliveryId, token);
  }, [deliveryId, token]);

  const sendWhatsApp = () => {
    if (!customerPhone) {
      Alert.alert("No phone", "Customer phone number is not available.");
      return;
    }
    const msg = waMessage ? decodeURIComponent(String(waMessage)) : `Your invoice: ${invoiceUrl}`;
    const digits = String(customerPhone).replace(/\D/g, "");
    const intl = digits.startsWith("92") ? digits : digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
    Linking.openURL(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`);
  };

  const shareInvoice = () => {
    const msg = waMessage ? decodeURIComponent(String(waMessage)) : `Invoice: ${invoiceUrl}`;
    Share.share({ message: msg, title: "KDF Invoice" });
  };

  if (!invoiceUrl) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.err}>Cannot load invoice (not signed in).</Text>
        <TouchableOpacity onPress={() => router.back()}>
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
        source={{ uri: invoiceUrl }}
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
