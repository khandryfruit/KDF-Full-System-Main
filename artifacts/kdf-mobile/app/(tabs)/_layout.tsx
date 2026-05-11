import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/context/AuthContext";

const NAV_BG  = "#0A1628";
const GREEN   = "#00C562";
const MUTED   = "rgba(255,255,255,0.35)";

function TabIcon({
  name, label, color, focused,
}: { name: string; label: string; color: string; focused: boolean }) {
  return (
    <View style={focused ? styles.activeTab : styles.inactiveTab}>
      {focused ? (
        <>
          <View style={styles.activeIconWrap}>
            <Feather name={name as any} size={18} color={GREEN} />
          </View>
          <Text style={styles.activeLabel}>{label}</Text>
        </>
      ) : (
        <>
          <Feather name={name as any} size={20} color={color} />
          <Text style={[styles.inactiveLabel, { color }]} numberOfLines={1}>{label}</Text>
        </>
      )}
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
          bottom: Platform.OS === "android" ? 12 : 22,
          left: 16,
          right: 16,
          height: 72,
          borderRadius: 40,
          elevation: 40,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.55,
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
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: 40, overflow: "hidden" },
                  ]}
                />
              )
            : undefined,
        tabBarItemStyle: {
          height: 72,
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
    backgroundColor: "#080F1E",
  },

  /* Active tab — pill with icon + label side by side */
  activeTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(0,197,98,0.14)",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: "rgba(0,197,98,0.30)",
  },
  activeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(0,197,98,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeLabel: {
    color: "#00C562",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  /* Inactive tab — icon stacked above label */
  inactiveTab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 4,
  },
  inactiveLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    flexShrink: 0,
    textAlign: "center",
  },
});
