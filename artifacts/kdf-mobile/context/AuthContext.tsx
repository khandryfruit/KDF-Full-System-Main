import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
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
  }),
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("kdf_rider_token");
        const savedRider = await AsyncStorage.getItem("kdf_rider_data");
        if (saved && savedRider) {
          setToken(saved);
          setRider(JSON.parse(savedRider));
          /* Re-register push token on app restart (token can change) */
          registerForPushNotifications(saved).catch(() => {});
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
    };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
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
      /* Register push token after successful login */
      registerForPushNotifications(data.token).catch(() => {});
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error. Check your connection." };
    }
  }, []);

  const logout = useCallback(async () => {
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
