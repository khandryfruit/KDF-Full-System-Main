import "./apiFetchBootstrap";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AdminErrorBoundary } from "@/components/AdminErrorBoundary";
import { ensureAdminBasePath } from "@/lib/ensureAdminBasePath";

ensureAdminBasePath();

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    '<div style="padding:24px;font-family:system-ui;color:#fff;background:#0f172a">Missing #root — rebuild the admin app.</div>';
} else {
  createRoot(rootEl).render(
    <AdminErrorBoundary>
      <App />
    </AdminErrorBoundary>,
  );
}
