import { useState } from "react";
import type { Seed, CropType } from "../lib/types";
import { updateSeed } from "../lib/api/seeds";
import { MonthSelector } from "./MonthSelector";

interface SeedModalProps {
  seed: Seed;
  cropTypes: CropType[];
  onClose: () => void;
  onUpdated: (seed: Seed) => void;
}

export function SeedModal({ seed, cropTypes, onClose, onUpdated }: SeedModalProps) {
  const [form, setForm] = useState<Partial<Seed>>({
    ...seed,
    presow_months: seed.presow_months ?? [],
    direct_sow_months: seed.direct_sow_months ?? [],
    plant_months: seed.plant_months ?? [],
    harvest_months: seed.harvest_months ?? [],
  });
  const [saving, setSaving] = useState(false);

  function handleChange(field: keyof Seed, value: any) {
    setForm({ ...form, [field]: value });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateSeed(seed.id, form);
      onUpdated(updated);
      onClose();
    } catch (e: any) {
      alert("Kon zaad niet opslaan: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-3xl space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2">Zaad bewerken</h3>

        {/* Naam + type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Naam</label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full border rounded-md px-2 py-1"
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

        {/* Afstanden + sowing */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rijafstand (cm)</label>
            <input
              type="number"
              value={form.row_spacing_cm ?? ""}
              onChange={(e) => handleChange("row_spacing_cm", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plantafstand (cm)</label>
            <input
              type="number"
              value={form.plant_spacing_cm ?? ""}
              onChange={(e) => handleChange("plant_spacing_cm", Number(e.target.value))}
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
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Voorzaai (weken)</label>
            <input
              type="number"
              value={form.presow_duration_weeks ?? ""}
              onChange={(e) => handleChange("presow_duration_weeks", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Groei (weken)</label>
            <input
              type="number"
              value={form.grow_duration_weeks ?? ""}
              onChange={(e) => handleChange("grow_duration_weeks", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Oogstduur (weken)</label>
            <input
              type="number"
              value={form.harvest_duration_weeks ?? ""}
              onChange={(e) => handleChange("harvest_duration_weeks", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
        </div>

        {/* Maanden-selectors */}
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

        {/* Notes */}
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
            disabled={saving}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground"
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
