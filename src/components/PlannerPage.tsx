// src/pages/PlannerPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting, deletePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { AlertTriangle, Edit3, Trash2 } from "lucide-react";
import { TimelineView } from "../components/TimelineView";
import {
  buildConflictIndex,
  bedAndSegmentOptionsFor,
  parseISO,
  toISO,
} from "../lib/conflicts";
import ConflictsTab from "../components/ConflictsTab";
import { computeConflictsMap } from "../lib/conflicts"; // (optioneel: voor icoontjes elders)

type TabKey = "list" | "map" | "timeline" | "conflicts";

export default function PlannerPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tab, setTab] = useState<TabKey>("list");

  // Editor state (voor lijst & plattegrond)
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);
  const [editDate, setEditDate] = useState<string>("");
  const [editBedId, setEditBedId] = useState<string>("");
  const [editStartSeg, setEditStartSeg] = useState<number>(0);
  const [bedOptions, setBedOptions] = useState<{ bedId: string; bedName: string; segmentStarts: number[] }[]>([]);

  // Load
  useEffect(() => {
    Promise.all([listBeds(garden.id), listPlantings(garden.id), listSeeds(garden.id)])
      .then(([b, p, s]) => { setBeds(b); setPlantings(p); setSeeds(s); })
      .catch(console.error);
  }, [garden.id]);

  const onReload = async () => {
    const [p] = await Promise.all([listPlantings(garden.id)]);
    setPlantings(p);
  };

  // Conflicts index (bed-level flag + offenders voor Conflicten-tab)
  const conflictIndex = useMemo(() => buildConflictIndex(beds, plantings), [beds, plantings]);
  const bedHasConflict = conflictIndex.bedHasConflict;

  // Lookup helpers
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const bedsById  = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);

  // -------- Editor (voor lijst/plattegrond) --------
  const openEdit = (p: Planting) => {
    const startISO = p.planned_date ?? toISO(new Date());
    setEditPlanting(p);
    setEditDate(startISO);
    setEditBedId(p.garden_bed_id!);
    setEditStartSeg(Math.max(0, p.start_segment ?? 0));
  };

  // Refresh bed/segment-opties zodra date of planting wijzigt
  useEffect(() => {
    if (!editPlanting || !editDate) { setBedOptions([]); return; }
    const startISO = editDate;
    const endISO = editPlanting.planned_harvest_end || editPlanting.planned_date || editDate;
    const opts = bedAndSegmentOptionsFor(beds, plantings, editPlanting, startISO, endISO);
    setBedOptions(opts);
    if (opts.length > 0) {
      const current = opts.find(o => o.bedId === editBedId && o.segmentStarts.includes(editStartSeg));
      if (!current) {
        setEditBedId(opts[0].bedId);
        setEditStartSeg(opts[0].segmentStarts[0]);
      }
    }
  }, [beds, plantings, editPlanting, editDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveEdit = async () => {
    if (!editPlanting) return;
    try {
      const payload: any = {
        planned_date: editDate,
        garden_bed_id: editBedId,
        start_segment: editStartSeg,
      };
      await updatePlanting(editPlanting.id, payload);
      await onReload();
      setEditPlanting(null);
    } catch (e: any) {
      alert("Kon planting niet bijwerken: " + (e?.message ?? e));
    }
  };

  const handleDelete = async (p: Planting) => {
    if (!confirm("Weet je zeker dat je deze planting wilt verwijderen?")) return;
    try {
      await deletePlanting(p.id);
      await onReload();
    } catch (e: any) {
      alert("Kon planting niet verwijderen: " + (e?.message ?? e));
    }
  };

  // -------- UI helpers --------
  function formatDateNL(date: Date) {
    return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  // -------- Lijstweergave (alleen warning-icoon op bak) --------
  const ListView = () => {
    // groepeer per bak, volgorde op sort_order
    const orderedBeds = [...beds].sort((a,b)=>(a?.sort_order||0)-(b?.sort_order||0));

    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        {orderedBeds.map(bed => {
          const rows = plantings.filter(p => p.garden_bed_id === bed.id);
          return (
            <div key={bed.id} className="border-b">
              <div className="bg-muted/30 border-b">
                <div className="flex items-center">
                  <div className="w-full p-3 font-medium text-sm flex items-center gap-2">
                    <span>{bed.name}</span>
                    {bed.is_greenhouse && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                    )}
                    {bedHasConflict.get(bed.id) && (
                      <AlertTriangle className="w-4 h-4 text-red-500" title="Conflict in deze bak" />
                    )}
                  </div>
                </div>
              </div>

              <div className="divide-y">
                {rows.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Geen plantingen in deze bak.</div>
                ) : rows.map(p => {
                  const seed = seedsById[p.seed_id];
                  const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
                  return (
                    <div key={p.id} className="p-3 flex items-center gap-3">
                      <div className="inline-block w-3 h-3 rounded" style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{seed?.name ?? "Onbekend gewas"}</div>
                        <div className="text-xs text-muted-foreground">
                          {s && e ? `${formatDateNL(s)} – ${formatDateNL(e)}` : "Geen volledige planning"}
                          {" • "}Segment {Math.max(0, p.start_segment ?? 0) + 1}
                          {p.segments_used && p.segments_used > 1 ? ` (${p.segments_used} breed)` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="p-1.5 border rounded hover:bg-muted" onClick={() => openEdit(p)} title="Bewerken">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 border rounded hover:bg-muted" onClick={() => handleDelete(p)} title="Verwijderen">
                          <Trash2 className="w-4 h-4" />
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
  };

  // -------- Plattegrond (compacte kaartjes, alleen warning-icoon per bak) --------
  const MapView = () => {
    // Simpele “cards” per bak
    const orderedBeds = [...beds].sort((a,b)=>(a?.sort_order||0)-(b?.sort_order||0));

    return (
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {orderedBeds.map(bed => {
          const rows = plantings
            .filter(p => p.garden_bed_id === bed.id)
            .sort((a,b) => (a.planned_date ?? "").localeCompare(b.planned_date ?? ""));

          const segCount = Math.max(1, bed.segments ?? 1);

          return (
            <div key={bed.id} className="border rounded-lg bg-white">
              <div className="p-3 flex items-center gap-2 border-b bg-muted/30">
                <div className="font-medium">{bed.name}</div>
                {bed.is_greenhouse && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Kas</span>
                )}
                {bedHasConflict.get(bed.id) && (
                  <AlertTriangle className="w-4 h-4 text-red-500" title="Conflict in deze bak" />
                )}
                <div className="ml-auto text-xs text-muted-foreground">Segmenten: {segCount}</div>
              </div>

              <div className="p-3 space-y-2">
                {rows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Nog geen plantingen.</div>
                ) : rows.map(p => {
                  const seed = seedsById[p.seed_id];
                  const s = parseISO(p.planned_date); const e = parseISO(p.planned_harvest_end);
                  return (
                    <div key={p.id} className="border rounded p-2 flex items-center gap-2">
                      <div className="inline-block w-3 h-3 rounded" style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{seed?.name ?? "Onbekend gewas"}</div>
                        <div className="text-xs text-muted-foreground">
                          {s && e ? `${formatDateNL(s)} – ${formatDateNL(e)}` : "Geen volledige planning"}
                          {" • "}Segment {Math.max(0, p.start_segment ?? 0) + 1}
                          {p.segments_used && p.segments_used > 1 ? ` (${p.segments_used} breed)` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="p-1.5 border rounded hover:bg-muted" onClick={() => openEdit(p)} title="Bewerken">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 border rounded hover:bg-muted" onClick={() => handleDelete(p)} title="Verwijderen">
                          <Trash2 className="w-4 h-4" />
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
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab==="list" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={()=>setTab("list")}
        >
          Lijst
        </button>
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab==="map" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={()=>setTab("map")}
        >
          Plattegrond
        </button>
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab==="timeline" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={()=>setTab("timeline")}
        >
          Timeline
        </button>
        <button
          className={`px-3 py-1.5 rounded-md border text-sm ${tab==="conflicts" ? "bg-primary text-primary-foreground" : ""}`}
          onClick={()=>setTab("conflicts")}
        >
          Conflicten
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
          currentWeek={new Date()}
          onReload={onReload}
        />
      )}
      {tab === "conflicts" && (
 <ConflictsTab
  garden={garden}
  beds={beds}
  plantings={plantings}
  seeds={seeds}
  onReload={reloadAll}
/>
      )}

      {/* Editor (alleen gebruikt in lijst/plattegrond; Timeline heeft eigen editor) */}
      {editPlanting && (tab==="list" || tab==="map") && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditPlanting(null)}>
          <div className="bg-card w-full max-w-md rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">Planting bewerken</h4>

            <label className="block text-sm">
              Plantdatum
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="mt-1 w-full border rounded-md px-2 py-1"
              />
            </label>

            <label className="block text-sm">
              Bak (alleen waar het past)
              <select
                value={editBedId}
                onChange={(e) => {
                  const bedId = e.target.value;
                  setEditBedId(bedId);
                  const opt = bedOptions.find(o => o.bedId === bedId);
                  if (opt && opt.segmentStarts.length > 0) setEditStartSeg(opt.segmentStarts[0]);
                }}
                className="mt-1 w-full border rounded-md px-2 py-1"
              >
                {bedOptions.map(o => (
                  <option key={o.bedId} value={o.bedId}>{o.bedName}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              Startsegment
              <select
                value={String(editStartSeg)}
                onChange={(e) => setEditStartSeg(parseInt(e.target.value, 10))}
                className="mt-1 w-full border rounded-md px-2 py-1"
              >
                {bedOptions.find(o => o.bedId === editBedId)?.segmentStarts.map(i => (
                  <option key={i} value={i}>Segment {i+1}</option>
                )) ?? (
                  <option value={editStartSeg}>Segment {editStartSeg+1}</option>
                )}
              </select>
            </label>

            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setEditPlanting(null)}>Annuleren</button>
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleSaveEdit}
              >
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
