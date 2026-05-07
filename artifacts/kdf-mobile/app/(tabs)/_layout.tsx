import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/context/AuthContext";

const NAV_BG  = "#0A1628";
const GREEN   = "#00C562";
const MUTED   = "rgba(255,255,255,0.28)";

function TabIcon({ name, label, color, focused }: { name: string; label: string; color: string; focused: boolean }) {
  return (
    <View style={focused ? styles.activeTab : styles.inactiveTab}>
      <Feather name={name as any} size={focused ? 20 : 19} color={color} />
      {focused && <Text style={styles.activeLabel}>{label}</Text>}
    </View>
  );
}

export default function TabLayout() {
  const { rider, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={GREEN} size="large" />
      </View>
    );
  }

  if (!rider) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GREEN,
        tabBarInactiveTintColor: MUTED,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.OS === "ios" ? "transparent" : NAV_BG,
          borderTopWidth: 0,
          bottom: Platform.OS === "android" ? 16 : 24,
          left: 20,
          right: 20,
          height: 68,
          borderRadius: 36,
          elevation: 30,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.45,
          shadowRadius: 20,
          paddingHorizontal: 8,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarBackground: Platform.OS === "ios"
          ? () => (
              <BlurView
                intensity={90}
                tint="dark"
                style={[StyleSheet.absoluteFill, { borderRadius: 36, overflow: "hidden" }]}
              />
            )
          : undefined,
        tabBarItemStyle: {
          height: 68,
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" label="Home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="package" label="Orders" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="dollar-sign" label="Earnings" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="user" label="Profile" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A1628",
  },
  activeTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(0,197,98,0.15)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(0,197,98,0.25)",
  },
  inactiveTab: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
  },
  activeLabel: {
    color: "#00C562",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
