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
    stock_status: seed.stock_status ?? "adequate",
    stock_quantity: seed.stock_quantity ?? 0,
    row_spacing_cm: seed.row_spacing_cm ?? null,
    plant_spacing_cm: seed.plant_spacing_cm ?? null,
    greenhouse_compatible: seed.greenhouse_compatible ?? false,
    sowing_type: seed.sowing_type ?? "both",

    presow_duration_weeks: seed.presow_duration_weeks ?? null,
    grow_duration_weeks: seed.grow_duration_weeks ?? null,
    harvest_duration_weeks: seed.harvest_duration_weeks ?? null,

    presow_months: seed.presow_months ?? [],
    direct_sow_months: seed.direct_sow_months ?? [],
    plant_months: seed.plant_months ?? [],
    harvest_months: seed.harvest_months ?? [],

    default_color: seed.default_color ?? null, // kan tailwind of #hex zijn; we schrijven #hex terug
    notes: seed.notes ?? "",
  });

  useEffect(() => {
    listCropTypes().then(setCropTypes).catch(console.error);
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
          form.row_spacing_cm === null || form.row_spacing_cm === undefined || form.row_spacing_cm === ""
            ? null
            : Number(form.row_spacing_cm),
        plant_spacing_cm:
          form.plant_spacing_cm === null || form.plant_spacing_cm === undefined || form.plant_spacing_cm === ""
            ? null
            : Number(form.plant_spacing_cm),
        presow_duration_weeks: form.presow_duration_weeks === "" ? null : form.presow_duration_weeks,
        grow_duration_weeks: form.grow_duration_weeks === "" ? null : form.grow_duration_weeks,
        harvest_duration_weeks: form.harvest_duration_weeks === "" ? null : form.harvest_duration_weeks,
        notes: form.notes || null,
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
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-3xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">
          {editing ? "Zaad bewerken" : "Nieuw zaad"}
        </h3>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Naam + type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Naam</label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full border rounded-md px-2 py-1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gewastype</label>
            <select
              value={form.crop_type_id ?? ""}
              onChange={(e) => handleChange("crop_type_id", e.target.value || null)}
              className="w-full border rounded-md px-2 py-1"
            >
              <option value="">— Kies type —</option>
              {cropTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Afstanden + zaaitype */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rijafstand (cm)</label>
            <input
              type="number"
              value={form.row_spacing_cm ?? ""}
              onChange={(e) => handleChange("row_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plantafstand (cm)</label>
            <input
              type="number"
              value={form.plant_spacing_cm ?? ""}
              onChange={(e) => handleChange("plant_spacing_cm", e.target.value === '' ? null : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Zaaitype</label>
            <select
              value={form.sowing_type ?? "both"}
              onChange={(e) => handleChange("sowing_type", e.target.value)}
              className="w-full border rounded-md px-2 py-1"
            >
              <option value="direct">Direct zaaien</option>
              <option value="presow">Voorzaaien</option>
              <option value="both">Beide</option>
            </select>
          </div>
        </div>

        {/* Duur */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Voorzaai (weken)</label>
            <input
              type="number"
              value={form.presow_duration_weeks ?? ""}
              onChange={(e) => handleChange("presow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Groei (weken)</label>
            <input
              type="number"
              value={form.grow_duration_weeks ?? ""}
              onChange={(e) => handleChange("grow_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Oogstduur (weken)</label>
            <input
              type="number"
              value={form.harvest_duration_weeks ?? ""}
              onChange={(e) => handleChange("harvest_duration_weeks", e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
        </div>

        {/* Maanden-selectors (jouw UI unchanged) */}
        <MonthSelector
          label="Voorzaaien"
          value={form.presow_months ?? []}
          onChange={(val) => handleChange("presow_months", val)}
        />
        <MonthSelector
          label="Direct zaaien"
          value={form.direct_sow_months ?? []}
          onChange={(val) => handleChange("direct_sow_months", val)}
        />
        <MonthSelector
          label="Planten"
          value={form.plant_months ?? []}
          onChange={(val) => handleChange("plant_months", val)}
        />
        <MonthSelector
          label="Oogsten"
          value={form.harvest_months ?? []}
          onChange={(val) => handleChange("harvest_months", val)}
        />

        {/* Kleur */}
        <ColorField
          label="Standaardkleur (kaart & planner)"
          value={form.default_color ?? undefined}
          onChange={(hex) => handleChange("default_color", hex)}
          helperText="Je kunt #RRGGBB of rgb(r,g,b) invoeren. We slaan #hex op."
        />

        {/* Notities */}
        <div>
          <label className="block text-sm font-medium mb-1">Notities</label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            className="w-full border rounded-md px-2 py-1"
          />
        </div>

        {/* Acties */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md border border-border bg-muted"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name?.trim()}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Opslaan..." : editing ? "Opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
