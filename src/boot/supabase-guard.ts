// src/boot/supabase-guard.ts
import { supabase, pingSupabase, hardResetSupabase, startAutoRefresh, stopAutoRefresh } from "../lib/supabaseClient";

let started = false;
let visiblePingTimer: number | null = null;
let consecutiveFailures = 0;

function log(...args: any[]) {
  if (import.meta.env.DEV) console.log("[supabase-guard]", ...args);
}

async function kick(reason: string) {
  log("kick:", reason);
  try {
    startAutoRefresh();
  } catch {}

  const res = await pingSupabase(8000);
  if (res.ok) {
    consecutiveFailures = 0;
    log("ping OK after kick");
    return;
  }

  consecutiveFailures++;
  log("ping FAIL after kick:", res.why);
  // If it failed immediately, try a hard reset right away
  await hardResetSupabase(`kick-fail:${reason}`);
}

async function periodicPing() {
  const res = await pingSupabase(8000);
  if (res.ok) {
    consecutiveFailures = 0;
    return;
  }
  consecutiveFailures++;
  log("periodic ping failed:", res.why, "count=", consecutiveFailures);

  // Two consecutive failures → rebuild client
  if (consecutiveFailures >= 2) {
    await hardResetSupabase("periodic-ping-fail");
    consecutiveFailures = 0;
  }
}

function onVisible() {
  log("visible");
  // kick immediately when returning visible
  kick("visible");
  // start periodic ping every 2 minutes while visible
  if (visiblePingTimer == null) {
    visiblePingTimer = window.setInterval(periodicPing, 2 * 60 * 1000) as unknown as number;
  }
}

function onHidden() {
  log("hidden");
  if (visiblePingTimer != null) {
    clearInterval(visiblePingTimer);
    visiblePingTimer = null;
  }
  try {
    stopAutoRefresh();
  } catch {}
}

function setup() {
  if (started) return;
  started = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onVisible();
    else onHidden();
  });

  // Initial state
  if (document.visibilityState === "visible") onVisible();
  else onHidden();

  // Auth event log (optional)
  supabase.auth.onAuthStateChange((event, session) => {
    const exp = session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : "—";
    log("auth:", event, "exp:", exp);
    if (event === "TOKEN_REFRESHED") consecutiveFailures = 0;
  });

  // expose tiny diag helper
  (window as any).__SUPABASE_DIAG__ = {
    ping: () => pingSupabase().then((r) => (log("manual ping ->", r), r)),
    reset: () => hardResetSupabase("manual"),
  };

  log("installed");
}

setup();
