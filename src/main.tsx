import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // <- MOET erin staan
import "./boot/supabase-guard";

// Prevent stale PWA service workers from breaking dev module loading
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
