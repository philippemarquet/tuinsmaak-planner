import { useEffect, useMemo, useState } from "react";
import type { Garden, Seed, CropType } from "../lib/types";
import { createSeed, updateSeed, deleteSeed } from "../lib/api/seeds";
import { Pencil, Trash2, Copy, PlusCircle } from "lucide-react";
import { SeedModal } from "./SeedModal";

/* ---------- helpers ---------- */

function sowingTypeLabel(v?: string) {
  switch ((v || "").toLowerCase()) {
    case "direct": return "Direct";
    case "presow": return "Voorzaai";
    case "both":  return "Beide";
    default:      return "—";
  }
}

function nextCopyName(name: string) {
  if (!name) return "Nieuw zaad (kopie)";
  if (/\(kopie\)$/i.test(name)) return `${name} 2`;
  return `${name} (kopie)`;
}

/* ---------- kaartje ---------- */

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
  // na migratie -> boolean in_stock
  const inStock = (seed as any).in_stock !== false;

  const stockBadgeText = inStock ? "In voorraad" : "Niet op voorraad";
  const stockBadgeClass = inStock ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";

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
            Zaaitype: {sowingTypeLabel(seed.sowing_type)}
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
      </div>
    </div>
  );
}

/* ---------- pagina ---------- */

export function InventoryPage({ 
  garden,
  seeds: initialSeeds,
  cropTypes: initialCropTypes,
  onDataChange
}: { 
  garden: Garden;
  seeds: Seed[];
  cropTypes: CropType[];
  onDataChange: () => Promise<void>;
}) {
  const [seeds, setSeeds] = useState<Seed[]>(initialSeeds);
  const [cropTypes, setCropTypes] = useState<CropType[]>(initialCropTypes);
  const [editorOpen, setEditorOpen] = useState<{ seed: Seed | null } | null>(null);

  // filters
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [cropTypeFilter, setCropTypeFilter] = useState<string>("all");
  const [q, setQ] = useState<string>(() => localStorage.getItem("inventoryQ") ?? "");

  // Sync met centrale data
  useEffect(() => {
    setSeeds(initialSeeds);
    setCropTypes(initialCropTypes);
  }, [initialSeeds, initialCropTypes]);

  useEffect(() => {
    localStorage.setItem("inventoryQ", q);
  }, [q]);

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
      await onDataChange();
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
        row_spacing_cm: seed.row_spacing_cm ?? null,
        plant_spacing_cm: seed.plant_spacing_cm ?? null,
        greenhouse_compatible: !!seed.greenhouse_compatible,
        sowing_type: seed.sowing_type ?? "direct",
        presow_duration_weeks: seed.presow_duration_weeks ?? null,
        grow_duration_weeks: seed.grow_duration_weeks ?? null,
        harvest_duration_weeks: seed.harvest_duration_weeks ?? null,
        presow_months: seed.presow_months ?? [],
        direct_plant_months: (seed as any).direct_plant_months ?? (seed as any).direct_sow_months ?? [],
        harvest_months: seed.harvest_months ?? [],
        notes: seed.notes ?? null,
        default_color: seed.default_color ?? "#22c55e",
      };
      const created = await createSeed(payload);
      upsertLocal(created);
      await onDataChange();
    } catch (e: any) {
      alert("Dupliceren mislukt: " + (e.message ?? String(e)));
    }
  }

  // filters toepassen
  const filtered = useMemo(() => {
    let arr = seeds.slice();

    // tekst-zoek (case-insensitive, op naam)
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(term));
    }

    if (inStockOnly) {
      arr = arr.filter((s: any) => (s as any).in_stock !== false);
    }
    if (cropTypeFilter !== "all") {
      if (cropTypeFilter === "__none__") {
        arr = arr.filter((s) => !s.crop_type_id);
      } else {
        arr = arr.filter((s) => s.crop_type_id === cropTypeFilter);
      }
    }

    return arr;
  }, [seeds, inStockOnly, cropTypeFilter, q]);

  // groepering op gewastype
  const groups = useMemo(() => {
    const nameById = new Map<string, string>(cropTypes.map(ct => [ct.id, ct.name]));
    const map = new Map<string, { label: string; items: Seed[] }>();

    for (const s of filtered) {
      const key = s.crop_type_id || "__none__";
      const label = s.crop_type_id ? (nameById.get(s.crop_type_id) || "Onbekend") : "Overig";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(s);
    }

    // sorteer groepen en items binnen groep
    const out = Array.from(map.entries())
      .sort(([, A], [, B]) => A.label.localeCompare(B.label, "nl"))
      .map(([id, g]) => ({
        id,
        label: g.label,
        items: g.items.slice().sort((a, b) => a.name.localeCompare(b.name, "nl")),
      }));

    return out;
  }, [filtered, cropTypes]);

  return (
    <div className="space-y-8">
      {/* header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">Voorraad</h2>

        <div className="flex flex-wrap items-center gap-3">
          {/* zoekveld */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek op naam…"
            className="w-48 md:w-64 border rounded-md px-2 py-1 text-sm"
          />

          <label className="inline-flex items-center gap-2 text-sm border rounded-md px-2 py-1">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            In voorraad
          </label>

          <select
            className="border rounded-md px-2 py-1 text-sm"
            value={cropTypeFilter}
            onChange={(e) => setCropTypeFilter(e.target.value)}
          >
            <option value="all">Alle gewastypen</option>
            {cropTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
            <option value="__none__">Overig (geen soort)</option>
          </select>

          <button
            onClick={() => setEditorOpen({ seed: null })}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md"
          >
            <PlusCircle className="h-4 w-4" />
            Nieuw zaad
          </button>
        </div>
      </div>

      {/* gegroepeerde kaarten */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen zaden gevonden.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="space-y-3">
            <h3 className="text-xl font-semibold">
              {g.label} <span className="text-sm text-muted-foreground">({g.items.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {g.items.map((seed) => (
                <SeedCard
                  key={seed.id}
                  seed={seed}
                  onEdit={(s) => setEditorOpen({ seed: s })}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {editorOpen && (
        <SeedModal
          gardenId={garden.id}
          seed={(editorOpen.seed as any) || ({} as any)}
          onClose={() => setEditorOpen(null)}
          onSaved={async (saved) => {
            upsertLocal(saved);
            setEditorOpen(null);
            await onDataChange();
          }}
        />
      )}
    </div>
  );
}

export default InventoryPage;
