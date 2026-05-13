import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const DEV_PORT = 5173;
const PREVIEW_PORT = 8080;

// BASE_PATH defaults to "/app/" so Railway deployments work without setting this var.
const basePath = process.env.BASE_PATH ?? "/app/";

export default defineConfig({
  base: basePath ?? "/",
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
    port: DEV_PORT,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // On Replit: API server runs on localhost:8080 — no env var needed.
    // On Railway: set API_PROXY_TARGET=https://api.khanbabadryfruits.com
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: PREVIEW_PORT,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
