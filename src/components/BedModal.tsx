import { useState } from "react";
import type { GardenBed } from "../lib/types";
import { updateBed } from "../lib/api/beds";

interface BedModalProps {
  bed: GardenBed;
  onClose: () => void;
  onUpdated: (bed: GardenBed) => void;
}

export function BedModal({ bed, onClose, onUpdated }: BedModalProps) {
  const [form, setForm] = useState<Partial<GardenBed>>({ ...bed });
  const [saving, setSaving] = useState(false);

  function handleChange(field: keyof GardenBed, value: any) {
    setForm({ ...form, [field]: value });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateBed(bed.id, form);
      onUpdated(updated);
      onClose();
    } catch (e: any) {
      alert("Kon bak niet opslaan: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-semibold mb-2">Bak bewerken</h3>

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

        {/* Afmetingen */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Breedte (cm)</label>
            <input
              type="number"
              value={form.width_cm ?? ""}
              onChange={(e) => handleChange("width_cm", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lengte (cm)</label>
            <input
              type="number"
              value={form.length_cm ?? ""}
              onChange={(e) => handleChange("length_cm", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
        </div>

        {/* Segmenten */}
        <div>
          <label className="block text-sm font-medium mb-1">Aantal segmenten</label>
          <input
            type="number"
            min={1}
            max={12}
            value={form.segments ?? 1}
            onChange={(e) => handleChange("segments", Number(e.target.value))}
            className="w-full border rounded-md px-2 py-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Splits de bak in {form.segments ?? 1} deel(len).
          </p>
        </div>

        {/* Kas */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_greenhouse ?? false}
            onChange={(e) => handleChange("is_greenhouse", e.target.checked)}
          />
          <label>Dit is een kas</label>
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
