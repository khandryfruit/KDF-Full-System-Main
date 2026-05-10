import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Switch, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adminFetch, useAuth } from "@/context/AuthContext";

const BG     = "#080D1A";
const CARD   = "#0F1729";
const GOLD   = "#F59E0B";
const GREEN  = "#10B981";
const BORDER = "rgba(255,255,255,0.07)";

const ICON_MAP: Record<string, string> = {
  ecommerce: "shopping-cart", logistics: "truck", riders: "navigation",
  billing: "file-text", whatsapp: "message-circle", marketing: "trending-up",
  analytics: "bar-chart-2", branches: "git-branch", notifications: "bell",
  payments: "credit-card", store: "package", settings: "settings",
};

const COLOR_MAP: Record<string, string> = {
  ecommerce: "#3B82F6", logistics: "#10B981", riders: "#00C562",
  billing: "#F59E0B", whatsapp: "#22C55E", marketing: "#EC4899",
  analytics: "#8B5CF6", branches: "#06B6D4", notifications: "#F97316",
  payments: "#10B981", store: "#6366F1", settings: "#94A3B8",
};

function ModuleCard({ module, onToggle }: { module: any; onToggle: (key: string, enabled: boolean) => void }) {
  const color = COLOR_MAP[module.module_key] ?? GOLD;
  const icon  = ICON_MAP[module.module_key] ?? "box";

  return (
    <View style={[styles.card, !module.is_enabled && styles.cardDisabled]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
        <Feather name={icon as any} size={22} color={module.is_enabled ? color : "rgba(255,255,255,0.2)"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modName, !module.is_enabled && styles.textDim]}>{module.module_name}</Text>
        <Text style={styles.modDesc} numberOfLines={1}>{module.description || ""}</Text>
        <View style={styles.visRow}>
          {module.app_visible && <View style={styles.visBadge}><Feather name="smartphone" size={9} color={GOLD} /><Text style={styles.visTxt}>App</Text></View>}
          {module.web_visible && <View style={styles.visBadge}><Feather name="monitor" size={9} color="#3B82F6" /><Text style={[styles.visTxt, { color: "#3B82F6" }]}>Web</Text></View>}
        </View>
      </View>
      <Switch
        value={module.is_enabled}
        onValueChange={val => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle(module.module_key, val);
        }}
        trackColor={{ false: "rgba(255,255,255,0.1)", true: `${color}60` }}
        thumbColor={module.is_enabled ? color : "rgba(255,255,255,0.35)"}
        ios_backgroundColor="rgba(255,255,255,0.1)"
      />
    </View>
  );
}

export default function AdminModules() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      const res = await adminFetch("/admin/modules", token);
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules ?? []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { fetchModules(); }, [fetchModules]);
  const onRefresh = () => { setRefreshing(true); fetchModules(); };

  const toggleModule = async (key: string, enabled: boolean) => {
    /* Optimistic update */
    setModules(prev => prev.map(m => m.module_key === key ? { ...m, is_enabled: enabled } : m));
    try {
      const res = await adminFetch(`/admin/modules/${key}/toggle`, token, {
        method: "PUT",
        body: JSON.stringify({ is_enabled: enabled }),
      });
      if (!res.ok) {
        /* Revert on failure */
        setModules(prev => prev.map(m => m.module_key === key ? { ...m, is_enabled: !enabled } : m));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setModules(prev => prev.map(m => m.module_key === key ? { ...m, is_enabled: !enabled } : m));
    }
  };

  const enabledCount = modules.filter(m => m.is_enabled).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Module Control</Text>
          <Text style={styles.subtitle}>
            <Text style={{ color: GREEN }}>{enabledCount} enabled</Text>
            {" · "}{modules.length} total
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={16} color={GOLD} />
        </TouchableOpacity>
      </View>

      {/* Banner */}
      <View style={styles.banner}>
        <Feather name="info" size={13} color={GOLD} />
        <Text style={styles.bannerTxt}>Changes sync instantly across web admin and all apps</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={modules}
          keyExtractor={item => item.module_key}
          renderItem={({ item }) => <ModuleCard module={item} onToggle={toggleModule} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  refreshBtn: { padding: 8, backgroundColor: `${GOLD}18`, borderRadius: 12, borderWidth: 1, borderColor: `${GOLD}30` },

  banner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: `${GOLD}10`, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: `${GOLD}20`,
  },
  bannerTxt: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: CARD, borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  cardDisabled: { opacity: 0.55 },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modName: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  textDim: { color: "rgba(255,255,255,0.35)" },
  modDesc: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  visRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  visBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: `${GOLD}10`, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: `${GOLD}20`,
  },
  visTxt: { color: GOLD, fontSize: 9, fontFamily: "Inter_600SemiBold" },
});
