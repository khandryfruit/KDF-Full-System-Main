const SESSION_KEY = "kdf_session_id";

function safeUUID(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      return (crypto as any).randomUUID();
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      arr[6] = (arr[6] & 0x0f) | 0x40;
      arr[8] = (arr[8] & 0x3f) | 0x80;
      return Array.from(arr, (b) => b.toString(16).padStart(2, "0"))
        .join("")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    }
  } catch {}
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = safeUUID();
      try { localStorage.setItem(SESSION_KEY, id); } catch {}
    }
    return id;
  } catch {
    return safeUUID();
  }
}

export interface AbandonedCartItem {
  productId: number;
  name: string;
  price: string;
  qty: number;
  variant?: string;
  variantLabel?: string;
  image?: string;
}

export interface TrackPayload {
  sessionId: string;
  userId?: number;
  customerName?: string;
  phone?: string;
  cartItems: AbandonedCartItem[];
  subtotal: number;
  checkoutStep: "cart" | "checkout" | "address" | "payment";
}

let trackTimer: ReturnType<typeof setTimeout> | null = null;

export function trackAbandonedCheckout(payload: TrackPayload): void {
  if (trackTimer) clearTimeout(trackTimer);
  trackTimer = setTimeout(async () => {
    try {
      await fetch("/api/abandoned-checkouts/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // never break the UX
    }
  }, 1500);
}

export async function markCheckoutRecovered(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/abandoned-checkouts/recover/${sessionId}`, {
      method: "POST",
    });
  } catch {
    // silent
  }
}
