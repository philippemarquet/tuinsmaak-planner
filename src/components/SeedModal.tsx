import { useState } from "react";
import type { Seed, CropType } from "../lib/types";
import { updateSeed } from "../lib/api/seeds";

interface SeedModalProps {
  seed: Seed;
  cropTypes: CropType[];
  onClose: () => void;
  onUpdated: (seed: Seed) => void;
}

export function SeedModal({ seed, cropTypes, onClose, onUpdated }: SeedModalProps) {
  const [form, setForm] = useState<Partial<Seed>>({ ...seed });
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
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-2xl space-y-4">
        <h3 className="text-lg font-semibold mb-2">Zaad bewerken</h3>

        {/* Naam */}
        <div>
          <label className="block text-sm font-medium mb-1">Naam</label>
          <input
            type="text"
            value={form.name ?? ""}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full border rounded-md px-2 py-1"
          />
        </div>

        {/* Gewastype */}
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

        {/* Afstanden */}
        <div className="grid grid-cols-2 gap-4">
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
        </div>

        {/* Sowing type */}
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

        {/* Duur in weken */}
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
