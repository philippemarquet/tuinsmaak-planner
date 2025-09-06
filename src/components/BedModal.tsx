import { useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { createBed, updateBed } from "../lib/api/beds";

interface BedModalProps {
  gardenId: UUID;
  bed?: GardenBed | null;          // undefined/null = nieuw
  onClose: () => void;
  onSaved: (bed: GardenBed) => void;
}

export function BedModal({ gardenId, bed, onClose, onSaved }: BedModalProps) {
  const editing = !!bed?.id;

  const [name, setName] = useState<string>(bed?.name ?? "");
  const [widthCm, setWidthCm] = useState<number | "">(bed?.width_cm ?? 120);
  const [lengthCm, setLengthCm] = useState<number | "">(bed?.length_cm ?? 200);
  const [segments, setSegments] = useState<number | "">(bed?.segments ?? 1);
  const [isGreenhouse, setIsGreenhouse] = useState<boolean>(bed?.is_greenhouse ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      const payload: Partial<GardenBed> = {
        garden_id: gardenId,
        name: name.trim() || "Bak",
        width_cm: widthCm === "" ? 0 : Number(widthCm),
        length_cm: lengthCm === "" ? 0 : Number(lengthCm),
        segments: segments === "" ? 1 : Math.max(1, Number(segments)),
        is_greenhouse: isGreenhouse,
      };

      const saved = editing
        ? await updateBed(bed!.id, payload)
        : await createBed(payload);

      onSaved(saved);
      onClose();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-lg p-6 w-full max-w-lg space-y-4">
        <h3 className="text-lg font-semibold">
          {editing ? "Bak bewerken" : "Nieuwe bak"}
        </h3>

        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Naam</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-md px-2 py-1"
              placeholder="Bijv. Bak 1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Breedte (cm)</label>
            <input
              type="number"
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Lengte (cm)</label>
            <input
              type="number"
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Segmenten</label>
            <input
              type="number"
              min={1}
              max={24}
              value={segments}
              onChange={(e) => setSegments(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full border rounded-md px-2 py-1"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isGreenhouse"
              type="checkbox"
              checked={isGreenhouse}
              onChange={(e) => setIsGreenhouse(e.target.checked)}
            />
            <label htmlFor="isGreenhouse" className="text-sm">Dit is een kas-bak</label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded-md border border-border bg-muted">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
