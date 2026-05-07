import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getPriorityInfo, formatCountdown, type Priority,
} from "@/utils/priority";

/* ─── Live ticking hook ─────────────────────────────── */
export function useLivePriority(assignedAt: string | null | undefined) {
  const [info, setInfo] = useState(() => getPriorityInfo(assignedAt));
  useEffect(() => {
    setInfo(getPriorityInfo(assignedAt));
    const id = setInterval(() => setInfo(getPriorityInfo(assignedAt)), 1_000);
    return () => clearInterval(id);
  }, [assignedAt]);
  return info;
}

/* ─── Pulsing animation for CRITICAL orders ────────── */
function PulseView({ children, active }: { children: React.ReactNode; active: boolean }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { anim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return <Animated.View style={{ opacity: anim }}>{children}</Animated.View>;
}

/* ─── Compact badge for order list cards ────────────── */
export function PriorityBadge({ assignedAt }: { assignedAt: string | null | undefined }) {
  const info = useLivePriority(assignedAt);
  const isCritical = info.priority === "critical";
  const icon: Record<Priority, string> = {
    low: "arrow-down-circle", medium: "clock", high: "alert-triangle", critical: "alert-octagon",
  };
  return (
    <PulseView active={isCritical}>
      <View style={[
        styles.badge,
        { backgroundColor: info.bgColor, borderColor: info.color + "66" },
        isCritical && { backgroundColor: info.bgColor },
      ]}>
        <Feather name={icon[info.priority] as any} size={10} color={isCritical ? "#fca5a5" : info.color} />
        <Text style={[styles.badgeTxt, { color: isCritical ? "#fca5a5" : info.textColor }]}>
          {info.label}
        </Text>
      </View>
    </PulseView>
  );
}

/* ─── Compact countdown line for order cards ─────────── */
export function CountdownLine({ assignedAt }: { assignedAt: string | null | undefined }) {
  const info = useLivePriority(assignedAt);
  if (!assignedAt) return null;
  const isCritical = info.priority === "critical";
  return (
    <View style={styles.countdownRow}>
      <Feather
        name={info.overdue ? "alert-circle" : "clock"}
        size={11}
        color={isCritical ? "#ef4444" : info.color}
      />
      <Text style={[styles.countdownTxt, { color: isCritical ? "#ef4444" : info.color }]}>
        {info.overdue
          ? `Overdue by ${formatCountdown(info.remainingMs)}`
          : `${formatCountdown(info.remainingMs)} remaining`}
      </Text>
    </View>
  );
}

/* ─── Full priority banner for order detail screen ───── */
export function PriorityBanner({ assignedAt }: { assignedAt: string | null | undefined }) {
  const info = useLivePriority(assignedAt);
  if (!assignedAt) return null;
  const isCritical = info.priority === "critical";

  return (
    <PulseView active={isCritical}>
      <View style={[
        styles.banner,
        {
          backgroundColor: isCritical ? "#7f1d1d" : info.bgColor,
          borderColor: info.color + "55",
        },
      ]}>
        {/* Left: priority badge + label */}
        <View style={[styles.bannerLeft, { backgroundColor: info.color + "22" }]}>
          <Feather name={isCritical ? "alert-octagon" : "clock"} size={22} color={info.color} />
          <Text style={[styles.bannerPriorityLabel, { color: info.color }]}>
            {info.label}
          </Text>
          <Text style={[styles.bannerPrioritySub, { color: isCritical ? "#fca5a5" : info.textColor }]}>
            PRIORITY
          </Text>
        </View>

        {/* Right: countdown */}
        <View style={styles.bannerRight}>
          <Text style={[styles.bannerCountdown, { color: isCritical ? "#fca5a5" : info.color }]}>
            {formatCountdown(info.remainingMs)}
          </Text>
          <Text style={[styles.bannerCountdownSub, { color: isCritical ? "#fca5a5cc" : info.textColor }]}>
            {info.overdue ? "OVERDUE" : "REMAINING"}
          </Text>
          <Text style={[styles.bannerDeadline, { color: isCritical ? "#fca5a5aa" : info.textColor + "aa" }]}>
            Due: {new Date(info.deadlineMs).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    </PulseView>
  );
}

const styles = StyleSheet.create({
  /* Badge */
  badge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  badgeTxt: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  /* Countdown line */
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  countdownTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  /* Banner */
  banner: {
    borderRadius: 14, borderWidth: 1.5, flexDirection: "row",
    overflow: "hidden", marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  bannerLeft: {
    width: 90, alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 4,
  },
  bannerPriorityLabel: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  bannerPrioritySub: { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.5, opacity: 0.8 },
  bannerRight: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 16,
    justifyContent: "center", gap: 2,
  },
  bannerCountdown: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  bannerCountdownSub: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  bannerDeadline: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
});
