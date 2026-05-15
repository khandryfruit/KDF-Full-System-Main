import { Audio } from "expo-av";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

/** Android channel with custom sound (v3.0.2+). Legacy `new_order` used system default. */
export const RIDER_ORDER_CHANNEL_ID = "new_order_alert";
export const RIDER_ORDER_SOUND = "new_order.wav";

const ON_DUTY_NOTIFICATION_ID = "kdf-rider-on-duty";

let chimeSound: Audio.Sound | null = null;

export async function ensureRiderNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync(RIDER_ORDER_CHANNEL_ID, {
    name: "New delivery assignments",
    description: "High-priority alerts with KDF new-order tone",
    importance: Notifications.AndroidImportance.MAX,
    sound: RIDER_ORDER_SOUND,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    enableVibrate: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
    lightColor: "#00B85A",
  });

  await Notifications.setNotificationChannelAsync("orders", {
    name: "Order updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#00B85A",
    sound: "default",
    enableVibrate: true,
    showBadge: true,
  });
}

/** Plays bundled chime (foreground/background JS alive). Complements push notification sound. */
export async function playNewOrderChime(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      interruptionModeAndroid: 1,
      interruptionModeIOS: 1,
    });
    if (chimeSound) {
      await chimeSound.unloadAsync().catch(() => {});
      chimeSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/audio/new_order.wav"),
      { shouldPlay: true, volume: 1.0 },
    );
    chimeSound = sound;
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (chimeSound === sound) chimeSound = null;
      }
    });
  } catch {
    /* OS notification sound is fallback */
  }
}

export async function presentNewOrderLocalNotification(params: {
  title: string;
  body: string;
  deliveryId?: number;
  orderNumber?: string;
}): Promise<void> {
  await ensureRiderNotificationChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      sound: RIDER_ORDER_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        type: "new_order",
        deliveryId: params.deliveryId != null ? String(params.deliveryId) : "",
        orderId: params.orderNumber ?? "",
      },
      ...(Platform.OS === "android" ? { channelId: RIDER_ORDER_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

/** Persistent low-priority notification while on duty — reduces OEM killing the app process. */
export async function startOnDutyForegroundGuard(): Promise<void> {
  if (Platform.OS !== "android" || !Device.isDevice) return;
  await ensureRiderNotificationChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: ON_DUTY_NOTIFICATION_ID,
    content: {
      title: "KDF Rider — On duty",
      body: "Listening for new assignments. Allow notifications & disable battery restrictions.",
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      sticky: true,
      autoDismiss: false,
      data: { type: "on_duty_guard" },
      ...(Platform.OS === "android" ? { channelId: RIDER_ORDER_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function stopOnDutyForegroundGuard(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(ON_DUTY_NOTIFICATION_ID);
  } catch { /* ignore */ }
  try {
    await Notifications.cancelScheduledNotificationAsync(ON_DUTY_NOTIFICATION_ID);
  } catch { /* ignore */ }
}

/** Samsung / Xiaomi / others: open app settings so rider can disable battery optimization. */
export function openNotificationAndBatterySettings(): void {
  if (Platform.OS === "android") {
    Linking.openSettings().catch(() => {});
  } else {
    Linking.openURL("app-settings:").catch(() => {});
  }
}

export function isNewOrderPush(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const t = data.type;
  if (t === "new_order") return true;
  if (data.deliveryId != null || data.orderId != null) return true;
  return false;
}
