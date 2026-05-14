import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Fixed dev/preview ports only in this file (see kdf-admin vite.config for Railpack note).
const DEV_PORT = 5173;
const PREVIEW_PORT = 8080;

const basePath = process.env.BASE_PATH ?? "/";

// On Railway: set API_PROXY_TARGET=http://workspaceapi-server.railway.internal:8080
// Locally: falls back to the shared Replit proxy (api-server on PORT 8080)
const proxyTarget =
  process.env.API_PROXY_TARGET ??
  process.env.VITE_API_BASE_URL ??
  "http://localhost:8080";

const proxy = {
  "/api": { target: proxyTarget, changeOrigin: true, secure: false },
};

export default defineConfig(async ({ command }) => ({
  base: basePath,
  plugins: [
    react({ jsxRuntime: "automatic" }),
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
  esbuild:
    command === "build"
      ? { legalComments: "none", drop: ["debugger"] as ("debugger")[] }
      : undefined,
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
          if (id.includes("react-helmet-async")) return "vendor-helmet";
          if (id.includes("wouter")) return "vendor-router";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("embla-carousel")) return "vendor-carousel";
        },
      },
    },
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy,
    fs: {
      strict: true,
    },
  },
  preview: {
    port: PREVIEW_PORT,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy,
  },
}));
