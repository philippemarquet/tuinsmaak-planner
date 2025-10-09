// src/components/PlannerPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, deletePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { AlertTriangle, Calendar, Edit3, Trash2, Plus, RefreshCw } from "lucide-react";
import PlantingEditor from "./PlantingEditor";
import TimelineView from "./TimelineView";
import ConflictsTab from "./ConflictsTab";
import { buildConflictsMap, bedHasConflict, conflictsFor, countUniqueConflicts } from "../lib/conflicts";

/** Helper: format ISO (YYYY-MM-DD) to nl-NL d-m-y */
function fmtDMY(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

type TabId = "list" | "grid" | "timeline" | "conflicts";

export default function PlannerPage({ garden }: { garden: Garden }) {
  const [active, setActive] = useState<TabId>("list");

  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [edit, setEdit] = useState<Planting | null>(null);
  const [currentWeek, setCurrentWeek] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay(); // 0=zo..6=za
    const diffToMonday = (day + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [b, p, s] = await Promise.all([
        listBeds(garden.id),
        listPlantings(garden.id),
        listSeeds(garden.id),
      ]);
      setBeds(b);
      setPlantings(p);
      setSeeds(s);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [garden.id]);

  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);

  const plantingsByBed = useMemo(() => {
    const m = new Map<string, Planting[]>();
    for (const p of plantings) {
      if (!m.has(p.garden_bed_id)) m.set(p.garden_bed_id, []);
      m.get(p.garden_bed_id)!.push(p);
    }
    // sort per bed by planned_date asc
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? ""));
    }
    return m;
  }, [plantings]);

  const conflictsMap = useMemo(() => buildConflictsMap(plantings), [plantings]);
  const conflictsCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);

  function nextWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d);
  }
  function prevWeek() {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d);
  }

  async function handleDelete(p: Planting) {
    if (!confirm(`Weet je zeker dat je "${seedsById[p.seed_id]?.name ?? "Onbekend"}" wilt verwijderen?`)) return;
    try {
      await deletePlanting(p.id);
      await reload();
    } catch (e: any) {
      alert("Kon planting niet verwijderen: " + (e?.message ?? e));
    }
  }

  /* --------------------------- Views --------------------------- */

  function renderToolbar() {
    return (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActive("list")}
            className={`px-3 py-1.5 rounded-md border text-sm ${active==="list" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Lijst
          </button>
          <button
            onClick={() => setActive("grid")}
            className={`px-3 py-1.5 rounded-md border text-sm ${active==="grid" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Plattegrond
          </button>
          <button
            onClick={() => setActive("timeline")}
            className={`px-3 py-1.5 rounded-md border text-sm ${active==="timeline" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Timeline
          </button>
          <button
            onClick={() => setActive("conflicts")}
            className={`px-3 py-1.5 rounded-md border text-sm ${active==="conflicts" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Conflicten {conflictsCount > 0 && <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{conflictsCount}</span>}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {active === "timeline" && (
            <div className="flex items-center gap-1">
              <button className="px-2 py-1 border rounded" onClick={prevWeek}>← Vorige week</button>
              <div className="px-2 text-sm text-muted-foreground">
                Week van {currentWeek.toLocaleDateString("nl-NL")}
              </div>
              <button className="px-2 py-1 border rounded" onClick={nextWeek}>Volgende week →</button>
            </div>
          )}
          <button onClick={reload} className="px-3 py-1.5 rounded-md border text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Herladen
          </button>
        </div>
      </div>
    );
  }

  function renderListView() {
    return (
      <div className="space-y-3">
        {beds.length === 0 && (
          <div className="text-sm text-muted-foreground">Geen bakken gevonden.</div>
        )}

        {beds.map(bed => {
          const hasConflict = bedHasConflict(bed.id, conflictsMap, plantings);
          const list = plantingsByBed.get(bed.id) ?? [];
          return (
            <div key={bed.id} className="border rounded-lg bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{bed.name}</div>
                  {hasConflict && <AlertTriangle className="w-4 h-4 text-amber-500" title="Conflict in deze bak" />}
                  {bed.is_greenhouse && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {Math.max(1, bed.segments ?? 1)} segment{(bed.segments ?? 1) !== 1 ? "en" : ""}
                </div>
              </div>

              {list.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Geen plantingen in deze bak.</div>
              ) : (
                <div className="divide-y">
                  {list.map(p => {
                    const seed = seedsById[p.seed_id];
                    const hasPConflict = Boolean(conflictsMap.get(p.id)?.length);
                    return (
                      <div key={p.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4 flex items-center gap-2 min-w-0">
                          <span
                            className="inline-block w-3 h-3 rounded"
                            style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }}
                            aria-hidden
                          />
                          <div className="truncate">
                            <div className="truncate font-medium">{seed?.name ?? "Onbekend"}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {fmtDMY(p.planned_date)} → {fmtDMY(p.planned_harvest_end)}
                            </div>
                          </div>
                          {hasPConflict && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" title="Conflict met andere planning" />}
                        </div>
                        <div className="col-span-3 text-xs text-muted-foreground">
                          Segment {Math.max(1, (p.start_segment ?? 0) + 1)} • {Math.max(1, p.segments_used ?? 1)} segment{(p.segments_used ?? 1) !== 1 ? "en" : ""}
                        </div>
                        <div className="col-span-3 text-xs text-muted-foreground">
                          {p.method === "presow" ? "Voorzaai" : "Direct zaai/plant"}
                        </div>
                        <div className="col-span-2 flex justify-end gap-2">
                          <button className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={() => setEdit(p)}>
                            <Edit3 className="w-4 h-4" /> Wijzig
                          </button>
                          <button className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={() => handleDelete(p)}>
                            <Trash2 className="w-4 h-4" /> Verwijder
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderGridView() {
    // Eenvoudige plattegrond: per bak een kaart met segmenten-indicatie.
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {beds.map(bed => {
          const hasConflict = bedHasConflict(bed.id, conflictsMap, plantings);
          const list = plantingsByBed.get(bed.id) ?? [];
          const segCount = Math.max(1, bed.segments ?? 1);
          // Bouw segment -> plantings
          const segMap = Array.from({ length: segCount }, () => [] as Planting[]);
          for (const p of list) {
            const start = Math.max(0, p.start_segment ?? 0);
            const used = Math.max(1, p.segments_used ?? 1);
            for (let s = start; s < start + used && s < segCount; s++) segMap[s].push(p);
          }

          return (
            <div key={bed.id} className="border rounded-lg bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{bed.name}</div>
                  {hasConflict && <AlertTriangle className="w-4 h-4 text-amber-500" title="Conflict in deze bak" />}
                  {bed.is_greenhouse && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {segCount} segment{segCount !== 1 ? "en" : ""}
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y">
                {segMap.map((items, idx) => (
                  <div key={idx} className="p-3">
                    <div className="text-xs text-muted-foreground mb-2">Segment {idx + 1}</div>
                    {items.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Leeg</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {items.map(p => {
                          const seed = seedsById[p.seed_id];
                          const hasPConflict = Boolean(conflictsMap.get(p.id)?.length);
                          return (
                            <div key={p.id} className="border rounded p-2 flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="inline-block w-3 h-3 rounded"
                                  style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }}
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-sm">{seed?.name ?? "Onbekend"}</div>
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {fmtDMY(p.planned_date)} → {fmtDMY(p.planned_harvest_end)}
                                  </div>
                                </div>
                                {hasPConflict && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" title="Conflict met andere planning" />}
                              </div>
                              <div className="flex items-center gap-2">
                                <button className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={() => setEdit(p)}>
                                  <Edit3 className="w-4 h-4" /> Wijzig
                                </button>
                                <button className="px-2 py-1 border rounded text-sm flex items-center gap-1" onClick={() => handleDelete(p)}>
                                  <Trash2 className="w-4 h-4" /> Verwijder
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderTimelineView() {
    return (
      <TimelineView
        beds={beds}
        plantings={plantings}
        seeds={seeds}
        currentWeek={currentWeek}
        onReload={reload}
      />
    );
  }

  function renderConflictsTab() {
    return (
      <ConflictsTab
        beds={beds}
        plantings={plantings}
        seeds={seeds}
        onReload={reload}
      />
    );
  }

  /* --------------------------- Render --------------------------- */

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Planner</h2>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span>{beds.length} bak{beds.length!==1?'ken':''} • {plantings.length} planting{plantings.length!==1?'en':''} • {seeds.length} zaden</span>
        </div>
      </div>

      {renderToolbar()}

      {error && (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Laden…</div>
      ) : (
        <>
          {active === "list" && renderListView()}
          {active === "grid" && renderGridView()}
          {active === "timeline" && renderTimelineView()}
          {active === "conflicts" && renderConflictsTab()}
        </>
      )}

      {edit && (
        <PlantingEditor
          beds={beds}
          seeds={seeds}
          plantings={plantings}
          planting={edit}
          onClose={() => setEdit(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
