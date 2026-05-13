import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isBuild = process.argv.includes("build");

// PORT is only meaningful for dev/preview servers, not during `vite build`.
// When deploying on Railway, set PORT=8080 as an explicit service variable so
// Railpack can inject it at build time (even though isBuild=true means it isn't
// actually used). Railway also overrides PORT at runtime automatically.
const rawPort = process.env.PORT;
if (!isBuild && !rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = rawPort ? Number(rawPort) : 3000;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Admin is always served at /admin/ (both dev and production).
// On Railway set BASE_PATH=/ to serve from the root domain.
const basePath = process.env.BASE_PATH ?? "/admin/";

// Proxy target for Vite's dev/preview server-side proxy.
// On Replit: api-server runs on localhost:8080 (no var needed).
// On Railway: set API_PROXY_TARGET=http://workspaceapi-server.railway.internal:8080
const proxyTarget =
  process.env.API_PROXY_TARGET ??
  process.env.VITE_API_BASE_URL ??
  "http://localhost:8080";

const proxy = {
  "/api": { target: proxyTarget, changeOrigin: true, secure: false },
  "/admin/api": { target: proxyTarget, changeOrigin: true, secure: false },
};

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
    target: "es2018",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@tanstack/react-query")) return "vendor-rq";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
    proxy,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy,
  },
});
