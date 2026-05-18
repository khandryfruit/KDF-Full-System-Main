type IndexableType = "product" | "category" | "blog" | "page";

async function googleIndexingFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem("kdf_admin_token") ?? "";
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `Indexing failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function indexContentNow(type: IndexableType, id: number | string) {
  return googleIndexingFetch<{ ok: boolean; queued: number; skipped: number; url?: string }>(
    "/api/admin/seo/indexing/index-now",
    {
      method: "POST",
      body: JSON.stringify({ type, id }),
    },
  );
}

export function indexSelectedContent(type: Exclude<IndexableType, "page">, ids: Array<number | string>) {
  return googleIndexingFetch<{ ok: boolean; queued: number; skipped: number; message: string }>(
    "/api/admin/seo/indexing/index-selected",
    {
      method: "POST",
      body: JSON.stringify({ type, ids }),
    },
  );
}
