import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/context/AuthContext";

const NAV_BG = "#0A1628";
const GREEN = "#00C562";
const MUTED = "rgba(255,255,255,0.38)";

function TabIcon({
  name,
  label,
  focused,
}: {
  name: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Feather
          name={name as any}
          size={20}
          color={focused ? "#fff" : MUTED}
        />
        {focused && <View style={styles.glow} />}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>
        {label}
      </Text>
      {focused && <View style={styles.activeDot} />}
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
          bottom: Platform.OS === "android" ? 14 : 24,
          left: 20,
          right: 20,
          height: 70,
          borderRadius: 36,
          elevation: 32,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
          paddingHorizontal: 0,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarBackground:
          Platform.OS === "ios"
            ? () => (
                <BlurView
                  intensity={90}
                  tint="dark"
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: 36, overflow: "hidden" },
                  ]}
                />
              )
            : undefined,
        tabBarItemStyle: {
          height: 70,
          paddingVertical: 0,
          flex: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" label="HOME" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="package" label="ORDERS" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="dollar-sign" label="EARN" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="user" label="ME" focused={focused} />
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

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 6,
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  iconWrapActive: {
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 8,
  },

  glow: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,197,98,0.25)",
    transform: [{ scale: 1.5 }],
  },

  label: {
    color: MUTED,
    fontSize: 8.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textAlign: "center",
  },

  labelActive: {
    color: GREEN,
  },

  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: GREEN,
    marginTop: 1,
  },
});
