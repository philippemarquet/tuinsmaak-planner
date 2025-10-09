// src/components/ConflictsTab.tsx
import { AlertTriangle, MoveRight, ArrowRight } from "lucide-react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { generateConflictDetails } from "../lib/conflictResolution";
import { updatePlanting } from "../lib/api/plantings";
import { useMemo, useState } from "react";

interface Props {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  onReload: () => Promise<void>;
}

export default function ConflictsTab({ beds, plantings, seeds, onReload }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const seedById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);

  const details = useMemo(() => generateConflictDetails(plantings, beds), [plantings, beds]);
  const offendersOnly = details.filter(d => d.blockers && d.blockers.length > 0);

  async function applyFit(offender: Planting, bedId: string, start_segment: number, newDateISO?: string) {
    setBusy(offender.id);
    try {
      const patch: any = { garden_bed_id: bedId, start_segment };
      if (newDateISO && offender.planned_date && offender.planned_harvest_end) {
        const start = new Date(newDateISO);
        const oldStart = new Date(offender.planned_date);
        const delta = Math.round((+start - +oldStart) / (1000*60*60*24));
        const hs = offender.planned_harvest_start ? new Date(offender.planned_harvest_start) : null;
        const he = new Date(offender.planned_harvest_end);
        patch.planned_date = newDateISO;
        if (hs) { hs.setDate(hs.getDate() + delta); patch.planned_harvest_start = hs.toISOString().slice(0,10); }
        he.setDate(he.getDate() + delta); patch.planned_harvest_end = he.toISOString().slice(0,10);
      }
      await updatePlanting(offender.id, patch);
      await onReload();
    } catch (e: any) {
      alert("Kon voorstel niet toepassen: " + (e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  if (offendersOnly.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6">
        Geen conflicten 🎉
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {offendersOnly.map((d) => {
        const offenderSeed = seedById[d.offender.seed_id];
        return (
          <div key={d.offender.id} className="border rounded-lg bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <div className="font-medium">
                {offenderSeed?.name ?? "Onbekend"} — moet worden aangepast
              </div>
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              Conflicteert met {d.blockers.map(b => seedById[b.seed_id]?.name ?? "Onbekend").join(", ")}
            </div>

            <div className="space-y-2">
              {d.sameBedOption && (
                <button
                  className="w-full text-left px-3 py-2 rounded border hover:bg-muted flex items-center justify-between"
                  disabled={busy === d.offender.id}
                  onClick={() => applyFit(d.offender, d.sameBedOption!.bed_id, d.sameBedOption!.start_segment)}
                >
                  <span>Verplaats binnen dezelfde bak (segment {d.sameBedOption.start_segment + 1})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {!d.sameBedOption && d.otherBedOptions && d.otherBedOptions.length > 0 && d.otherBedOptions.map(opt => (
                <button
                  key={`${opt.bed_id}-${opt.start_segment}`}
                  className="w-full text-left px-3 py-2 rounded border hover:bg-muted flex items-center justify-between"
                  disabled={busy === d.offender.id}
                  onClick={() => applyFit(d.offender, opt.bed_id, opt.start_segment)}
                >
                  <span>Verplaats naar {beds.find(b => b.id===opt.bed_id)?.name} (segment {opt.start_segment + 1})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ))}

              {!d.sameBedOption && (!d.otherBedOptions || d.otherBedOptions.length===0) && d.earliestFit && (
                <button
                  className="w-full text-left px-3 py-2 rounded border hover:bg-muted flex items-center justify-between"
                  disabled={busy === d.offender.id}
                  onClick={() => applyFit(d.offender, d.earliestFit!.bed_id, d.earliestFit!.start_segment, d.earliestFit!.dateISO)}
                >
                  <span>Verschuif naar eerstmogelijke datum ({d.earliestFit.dateISO}) in {beds.find(b => b.id===d.earliestFit!.bed_id)?.name}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
