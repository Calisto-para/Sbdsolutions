import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "../styles.css";
import "./platform.css";
import "./design-v3.css";
import "./home-v2.css";
import "./brand-2026.css";
import "./dashboard-v3.css";
import "./pwa.css";

/* The installable app and Firebase push share one service worker. Register it
   in production builds only, so the Vite dev server keeps its live reload. */
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  (window.location.protocol === "https:" || window.location.hostname === "localhost")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
