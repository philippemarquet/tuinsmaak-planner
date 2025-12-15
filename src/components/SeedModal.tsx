import { useEffect, useState } from "react";
import type { Seed, CropType, UUID } from "../lib/types";
import { createSeed, updateSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { MonthSelector } from "./MonthSelector";
import { ColorField } from "./ColorField";

interface SeedModalProps {
  gardenId: UUID;
  seed: Partial<Seed>;            // leeg bij nieuw
  onClose: () => void;
  onSaved: (seed: Seed) => void;  // geeft aangemaakte/geüpdatete seed terug
}

export function SeedModal({ gardenId, seed, onClose, onSaved }: SeedModalProps) {
  const editing = !!seed.id;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Seed>>({
    garden_id: gardenId,
    name: seed.name ?? "",
    crop_type_id: seed.crop_type_id ?? null,
    purchase_date: seed.purchase_date ?? "",
    row_spacing_cm: seed.row_spacing_cm ?? null,
    plant_spacing_cm: seed.plant_spacing_cm ?? null,
    greenhouse_compatible: seed.greenhouse_compatible ?? false, // ← al aanwezig in state
    sowing_type: (seed.sowing_type === "presow" ? "presow" : "direct"),

    presow_duration_weeks: seed.presow_duration_weeks ?? null,
    grow_duration_weeks: seed.grow_duration_weeks ?? null,
    harvest_duration_weeks: seed.harvest_duration_weeks ?? null,

    presow_months: seed.presow_months ?? [],
    greenhouse_months: (seed as any).greenhouse_months ?? [],
    direct_plant_months: (seed as any).direct_plant_months ?? (seed as any).direct_sow_months ?? [],
    harvest_months: seed.harvest_months ?? [],

    default_color: seed.default_color ?? null,
    notes: seed.notes ?? "",
    in_stock: (seed as any).in_stock !== false,
  });

  useEffect(() => {
    // Haal cropTypes op en sla ze op in localStorage als backup
    const fetchCropTypes = async () => {
      try {
        const types = await listCropTypes();
        setCropTypes(types);
        localStorage.setItem('cached_crop_types', JSON.stringify(types));
      } catch (err) {
        console.error('Failed to fetch crop types:', err);
        // Gebruik cached data als fallback
        const cached = localStorage.getItem('cached_crop_types');
        if (cached) {
          setCropTypes(JSON.parse(cached));
        }
      }
    };

    fetchCropTypes();

    // Herlaad cropTypes wanneer de tab weer actief wordt
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCropTypes();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  function handleChange<K extends keyof Seed>(field: K, value: Seed[K] | any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<Seed> = {
        ...form,
        crop_type_id: form.crop_type_id || null,
        purchase_date: form.purchase_date || null,
        row_spacing_cm:
          !form.row_spacing_cm || String(form.row_spacing_cm) === ""
            ? null
            : Number(form.row_spacing_cm),
        plant_spacing_cm:
          !form.plant_spacing_cm || String(form.plant_spacing_cm) === ""
            ? null
            : Number(form.plant_spacing_cm),
        presow_duration_weeks: !form.presow_duration_weeks || String(form.presow_duration_weeks) === "" ? null : Number(form.presow_duration_weeks),
        grow_duration_weeks: !form.grow_duration_weeks || String(form.grow_duration_weeks) === "" ? null : Number(form.grow_duration_weeks),
        harvest_duration_weeks: !form.harvest_duration_weeks || String(form.harvest_duration_weeks) === "" ? null : Number(form.harvest_duration_weeks),
        greenhouse_months: form.greenhouse_compatible ? ((form as any).greenhouse_months ?? []) : [],
        notes: form.notes || null,
        // greenhouse_compatible + in_stock gaan al mee via ...form
        // default_color verwacht #hex (ColorField regelt conversie)
      };

      const saved = editing
        ? await updateSeed(seed.id as UUID, payload)
        : await createSeed(payload);

      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg p-4 w-full max-w-xl space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold">
          {editing ? "Zaad bewerken" : "Nieuw zaad"}
        </h3>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </div>
        )}

        {/* Naam + type + kleur */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-0.5">Naam</label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-0.5">Kleur</label>
            <ColorField
              value={form.default_color ?? undefined}
              onChange={(hex) => handleChange("default_color", hex)}
              compact
            />
          </div>
        </div>

        {/* Type + Aankoopdatum */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-0.5">Gewastype</label>
            <select
              value={form.crop_type_id ?? ""}
              onChange={(e) => handleChange("crop_type_id", e.target.value || null)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="">— Kies —</option>
              {cropTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-0.5">Aankoopdatum</label>
            <input
              type="date"
              value={form.purchase_date ?? ""}
              onChange={(e) => handleChange("purchase_date", e.target.value || null)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        {/* Checkboxes inline */}
        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={form.in_stock ?? true}
              onChange={(e) => handleChange("in_stock", e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span className="text-xs">In voorraad</span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!form.greenhouse_compatible}
              onChange={(e) => handleChange("greenhouse_compatible", e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span className="text-xs">Geschikt voor kas</span>
          </label>
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-xs">Zaaitype:</label>
            <select
              value={form.sowing_type ?? "direct"}
              onChange={(e) => handleChange("sowing_type", e.target.value)}
              className="border rounded px-1.5 py-0.5 text-xs"
            >
              <option value="direct">Direct</option>
              <option value="presow">Voorzaaien</option>
            </select>
          </div>
        </div>

        {/* Afstanden + Duur - compact 6-kolommen */}
        <div className="grid grid-cols-6 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Rij cm</label>
            <input
              type="number"
              value={form.row_spacing_cm ?? ""}
              onChange={(e) => handleChange("row_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded px-1.5 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Plant cm</label>
            <input
              type="number"
              value={form.plant_spacing_cm ?? ""}
              onChange={(e) => handleChange("plant_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded px-1.5 py-1 text-sm"
            />
          </div>
          <div className="border-l pl-2">
            <label className="block text-xs text-muted-foreground mb-0.5">Voorzaai wk</label>
            <input
              type="number"
              value={form.presow_duration_weeks ?? ""}
              onChange={(e) => handleChange("presow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded px-1.5 py-1 text-sm disabled:opacity-50"
              disabled={form.sowing_type === 'direct'}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Groei wk</label>
            <input
              type="number"
              value={form.grow_duration_weeks ?? ""}
              onChange={(e) => handleChange("grow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded px-1.5 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Oogst wk</label>
            <input
              type="number"
              value={form.harvest_duration_weeks ?? ""}
              onChange={(e) => handleChange("harvest_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded px-1.5 py-1 text-sm"
            />
          </div>
        </div>

        {/* Maanden-selectors - compact */}
        <div className="space-y-1.5 pt-1 border-t">
          <MonthSelector
            label="Voorzaaien"
            value={(form.presow_months ?? []) as number[]}
            onChange={(val) => handleChange("presow_months", val)}
            disabled={form.sowing_type === 'direct'}
          />
          <MonthSelector
            label="In de kas"
            value={((form as any).greenhouse_months ?? []) as number[]}
            onChange={(val) => handleChange("greenhouse_months", val)}
            disabled={!form.greenhouse_compatible}
          />
          <MonthSelector
            label="Volle grond"
            value={(form.direct_plant_months ?? []) as number[]}
            onChange={(val) => handleChange("direct_plant_months", val)}
          />
          <MonthSelector
            label="Oogsten"
            value={(form.harvest_months ?? []) as number[]}
            onChange={(val) => handleChange("harvest_months", val)}
          />
        </div>

        {/* Notities */}
        <div>
          <label className="block text-xs font-medium mb-0.5">Notities</label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
            rows={2}
          />
        </div>

        {/* Acties */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-sm border border-border bg-muted hover:bg-muted/80"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name?.trim()}
            className="px-3 py-1 rounded text-sm bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Opslaan..." : editing ? "Opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
