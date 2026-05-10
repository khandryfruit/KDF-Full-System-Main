import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Redirect, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import NewOrderAlert, { NewOrderData } from "@/components/NewOrderAlert";
import { AuthProvider, riderFetch, useAuth } from "@/context/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 20_000 } },
});

/* ── Register push token for rider ── */
async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "f5433930-a95c-4ac1-857f-dfdafc2fe4d1",
    });
    return tokenData.data;
  } catch { return null; }
}

/* ── New-Order Monitor (riders only) ── */
function NewOrderMonitor({ children }: { children: React.ReactNode }) {
  const { token, rider } = useAuth();
  const router           = useRouter();
  const qc               = useQueryClient();
  const [alertOrder, setAlertOrder] = useState<NewOrderData | null>(null);
  const knownIds    = useRef<Set<number>>(new Set());
  const initialized = useRef(false);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptBusy  = useRef(false);

  useEffect(() => {
    if (!token || !rider) return;
    registerPushToken().then(async (pushToken) => {
      if (!pushToken) return;
      try {
        await riderFetch("/rider/push-token", token, {
          method: "PUT",
          body: JSON.stringify({ expo_push_token: pushToken }),
        });
      } catch { /* non-critical */ }
    });
  }, [token, !!rider]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as any;
      if (data?.deliveryId) router.push(`/order/${data.deliveryId}` as any);
    });
    return () => { sub.remove(); tapSub.remove(); };
  }, []);

  const checkNewOrders = useCallback(async () => {
    if (!token || !rider) return;
    try {
      const r = await riderFetch("/rider/deliveries?status=assigned&period=active", token);
      if (!r.ok) return;
      const json = await r.json();
      const deliveries: any[] = json.deliveries ?? [];
      if (!initialized.current) {
        deliveries.forEach((d) => knownIds.current.add(d.id));
        initialized.current = true;
        return;
      }
      const newOnes = deliveries.filter((d) => !knownIds.current.has(d.id));
      if (newOnes.length === 0) return;
      newOnes.forEach((d) => knownIds.current.add(d.id));
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
      const newest = newOnes[0];
      setAlertOrder({
        id: newest.id,
        shopify_order_number: newest.shopify_order_number ?? String(newest.id),
        customer_name: newest.customer_name ?? "Customer",
        customer_phone: newest.customer_phone ?? "",
        cod_amount: Number(newest.cod_amount ?? 0),
        is_paid: newest.is_paid ?? false,
        delivery_address: newest.delivery_address ?? "",
        assigned_at: newest.assigned_at ?? new Date().toISOString(),
      });
    } catch { /* silent */ }
  }, [token, !!rider]);

  useEffect(() => {
    if (!token || !rider) {
      initialized.current = false;
      knownIds.current.clear();
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const init = setTimeout(checkNewOrders, 3_000);
    pollRef.current = setInterval(checkNewOrders, 12_000);
    return () => { clearTimeout(init); if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, !!rider, checkNewOrders]);

  const handleAccept = async (id: number) => {
    if (acceptBusy.current) return;
    acceptBusy.current = true;
    setAlertOrder(null);
    try {
      await riderFetch(`/rider/deliveries/${id}/status`, token!, {
        method: "PUT",
        body: JSON.stringify({ status: "picked" }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
    } catch { /* silent */ }
    acceptBusy.current = false;
  };

  return (
    <>
      {children}
      <NewOrderAlert
        order={alertOrder}
        onAccept={handleAccept}
        onView={(id) => { setAlertOrder(null); router.push(`/order/${id}` as any); }}
        onDismiss={() => setAlertOrder(null)}
      />
    </>
  );
}

/* ── Role-based root nav ── */
function RootLayoutNav() {
  const { userRole, loading } = useAuth();
  if (loading) return null;

  return (
    <Stack>
      {/* Rider tabs */}
      <Stack.Screen name="(tabs)"   options={{ headerShown: false }} />
      {/* Admin tabs */}
      <Stack.Screen name="(admin)"  options={{ headerShown: false }} />
      {/* Shared */}
      <Stack.Screen name="login"    options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

/* ── Root redirect based on role ── */
function RoleRedirect() {
  const { userRole, loading } = useAuth();
  if (loading) return null;
  if (userRole === "admin")  return <Redirect href="/(admin)" />;
  if (userRole === "rider")  return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <NewOrderMonitor>
                <RootLayoutNav />
              </NewOrderMonitor>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
