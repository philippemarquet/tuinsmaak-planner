import { useEffect, useState, useRef } from "react";
import type { Garden } from "../lib/types";
import {
  createWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  type WishlistItem,
} from "../lib/api/wishlist";
import { Plus, Check, Trash2, Star, AlertCircle, Play, Pause } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { supabase } from "../lib/supabaseClient";

interface WishlistPageProps {
  garden: Garden;
  wishlistItems: WishlistItem[];
  onDataChange: () => Promise<void>;
}

type PingState = "idle" | "busy" | "ok" | "err";

export function WishlistPage({ garden, wishlistItems, onDataChange }: WishlistPageProps) {
  const [items, setItems] = useState<WishlistItem[]>(wishlistItems);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [creating, setCreating] = useState(false);

  // ---------- Sessiedebug ----------
  const [pingStatus, setPingStatus] = useState<PingState>("idle");
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<{ has: boolean; exp?: string; userEmail?: string }>({
    has: false,
    exp: undefined,
    userEmail: undefined,
  });
  const [autoRefreshActive, setAutoRefreshActive] = useState<boolean>(false);

  type LogLine = { t: string; msg: string };
  const [authEvents, setAuthEvents] = useState<LogLine[]>([]);
  const [visEvents, setVisEvents] = useState<LogLine[]>([]);
  const authSubRef = useRef<ReturnType<typeof supabase.auth.onAuthStateChange> | null>(null);

  const now = () => new Date().toLocaleTimeString();

  function pushAuth(msg: string) {
    setAuthEvents((prev) => [{ t: now(), msg }, ...prev].slice(0, 12));
  }
  function pushVis(msg: string) {
    setVisEvents((prev) => [{ t: now(), msg }, ...prev].slice(0, 12));
  }

  function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  async function pingNow() {
    try {
      setPingStatus("busy");
      const [{ data: sData }, { data: uData }] = await Promise.all([
        withTimeout(supabase.auth.getSession(), 12000),
        withTimeout(supabase.auth.getUser(), 12000),
      ]);

      const s = sData.session;
      setSessionInfo({
        has: !!s,
        exp: s?.expires_at ? new Date(s.expires_at * 1000).toLocaleTimeString() : undefined,
        userEmail: uData.user?.email ?? undefined,
      });

      setPingStatus("ok");
    } catch (e: any) {
      setPingStatus("err");
    } finally {
      setLastPingAt(now());
    }
  }

  async function refreshOnce() {
    setRefreshResult("…");
    try {
      const { data, error } = await withTimeout(supabase.auth.refreshSession(), 12000);
      if (error) {
        setRefreshResult(`ERROR: ${error.message}`);
        pushAuth(`refreshSession ERROR: ${error.message}`);
        return;
      }
      const s = data.session;
      setSessionInfo((old) => ({
        has: !!s,
        exp: s?.expires_at ? new Date(s.expires_at * 1000).toLocaleTimeString() : old.exp,
        userEmail: old.userEmail,
      }));
      setRefreshResult(`OK • new exp ${s?.expires_at ? new Date(s.expires_at * 1000).toLocaleTimeString() : "?"}`);
      pushAuth("refreshSession OK");
    } catch (e: any) {
      setRefreshResult(`ERROR: ${e?.message || String(e)}`);
      pushAuth(`refreshSession TIMEOUT/ERR`);
    }
  }

  function startAutoRefresh() {
    // Alleen aanwezig in supabase-js v2; optioneel aanroepen
    // @ts-expect-error: method kan ontbreken afhankelijk van versie
    supabase.auth.startAutoRefresh?.();
    setAutoRefreshActive(true);
    pushAuth("startAutoRefresh()");
  }
  function stopAutoRefresh() {
    // @ts-expect-error: method kan ontbreken afhankelijk van versie
    supabase.auth.stopAutoRefresh?.();
    setAutoRefreshActive(false);
    pushAuth("stopAutoRefresh()");
  }

  useEffect(() => {
    // Auth event stream
    authSubRef.current = supabase.auth.onAuthStateChange((event, session) => {
      const exp = session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : "—";
      pushAuth(`${event}${session ? ` • exp ${exp}` : ""}`);
    });

    // Visibility observe + “kick” bij visible (diagnostisch)
    const onVis = async () => {
      const state = document.visibilityState; // 'visible' | 'hidden'
      pushVis(`visibility: ${state}`);

      if (state === "visible") {
        // “Kick” autoRefresh en haal meteen de session op (observatie, geen schema-wijziging)
        // @ts-expect-error
        supabase.auth.startAutoRefresh?.();
        setAutoRefreshActive(true);
        try {
          const { data } = await supabase.auth.getSession();
          const s = data.session;
          setSessionInfo((old) => ({
            has: !!s,
            exp: s?.expires_at ? new Date(s.expires_at * 1000).toLocaleTimeString() : old.exp,
            userEmail: old.userEmail,
          }));
          pushVis(`getSession on visible: ${s ? "has session" : "no session"}`);
        } catch {
          pushVis("getSession on visible: ERROR");
        }
      } else {
        // @ts-expect-error
        supabase.auth.stopAutoRefresh?.();
        setAutoRefreshActive(false);
      }
    };

    document.addEventListener("visibilitychange", onVis);
    // init
    onVis();

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      authSubRef.current?.data?.subscription?.unsubscribe?.();
    };
  }, []);
  // ---------- einde sessiedebug ----------

  useEffect(() => {
    setItems(wishlistItems);
  }, [wishlistItems]);

  const checkedIds = new Set(items.filter((it) => it.is_checked).map((it) => it.id));

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    const notes = (fd.get("notes") as string)?.trim() || null;
    if (!name) return;

    try {
      await createWishlistItem({ garden_id: garden.id, name, notes });
      await onDataChange();
      setCreating(false);
    } catch (err: any) {
      alert("Toevoegen mislukt: " + err.message);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    const notes = (fd.get("notes") as string)?.trim() || null;
    if (!name) return;

    try {
      await updateWishlistItem(editing.id, { name, notes });
      await onDataChange();
      setEditing(null);
    } catch (err: any) {
      alert("Opslaan mislukt: " + err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je dit item wilt verwijderen?")) return;
    try {
      await deleteWishlistItem(id);
      await onDataChange();
    } catch (err: any) {
      alert("Verwijderen mislukt: " + err.message);
    }
  }

  async function toggleCheck(id: string) {
    const item = items.find((it) => it.id === id);
    if (!item) return;

    try {
      await updateWishlistItem(id, { is_checked: !item.is_checked });
      await onDataChange();
    } catch (err: any) {
      alert("Bijwerken mislukt: " + err.message);
    }
  }

  async function deleteAllChecked() {
    if (checkedIds.size === 0) return;
    if (!confirm(`Weet je zeker dat je ${checkedIds.size} afgevinkte item(s) wilt verwijderen?`)) return;

    try {
      await Promise.all(Array.from(checkedIds).map((id) => deleteWishlistItem(id)));
      await onDataChange();
    } catch (err: any) {
      alert("Verwijderen mislukt: " + err.message);
    }
  }

  const uncheckedItems = items.filter((it) => !checkedIds.has(it.id));
  const checkedItems = items.filter((it) => checkedIds.has(it.id));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-500" />
          Wishlist
        </h2>
        <div className="flex items-center gap-2">
          {checkedIds.size > 0 && (
            <button
              onClick={deleteAllChecked}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Afgevinkte verwijderen ({checkedIds.size})
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Toevoegen
          </button>
        </div>
      </div>

      {/* DEBUG: Supabase sessiestatus + event logs */}
      <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>
              Sessies: {sessionInfo.has ? "actief" : "—"}
              {sessionInfo.exp ? ` • exp ${sessionInfo.exp}` : ""}
              {sessionInfo.userEmail ? ` • ${sessionInfo.userEmail}` : " • unknown"}
              {` • autoRefresh: ${autoRefreshActive ? "aan" : "uit"}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={pingNow}
              className="px-2 py-1 rounded border hover:bg-muted"
              title="supabase.auth.getSession() + getUser()"
            >
              Ping {pingStatus === "busy" ? "…" : pingStatus === "ok" ? "OK" : pingStatus === "err" ? "ERR" : ""}
            </button>
            <button
              onClick={refreshOnce}
              className="px-2 py-1 rounded border hover:bg-muted"
              title="supabase.auth.refreshSession()"
            >
              Refresh sessie
            </button>
            <button
              onClick={startAutoRefresh}
              className="px-2 py-1 rounded border hover:bg-muted flex items-center gap-1"
              title="test: start auto refresh"
            >
              <Play className="w-3 h-3" /> AutoRefresh
            </button>
            <button
              onClick={stopAutoRefresh}
              className="px-2 py-1 rounded border hover:bg-muted flex items-center gap-1"
              title="test: stop auto refresh"
            >
              <Pause className="w-3 h-3" /> AutoRefresh
            </button>
          </div>
        </div>
        <div className="text-muted-foreground">
          Laatste ping: {lastPingAt ? `${pingStatus === "ok" ? "OK" : pingStatus === "err" ? "ERR" : "…"} • ${lastPingAt}` : "—"}
          {" • "}
          Laatste refresh: {refreshResult ?? "—"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div>
            <div className="font-semibold mb-1">Auth-events</div>
            <div className="rounded border bg-background max-h-40 overflow-auto">
              {authEvents.length === 0 ? (
                <div className="p-2 text-muted-foreground">—</div>
              ) : (
                authEvents.map((l, i) => (
                  <div key={i} className="px-2 py-1 border-b last:border-b-0">
                    <span className="text-muted-foreground">{l.t}</span> • {l.msg}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div className="font-semibold mb-1">Visibility</div>
            <div className="rounded border bg-background max-h-40 overflow-auto">
              {visEvents.length === 0 ? (
                <div className="p-2 text-muted-foreground">—</div>
              ) : (
                visEvents.map((l, i) => (
                  <div key={i} className="px-2 py-1 border-b last:border-b-0">
                    <span className="text-muted-foreground">{l.t}</span> • {l.msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Star className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Nog geen wensen. Voeg er hierboven één toe.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Unchecked */}
          {uncheckedItems.map((it) => (
            <div
              key={it.id}
              className="border rounded-lg p-3 bg-card flex items-center gap-3 hover:bg-accent/30 transition-colors"
            >
              <button
                onClick={() => toggleCheck(it.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors"
                title="Markeer als afgevinkt"
              >
                <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
              </button>

              <button onClick={() => setEditing(it)} className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium">{it.name}</div>
                {it.notes && <div className="text-xs text-muted-foreground truncate">{it.notes}</div>}
              </button>

              <button
                onClick={() => handleDelete(it.id)}
                className="flex-shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Verwijderen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Checked */}
          {checkedItems.map((it) => (
            <div key={it.id} className="border rounded-lg p-3 bg-muted/50 flex items-center gap-3 opacity-60">
              <button
                onClick={() => toggleCheck(it.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-green-500 bg-green-500 flex items-center justify-center hover:bg-green-600 hover:border-green-600 transition-colors"
                title="Klik om af te vinken ongedaan te maken"
              >
                <Check className="w-3 h-3 text-white" />
              </button>

              <button onClick={() => toggleCheck(it.id)} className="flex-1 text-left min-w-0" title="Klik om af te vinken ongedaan te maken">
                <div className="text-sm font-medium line-through">{it.name}</div>
                {it.notes && <div className="text-xs text-muted-foreground truncate line-through">{it.notes}</div>}
              </button>

              <button
                onClick={() => handleDelete(it.id)}
                className="flex-shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Verwijderen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md p-0 gap-0 bg-card/95 backdrop-blur-md border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 bg-gradient-to-r from-amber-500/10 to-transparent">
            <h3 className="text-lg font-semibold">Nieuw wensitem</h3>
          </div>
          <form onSubmit={handleCreate} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Naam *</label>
              <input
                name="name"
                className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/20 px-0 py-2 text-base font-medium placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="Bijv. 'Bosbessen'"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notities</label>
              <textarea
                name="notes"
                className="w-full bg-muted/20 border-0 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/50"
                placeholder="Optioneel"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <div className="flex-1" />
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                Annuleren
              </button>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Toevoegen
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md p-0 gap-0 bg-card/95 backdrop-blur-md border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 bg-gradient-to-r from-amber-500/10 to-transparent">
            <h3 className="text-lg font-semibold">Wensitem bewerken</h3>
          </div>
          <form onSubmit={handleUpdate} className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Naam *</label>
              <input name="name" defaultValue={editing?.name} className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/20 px-0 py-2 text-base font-medium placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none transition-colors" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notities</label>
              <textarea name="notes" defaultValue={editing?.notes ?? ""} className="w-full bg-muted/20 border-0 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/50" rows={2} />
            </div>
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <div className="flex-1" />
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                Annuleren
              </button>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                Opslaan
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
