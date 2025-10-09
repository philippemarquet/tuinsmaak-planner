// src/components/PlantingEditor.tsx
import { useEffect, useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { updatePlanting, deletePlanting } from "../lib/api/plantings";
import { freeStartsForInterval } from "../lib/conflictResolution";

interface Props {
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[]; // all plantings for availability checks
  planting: Planting;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export default function PlantingEditor({ beds, seeds, plantings, planting, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<Planting>(() => ({ ...planting }));

  const seed = seeds.find(s => s.id === state.seed_id);
  const neededSegs = Math.max(1, state.segments_used ?? 1);

  // Compute available beds (only those that can fit this planting on current dates)
  const availableBeds = useMemo(() => {
    const out: { bed: GardenBed; starts: number[] }[] = [];
    if (!state.planned_date || !state.planned_harvest_end) return out;
    for (const bed of beds) {
      const starts = freeStartsForInterval(
        bed,
        plantings,
        state.planned_date,
        state.planned_harvest_end,
        neededSegs,
        state.id
      );
      if (starts.length > 0) out.push({ bed, starts });
    }
    return out;
  }, [beds, plantings, state.planned_date, state.planned_harvest_end, neededSegs, state.id]);

  // Ensure start_segment remains valid when bed changes
  useEffect(() => {
    const current = availableBeds.find(x => x.bed.id === state.garden_bed_id);
    if (!current) return;
    if (!current.starts.includes(state.start_segment ?? 0)) {
      setState(s => ({ ...s, start_segment: current.starts[0] }));
    }
  }, [state.garden_bed_id, availableBeds]);

  async function save() {
    setSaving(true);
    try {
      await updatePlanting(state.id, {
        garden_bed_id: state.garden_bed_id,
        start_segment: state.start_segment ?? 0,
        segments_used: neededSegs,
        planned_date: state.planned_date,
        planned_harvest_start: state.planned_harvest_start,
        planned_harvest_end: state.planned_harvest_end,
        color: state.color,
      } as any);
      await onSaved();
      onClose();
    } catch (e: any) {
      alert("Kon planting niet opslaan: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Planting bewerken</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium">Bak</label>
            <select
              className="mt-1 w-full border rounded-md px-2 py-1 text-sm"
              value={state.garden_bed_id}
              onChange={(e) => {
                const nextBed = e.target.value;
                const starts = availableBeds.find(x => x.bed.id === nextBed)?.starts ?? [0];
                setState(s => ({ ...s, garden_bed_id: nextBed, start_segment: starts[0] }));
              }}
            >
              {availableBeds.map(({ bed }) => (
                <option key={bed.id} value={bed.id}>{bed.name}</option>
              ))}
            </select>
            {availableBeds.length === 0 && (
              <p className="text-xs text-red-600 mt-1">
                Geen enkele bak heeft vrije segmenten op deze data. Pas de datum of segmenten aan.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium">Start segment</label>
            <select
              className="mt-1 w-full border rounded-md px-2 py-1 text-sm"
              value={state.start_segment ?? 0}
              onChange={(e) => setState(s => ({ ...s, start_segment: Number(e.target.value) }))}
            >
              {(availableBeds.find(x => x.bed.id === state.garden_bed_id)?.starts ?? [state.start_segment ?? 0])
                .map(start => (
                  <option key={start} value={start}>Segment {start + 1}</option>
                ))
              }
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Bezet {neededSegs} segment{neededSegs!==1?'en':''}.</p>
          </div>

          <div>
            <label className="block text-sm font-medium">Kleur</label>
            <input
              type="color"
              className="mt-1 w-full border rounded-md px-2 py-1 h-9"
              value={state.color || "#22c55e"}
              onChange={(e) => setState(s => ({ ...s, color: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="px-3 py-1.5 rounded-md border" onClick={onClose}>Annuleren</button>
          <button
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            disabled={saving || availableBeds.length === 0}
            onClick={save}
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
