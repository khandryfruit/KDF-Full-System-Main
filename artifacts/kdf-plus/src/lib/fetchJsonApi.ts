import { getPublicApiOrigin } from "@/lib/apiOrigin";

/** Build absolute API URL (works even if fetch patch fails on some mobile browsers). */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const origin = getPublicApiOrigin().replace(/\/+$/, "");
  return origin ? `${origin}${p}` : p;
}

export async function fetchJsonApi<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: string }).message)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  if (body && typeof body === "object" && "error" in body && !("id" in body)) {
    throw new Error(String((body as { error?: string }).error ?? "Request failed"));
  }
  return body as T;
}
