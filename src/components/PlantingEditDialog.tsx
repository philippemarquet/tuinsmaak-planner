// src/components/PlantingEditDialog.tsx
import { useEffect, useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { updatePlanting } from "../lib/api/plantings";
import { X } from "lucide-react";
import { allFittingSegmentsInBed } from "../lib/fit";

type Props = {
  open: boolean;
  onClose: () => void;
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[]; // alle plantings in de tuin (voor fit-check)
  planting: Planting | null;
  onSaved?: (p: Planting) => void;
};

export default function PlantingEditDialog({
  open, onClose, beds, seeds, plantings, planting, onSaved
}: Props) {
  const [busy, setBusy] = useState(false);

  const seedName = useMemo(() => {
    if (!planting) return "";
    const s = seeds.find(x => x.id === planting.seed_id);
    return s?.name ?? "Onbekend gewas";
  }, [planting, seeds]);

  // Bepaal per bed de mogelijke startSegments waar deze planting past (zelfde datum-range en gebruikte segmenten)
  const bedOptions = useMemo(() => {
    if (!planting || !planting.planned_date || !planting.planned_harvest_end) return [];
    return beds.map(bed => {
      const segs = allFittingSegmentsInBed(bed, plantings, planting);
      return { bed, segs };
    }).filter(x => x.segs.length > 0);
  }, [beds, plantings, planting]);

  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [selectedStartSeg, setSelectedStartSeg] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !planting) return;
    // default voorstel: huidige bed + start_segment indien die combinatie nog past
    const current = bedOptions.find(x => x.bed.id === planting.garden_bed_id);
    if (current && current.segs.includes(Math.max(0, planting.start_segment ?? 0))) {
      setSelectedBedId(current.bed.id);
      setSelectedStartSeg(Math.max(0, planting.start_segment ?? 0));
    } else if (bedOptions.length > 0) {
      setSelectedBedId(bedOptions[0].bed.id);
      setSelectedStartSeg(bedOptions[0].segs[0]);
    } else {
      setSelectedBedId(null);
      setSelectedStartSeg(null);
    }
  }, [open, planting, bedOptions]);

  if (!open || !planting) return null;

  const save = async () => {
    if (!selectedBedId || selectedStartSeg == null) return;
    setBusy(true);
    try {
      const patch: Partial<Planting> = {
        garden_bed_id: selectedBedId,
        start_segment: selectedStartSeg,
      };
      const updated = await updatePlanting(planting.id, patch as any);
      if (onSaved) onSaved(updated ?? { ...planting, ...patch });
      onClose();
    } catch (e: any) {
      alert("Kon planting niet opslaan: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card text-card-foreground w-full max-w-lg rounded-lg shadow-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Bewerken: {seedName}</h3>
          <button className="p-2 rounded hover:bg-muted" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground">Huidige bak</div>
              <div className="font-medium">{beds.find(b => b.id === planting.garden_bed_id)?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Datums</div>
              <div className="font-medium">
                {(planting.planned_date ?? "—")} → {(planting.planned_harvest_end ?? "—")}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-medium mb-1">Verplaats naar bak</label>
            {bedOptions.length === 0 ? (
              <div className="text-red-600 text-sm">
                Er is geen enkele bak waar dit gewas past op dezelfde datum.
              </div>
            ) : (
              <select
                className="w-full border rounded px-2 py-1.5 bg-background"
                value={selectedBedId ?? ""}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedBedId(id);
                  const opt = bedOptions.find(x => x.bed.id === id);
                  setSelectedStartSeg(opt?.segs[0] ?? null);
                }}
              >
                {bedOptions.map(({ bed, segs }) => (
                  <option key={bed.id} value={bed.id}>
                    {bed.name} ({segs.length} passende segment{segs.length > 1 ? "en" : ""})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedBedId && (
            <div>
              <label className="block text-sm font-medium mb-1">Startsegment</label>
              <select
                className="w-full border rounded px-2 py-1.5 bg-background"
                value={selectedStartSeg ?? ""}
                onChange={e => setSelectedStartSeg(parseInt(e.target.value, 10))}
              >
                {bedOptions.find(x => x.bed.id === selectedBedId)?.segs.map(s => (
                  <option key={s} value={s}>Segment {s + 1}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="px-3 py-1.5 rounded border" onClick={onClose}>Annuleren</button>
          <button
            className="px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
            onClick={save}
            disabled={busy || !selectedBedId || selectedStartSeg == null}
          >
            {busy ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
