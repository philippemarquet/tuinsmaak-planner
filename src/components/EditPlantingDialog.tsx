// src/components/EditPlantingDialog.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { updatePlanting } from "../lib/api/plantings";
import { bedsThatFitFor } from "../lib/conflicts";

type Props = {
  open: boolean;
  onClose: () => void;
  planting: Planting;
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[]; // voor label
  onSaved: () => Promise<void>;
};

export default function EditPlantingDialog({ open, onClose, planting, beds, plantings, seeds, onSaved }: Props) {
  const [busy, setBusy] = useState(false);

  const seed = seeds.find(s => s.id === planting.seed_id);
  const options = useMemo(() => bedsThatFitFor(planting, beds, plantings), [planting, beds, plantings]);
  const [selBedId, setSelBedId] = useState(planting.garden_bed_id);
  const currentBed = beds.find(b => b.id === selBedId) || null;

  const currentValidSegs = useMemo(() => {
    const o = options.find(x => x.bed.id === selBedId);
    return o?.validSegments ?? [];
  }, [options, selBedId]);

  const [selStartSeg, setSelStartSeg] = useState<number>(planting.start_segment ?? 0);

  // Zorg dat startsegment altijd geldig is t.o.v. selBedId
  useMemo(() => {
    if (!currentValidSegs.includes(selStartSeg)) {
      const first = currentValidSegs[0];
      if (first != null) setSelStartSeg(first);
    }
  }, [currentValidSegs, selStartSeg]);

  if (!open) return null;

  const canSave = options.some(x => x.bed.id === selBedId && currentValidSegs.includes(selStartSeg));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card rounded-lg shadow-lg w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">Planting wijzigen</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {seed?.name ?? "Onbekend gewas"} • {currentBed?.name ?? "Onbekende bak"}
        </p>

        {options.length === 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
            Deze planting past op de huidige datum en segment-bezetting in geen enkele bak.  
            Pas eerst de datum of segment-gebruik aan in de Planner/Conflicten-tab.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm">
              Bak
              <select
                className="mt-1 w-full border rounded-md px-2 py-1"
                value={selBedId}
                onChange={e => setSelBedId(e.target.value)}
              >
                {options.map(({ bed }) => (
                  <option key={bed.id} value={bed.id}>{bed.name}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Start-segment
              <select
                className="mt-1 w-full border rounded-md px-2 py-1"
                value={selStartSeg}
                onChange={e => setSelStartSeg(Number(e.target.value))}
              >
                {currentValidSegs.map(s => (
                  <option key={s} value={s}>Segment {s+1}</option>
                ))}
              </select>
              <div className="text-xs text-muted-foreground mt-1">
                (Gebruikt {Math.max(1, planting.segments_used ?? 1)} segmenten)
              </div>
            </label>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="px-3 py-1.5 rounded-md border" onClick={onClose} disabled={busy}>Annuleren</button>
          <button
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            disabled={busy || !canSave}
            onClick={async () => {
              if (!canSave) return;
              setBusy(true);
              try {
                await updatePlanting(planting.id, {
                  garden_bed_id: selBedId,
                  start_segment: selStartSeg,
                } as any);
                await onSaved();
                onClose();
              } catch (e: any) {
                alert("Kon planting niet updaten: " + (e?.message ?? e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
