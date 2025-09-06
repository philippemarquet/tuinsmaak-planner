import { useEffect, useMemo, useState } from "react";
import type { Garden, Seed, CropType } from "../lib/types";
import { listSeeds, createSeed, updateSeed, deleteSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { Pencil, Trash2, PlusCircle } from "lucide-react";
import SeedEditor from "./SeedEditor";

function normalizeToHex(color?: string | null): string {
  if (!color) return "#22c55e";
  if (color.startsWith("#")) return color;
  // kleine mapping voor oudere Tailwind-class waardes
  const map: Record<string, string> = {
    "bg-green-500": "#22c55e",
    "bg-blue-500": "#3b82f6",
    "bg-red-500": "#ef4444",
    "bg-yellow-500": "#eab308",
    "bg-purple-500": "#a855f7",
    "bg-emerald-500": "#10b981",
    "bg-orange-500": "#f97316",
  };
  return map[color] ?? "#22c55e";
}

function SeedCard({
  seed,
  cropTypes,
  onEdit,
  onDelete,
}: {
  seed: Seed;
  cropTypes: CropType[];
  onEdit: (s: Seed) => void;
  onDelete: (s: Seed) => void;
}) {
  const ctName = useMemo(
    () => cropTypes.find((c) => c.id === seed.crop_type_id)?.name ?? "—",
    [cropTypes, seed.crop_type_id]
  );
  const hex = normalizeToHex(seed.default_color);

  return (
    <div className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span
            aria-label="kleur"
            className="inline-block w-4 h-4 rounded border"
            style={{ backgroundColor: hex }}
          />
          <div>
            <h4 className="font-semibold text-lg">{seed.name}</h4>
            <p className="text-xs text-muted-foreground">
              Type: {ctName} • Zaaitype: {seed.sowing_type}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(seed)}
            className="p-1 text-muted-foreground hover:text-primary"
            title="Bewerken"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(seed)}
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-muted-foreground">Aangekocht</div>
        <div>{seed.purchase_date ?? "—"}</div>

        <div className="text-muted-foreground">In voorraad</div>
        <div>
          {seed.stock_status === "out" ? (
            <span className="text-red-600">nee</span>
          ) : (
            <span className="text-green-600">ja</span>
          )}
          {typeof seed.stock_quantity === "number" ? ` • ${seed.stock_quantity}` : ""}
        </div>

        <div className="text-muted-foreground">Afstanden</div>
        <div>
          {seed.row_spacing_cm ?? "—"} / {seed.plant_spacing_cm ?? "—"} cm
        </div>

        <div className="text-muted-foreground">Kas geschikt</div>
        <div>{seed.greenhouse_compatible ? "ja" : "nee"}</div>
      </div>
    </div>
  );
}

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [editing, setEditing] = useState<Seed | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    Promise.all([listSeeds(garden.id), listCropTypes()])
      .then(([s, cts]) => {
        setSeeds(s);
        setCropTypes(cts);
      })
      .catch(console.error);
  }, [garden.id]);

  async function handleDelete(seed: Seed) {
    if (!confirm(`Weet je zeker dat je "${seed.name}" wilt verwijderen?`)) return;
    try {
      await deleteSeed(seed.id);
      setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
    } catch (e: any) {
      alert("Kon zaad niet verwijderen: " + (e.message ?? String(e)));
    }
  }

  async function handleSave(newSeed: Partial<Seed>, existing?: Seed | null) {
    try {
      if (existing) {
        const updated = await updateSeed(existing.id, newSeed);
        setSeeds((prev) => prev.map((s) => (s.id === existing.id ? updated : s)));
        setEditing(null);
      } else {
        const created = await createSeed({ ...newSeed, garden_id: garden.id });
        setSeeds((prev) => [created, ...prev]);
        setCreating(false);
      }
    } catch (e: any) {
      alert("Opslaan mislukt: " + (e.message ?? String(e)));
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md"
        >
          <PlusCircle className="h-4 w-4" />
          Nieuw zaad
        </button>
      </div>

      {/* Cards */}
      {seeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen zaden toegevoegd.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {seeds.map((seed) => (
            <SeedCard
              key={seed.id}
              seed={seed}
              cropTypes={cropTypes}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {creating && (
        <SeedEditor
          gardenId={garden.id}
          onClose={() => setCreating(false)}
          onSaved={(s) => handleSave(s, null)}
        />
      )}

      {editing && (
        <SeedEditor
          gardenId={garden.id}
          seed={editing}
          onClose={() => setEditing(null)}
          onSaved={(s) => handleSave(s, editing)}
        />
      )}
    </div>
  );
}
