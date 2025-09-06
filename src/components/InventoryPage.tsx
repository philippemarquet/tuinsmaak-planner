import { useEffect, useMemo, useState } from "react";
import type { Garden, Seed } from "../lib/types";
import { listSeeds, createSeed, updateSeed, deleteSeed } from "../lib/api/seeds";
import { Pencil, Trash2, Copy, PlusCircle } from "lucide-react";
import SeedEditor from "./SeedEditor";

function SeedCard({
  seed,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  seed: Seed;
  onEdit: (s: Seed) => void;
  onDelete: (s: Seed) => void;
  onDuplicate: (s: Seed) => void;
}) {
  const stockBadgeText = seed.stock_status === "out" ? "Niet op voorraad" : "In voorraad";
  const stockBadgeClass =
    seed.stock_status === "out"
      ? "bg-red-100 text-red-700"
      : "bg-emerald-100 text-emerald-700";

  const colorDot =
    seed.default_color && seed.default_color.startsWith("#") ? (
      <span
        className="inline-block w-3.5 h-3.5 rounded"
        style={{ backgroundColor: seed.default_color }}
        title="Standaardkleur"
      />
    ) : (
      <span
        className={`inline-block w-3.5 h-3.5 rounded ${seed.default_color ?? "bg-green-500"}`}
        title="Standaardkleur"
      />
    );

  return (
    <div className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 min-w-0">
          {colorDot}
          <div className="min-w-0">
            <h4 className="font-semibold text-lg truncate">{seed.name}</h4>
            <p className="text-xs text-muted-foreground">
              {seed.purchase_date ? `Aangekocht: ${seed.purchase_date}` : "Aankoopdatum: —"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onDuplicate(seed)}
            className="p-1 text-muted-foreground hover:text-primary"
            title="Dupliceren"
          >
            <Copy className="h-4 w-4" />
          </button>
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

      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded ${stockBadgeClass}`}>{stockBadgeText}</span>
        {seed.sowing_type && (
          <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
            Zaaitype: {seed.sowing_type}
          </span>
        )}
        {seed.greenhouse_compatible && (
          <span className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">
            Geschikt voor kas
          </span>
        )}
      </div>

      <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
        <div>Rijafstand: {seed.row_spacing_cm ?? "—"} cm</div>
        <div>Plantafstand: {seed.plant_spacing_cm ?? "—"} cm</div>
        <div>Voorzaai: {seed.presow_duration_weeks ?? "—"} wkn</div>
        <div>Groei→oogst: {seed.grow_duration_weeks ?? "—"} wkn</div>
        <div>Oogstduur: {seed.harvest_duration_weeks ?? "—"} wkn</div>
        <div>Aantal: {seed.stock_quantity ?? 0}</div>
      </div>
    </div>
  );
}

function nextCopyName(name: string) {
  if (!name) return "Nieuw zaad (kopie)";
  if (/\(kopie\)$/i.test(name)) return `${name} 2`;
  return `${name} (kopie)`;
}

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [editorOpen, setEditorOpen] = useState<{ seed: Seed | null } | null>(null);

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
  }, [garden.id]);

  const sortedSeeds = useMemo(
    () => seeds.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [seeds]
  );

  function upsertLocal(updated: Seed) {
    setSeeds((prev) => {
      const i = prev.findIndex((s) => s.id === updated.id);
      if (i === -1) return [...prev, updated];
      const next = prev.slice();
      next[i] = updated;
      return next;
    });
  }

  async function handleDelete(seed: Seed) {
    if (!confirm(`Zaad “${seed.name}” verwijderen?`)) return;
    try {
      await deleteSeed(seed.id);
      setSeeds((prev) => prev.filter((s) => s.id !== seed.id));
    } catch (e: any) {
      alert("Kon zaad niet verwijderen: " + (e.message ?? String(e)));
    }
  }

  async function handleDuplicate(seed: Seed) {
    try {
      const payload: Partial<Seed> = {
        garden_id: garden.id,
        name: nextCopyName(seed.name),
        crop_type_id: seed.crop_type_id ?? null,
        purchase_date: seed.purchase_date ?? null,
        stock_status: seed.stock_status ?? "adequate",
        stock_quantity: seed.stock_quantity ?? 0,
        row_spacing_cm: seed.row_spacing_cm ?? null,
        plant_spacing_cm: seed.plant_spacing_cm ?? null,
        greenhouse_compatible: !!seed.greenhouse_compatible,
        sowing_type: seed.sowing_type ?? "both",
        presow_duration_weeks: seed.presow_duration_weeks ?? null,
        grow_duration_weeks: seed.grow_duration_weeks ?? null,
        harvest_duration_weeks: seed.harvest_duration_weeks ?? null,
        presow_months: seed.presow_months ?? [],
        direct_sow_months: seed.direct_sow_months ?? [],
        plant_months: seed.plant_months ?? [],
        harvest_months: seed.harvest_months ?? [],
        notes: seed.notes ?? null,
        default_color: seed.default_color ?? "#22c55e",
      };
      const created = await createSeed(payload);
      upsertLocal(created);
    } catch (e: any) {
      alert("Dupliceren mislukt: " + (e.message ?? String(e)));
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <button
          onClick={() => setEditorOpen({ seed: null })}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md"
        >
          <PlusCircle className="h-4 w-4" />
          Nieuw zaad
        </button>
      </div>

      {sortedSeeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen zaden toegevoegd.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedSeeds.map((seed) => (
            <SeedCard
              key={seed.id}
              seed={seed}
              onEdit={(s) => setEditorOpen({ seed: s })}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <SeedEditor
          gardenId={garden.id}
          seed={editorOpen.seed}
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
