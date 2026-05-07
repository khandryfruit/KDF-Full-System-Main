import { createRoot } from "react-dom/client";
import App from "./App";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import "./index.css";

setAuthTokenGetter(() => localStorage.getItem("kdf_token"));

createRoot(document.getElementById("root")!).render(<App />);
