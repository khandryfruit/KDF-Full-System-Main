import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isBuild = process.argv.includes("build");

const rawPort = process.env.PORT;
if (!isBuild && !rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = rawPort ? Number(rawPort) : 3000;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Admin is always served at /admin/ (both dev and production).
const basePath = process.env.BASE_PATH ?? "/admin/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Forward /api/* to the API server so Vite does not intercept these requests
    // and return a "public base URL /admin/" error when base !== "/".
    //
    // Proxy target for server-side forwarding (Vite process, not the browser).
    // On Replit: API server runs on localhost:8080 — no env var needed.
    // On Railway: set API_PROXY_TARGET=http://workspaceapi-server.railway.internal:8080
    //   (Railway private network — avoids EAI_AGAIN DNS failures on public hostnames).
    //   VITE_API_BASE_URL is used by the browser for direct calls; this is separate.
    proxy: {
      // Forward /api/* directly to the Express server.
      "/api": {
        target: process.env.API_PROXY_TARGET ?? process.env.VITE_API_BASE_URL ?? "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      // Forward /admin/api/* to Express as well (production-path alias).
      // Express has a /admin/api → /api rewrite middleware that handles these.
      "/admin/api": {
        target: process.env.API_PROXY_TARGET ?? process.env.VITE_API_BASE_URL ?? "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    // Same proxy as dev server — required so vite preview forwards /api to the API service.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? process.env.VITE_API_BASE_URL ?? "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/admin/api": {
        target: process.env.API_PROXY_TARGET ?? process.env.VITE_API_BASE_URL ?? "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
