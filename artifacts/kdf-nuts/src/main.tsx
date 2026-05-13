import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

setAuthTokenGetter(() => {
  try { return localStorage.getItem("kdf_token"); } catch { return null; }
});

// On Railway (or any host where VITE_API_BASE_URL is set), point the API
// client at the absolute URL so all generated hooks reach the right server.
// When the var is absent, the client uses relative paths (proxy handles it).
const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (apiBase) {
  setBaseUrl(apiBase.replace(/\/+$/, ""));
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
