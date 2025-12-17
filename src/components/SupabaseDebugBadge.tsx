// src/components/SupabaseDebugBadge.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  /** Voer een superlichte HEAD-select uit op deze tabel om een 'ping' te doen */
  testTable?: string;
  className?: string;
};

type Conn = "unknown" | "open" | "closed" | "error";

export default function SupabaseDebugBadge({ testTable = "wishlist_items", className }: Props) {
  const [conn, setConn] = useState<Conn>("unknown");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [pingOk, setPingOk] = useState<boolean | null>(null);
  const [sessionMinLeft, setSessionMinLeft] = useState<number | null>(null);
  const [channels, setChannels] = useState<number>(0);

  // realtime events
  useEffect(() => {
    try {
      const rt = (supabase as any).realtime;
      if (!rt) return;

      const onOpen = () => setConn("open");
      const onClose = () => setConn("closed");
      const onError = (e: any) => { setConn("error"); setLastError(String(e?.message ?? e)); };

      rt.onOpen(onOpen);
      rt.onClose(onClose);
      rt.onError(onError);

      // init state
      setChannels((supabase as any).getChannels?.().length ?? 0);

      const t = setInterval(() => {
        setChannels((supabase as any).getChannels?.().length ?? 0);
      }, 3000);

      return () => {
        try { rt.onOpen(null as any); rt.onClose(null as any); rt.onError(null as any); } catch {}
        clearInterval(t);
      };
    } catch (e) {
      setConn("unknown");
      setLastError("Realtime niet beschikbaar");
    }
  }, []);

  // session info (remaining minutes)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const exp = data.session?.expires_at ? data.session.expires_at * 1000 : null;
      if (!alive) return;
      if (exp) {
        const mins = Math.max(0, Math.round((exp - Date.now()) / 60000));
        setSessionMinLeft(mins);
      } else {
        setSessionMinLeft(null);
      }
    })().catch(() => setSessionMinLeft(null));

    const t = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      const exp = data.session?.expires_at ? data.session.expires_at * 1000 : null;
      if (!alive) return;
      if (exp) {
        const mins = Math.max(0, Math.round((exp - Date.now()) / 60000));
        setSessionMinLeft(mins);
      } else {
        setSessionMinLeft(null);
      }
    }, 60_000);

    return () => { alive = false; clearInterval(t); };
  }, []);

  async function ping() {
    setLastError(null);
    setPingOk(null);
    setLastPingAt(Date.now());
    try {
      // superlichte HEAD-query; vereist alleen SELECT rechten op de tabel
      const { error } = await supabase.from(testTable).select("*", { count: "exact", head: true }).limit(1);
      if (error) throw error;
      setPingOk(true);
    } catch (e: any) {
      setPingOk(false);
      setLastError(e?.message ?? String(e));
    }
  }

  const dotClass = useMemo(() => {
    if (conn === "error" || conn === "closed") return "bg-red-500";
    if (conn === "open") {
      if (pingOk === false) return "bg-red-500";
      if (pingOk === true) return "bg-emerald-500";
      return "bg-amber-500";
    }
    return "bg-gray-400";
  }, [conn, pingOk]);

  return (
    <div
      className={["fixed bottom-3 right-3 z-40",
        "rounded-lg border border-border bg-card/90 backdrop-blur p-2.5 shadow",
        "text-xs text-muted-foreground", className].filter(Boolean).join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`} />
        <span className="font-medium text-foreground">Supabase</span>
        <span>•</span>
        <span>{conn}</span>
        <span>•</span>
        <span>chan {channels}</span>
        {sessionMinLeft != null && (
          <>
            <span>•</span>
            <span>session {sessionMinLeft}m</span>
          </>
        )}
        <button
          onClick={ping}
          className="ml-2 px-2 py-0.5 rounded border hover:bg-muted text-foreground"
          title={`Ping op tabel “${testTable}”`}
        >
          Ping
        </button>
      </div>
      {lastPingAt && (
        <div className="mt-1">
          Laatste ping: {new Date(lastPingAt).toLocaleTimeString()} — {pingOk === null ? "…" : pingOk ? "OK" : "FOUT"}
          {lastError && <div className="mt-0.5 text-[11px] text-red-600">⚠ {lastError}</div>}
        </div>
      )}
    </div>
  );
}
