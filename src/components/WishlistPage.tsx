import { useEffect, useState } from "react";
import type { Garden } from "../lib/types";
import {
  createWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  type WishlistItem,
} from "../lib/api/wishlist";
import { Plus, Check, Trash2, Star } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { cn } from "../lib/utils";
import { supabase } from "../lib/supabaseClient"; // ← toegevoegd

interface WishlistPageProps {
  garden: Garden;
  wishlistItems: WishlistItem[];
  onDataChange: () => Promise<void>;
}

export function WishlistPage({ garden, wishlistItems, onDataChange }: WishlistPageProps) {
  const [items, setItems] = useState<WishlistItem[]>(wishlistItems);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [creating, setCreating] = useState(false);

  // ---- Status/diagnose (toegevoegd) ----
  const [lastPingAt, setLastPingAt] = useState<string>("—");
  const [pingStatus, setPingStatus] = useState<"idle"|"ok"|"err"|"busy">("idle");
  const [sessionInfo, setSessionInfo] = useState<{ has: boolean; exp?: string }>(
    { has: false, exp: undefined }
  );

  useEffect(() => {
    setItems(wishlistItems);
  }, [wishlistItems]);

  // Afgevinkte IDs uit DB-veld
  const checkedIds = new Set(items.filter(it => it.is_checked).map(it => it.id));

  // ---- Helpers (toegevoegd) ----
  async function checkSessionOnly() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const s = data.session;
    setSessionInfo({
      has: !!s,
      exp: s?.expires_at ? new Date(s.expires_at * 1000).toLocaleTimeString() : undefined,
    });
    return s;
  }

  async function ensureSession() {
    const s = await checkSessionOnly();
    if (!s) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const ss = data.session;
      setSessionInfo({
        has: !!ss,
        exp: ss?.expires_at ? new Date(ss.expires_at * 1000).toLocaleTimeString() : undefined,
      });
    }
  }

  async function pingNow() {
    try {
      setPingStatus("busy");
      // Alleen auth ping (tabel-permissies verschillen per project)
      await checkSessionOnly();
      setPingStatus("ok");
    } catch (e) {
      setPingStatus("err");
    } finally {
      setLastPingAt(new Date().toLocaleTimeString());
      // kleine delay om ‘busy’ niet te laten blijven hangen bij exceptions
      setTimeout(() => setPingStatus((s)=> s==="busy" ? "idle" : s), 150);
    }
  }

  // Automatisch opnieuw pingen wanneer je terugkomt op de tab
  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") pingNow().catch(()=>{});
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    // eerste ping bij mount
    pingNow().catch(()=>{});
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, []);

  // ---- CRUD met sessie-borging (toegevoegd: ensureSession()) ----
  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string)?.trim();
    const notes = (fd.get("notes") as string)?.trim() || null;
    if (!name) return;

    try {
      await ensureSession();
      await createWishlistItem({ garden_id: garden.id, name, notes });
      await onDataChange();
      setCreating(false);
    } catch (err: any) {
      alert("Toevoegen mislukt: " + (err?.message ?? String(err)));
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
      await ensureSession();
      await updateWishlistItem(editing.id, { name, notes });
      await onDataChange();
      setEditing(null);
    } catch (err: any) {
      alert("Opslaan mislukt: " + (err?.message ?? String(err)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je dit item wilt verwijderen?")) return;
    try {
      await ensureSession();
      await deleteWishlistItem(id);
      await onDataChange();
    } catch (err: any) {
      alert("Verwijderen mislukt: " + (err?.message ?? String(err)));
    }
  }

  async function toggleCheck(id: string) {
    const item = items.find(it => it.id === id);
    if (!item) return;

    try {
      await ensureSession();
      await updateWishlistItem(id, { is_checked: !item.is_checked });
      await onDataChange();
    } catch (err: any) {
      alert("Bijwerken mislukt: " + (err?.message ?? String(err)));
    }
  }

  async function deleteAllChecked() {
    if (checkedIds.size === 0) return;
    if (!confirm(`Weet je zeker dat je ${checkedIds.size} afgevinkte item(s) wilt verwijderen?`)) return;

    try {
      await ensureSession();
      await Promise.all(Array.from(checkedIds).map((id) => deleteWishlistItem(id)));
      await onDataChange();
    } catch (err: any) {
      alert("Verwijderen mislukt: " + (err?.message ?? String(err)));
    }
  }

  // Gescheiden lijsten
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

        {/* Kleine statusbalk (toegevoegd) */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs px-2 py-1 rounded border",
              sessionInfo.has ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-700 border-gray-200"
            )}
            title={sessionInfo.exp ? `Session exp: ${sessionInfo.exp}` : "Geen sessie"}
          >
            Sessies: {sessionInfo.has ? "actief" : "geen"}{sessionInfo.exp ? ` • exp ${sessionInfo.exp}` : ""}
          </span>
          <span
            className={cn(
              "text-xs px-2 py-1 rounded border",
              pingStatus === "ok" ? "bg-blue-50 text-blue-700 border-blue-200" :
              pingStatus === "err" ? "bg-red-50 text-red-700 border-red-200" :
              pingStatus === "busy" ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-gray-50 text-gray-600 border-gray-200"
            )}
          >
            Ping: {pingStatus === "busy" ? "…" : pingStatus === "ok" ? "OK" : pingStatus === "err" ? "ERROR" : "—"}{lastPingAt !== "—" ? ` • ${lastPingAt}` : ""}
          </span>
          <button
            onClick={pingNow}
            className="px-2 py-1 text-xs rounded border hover:bg-muted"
          >
            Ping
          </button>
          <button
            onClick={async ()=>{ try { await supabase.auth.refreshSession(); await pingNow(); } catch(e:any){ alert("Refresh faalde: " + (e?.message ?? String(e))); }}}
            className="px-2 py-1 text-xs rounded border hover:bg-muted"
          >
            Refresh sessie
          </button>

          {/* bestaande knoppen */}
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
          {/* Unchecked items */}
          {uncheckedItems.map((it) => (
            <div
              key={it.id}
              className="border rounded-lg p-3 bg-card flex items-center gap-3 hover:bg-accent/30 transition-colors"
            >
              {/* Check button */}
              <button
                onClick={() => toggleCheck(it.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition-colors"
                title="Markeer als afgevinkt"
              >
                <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
              </button>

              {/* Content - clickable to edit */}
              <button
                onClick={() => setEditing(it)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm font-medium">{it.name}</div>
                {it.notes && (
                  <div className="text-xs text-muted-foreground truncate">{it.notes}</div>
                )}
              </button>

              {/* Delete button */}
              <button
                onClick={() => handleDelete(it.id)}
                className="flex-shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Verwijderen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Checked items */}
          {checkedItems.map((it) => (
            <div
              key={it.id}
              className="border rounded-lg p-3 bg-muted/50 flex items-center gap-3 opacity-60"
            >
              {/* Checked indicator */}
              <button
                onClick={() => toggleCheck(it.id)}
                className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-green-500 bg-green-500 flex items-center justify-center hover:bg-green-600 hover:border-green-600 transition-colors"
                title="Klik om af te vinken ongedaan te maken"
              >
                <Check className="w-3 h-3 text-white" />
              </button>

              {/* Content */}
              <button
                onClick={() => toggleCheck(it.id)}
                className="flex-1 text-left min-w-0"
                title="Klik om af te vinken ongedaan te maken"
              >
                <div className="text-sm font-medium line-through">{it.name}</div>
                {it.notes && (
                  <div className="text-xs text-muted-foreground truncate line-through">{it.notes}</div>
                )}
              </button>

              {/* Delete button */}
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
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
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
              <input
                name="name"
                defaultValue={editing?.name}
                className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/20 px-0 py-2 text-base font-medium placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none transition-colors"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notities</label>
              <textarea
                name="notes"
                defaultValue={editing?.notes ?? ""}
                className="w-full bg-muted/20 border-0 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/50"
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-2 border-t border-border/30">
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Opslaan
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
