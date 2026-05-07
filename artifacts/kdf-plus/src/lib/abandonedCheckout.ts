const SESSION_KEY = "kdf_session_id";

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
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
