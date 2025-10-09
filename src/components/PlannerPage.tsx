// src/components/PlannerPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, deletePlanting, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { AlertTriangle, Edit3, Trash2, Map, List, Timer, Wrench } from "lucide-react";
import PlantingEditDialog from "./PlantingEditDialog";
import { bedHasConflict, buildConflictsMap, isLikelyNewerToFix, allFittingSegmentsInBed, findEarliestFitAcrossBeds } from "../lib/fit";
import TimelineView from "./TimelineView";

type Tab = "list" | "map" | "timeline" | "conflicts";

export default function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tab, setTab] = useState<Tab>("list");

  const [editOpen, setEditOpen] = useState(false);
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);

  useEffect(() => {
    reload();
  }, [garden.id]);

  async function reload() {
    const [b, p, s] = await Promise.all([
      listBeds(garden.id),
      listPlantings(garden.id),
      listSeeds(garden.id),
    ]);
    // Sorteer bakken: buiten → kas, dan sort_order
    const outdoor = b.filter(x => !x.is_greenhouse).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));
    const greenhouse = b.filter(x => x.is_greenhouse).sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));
    setBeds([...outdoor, ...greenhouse]);
    setPlantings(p);
    setSeeds(s);
  }

  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);

  const conflictsMap = useMemo(() => buildConflictsMap(plantings), [plantings]);
  const bedsWithConflict = useMemo(() => {
    const set = new Set<string>();
    for (const b of beds) {
      if (bedHasConflict(b, plantings)) set.add(b.id);
    }
    return set;
  }, [beds, plantings]);

  const openEdit = (p: Planting) => { setEditPlanting(p); setEditOpen(true); };
  const onSaved = (updated: Planting) => {
    setPlantings(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
  };

  const remove = async (p: Planting) => {
    if (!confirm("Weet je zeker dat je dit gewas wil verwijderen?")) return;
    await deletePlanting(p.id);
    await reload();
  };

  /* ========== Lijstweergave (compact, alleen icoon bij bak) ========== */
  const ListView = () => (
    <div className="space-y-4">
      {beds.map(bed => {
        const inBed = plantings.filter(p => p.garden_bed_id === bed.id).sort((a,b) => {
          const A = a.planned_date ? new Date(a.planned_date).getTime() : 0;
          const B = b.planned_date ? new Date(b.planned_date).getTime() : 0;
          return A - B;
        });
        const hasC = bedsWithConflict.has(bed.id);
        return (
          <div key={bed.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
              <div className="flex items-center gap-2">
                <div className="font-medium">{bed.name}</div>
                {hasC && <AlertTriangle className="w-4 h-4 text-red-500" title="Conflicten aanwezig in deze bak" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {bed.segments} segment{bed.segments === 1 ? "" : "en"} {bed.is_greenhouse ? "• Kas" : ""}
              </div>
            </div>
            <div className="divide-y">
              {inBed.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Nog niets gepland.</div>
              ) : inBed.map(p => {
                const s = seedsById[p.seed_id];
                const seg = Math.max(0, p.start_segment ?? 0);
                const used = Math.max(1, p.segments_used ?? 1);
                const hasConflict = conflictsMap.has(p.id);
                return (
                  <div key={p.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded" style={{background: p.color ?? "#22c55e"}} />
                        <span className="font-medium truncate">{s?.name ?? "Onbekend gewas"}</span>
                        {hasConflict && <AlertTriangle className="w-3 h-3 text-red-500" title="Conflicterend" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.planned_date ?? "—"} → {p.planned_harvest_end ?? "—"} • segment {seg+1}
                        {used>1 ? ` (${used} seg.)` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 text-xs border rounded" onClick={() => openEdit(p)}>
                        <Edit3 className="inline w-3 h-3 mr-1" /> Bewerken
                      </button>
                      <button className="px-2 py-1 text-xs border rounded" onClick={() => remove(p)}>
                        <Trash2 className="inline w-3 h-3 mr-1" /> Verwijderen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ========== Heel simpele plattegrond: één rij per bed met segmenten ========== */
  const MapView = () => (
    <div className="space-y-4">
      {beds.map(bed => {
        const hasC = bedsWithConflict.has(bed.id);
        const blocks = Array.from({length: Math.max(1, bed.segments || 1)}, (_,i)=>i);
        const itemsBySeg = (segIdx: number) =>
          plantings.filter(p => p.garden_bed_id === bed.id && (p.start_segment ?? 0) <= segIdx && (p.start_segment ?? 0) + Math.max(1, p.segments_used ?? 1) - 1 >= segIdx);

        return (
          <div key={bed.id} className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="font-medium">{bed.name}</div>
              {hasC && <AlertTriangle className="w-4 h-4 text-red-500" title="Conflicten aanwezig in deze bak" />}
              <div className="text-xs text-muted-foreground">
                {bed.segments} segment{bed.segments === 1 ? "" : "en"} {bed.is_greenhouse ? "• Kas" : ""}
              </div>
            </div>
            <div className="grid" style={{gridTemplateColumns: `repeat(${bed.segments}, minmax(0,1fr))`, gap: "6px"}}>
              {blocks.map(i => (
                <div key={i} className="min-h-[64px] rounded border bg-muted/20 p-1">
                  <div className="text-[10px] text-muted-foreground mb-1">Segment {i+1}</div>
                  <div className="flex flex-col gap-1">
                    {itemsBySeg(i).map(p => {
                      const s = seedsById[p.seed_id];
                      const hasConflict = conflictsMap.has(p.id);
                      return (
                        <div key={p.id} className="px-2 py-1 rounded text-[11px] text-white flex items-center justify-between"
                             style={{background: p.color ?? "#22c55e"}}>
                          <div className="truncate">{s?.name ?? "—"}</div>
                          <div className="flex items-center gap-1 ml-2">
                            {hasConflict && <AlertTriangle className="w-3 h-3 text-yellow-300" title="Conflicterend" />}
                            <button className="p-0.5 bg-white/20 rounded" onClick={() => openEdit(p)} title="Bewerken">
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ========== Conflicten-tab (alleen “te fixen” regels + opties 1-3) ========== */
  const ConflictsTab = () => {
    // Kandidaten: alleen plantings waarvoor conflictsMap entries bestaan én heuristiek → te fixen
    const entries = [...conflictsMap.entries()]
      .map(([id, arr]) => ({ planting: plantings.find(p => p.id === id)!, conflicts: arr }))
      .filter(x => x.planting && isLikelyNewerToFix(x.planting, x.conflicts));

    const moveTo = async (p: Planting, bedId: string, startSeg: number) => {
      const patch: Partial<Planting> = { garden_bed_id: bedId, start_segment: startSeg };
      await updatePlanting(p.id, patch as any);
      await reload();
    };

    const renderRow = (p: Planting, conflicts: Planting[]) => {
      const seed = seedsById[p.seed_id];
      const sameBed = beds.find(b => b.id === p.garden_bed_id)!;

      const sameBedSegs = allFittingSegmentsInBed(sameBed, plantings, p)
        .filter(s => s !== (p.start_segment ?? 0)); // andere seg op zelfde datum

      const sameDateOtherBeds = beds
        .filter(b => b.id !== p.garden_bed_id)
        .map(b => ({ b, segs: allFittingSegmentsInBed(b, plantings, p) }))
        .filter(x => x.segs.length > 0);

      const earliest = (sameBedSegs.length === 0 && sameDateOtherBeds.length === 0 && p.planned_date)
        ? findEarliestFitAcrossBeds(beds, plantings, p, p.planned_date)
        : null;

      return (
        <div key={p.id} className="border rounded-lg p-3 bg-card">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div className="font-medium truncate">{seed?.name ?? "Onbekend gewas"}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {sameBed.name} • {p.planned_date ?? "—"} → {p.planned_harvest_end ?? "—"} • seg {Math.max(0,p.start_segment ?? 0)+1}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Conflicteert met: {conflicts.length} andere{conflicts.length>1?"":"r"}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {/* Optie 1: andere segmenten zelfde bak */}
            {sameBedSegs.map(seg => (
              <button key={`samebed-${seg}`}
                className="px-3 py-1.5 rounded border text-sm"
                onClick={() => moveTo(p, sameBed.id, seg)}
              >
                Verplaats naar {sameBed.name}, segment {seg+1} (zelfde datum)
              </button>
            ))}

            {/* Optie 2: andere bakken zelfde datum */}
            {sameDateOtherBeds.map(({b, segs}) => (
              <button key={`otherbed-${b.id}`}
                className="px-3 py-1.5 rounded border text-sm"
                onClick={() => moveTo(p, b.id, segs[0])}
              >
                Verplaats naar {b.name}, segment {segs[0]+1} (zelfde datum)
              </button>
            ))}

            {/* Optie 3: vroegst mogelijke datum */}
            {(!sameBedSegs.length && !sameDateOtherBeds.length && earliest) && (
              <button
                className="px-3 py-1.5 rounded border text-sm"
                onClick={() => {
                  // verschuif datum + bed + segment in één patch
                  updatePlanting(p.id, {
                    planned_date: earliest.dateISO,
                    planned_harvest_end: earliest.endISO,
                    garden_bed_id: earliest.bedId,
                    start_segment: earliest.startSeg,
                  } as any).then(reload);
                }}
              >
                Vroegste plek: {beds.find(b=>b.id===earliest.bedId)?.name}, seg {earliest.startSeg+1} (vanaf {earliest.dateISO})
              </button>
            )}

            {(!sameBedSegs.length && !sameDateOtherBeds.length && !earliest) && (
              <div className="text-sm text-red-600">
                Geen automatische oplossing gevonden binnen 365 dagen.
              </div>
            )}
          </div>
        </div>
      );
    };

    if (entries.length === 0) {
      return <div className="text-sm text-muted-foreground">Geen conflicten om op te lossen. 🎉</div>;
    }
    return (
      <div className="space-y-3">
        {entries.map(({ planting, conflicts }) => renderRow(planting!, conflicts))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button className={`px-3 py-1.5 rounded border text-sm ${tab==='list'?'bg-primary text-primary-foreground':''}`} onClick={()=>setTab('list')}>
          <List className="inline w-4 h-4 mr-1" /> Lijst
        </button>
        <button className={`px-3 py-1.5 rounded border text-sm ${tab==='map'?'bg-primary text-primary-foreground':''}`} onClick={()=>setTab('map')}>
          <Map className="inline w-4 h-4 mr-1" /> Plattegrond
        </button>
        <button className={`px-3 py-1.5 rounded border text-sm ${tab==='timeline'?'bg-primary text-primary-foreground':''}`} onClick={()=>setTab('timeline')}>
          <Timer className="inline w-4 h-4 mr-1" /> Timeline
        </button>
        <button className={`px-3 py-1.5 rounded border text-sm ${tab==='conflicts'?'bg-primary text-primary-foreground':''}`} onClick={()=>setTab('conflicts')}>
          <Wrench className="inline w-4 h-4 mr-1" /> Conflicten
        </button>
      </div>

      {/* Content */}
      {tab === "list" && <ListView />}
      {tab === "map" && <MapView />}
      {tab === "timeline" && (
        <TimelineView
          beds={beds}
          plantings={plantings}
          seeds={seeds}
          conflictsMap={conflictsMap}
          currentWeek={new Date()}
          onReload={reload}
          onEdit={openEdit}
        />
      )}
      {tab === "conflicts" && <ConflictsTab />}

      {/* Shared edit dialog (vanuit alle tabjes) */}
      <PlantingEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        beds={beds}
        seeds={seeds}
        plantings={plantings}
        planting={editPlanting}
        onSaved={onSaved}
      />
    </div>
  );
}
