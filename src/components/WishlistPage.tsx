import { useEffect, useState } from "react";
import type { Garden } from "../lib/types";
import {
  createWishlistItem,
  updateWishlistItem,
  deleteWishlistItem,
  type WishlistItem,
} from "../lib/api/wishlist";
import { Pencil, Trash2, PlusCircle, X } from "lucide-react";

interface WishlistPageProps {
  garden: Garden;
  wishlistItems: WishlistItem[];
  onDataChange: () => Promise<void>;
}

export function WishlistPage({ garden, wishlistItems, onDataChange }: WishlistPageProps) {
  const [items, setItems] = useState<WishlistItem[]>(wishlistItems);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setItems(wishlistItems);
  }, [wishlistItems]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Wishlist</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-md"
        >
          <PlusCircle className="h-4 w-4" />
          Nieuw wensitem
        </button>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen wensen. Voeg er hierboven één toe.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((it) => (
            <div
              key={it.id}
              className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-lg">{it.name}</h4>
                  {it.notes && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {it.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(it)}
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Bewerken"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(it.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Toegevoegd op {new Date(it.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <Modal title="Nieuw wensitem" onClose={() => setCreating(false)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Naam</label>
              <input
                name="name"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="Bijv. ‘Bosbessen’"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notities</label>
              <textarea
                name="notes"
                className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]"
                placeholder="Optioneel"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-3 py-2 rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Toevoegen
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Wensitem bewerken" onClose={() => setEditing(null)}>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Naam</label>
              <input
                name="name"
                defaultValue={editing.name}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notities</label>
              <textarea
                name="notes"
                defaultValue={editing.notes ?? ""}
                className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-2 rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Opslaan
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
