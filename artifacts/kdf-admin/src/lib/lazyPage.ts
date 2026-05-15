import { lazy, type ComponentType } from "react";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

const RELOAD_KEY = "kdf_admin_chunk_reload_v1";

async function importWithChunkRetry<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (err) {
    if (isChunkLoadError(err) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
      return new Promise(() => {});
    }
    throw err;
  }
}

/** Lazy route loader with one automatic hard reload on stale chunk hashes after deploy. */
export function lazyPage<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() => importWithChunkRetry(factory));
}
