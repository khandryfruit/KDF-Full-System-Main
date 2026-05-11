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
  isOnline: boolean;
  toggleOnline: (online: boolean) => Promise<void>;
  login: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  rider: null,
  token: null,
  loading: true,
  isOnline: false,
  toggleOnline: async () => {},
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
      await Notifications.setNotificationChannelAsync("new_order", {
        name: "New Orders",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400, 200, 400],
        lightColor: "#00B85A",
        sound: "default",
        enableVibrate: true,
        showBadge: true,
        bypassDnd: true,
      });
      await Notifications.setNotificationChannelAsync("orders", {
        name: "Order Updates",
        importance: Notifications.AndroidImportance.HIGH,
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
  const [rider,    setRider]    = useState<Rider | null>(null);
  const [token,    setToken]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const stopLocationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const riderToken = await AsyncStorage.getItem("kdf_rider_token");
        const riderData  = await AsyncStorage.getItem("kdf_rider_data");
        const onlineStr  = await AsyncStorage.getItem("kdf_rider_online");
        if (riderToken && riderData) {
          setToken(riderToken);
          setRider(JSON.parse(riderData));
          if (onlineStr !== null) setIsOnline(onlineStr === "true");
          registerForPushNotifications(riderToken).catch(() => {});
          startLocationTracking(riderToken).then(stop => { stopLocationRef.current = stop; });
          /* Sync online status from server */
          fetch(`${BASE_URL}/api/rider/auth/me`, {
            headers: { Authorization: `Bearer ${riderToken}` },
          })
            .then(r => r.json())
            .then(d => {
              if (typeof d?.rider?.is_online === "boolean") {
                setIsOnline(d.rider.is_online);
                AsyncStorage.setItem("kdf_rider_online", String(d.rider.is_online)).catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch {}
      setLoading(false);
    })();
    return () => { stopLocationRef.current?.(); };
  }, []);

  const toggleOnline = useCallback(async (online: boolean) => {
    setIsOnline(online);
    await AsyncStorage.setItem("kdf_rider_online", String(online)).catch(() => {});
    const t = token ?? (await AsyncStorage.getItem("kdf_rider_token"));
    if (!t) return;
    fetch(`${BASE_URL}/api/rider/online`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ is_online: online }),
    }).catch(() => {});
  }, [token]);

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
      /* Fetch actual is_online from server after login */
      fetch(`${BASE_URL}/api/rider/auth/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      })
        .then(r => r.json())
        .then(d => {
          const online = d?.rider?.is_online ?? false;
          setIsOnline(online);
          AsyncStorage.setItem("kdf_rider_online", String(online)).catch(() => {});
        })
        .catch(() => {});
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
    await AsyncStorage.removeItem("kdf_rider_token");
    await AsyncStorage.removeItem("kdf_rider_data");
    await AsyncStorage.removeItem("kdf_expo_push_token");
    await AsyncStorage.removeItem("kdf_rider_online");
    setToken(null);
    setRider(null);
    setIsOnline(false);
  }, []);

  return (
    <AuthContext.Provider value={{ rider, token, loading, isOnline, toggleOnline, login, logout }}>
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
