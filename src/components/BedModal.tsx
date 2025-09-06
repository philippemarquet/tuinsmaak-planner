import { useState } from "react";
import type { GardenBed } from "../lib/types";
import { updateBed } from "../lib/api/beds";

interface BedModalProps {
  bed: GardenBed;
  onClose: () => void;
  onUpdated: (bed: GardenBed) => void;
}

export function BedModal({ bed, onClose, onUpdated }: BedModalProps) {
  const [form, setForm] = useState<Partial<GardenBed>>({
    id: bed.id,
    name: bed.name,
    width_cm: bed.width_cm,
    length_cm: bed.length_cm,
    segments: bed.segments,
    is_greenhouse: bed.is_greenhouse,
    location_x: bed.location_x,
    location_y: bed.location_y,
  });
  const [saving, setSaving] = useState(false);

  function handleChange<K extends keyof GardenBed>(field: K, value: GardenBed[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    try {
      setSaving(true);

      // Harden numerieke velden
      const patch: Partial<GardenBed> = {
        name: (form.name ?? "").toString().trim() || bed.name,
        width_cm: Number(form.width_cm ?? bed.width_cm) || 0,
        length_cm: Number(form.length_cm ?? bed.length_cm) || 0,
        segments: Math.max(1, Number(form.segments ?? bed.segments) || 1),
        is_greenhouse: Boolean(form.is_greenhouse ?? bed.is_greenhouse),
        location_x:
          form.location_x === undefined || form.location_x === null
            ? bed.location_x ?? 0
            : Number(form.location_x),
        location_y:
          form.location_y === undefined || form.location_y === null
            ? bed.location_y ?? 0
            : Number(form.location_y),
      };

      const updated = await updateBed(bed.id, patch);
      onUpdated(updated);
      onClose();
    } catch (e: any) {
      console.error(e);
      alert("Kon bak niet opslaan: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-card rounded-lg shadow-lg p-6 w-full max-w-lg space-y-4"
        // voorkom dat DnD in de achtergrond deze modal 'oppakt'
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
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
            max={24}
            value={form.segments ?? 1}
            onChange={(e) => handleChange("segments", Number(e.target.value))}
            className="w-full border rounded-md px-2 py-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Splits de bak in {form.segments ?? 1} deel(len).
          </p>
        </div>

        {/* Positie (optioneel) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Locatie X</label>
            <input
              type="number"
              value={form.location_x ?? 0}
              onChange={(e) => handleChange("location_x", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Locatie Y</label>
            <input
              type="number"
              value={form.location_y ?? 0}
              onChange={(e) => handleChange("location_y", Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>
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
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
