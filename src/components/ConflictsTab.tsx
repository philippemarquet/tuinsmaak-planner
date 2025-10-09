// src/components/ConflictsTab.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed } from "../lib/types";
import { updatePlanting } from "../lib/api/plantings";
import {
  buildConflictIndex,
  conflictSuggestions,
  parseISO,
  toISO,
} from "../lib/conflicts";
import { AlertTriangle, MoveRight, Lightbulb, Check } from "lucide-react";

interface ConflictsTabProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  onApply?: () => Promise<void> | void; // na een update
}

/**
 * Toont alleen "offenders": de plantingen die je moet aanpassen om het conflict op te lossen.
 * Per offender tonen we alleen de opties die mogelijk zijn:
 *  1) ander segment in dezelfde bak (zelfde datum),
 *  2) andere bak(ken) op dezelfde datum,
 *  3) vroegste mogelijke datum (alleen als 1 en 2 niet kunnen).
 */
export function ConflictsTab({ beds, plantings, seeds, onApply }: ConflictsTabProps) {
  const { offenders, conflictsByPlanting } = useMemo(() => buildConflictIndex(beds, plantings), [beds, plantings]);
  const offendersList = useMemo(() => plantings.filter(p => offenders.has(p.id)), [plantings, offenders]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const bedsById  = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);

  // UI helpers
  function fmt(d?: string | null) {
    const x = d ? parseISO(d) : null;
    return x ? x.toLocaleDateString("nl-NL", { day:"2-digit", month:"2-digit", year:"numeric" }) : "";
    }
  function conflictPartners(p: Planting) {
    const ids = conflictsByPlanting.get(p.id) ?? [];
    return ids
      .map(id => plantings.find(q => q.id === id))
      .filter(Boolean) as Planting[];
  }

  // Action handlers
  async function moveSameBed(p: Planting, start_segment: number) {
    await updatePlanting(p.id, { start_segment } as any);
    if (onApply) await onApply();
  }
  async function moveOtherBed(p: Planting, garden_bed_id: string, start_segment: number) {
    await updatePlanting(p.id, { garden_bed_id, start_segment } as any);
    if (onApply) await onApply();
  }
  async function moveEarliest(p: Planting, newISO: string, garden_bed_id: string, start_segment: number) {
    await updatePlanting(p.id, { planned_date: newISO, garden_bed_id, start_segment } as any);
    if (onApply) await onApply();
  }

  if (offendersList.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="flex items-center gap-2 text-green-700">
          <Check className="w-5 h-5" />
          <span>Geen conflicten om op te lossen. 🎉</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {offendersList.map(p => {
        const seed = seedsById[p.seed_id];
        const bed  = bedsById[p.garden_bed_id!];
        const partners = conflictPartners(p);
        const sug = conflictSuggestions(beds, plantings, p);

        return (
          <div key={p.id} className="border rounded-lg bg-white">
            {/* Header: alleen offender-regel */}
            <div className="p-3 border-b flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {seed?.name ?? "Onbekend gewas"}
                  {" • "}
                  {bed?.name ?? "Onbekende bak"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Bezetting: {fmt(p.planned_date)} → {fmt(p.planned_harvest_end)}
                </div>
                {partners.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Conflicteert met: {partners.map(q => seedsById[q.seed_id]?.name ?? "??").join(", ")}
                  </div>
                )}
              </div>
            </div>

            {/* Suggesties volgens 1/2/3 */}
            <div className="p-3 space-y-3">
              {/* 1) Ander segment in dezelfde bak (zelfde datum) */}
              {sug.sameBedStarts.length > 0 && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Plaats in een ander segment (zelfde bak & datum)
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      onChange={(e) => moveSameBed(p, parseInt(e.target.value, 10))}
                      defaultValue=""
                    >
                      <option value="" disabled>Kies startsegment…</option>
                      {sug.sameBedStarts.map(i => (
                        <option key={i} value={i}>Segment {i+1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 2) Andere bak op dezelfde datum */}
              {sug.otherBeds.length > 0 && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Verplaats naar andere bak (zelfde datum)
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      onChange={(e) => {
                        const [bedId, startSegStr] = e.target.value.split("|");
                        if (!bedId) return;
                        moveOtherBed(p, bedId, parseInt(startSegStr, 10));
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Kies bak & startsegment…</option>
                      {sug.otherBeds.map(({ bed, starts }) => (
                        starts.map(st => (
                          <option key={`${bed.id}-${st}`} value={`${bed.id}|${st}`}>
                            {bed.name} — Segment {st+1}
                          </option>
                        ))
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 3) Vroegste datum (alleen als 1 en 2 niet kunnen) */}
              {sug.sameBedStarts.length === 0 && sug.otherBeds.length === 0 && sug.earliest && (
                <div className="rounded-md border p-3 bg-amber-50">
                  <div className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Vroegst mogelijke datum
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                    <div>
                      Voorstel: <strong>{sug.earliest.dateISO}</strong> in <strong>{sug.earliest.bed.name}</strong>, segment <strong>{sug.earliest.start_segment + 1}</strong>
                    </div>
                    <button
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground"
                      onClick={() => moveEarliest(p, sug.earliest!.dateISO, sug.earliest!.bed.id, sug.earliest!.start_segment)}
                    >
                      Toepassen <MoveRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Geen opties? Dan is er écht geen plek binnen de scan */}
              {sug.sameBedStarts.length === 0 && sug.otherBeds.length === 0 && !sug.earliest && (
                <div className="rounded-md border p-3 bg-muted/20 text-sm">
                  Geen automatische oplossing gevonden in het scanbereik. Pas handmatig aan.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
