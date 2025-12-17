// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as integratedClient } from "../integrations/supabase/client";

// ---- Start with Lovable’s integrated client, but allow hot-swaps later
let _client: SupabaseClient = integratedClient;

// Export a proxy so existing `import { supabase } from "../lib/supabaseClient"`
// continues to work even after we swap the underlying instance.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop, _r) {
    const v = (_client as any)[prop];
    return typeof v === "function" ? v.bind(_client) : v;
  },
}) as SupabaseClient;

// ----------------- Diagnostics & reset helpers -----------------
function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

/** Lightweight ping to detect “stuck” client */
export async function pingSupabase(ms = 8000): Promise<{ ok: boolean; why?: string }> {
  try {
    const [{ data: s }, { data: u }] = await Promise.all([
      withTimeout(supabase.auth.getSession(), ms),
      withTimeout(supabase.auth.getUser(), ms),
    ]);
    return { ok: !!s.session && !!u.user };
  } catch (e: any) {
    return { ok: false, why: e?.message || String(e) };
  }
}

/** Rebuild the underlying client without breaking imports */
export async function hardResetSupabase(reason = "unknown"): Promise<void> {
  // Stop old auto-refresh loop (best-effort; available in supabase-js v2)
  try { /* @ts-ignore */ _client.auth.stopAutoRefresh?.(); } catch {}

  // Prefer environment (Lovable/Vite), fall back to current env
  const URL = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
  const ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!URL || !ANON) {
    // If env is missing, keep using the integrated client (can’t rebuild safely)
    if (import.meta.env?.DEV) {
      console.warn("[supabase] hardReset requested but VITE_SUPABASE_URL/ANON not set; reusing integrated client");
    }
    _client = integratedClient;
    return;
  }

  const fresh = createClient(URL, ANON, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  });

  _client = fresh;

  // Hydrate and restart refresh loop (best-effort)
  try { await _client.auth.getSession(); /* @ts-ignore */ _client.auth.startAutoRefresh?.(); } catch {}

  if (import.meta.env?.DEV) console.warn("[supabase] hard reset applied:", reason);
}

// Optional: expose start/stop in case you need it elsewhere
export function startAutoRefresh() { /* @ts-ignore */ _client.auth.startAutoRefresh?.(); }
export function stopAutoRefresh()  { /* @ts-ignore */ _client.auth.stopAutoRefresh?.(); }
