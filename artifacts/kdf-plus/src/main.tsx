import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const hostname = window.location.hostname;
if (hostname.startsWith("admin.")) {
  window.location.replace("/admin/");
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
