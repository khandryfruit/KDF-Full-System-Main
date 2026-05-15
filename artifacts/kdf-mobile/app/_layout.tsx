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
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import NewOrderAlert from "@/components/NewOrderAlert";
import { deliveryRowToAlert, pushDataToAlert } from "@/lib/newOrderAlert";
import { AuthProvider, riderFetch, useAuth } from "@/context/AuthContext";
import {
  ensureRiderNotificationChannels,
  isNewOrderPush,
  playNewOrderChime,
  startOnDutyForegroundGuard,
  stopOnDutyForegroundGuard,
} from "@/lib/riderNotifications";
import {
  registerAssignmentBackgroundTask,
  unregisterAssignmentBackgroundTask,
} from "@/tasks/assignmentBackgroundTask";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const isOrder = isNewOrderPush(data);
    if (isOrder) void playNewOrderChime();
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: isOrder,
      shouldSetBadge: true,
    };
  },
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 20_000 } },
});

const POLL_ACTIVE_MS = 5_000;
const POLL_BACKGROUND_MS = 3_000;

async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    await ensureRiderNotificationChannels();
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
  } catch {
    return null;
  }
}

function NewOrderMonitor({ children }: { children: React.ReactNode }) {
  const { token, rider, isOnline } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [alertOrder, setAlertOrder] = useState<ReturnType<typeof deliveryRowToAlert> | null>(null);
  const knownIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptBusy = useRef(false);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    ensureRiderNotificationChannels().catch(() => {});
  }, []);

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
    registerAssignmentBackgroundTask().catch(() => {});
    return () => {
      unregisterAssignmentBackgroundTask().catch(() => {});
    };
  }, [token, !!rider]);

  useEffect(() => {
    if (!token || !rider) {
      stopOnDutyForegroundGuard().catch(() => {});
      return;
    }
    if (isOnline) {
      startOnDutyForegroundGuard().catch(() => {});
    } else {
      stopOnDutyForegroundGuard().catch(() => {});
    }
  }, [token, !!rider, isOnline]);

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
      void playNewOrderChime();
      setAlertOrder(deliveryRowToAlert(newOnes[0] as Record<string, unknown>));
    } catch { /* silent */ }
  }, [token, !!rider, qc]);

  useEffect(() => {
    checkRef.current = checkNewOrders;
  }, [checkNewOrders]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      qc.invalidateQueries({ queryKey: ["rider-deliveries"] });
      qc.invalidateQueries({ queryKey: ["rider-stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (isNewOrderPush(data)) {
        void playNewOrderChime();
        const fromPush = data ? pushDataToAlert(data) : null;
        if (fromPush && !knownIds.current.has(fromPush.id)) {
          knownIds.current.add(fromPush.id);
          setAlertOrder(fromPush);
        }
      }
      void checkRef.current();
    });
    const tapSub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.deliveryId) router.push(`/order/${data.deliveryId}` as any);
    });
    return () => {
      sub.remove();
      tapSub.remove();
    };
  }, [qc, router]);

  const schedulePoll = useCallback(
    (ms: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(checkNewOrders, ms);
    },
    [checkNewOrders],
  );

  useEffect(() => {
    if (!token || !rider) {
      initialized.current = false;
      knownIds.current.clear();
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const init = setTimeout(checkNewOrders, 2_000);
    schedulePoll(POLL_ACTIVE_MS);

    const appSub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === "active") {
        schedulePoll(POLL_ACTIVE_MS);
        void checkNewOrders();
      } else if (prev === "active" && (nextState === "background" || nextState === "inactive")) {
        schedulePoll(POLL_BACKGROUND_MS);
        void checkNewOrders();
      }
    });

    return () => {
      clearTimeout(init);
      if (pollRef.current) clearInterval(pollRef.current);
      appSub.remove();
    };
  }, [token, !!rider, checkNewOrders, schedulePoll]);

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
        onView={(id) => {
          setAlertOrder(null);
          router.push(`/order/${id}` as any);
        }}
        onDismiss={() => setAlertOrder(null)}
      />
    </>
  );
}

function RootLayoutNav() {
  const { rider, loading } = useAuth();
  if (loading) return null;
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="order/invoice" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
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
