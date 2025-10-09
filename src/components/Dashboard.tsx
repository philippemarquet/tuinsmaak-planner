import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { useConflictFlags } from "../hooks/useConflictFlags";

/* ---------- helpers ---------- */
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, w: number) { const x = new Date(d); x.setDate(x.getDate() + w * 7); return x; }
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function fmtDMY(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth()+1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Volledig deterministische herleiding vanaf een gekozen anker. */
function computePlanFromAnchor(params: {
  method: "direct" | "presow";
  seed: Seed;
  anchorType: "presow" | "ground" | "harvest_start" | "harvest_end";
  anchorISO: string;
}) {
  const { method, seed, anchorType, anchorISO } = params;
  const presowW = seed.presow_duration_weeks ?? 0;
  const growW = seed.grow_duration_weeks ?? null;
  const harvestW = seed.harvest_duration_weeks ?? null;

  let planned_date: string | null = null;
  let planned_presow_date: string | null = null;
  let planned_harvest_start: string | null = null;
  let planned_harvest_end: string | null = null;

  const A = new Date(anchorISO);

  if (anchorType === "presow") {
    planned_presow_date = anchorISO;
    const ground = addWeeks(A, presowW);
    planned_date = toISO(ground);

    if (growW != null) {
      const hs = addWeeks(ground, growW);
      planned_harvest_start = toISO(hs);
      if (harvestW != null) planned_harvest_end = toISO(addWeeks(hs, harvestW));
    }
  } else if (anchorType === "ground") {
    planned_date = anchorISO;
    planned_presow_date = method === "presow" ? toISO(addWeeks(new Date(anchorISO), -presowW)) : null;

    if (growW != null) {
      const hs = addWeeks(new Date(anchorISO), growW);
      planned_harvest_start = toISO(hs);
      if (harvestW != null) planned_harvest_end = toISO(addWeeks(hs, harvestW));
    }
  } else if (anchorType === "harvest_start") {
    planned_harvest_start = anchorISO;

    if (harvestW != null) planned_harvest_end = toISO(addWeeks(A, harvestW));

    if (growW != null) {
      const ground = addWeeks(A, -growW);
      planned_date = toISO(ground);
      planned_presow_date = method === "presow" ? toISO(addWeeks(ground, -presowW)) : null;
    }
  } else if (anchorType === "harvest_end") {
    planned_harvest_end = anchorISO;

    if (harvestW != null) {
      const hs = addWeeks(A, -harvestW);
      planned_harvest_start = toISO(hs);
      if (growW != null) {
        const ground = addWeeks(hs, -growW);
        planned_date = toISO(ground);
        planned_presow_date = method === "presow" ? toISO(addWeeks(ground, -presowW)) : null;
      }
    }
  }

  return { planned_date, planned_presow_date, planned_harvest_start, planned_harvest_end };
}

/* ---------- types voor timeline ---------- */
type MilestoneId = "presow" | "ground" | "harvest_start" | "harvest_end";
type Milestone = {
  id: MilestoneId;
  label: string;
  taskType: Task["type"];
  plannedISO: string | null;
  actualISO: string | null;
  task: Task | null;
  status: "pending" | "done" | "skipped";
};

/* ---------- hoofdcomponent ---------- */
export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAll, setShowAll] = useState(false);

  const [dialog, setDialog] = useState<{
    task: Task;
    dateISO: string;
    hasActual: boolean;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listBeds(garden.id),
      listPlantings(garden.id),
      listSeeds(garden.id),
      listTasks(garden.id),
    ])
      .then(([b, p, s, t]) => { setBeds(b); setPlantings(p); setSeeds(s); setTasks(t); })
      .catch(console.error);
  }, [garden.id]);

  const bedsById = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const plantingsById = useMemo(() => Object.fromEntries(plantings.map(p => [p.id, p])), [plantings]);

  /* ---------- conflicts ---------- */
  const conflictsMap = useMemo(() => buildConflictsMap(plantings, seeds), [plantings, seeds]);
  const totalConflicts = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);
  
  // Update conflict flags (badge elders)
  useConflictFlags(totalConflicts);

  /* ---------- indexeer tasks per planting & type ---------- */
  const tasksIndex = useMemo(() => {
    const map = new Map<string, Map<Task["type"], Task>>();
    for (const t of tasks) {
      if (!map.has(t.planting_id)) map.set(t.planting_id, new Map());
      map.get(t.planting_id)!.set(t.type, t);
    }
    return map;
  }, [tasks]);

  /* ---------- labels ---------- */
  function seedNameFor(t: Task) {
    const pl = plantingsById[t.planting_id]; const seed = pl ? seedsById[pl.seed_id] : null;
    return seed?.name ?? "Onbekend gewas";
  }
  function bedNameFor(t: Task) {
    const pl = plantingsById[t.planting_id]; const bed = pl ? bedsById[pl.garden_bed_id] : null;
    return bed?.name ?? "Onbekende bak";
  }
  function labelForType(type: Task["type"], method?: Planting["method"]) {
    if (type === "sow") return method === "presow" ? "Voorzaaien" : "Zaaien";
    if (type === "plant_out") return "Uitplanten";
    if (type === "harvest_start") return "Start oogst";
    if (type === "harvest_end") return "Einde oogst";
    return type;
  }

  /* ---------- milestones per planting ---------- */
  function milestonesFor(p: Planting): Milestone[] {
    const method = p.method as "direct" | "presow" | null;
    const tmap = tasksIndex.get(p.id);

    const resolveStatus = (actualISO: string | null | undefined, task?: Task | null) =>
      actualISO ? "done" : (task?.status ?? "pending") as "pending" | "done" | "skipped";

    const out: Milestone[] = [];

    if (method === "presow") {
      const tSow = tmap?.get("sow") ?? null;
      out.push({
        id: "presow",
        label: "Voorzaaien",
        taskType: "sow",
        plannedISO: p.planned_presow_date,
        actualISO: p.actual_presow_date,
        task: tSow,
        status: resolveStatus(p.actual_presow_date, tSow),
      });

      const tPlant = tmap?.get("plant_out") ?? null;
      out.push({
        id: "ground",
        label: "Uitplanten",
        taskType: "plant_out",
        plannedISO: p.planned_date,
        actualISO: p.actual_ground_date,
        task: tPlant,
        status: resolveStatus(p.actual_ground_date, tPlant),
      });
    } else {
      const tSow = tmap?.get("sow") ?? null;
      out.push({
        id: "ground",
        label: "Zaaien",
        taskType: "sow",
        plannedISO: p.planned_date,
        actualISO: p.actual_ground_date,
        task: tSow,
        status: resolveStatus(p.actual_ground_date, tSow),
      });
    }

    const tHs = tmap?.get("harvest_start") ?? null;
    out.push({
      id: "harvest_start",
      label: "Start oogst",
      taskType: "harvest_start",
      plannedISO: p.planned_harvest_start,
      actualISO: p.actual_harvest_start,
      task: tHs,
      status: resolveStatus(p.actual_harvest_start, tHs),
    });

    const tHe = tmap?.get("harvest_end") ?? null;
    out.push({
      id: "harvest_end",
      label: "Einde oogst",
      taskType: "harvest_end",
      plannedISO: p.planned_harvest_end,
      actualISO: p.actual_harvest_end,
      task: tHe,
      status: resolveStatus(p.actual_harvest_end, tHe),
    });

    return out;
  }

  function firstOpenMilestone(p: Planting): { ms: Milestone; index: number; whenISO: string } | null {
    const ms = milestonesFor(p);
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const due = m.task?.due_date ?? m.plannedISO ?? null;
      if (m.status !== "done" && due) return { ms: m, index: i, whenISO: due };
    }
    return null;
  }

  /* ---------- filter/sort: komende 2 weken of alles ---------- */
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = addDays(today, 14);

  const plantingsSorted = useMemo(() => {
    const withKeys = plantings.map(p => {
      const nxt = firstOpenMilestone(p);
      const keyDate = nxt?.whenISO ? new Date(nxt.whenISO) : (p.planned_harvest_end ? new Date(p.planned_harvest_end) : addDays(today, 365));
      return { p, nxt, keyDate };
    });

    const filtered = showAll
      ? withKeys
      : withKeys.filter(x => x.nxt && (() => {
          const d = new Date(x.nxt!.whenISO);
          return d >= today && d <= horizon;
        })());

    filtered.sort((a,b) => a.keyDate.getTime() - b.keyDate.getTime());
    return filtered.map(x => x.p);
  }, [plantings, showAll]);

  /* ---------- planner ping helper ---------- */
  function pingPlannerConflict(plantingId: string) {
    try {
      localStorage.setItem("plannerNeedsAttention", "1");
      localStorage.setItem("plannerOpenTab", "conflicts");
      localStorage.setItem("plannerConflictFocusId", plantingId);
      localStorage.setItem("plannerFlashAt", String(Date.now()));
    } catch {}
  }

  // Update conflict flags in localStorage
  useEffect(() => {
    try {
      localStorage.setItem("plannerHasConflicts", totalConflicts > 0 ? "1" : "0");
      localStorage.setItem("plannerConflictCount", String(totalConflicts));
    } catch {}
  }, [totalConflicts]);

  async function reloadAll() {
    const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
    setPlantings(p); setTasks(t);
    return { p, t };
  }

  /* ---------- mapping helpers ---------- */
  function actualFieldFor(task: Task, p: Planting) {
    if (task.type === "sow") {
      return (p.method === "presow") ? "actual_presow_date" : "actual_ground_date";
    }
    if (task.type === "plant_out") return "actual_ground_date";
    if (task.type === "harvest_start") return "actual_harvest_start";
    return "actual_harvest_end";
  }
  function anchorTypeFor(task: Task, p: Planting): "presow" | "ground" | "harvest_start" | "harvest_end" {
    if (task.type === "sow") return (p.method === "presow") ? "presow" : "ground";
    if (task.type === "plant_out") return "ground";
    if (task.type === "harvest_start") return "harvest_start";
    return "harvest_end";
  }

  /* ---------- acties: actual invullen / wijzigen ---------- */
  async function applyActual(task: Task, performedISO: string) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      const seed = pl ? seedsById[pl.seed_id] : null;
      if (!pl || !seed) throw new Error("Planting/seed niet gevonden");

      const field = actualFieldFor(task, pl);

      // 1) actual_* altijd opslaan
      await updatePlanting(task.planting_id, { [field]: performedISO } as any);

      // Optimistisch UI bijwerken
      setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, [field]: performedISO } as any : x));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "done" } : t));

      // 2) Vanaf deze actual de keten herleiden (alleen deze planting)
      const anchorType = anchorTypeFor(task, pl);
      const plan = computePlanFromAnchor({
        method: (pl.method as "direct"|"presow"),
        seed,
        anchorType,
        anchorISO: performedISO,
      });

      try {
        await updatePlanting(task.planting_id, plan as any);
      } catch (e) {
        console.warn("Plan update gaf fout (waarschijnlijk overlap):", e);
      }

      // 3) taak afronden (best-effort)
      try { await updateTask(task.id, { status: "done" }); } catch {}

      // 4) herladen en conflicts checken; ping Planner bij conflict
      const { p } = await reloadAll();
      const cmap = buildConflictsMap(p, seeds);
      const conflicts = cmap.get(task.planting_id) ?? [];
      
      if (conflicts.length > 0) {
        pingPlannerConflict(task.planting_id);
      }
    } catch (e: any) {
      alert("Kon actie niet opslaan: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  /* ---------- acties: actual leegmaken ---------- */
  async function clearActual(task: Task) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      if (!pl) throw new Error("Planting niet gevonden");
      const field = actualFieldFor(task, pl);

      await updatePlanting(task.planting_id, { [field]: null } as any);
      setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, [field]: null } as any : x));

      await updateTask(task.id, { status: "pending" });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "pending" } : t));

      await reloadAll();
    } catch (e: any) {
      alert("Kon datum niet leegmaken: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  /* ---------- UI helpers timeline ---------- */
  function rangeForRow(p: Planting) {
    const ms = milestonesFor(p);
    const dates: Date[] = [];
    for (const m of ms) {
      if (m.plannedISO) dates.push(new Date(m.plannedISO));
      if (m.actualISO) dates.push(new Date(m.actualISO));
    }
    if (dates.length === 0) {
      const now = new Date();
      return { start: now, end: addDays(now, 7) };
    }
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    if (start.getTime() === end.getTime()) end.setDate(end.getDate() + 7);
    return { start, end };
  }
  function pctInRange(d: Date, start: Date, end: Date) {
    const p = (d.getTime() - start.getTime()) / (end.getTime() - start.getTime());
    return clamp01(p) * 100;
  }
  const todayDate = new Date();

  /* ---------- render ---------- */
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <button
          onClick={() => setShowAll(s => !s)}
          className="px-3 py-1.5 rounded-md border text-sm"
        >
          {showAll ? "Komende 2 weken" : "Alle plantingen"}
        </button>
      </div>

      {/* Conflict banner (alleen info; geen auto-oplossen meer) */}
      {totalConflicts > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 flex items-center justify-between">
          <div className="text-sm">
            ⚠️ {totalConflicts} conflict{totalConflicts!==1?"en":""} gedetecteerd. Bekijk en los op in de Planner (tabblad “Conflicten”).
          </div>
          <button
            className="text-sm px-2 py-1 rounded border border-amber-300 hover:bg-amber-100"
            onClick={() => {
              try {
                localStorage.setItem("plannerOpenTab", "conflicts");
                window.location.hash = "#planner";
              } catch {}
            }}
          >
            Open conflicten
          </button>
        </div>
      )}

      <section className="space-y-3">
        {plantingsSorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showAll ? "Geen plantingen gevonden." : "Geen acties in de komende 2 weken."}
          </p>
        ) : (
          plantingsSorted.map((p) => {
            const seed = seedsById[p.seed_id];
            const bed = bedsById[p.garden_bed_id];
            const ms = milestonesFor(p);
            const next = firstOpenMilestone(p);
            const { start, end } = rangeForRow(p);
            const nextLabel = next ? `${next.ms.label} • ${fmtDMY(next.whenISO)}` : null;

            const conflictCount = conflictsMap.get(p.id)?.length ?? 0;
            const hasConflict = conflictCount > 0;

            return (
              <div key={p.id} className="border rounded-lg p-3 bg-card">
                <div className="grid grid-cols-12 gap-3 items-center">
                  {/* links: label + volgende actie */}
                  <div className="col-span-12 md:col-span-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded"
                        style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          <span className="truncate">{seed?.name ?? "Onbekend gewas"}</span>
                          {hasConflict && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-200">
                              ⚠️ Conflict
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{bed?.name ?? "Onbekende bak"}</div>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs flex items-center gap-2 text-muted-foreground">
                      {nextLabel ? (
                        <>
                          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
                          <span className="truncate">Volgende: {nextLabel}</span>
                        </>
                      ) : (
                        <span className="truncate">Alle acties afgerond</span>
                      )}
                    </div>
                  </div>

                  {/* midden: milestones lijst */}
                  <div className="col-span-12 md:col-span-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {ms.map((m, idx) => {
                        const isDone = m.status === "done";
                        const isNext = next && idx === next.index && !isDone;
                        const isPending = !isDone && !isNext;
                        const baseISO = m.actualISO ?? m.task?.due_date ?? m.plannedISO;
                        const title = `${m.label}` +
                          (m.actualISO ? ` • uitgevoerd: ${fmtDMY(m.actualISO)}` :
                           m.task?.due_date ? ` • gepland: ${fmtDMY(m.task.due_date)}` :
                           m.plannedISO ? ` • gepland: ${fmtDMY(m.plannedISO)}` : "");
                        const bulletCls = isDone
                          ? "bg-green-500 border-green-600"
                          : isNext
                          ? "bg-yellow-400 border-yellow-500"
                          : "bg-gray-300 border-gray-400";
                        const canClick = isDone || isNext;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={`flex items-center gap-2 p-2 rounded border bg-background text-left ${canClick?"hover:bg-muted cursor-pointer":"opacity-60 cursor-not-allowed"}`}
                            title={canClick ? title : "Je kunt alleen de eerstvolgende actie invullen"}
                            onClick={() => {
                              if (!canClick) return;
                              const t = m.task; if (!t) return;
                              const defaultISO = (m.actualISO || toISO(new Date()));
                              setDialog({ task: t, dateISO: defaultISO, hasActual: !!m.actualISO });
                            }}
                          >
                            <span className={`inline-flex w-4 h-4 rounded-full border shadow ${bulletCls}`} />
                            <span className="text-xs flex-1 min-w-0">
                              <span className="block font-medium truncate">{m.label}</span>
                              <span className="block text-muted-foreground truncate">
                                {baseISO ? fmtDMY(baseISO) : "—"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Dialog: actie uitvoeren / bewerken of leegmaken */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDialog(null)}>
          <div className="bg-card w-full max-w-sm rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">Actie {dialog.hasActual ? "bewerken" : "uitvoeren"}</h4>
            <p className="text-sm">
              {(() => {
                const p = plantingsById[dialog.task.planting_id];
                return `${labelForType(dialog.task.type, p?.method)} • ${seedNameFor(dialog.task)} • ${bedNameFor(dialog.task)}`;
              })()}
            </p>
            <label className="block text-sm">
              Datum
              <input
                type="date"
                value={dialog.dateISO}
                onChange={(e) => setDialog(d => d ? { ...d, dateISO: e.target.value } : d)}
                className="mt-1 w-full border rounded-md px-2 py-1"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setDialog(null)}>Annuleren</button>
              {dialog.hasActual && (
                <button
                  className="px-3 py-1.5 rounded-md border"
                  onClick={() => clearActual(dialog.task)}
                  disabled={busyId === dialog.task.id}
                >
                  {busyId === dialog.task.id ? "Leegmaken…" : "Leegmaken"}
                </button>
              )}
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                onClick={() => applyActual(dialog.task, dialog.dateISO)}
                disabled={busyId === dialog.task.id}
              >
                {busyId === dialog.task.id ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
