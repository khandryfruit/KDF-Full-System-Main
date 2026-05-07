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

/* ── Set foreground notification behaviour ── */
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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  rider: null,
  token: null,
  loading: true,
  login: async () => ({ ok: false }),
  logout: () => {},
});

async function registerForPushNotifications(token: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (!Device.isDevice) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return;

    /* Create Android notification channel */
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("new_order", {
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

    const expoPushToken = tokenData.data;

    /* Save locally */
    await AsyncStorage.setItem("kdf_expo_push_token", expoPushToken);

    /* Send to server */
    await fetch(`${BASE_URL}/api/rider/push-token`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    }).catch(() => {});
  } catch {}
}

/* ── Background location push (every 15s when logged in) ── */
async function startLocationTracking(authToken: string): Promise<() => void> {
  if (Platform.OS === "web") return () => {};
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return () => {};

    let stopped = false;

    const loop = async () => {
      while (!stopped) {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await fetch(`${BASE_URL}/api/rider/location`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
          }).catch(() => {});
        } catch {}
        await new Promise(r => setTimeout(r, 15_000));
      }
    };

    loop();
    return () => { stopped = true; };
  } catch {
    return () => {};
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const stopLocationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("kdf_rider_token");
        const savedRider = await AsyncStorage.getItem("kdf_rider_data");
        if (saved && savedRider) {
          setToken(saved);
          setRider(JSON.parse(savedRider));
          registerForPushNotifications(saved).catch(() => {});
          /* Start location tracking on app resume */
          startLocationTracking(saved).then(stop => {
            stopLocationRef.current = stop;
          });
        }
      } catch {}
      setLoading(false);
    })();

    /* Foreground notification listener */
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      /* App is in foreground — notification shown via handler above */
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      stopLocationRef.current?.();
    };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    /* Stop any existing location loop */
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
      /* Start location tracking after login */
      startLocationTracking(data.token).then(stop => {
        stopLocationRef.current = stop;
      });
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
    setToken(null);
    setRider(null);
  }, []);

  return (
    <AuthContext.Provider value={{ rider, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function riderFetch(path: string, token: string | null, options: RequestInit = {}) {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  return res;
}
