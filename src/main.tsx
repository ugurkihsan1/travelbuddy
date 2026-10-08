import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && location.protocol !== "file:" && !document.querySelector('meta[name="travelbuddy-preview"]') && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(async () => {
      await navigator.serviceWorker.ready;
      window.dispatchEvent(new Event("travelbuddy:offline-status-changed"));
    }).catch(() => {
      // The application still works when the browser disallows offline storage.
      window.dispatchEvent(new Event("travelbuddy:offline-status-changed"));
    });
  });
}
