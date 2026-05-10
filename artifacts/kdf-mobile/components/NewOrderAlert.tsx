import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export interface NewOrderData {
  id: number;
  shopify_order_number: string;
  customer_name: string;
  customer_phone: string;
  cod_amount: number;
  is_paid: boolean;
  delivery_address: string;
  assigned_at: string;
}

interface Props {
  order: NewOrderData | null;
  onAccept: (id: number) => void;
  onView: (id: number) => void;
  onDismiss: () => void;
}

export default function NewOrderAlert({ order, onAccept, onView, onDismiss }: Props) {
  const insets   = useSafeAreaInsets();
  const slideY   = useRef(new Animated.Value(-260)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const scale    = useRef(new Animated.Value(0.92)).current;
  const pulse    = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef    = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (order) {
      /* Haptic burst */
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 250);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 500);

      /* Slide in */
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 220 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 200 }),
      ]).start();

      /* Pulse loop */
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.025, duration: 750, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        ])
      );
      loopRef.current.start();

      /* Glow loop */
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
        ])
      ).start();

      /* Auto-dismiss */
      dismissRef.current = setTimeout(() => onDismiss(), 45_000);
    } else {
      loopRef.current?.stop();
      Animated.parallel([
        Animated.timing(slideY, { toValue: -260, duration: 240, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      if (dismissRef.current) clearTimeout(dismissRef.current);
    }
    return () => { if (dismissRef.current) clearTimeout(dismissRef.current); };
  }, [!!order]);

  if (!order) return null;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity }]} />

      <Animated.View
        style={[
          styles.container,
          {
            top: insets.top + (Platform.OS === "web" ? 70 : 8),
            transform: [{ translateY: slideY }, { scale }],
            opacity,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <LinearGradient
            colors={["#021A0C", "#003D1A", "#005C26"]}
            style={styles.card}
          >
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={styles.newBadge}>
                <Animated.View
                  style={[
                    styles.liveDot,
                    { backgroundColor: glowAnim.interpolate({ inputRange: [0, 1], outputRange: ["#00C562", "#00FF7F"] }) },
                  ]}
                />
                <Text style={styles.newBadgeTxt}>نیا آرڈر آیا!</Text>
              </View>
              <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
                <Feather name="x" size={15} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Order details */}
            <View style={styles.orderRow}>
              <View style={styles.packageIconWrap}>
                <Feather name="package" size={26} color="#00E572" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderNum}>Order #{order.shopify_order_number}</Text>
                <Text style={styles.custName} numberOfLines={1}>{order.customer_name}</Text>
              </View>
              <View style={[styles.codPill, { backgroundColor: order.is_paid ? "#00C562" : "#F59E0B" }]}>
                <Text style={styles.codPillTxt}>
                  {order.is_paid ? "✓ PAID" : `Rs.${Number(order.cod_amount).toLocaleString()}`}
                </Text>
              </View>
            </View>

            {/* Address */}
            {!!order.delivery_address && (
              <View style={styles.addrRow}>
                <Feather name="map-pin" size={12} color="rgba(0,229,114,0.7)" />
                <Text style={styles.addrTxt} numberOfLines={2}>{order.delivery_address}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onAccept(order.id);
                }}
                activeOpacity={0.82}
              >
                <Feather name="check" size={20} color="#003D1A" />
                <Text style={styles.acceptTxt}>Accept کریں</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => { Haptics.selectionAsync(); onView(order.id); }}
                activeOpacity={0.82}
              >
                <Feather name="eye" size={16} color="rgba(255,255,255,0.85)" />
                <Text style={styles.viewTxt}>Details</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    shadowColor: "#00C562",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 24,
    borderRadius: 22,
    overflow: "hidden",
  },
  card: {
    padding: 18,
    gap: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(0,197,98,0.3)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  newBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(0,229,114,0.15)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(0,229,114,0.3)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  newBadgeTxt: {
    color: "#00E572",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  packageIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(0,229,114,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,229,114,0.25)",
  },
  orderNum: {
    color: "#fff",
    fontSize: 19,
    fontFamily: "Inter_700Bold",
  },
  custName: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  codPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  codPillTxt: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  addrRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addrTxt: {
    flex: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  acceptBtn: {
    flex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#00C562",
    borderRadius: 14,
    paddingVertical: 15,
  },
  acceptTxt: {
    color: "#002D16",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  viewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  viewTxt: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
