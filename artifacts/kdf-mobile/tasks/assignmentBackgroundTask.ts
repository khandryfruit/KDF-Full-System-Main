import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import {
  playNewOrderChime,
  presentNewOrderLocalNotification,
} from "@/lib/riderNotifications";

function riderApiOrigin(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";
  return fromEnv || "https://api.khanbabadryfruits.com";
}

export const ASSIGNMENT_BG_TASK = "kdf-rider-assignment-check";

const KNOWN_KEY = "kdf_known_assigned_delivery_ids";

async function loadKnownIds(): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(KNOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function saveKnownIds(ids: Set<number>): Promise<void> {
  const trimmed = [...ids].slice(-200);
  await AsyncStorage.setItem(KNOWN_KEY, JSON.stringify(trimmed));
}

TaskManager.defineTask(ASSIGNMENT_BG_TASK, async () => {
  try {
    const token = await AsyncStorage.getItem("kdf_rider_token");
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const res = await fetch(
      `${riderApiOrigin()}/api/rider/deliveries?status=assigned&period=active`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

    const json = (await res.json()) as { deliveries?: { id: number; shopify_order_number?: string; customer_name?: string }[] };
    const deliveries = json.deliveries ?? [];
    const known = await loadKnownIds();

    if (known.size === 0) {
      deliveries.forEach((d) => known.add(d.id));
      await saveKnownIds(known);
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const newOnes = deliveries.filter((d) => !known.has(d.id));
    if (newOnes.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData;

    newOnes.forEach((d) => known.add(d.id));
    await saveKnownIds(known);

    const newest = newOnes[0];
    await presentNewOrderLocalNotification({
      title: "🚚 نیا آرڈر ملا!",
      body: `Order #${newest.shopify_order_number ?? newest.id} — ${(newest as { customer_name?: string }).customer_name ?? "Customer"}`,
      deliveryId: newest.id,
      orderNumber: String(newest.shopify_order_number ?? newest.id),
    });
    await playNewOrderChime();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerAssignmentBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) return;

    const registered = await TaskManager.isTaskRegisteredAsync(ASSIGNMENT_BG_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(ASSIGNMENT_BG_TASK, {
        minimumInterval: 60 * 5,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    /* OEM may block background fetch */
  }
}

export async function unregisterAssignmentBackgroundTask(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(ASSIGNMENT_BG_TASK);
    if (registered) await BackgroundFetch.unregisterTaskAsync(ASSIGNMENT_BG_TASK);
  } catch { /* ignore */ }
}
