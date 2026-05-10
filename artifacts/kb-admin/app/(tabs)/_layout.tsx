import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

const NAV_BG = "#0A0F1E";
const GOLD   = "#F59E0B";
const MUTED  = "rgba(255,255,255,0.30)";

function AdminTabIcon({ name, label, color, focused }: { name: string; label: string; color: string; focused: boolean }) {
  return (
    <View style={focused ? styles.activeTab : styles.inactiveTab}>
      {focused ? (
        <>
          <View style={styles.activeIconWrap}>
            <Feather name={name as any} size={17} color={GOLD} />
          </View>
          <Text style={styles.activeLabel}>{label}</Text>
        </>
      ) : (
        <>
          <Feather name={name as any} size={20} color={color} />
          <Text style={[styles.inactiveLabel, { color }]}>{label}</Text>
        </>
      )}
    </View>
  );
}

export default function AdminTabLayout() {
  const { adminUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={GOLD} size="large" />
      </View>
    );
  }

  if (!adminUser) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: MUTED,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "ios" ? "transparent" : NAV_BG,
          borderTopWidth: 0,
          bottom: Platform.OS === "android" ? 12 : 22,
          left: 16,
          right: 16,
          height: 72,
          borderRadius: 40,
          elevation: 40,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.6,
          shadowRadius: 24,
          paddingHorizontal: 6,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  intensity={95}
                  tint="dark"
                  style={[StyleSheet.absoluteFill, { borderRadius: 40, overflow: "hidden" }]}
                />
              )
            : undefined,
        tabBarItemStyle: { height: 72, paddingVertical: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="grid" label="Dashboard" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="shopping-bag" label="Orders" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="riders"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="navigation" label="Riders" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="whatsapp"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="message-circle" label="WhatsApp" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="modules"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="sliders" label="Modules" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <AdminTabIcon name="user" label="Me" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#080D1A" },
  activeTab: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    backgroundColor: "rgba(245,158,11,0.13)",
    borderRadius: 28, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1.5, borderColor: "rgba(245,158,11,0.28)",
  },
  activeIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(245,158,11,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  activeLabel:    { color: GOLD, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  inactiveTab:    { alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 4 },
  inactiveLabel:  { fontSize: 9, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "uppercase" },
});
