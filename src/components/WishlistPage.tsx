import { useEffect, useMemo, useState } from "react";
import type { Garden } from "../lib/types";
import { createWishlistItem, deleteWishlistItem, listWishlist, updateWishlistItem, type WishlistItem } from "../lib/api/wishlist";
import { Pencil, Trash2, PlusCircle } from "lucide-react";

function WishlistCard({
  item,
  onEdit,
  onDelete,
}: {
  item: WishlistItem;
  onEdit: (i: WishlistItem) => void;
  onDelete: (i: WishlistItem) => void;
}) {
  return (
    <div className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3">
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <h4 className="font-semibold text-lg truncate">{item.name}</h4>
          {item.notes && (
            <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{item.notes}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(item)}
            className="p-1 text-muted-foreground hover:text-primary"
            title="Bewerken"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(item)}
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Toegevoegd: {new Date(item.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function WishlistEditor({
  gardenId,
  item,
  onClose,
  onSaved,
}: {
  gardenId: string;
  item?: WishlistItem | null;
  onClose: () => void;
  onSaved: (i: WishlistItem) => void;
}) {
  const editing = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");

  async function handleSave() {
    if (!name.trim()) {
      alert("Naam is verplicht.");
      return;
    }
    const payload = {
      garden_id: gardenId,
      name: name.trim(),
      notes: notes.trim() ? notes.trim() : null,
    };
    const saved = editing
      ? await updateWishlistItem(item!.id, payload)
      : await createWishlistItem(payload);
    onSaved(saved);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? "Wens bewerken" : "Nieuwe wens"}</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Sluiten</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm">Naam</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bijv. paarse wortelzaadjes"
            />
          </div>
          <div>
            <label className="text-sm">Notities</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[100px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Waar te kopen, prijs, ras, etc."
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
          >
            {editing ? "Opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WishlistPage({ garden }: { garden: Garden }) {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [editorOpen, setEditorOpen] = useState<{ item: WishlistItem | null } | null>(null);

  useEffect(() => {
    listWishlist(garden.id).then(setItems).catch(console.error);
  }, [garden.id]);

  const sorted = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name)), [items]);

  function upsertLocal(updated: WishlistItem) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === updated.id);
      if (i === -1) return [updated, ...prev];
      const cp = prev.slice();
      cp[i] = updated;
      return cp;
    });
  }

  async function handleDelete(item: WishlistItem) {
    if (!confirm(`“${item.name}” verwijderen uit wishlist?`)) return;
    try {
      await deleteWishlistItem(item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e: any) {
      alert("Verwijderen mislukt: " + (e.message ?? String(e)));
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Wishlist</h2>
        <button
          onClick={() => setEditorOpen({ item: null })}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md"
        >
          <PlusCircle className="h-4 w-4" />
          Nieuw item
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen items. Voeg wensen toe die je later wilt aanschaffen.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              onEdit={(i) => setEditorOpen({ item: i })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <WishlistEditor
          gardenId={garden.id}
          item={editorOpen.item}
          onClose={() => setEditorOpen(null)}
          onSaved={(saved) => {
            upsertLocal(saved);
            setEditorOpen(null);
          }}
        />
      )}
    </div>
  );
}
