import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export const BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "");

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as Notifications.NotificationBehavior),
});

export interface Rider {
  id: number;
  name: string;
  phone: string;
  whatsapp_number?: string;
  delivery_area?: string;
  vehicle_type?: string;
  status: string;
  delivery_charge_per_order?: number;
  cnic?: string;
}

interface AuthContextType {
  rider: Rider | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  rider: null,
  token: null,
  loading: true,
  login: async () => ({ ok: false }),
  logout: async () => {},
});

async function registerForPushNotifications(token: string): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", {
        name: "New Orders",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#00B85A",
        sound: "default",
        enableVibrate: true,
        showBadge: true,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "f5433930-a95c-4ac1-857f-dfdafc2fe4d1",
    });
    const pushToken = tokenData.data;
    await AsyncStorage.setItem("kdf_expo_push_token", pushToken);

    await fetch(`${BASE_URL}/api/rider/push-token`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ expo_push_token: pushToken }),
    }).catch(() => {});
  } catch {}
}

async function startLocationTracking(authToken: string): Promise<() => void> {
  if (Platform.OS === "web") return () => {};
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return () => {};
    let stopped = false;
    let failCount = 0;
    const loop = async () => {
      while (!stopped) {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 5,
          });
          failCount = 0;
          await fetch(`${BASE_URL}/api/rider/location`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              speed: loc.coords.speed,
              heading: loc.coords.heading,
            }),
          }).catch(() => {});
        } catch { failCount++; }
        await new Promise(r => setTimeout(r, failCount >= 3 ? 20_000 : 8_000));
      }
    };
    loop();
    return () => { stopped = true; };
  } catch {
    return () => {};
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider,   setRider]   = useState<Rider | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const stopLocationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const riderToken = await AsyncStorage.getItem("kdf_rider_token");
        const riderData  = await AsyncStorage.getItem("kdf_rider_data");
        if (riderToken && riderData) {
          setToken(riderToken);
          setRider(JSON.parse(riderData));
          registerForPushNotifications(riderToken).catch(() => {});
          startLocationTracking(riderToken).then(stop => { stopLocationRef.current = stop; });
        }
      } catch {}
      setLoading(false);
    })();
    return () => { stopLocationRef.current?.(); };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    stopLocationRef.current?.();
    stopLocationRef.current = null;
    try {
      const res = await fetch(`${BASE_URL}/api/rider/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || "Login failed" };
      await AsyncStorage.setItem("kdf_rider_token", data.token);
      await AsyncStorage.setItem("kdf_rider_data", JSON.stringify(data.rider));
      setToken(data.token);
      setRider(data.rider);
      registerForPushNotifications(data.token).catch(() => {});
      startLocationTracking(data.token).then(stop => { stopLocationRef.current = stop; });
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Check your connection." };
    }
  }, []);

  const logout = useCallback(async () => {
    stopLocationRef.current?.();
    stopLocationRef.current = null;
    await AsyncStorage.multiRemove(["kdf_rider_token", "kdf_rider_data", "kdf_expo_push_token"]);
    setToken(null);
    setRider(null);
  }, []);

  return (
    <AuthContext.Provider value={{ rider, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }

export async function riderFetch(path: string, token: string | null, options: RequestInit = {}) {
  return fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
