import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

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

/** Recompute planned_* fields given an anchor (presow/ground/harvest_start/harvest_end). */
function computePlanFromAnchor(params: {
  method: "direct" | "presow";
  seed: Seed;
  anchorType: "presow" | "ground" | "harvest_start" | "harvest_end";
  anchorISO: string;
  prev: Pick<Planting, "planned_date" | "planned_presow_date" | "planned_harvest_start" | "planned_harvest_end">;
}) {
  const { method, seed, anchorType, anchorISO, prev } = params;
  const presowW = seed.presow_duration_weeks ?? null;
  const growW = seed.grow_duration_weeks ?? null;
  const harvestW = seed.harvest_duration_weeks ?? null;

  let planned_date = prev.planned_date || anchorISO;
  let planned_presow_date = prev.planned_presow_date || null;
  let planned_harvest_start = prev.planned_harvest_start || null;
  let planned_harvest_end = prev.planned_harvest_end || null;

  const A = new Date(anchorISO);

  if (anchorType === "presow") {
    planned_presow_date = anchorISO;
    if (presowW != null) planned_date = toISO(addWeeks(A, presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "ground") {
    planned_date = anchorISO;
    if (method === "direct") planned_presow_date = null;
    else if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "harvest_start") {
    planned_harvest_start = anchorISO;
    if (harvestW != null) planned_harvest_end = toISO(addWeeks(A, harvestW));
    if (growW != null) {
      planned_date = toISO(addWeeks(A, -growW));
      if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
      if (method === "direct") planned_presow_date = null;
    }
  } else if (anchorType === "harvest_end") {
    planned_harvest_end = anchorISO;
    if (harvestW != null) {
      const hs = addWeeks(A, -harvestW);
      planned_harvest_start = toISO(hs);
      if (growW != null) {
        planned_date = toISO(addWeeks(hs, -growW));
        if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
        if (method === "direct") planned_presow_date = null;
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

  /* ---------- conflicts (dag-niveau + segmenten) ---------- */
  function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart <= bEnd && bStart <= aEnd; // dag-inclusief
  }
  function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
    const aEnd = aStartSeg + aUsed - 1, bEnd = bStartSeg + bUsed - 1;
    return aStartSeg <= bEnd && bStartSeg <= aEnd;
  }
  function detectConflictsFor(planting: Planting) {
    if (!planting.planned_date || !planting.planned_harvest_end) return { list: [], later: [] as Planting[] };
    const s1 = new Date(planting.planned_date);
    const e1 = new Date(planting.planned_harvest_end);
    const seg1 = planting.start_segment ?? 0, used1 = planting.segments_used ?? 1;
    const list: Planting[] = [];
    const later: Planting[] = [];
    for (const q of plantings) {
      if (q.id === planting.id) continue;
      if (q.garden_bed_id !== planting.garden_bed_id) continue;
      if (!q.planned_date || !q.planned_harvest_end) continue;
      const s2 = new Date(q.planned_date), e2 = new Date(q.planned_harvest_end);
      if (!intervalsOverlap(s1, e1, s2, e2)) continue;
      const seg2 = q.start_segment ?? 0, used2 = q.segments_used ?? 1;
      if (!segmentsOverlap(seg1, used1, seg2, used2)) continue;
      list.push(q);
      if ((q.planned_date ?? "") >= (planting.planned_date ?? "")) later.push(q);
    }
    return { list, later };
  }

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

      // 1) schrijf actual_* (server)
      await updatePlanting(task.planting_id, { [field]: performedISO } as any);

      // 1b) Optimistisch groen + task done
      setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, [field]: performedISO } as any : x));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "done" } : t));

      // 2) planned_* herberekenen vanaf deze actual (anker)
      const anchorType = anchorTypeFor(task, pl);
      const plan = computePlanFromAnchor({
        method: (pl.method as "direct"|"presow"),
        seed,
        anchorType,
        anchorISO: performedISO,
        prev: {
          planned_date: pl.planned_date,
          planned_presow_date: pl.planned_presow_date,
          planned_harvest_start: pl.planned_harvest_start,
          planned_harvest_end: pl.planned_harvest_end,
        },
      });
      await updatePlanting(task.planting_id, plan as any);

      // 3) taak afronden
      try { await updateTask(task.id, { status: "done" }); } catch {}

      // 4) herladen en conflicts op DAG-niveau checken (ground→harvest_end + segmenten)
      const { p } = await reloadAll();
      const updated = p.find(x => x.id === task.planting_id);
      if (updated) {
        const { later } = detectConflictsFor(updated);
        if (later.length > 0) pingPlannerConflict(updated.id);
      }
    } catch (e: any) {
      alert("Kon actie niet opslaan: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  /* ---------- acties: actual leegmaken (terug naar planning) ---------- */
  async function clearActual(task: Task) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      if (!pl) throw new Error("Planting niet gevonden");
      const field = actualFieldFor(task, pl);

      // 1) actual verwijderen
      await updatePlanting(task.planting_id, { [field]: null } as any);
      setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, [field]: null } as any : x));

      // 2) taak terug naar pending
      await updateTask(task.id, { status: "pending" });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "pending" } : t));

      // 3) resync
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
                        <div className="font-medium truncate">{seed?.name ?? "Onbekend gewas"}</div>
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

                  {/* midden: timeline */}
                  <div className="col-span-12 md:col-span-8">
                    <div className="relative h-12">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded bg-muted" />
                      <div className="absolute top-0 bottom-0 w-[2px] bg-primary/60"
                           style={{ left: `${pctInRange(todayDate, start, end)}%` }} title="Vandaag" />
                      {ms.map((m, idx) => {
                        const baseISO = m.actualISO ?? m.task?.due_date ?? m.plannedISO;
                        if (!baseISO) return null;
                        const d = new Date(baseISO);
                        const pct = pctInRange(d, start, end);
                        const isDone = m.status === "done"; // groen zodra er een actual is of task done
                        const isNext = next && idx === next.index && !isDone;
                        const isLatePending = isNext && m.task?.due_date && new Date(m.task.due_date) < todayDate;

                        const canFill = isDone || isNext; // alleen eerstvolgende open actie invulbaar; done mag je wel bewerken/legen
                        const dotClasses = [
                          "absolute -translate-x-1/2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border shadow",
                          canFill ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                          isDone ? "bg-green-500 border-green-600"
                                 : isNext ? "bg-yellow-400 border-yellow-500"
                                          : "bg-gray-300 border-gray-400",
                          isLatePending ? "ring-2 ring-red-400" : "",
                        ].join(" ");
                        const title =
                          `${m.label}` +
                          (m.actualISO ? ` • uitgevoerd: ${fmtDMY(m.actualISO)}` :
                           m.task?.due_date ? ` • gepland: ${fmtDMY(m.task.due_date)}` :
                           m.plannedISO ? ` • gepland: ${fmtDMY(m.plannedISO)}` : "");

                        return (
                          <div key={m.id}>
                            <div
                              className={dotClasses}
                              style={{ left: `${pct}%` }}
                              title={canFill ? title : "Je kunt alleen de eerstvolgende actie invullen"}
                              onClick={() => {
                                if (!canFill) return;
                                const t = m.task; if (!t) return;
                                const defaultISO = (m.actualISO || toISO(new Date()));
                                setDialog({ task: t, dateISO: defaultISO, hasActual: !!m.actualISO });
                              }}
                            >
                              {isDone && <span className="text-[10px] text-white grid place-items-center w-full h-full">✓</span>}
                            </div>
                            {/* datumlabel onder de dot: actual indien aanwezig, anders planned/due */}
                            <div
                              className="absolute -translate-x-1/2 top-[calc(50%+14px)] text-[10px] text-muted-foreground"
                              style={{ left: `${pct}%` }}
                            >
                              {fmtDMY(m.actualISO ?? m.plannedISO ?? m.task?.due_date ?? null)}
                            </div>
                          </div>
                        );
                      })}
                      <div className="absolute left-0 right-0 -bottom-1.5 flex justify-between text-[10px] text-muted-foreground">
                        <span>{fmtDMY(toISO(start))}</span>
                        <span>{fmtDMY(toISO(end))}</span>
                      </div>
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
}  let planned_presow_date = prev.planned_presow_date || null;
  let planned_harvest_start = prev.planned_harvest_start || null;
  let planned_harvest_end = prev.planned_harvest_end || null;

  const A = new Date(anchorISO);

  if (anchorType === "presow") {
    planned_presow_date = anchorISO;
    if (presowW != null) planned_date = toISO(addWeeks(A, presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "ground") {
    planned_date = anchorISO;
    if (method === "direct") planned_presow_date = null;
    else if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
    if (growW != null) planned_harvest_start = toISO(addWeeks(new Date(planned_date), growW));
    if (harvestW != null && planned_harvest_start) planned_harvest_end = toISO(addWeeks(new Date(planned_harvest_start), harvestW));
  } else if (anchorType === "harvest_start") {
    planned_harvest_start = anchorISO;
    if (harvestW != null) planned_harvest_end = toISO(addWeeks(A, harvestW));
    if (growW != null) {
      planned_date = toISO(addWeeks(A, -growW));
      if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
      if (method === "direct") planned_presow_date = null;
    }
  } else if (anchorType === "harvest_end") {
    planned_harvest_end = anchorISO;
    if (harvestW != null) {
      const hs = addWeeks(A, -harvestW);
      planned_harvest_start = toISO(hs);
      if (growW != null) {
        planned_date = toISO(addWeeks(hs, -growW));
        if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
        if (method === "direct") planned_presow_date = null;
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
    mode: "run" | "reopen";
    task: Task;
    dateISO: string;
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
  function pingPlannerConflict(plantingId: string, fromISO?: string | null, toISO?: string | null) {
    try {
      localStorage.setItem("plannerNeedsAttention", "1");
      localStorage.setItem("plannerOpenTab", "conflicts");
      localStorage.setItem("plannerConflictFocusId", plantingId);
      if (fromISO) localStorage.setItem("plannerFlashFrom", fromISO);
      if (toISO)   localStorage.setItem("plannerFlashTo", toISO);
      localStorage.setItem("plannerFlashAt", String(Date.now()));
    } catch {}
  }

  /* ---------- acties uitvoeren/heropenen ---------- */
  async function runTask(task: Task, performedISO: string) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      const seed = pl ? seedsById[pl.seed_id] : null;
      if (!pl || !seed) throw new Error("Planting/seed niet gevonden");

      // 1) schrijf ALTIJD actual_* (server)
      const actuals: any = {};
      if (task.type === "sow") {
        if (pl.method === "presow") actuals.actual_presow_date = performedISO;
        else actuals.actual_ground_date = performedISO;
      } else if (task.type === "plant_out") {
        actuals.actual_ground_date = performedISO;
      } else if (task.type === "harvest_start") {
        actuals.actual_harvest_start = performedISO;
      } else if (task.type === "harvest_end") {
        actuals.actual_harvest_end = performedISO;
      }
      await updatePlanting(task.planting_id, actuals as any);

      // 1b) OPTIMISTISCHE UI: markeer lokaal meteen done & zet actuals,
      // zodat het bolletje direct groen wordt (ook als plan-update straks faalt).
      setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, ...actuals } : x));
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "done" } : t));

      // 2) planned_* herberekenen vanaf deze ankerdatum; proberen toe te passen
      const anchorType: "presow" | "ground" | "harvest_start" | "harvest_end" =
        task.type === "sow" ? (pl.method === "presow" ? "presow" : "ground")
        : task.type === "plant_out" ? "ground"
        : task.type === "harvest_start" ? "harvest_start"
        : "harvest_end";

      const plan = computePlanFromAnchor({
        method: pl.method as "direct" | "presow",
        seed,
        anchorType,
        anchorISO: performedISO,
        prev: {
          planned_date: pl.planned_date,
          planned_presow_date: pl.planned_presow_date,
          planned_harvest_start: pl.planned_harvest_start,
          planned_harvest_end: pl.planned_harvest_end,
        },
      });

      try {
        await updatePlanting(task.planting_id, plan as any);
      } catch {
        // Overlap → laat planner oplossen, maar actual blijft staan en bolletje blijft groen
        pingPlannerConflict(task.planting_id, pl.planned_date, plan.planned_date);
      }

      // 3) taak afronden (server)
      try { await updateTask(task.id, { status: "done" }); } catch (e: any) {
        const msg = String(e?.message ?? e);
        const benign = msg.includes("no row could be fetched") || msg.includes("no row returned");
        if (!benign) throw e;
      }

      // 4) herladen om definitief te syncen
      const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
      setPlantings(p); setTasks(t);
    } catch (e: any) {
      alert("Kon actie niet afronden: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  async function reopenTask(task: Task, newPlannedISO: string) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      const seed = pl ? seedsById[pl.seed_id] : null;
      if (!pl || !seed) throw new Error("Planting/seed niet gevonden");

      const clearActuals: any = {};
      if (task.type === "sow") {
        if (pl.method === "presow") clearActuals.actual_presow_date = null;
        else clearActuals.actual_ground_date = null;
      } else if (task.type === "plant_out") {
        clearActuals.actual_ground_date = null;
      } else if (task.type === "harvest_start") {
        clearActuals.actual_harvest_start = null;
      } else if (task.type === "harvest_end") {
        clearActuals.actual_harvest_end = null;
      }

      const anchorType: "presow" | "ground" | "harvest_start" | "harvest_end" =
        task.type === "sow" ? (pl.method === "presow" ? "presow" : "ground")
        : task.type === "plant_out" ? "ground"
        : task.type === "harvest_start" ? "harvest_start"
        : "harvest_end";

      const plan = computePlanFromAnchor({
        method: pl.method as "direct" | "presow",
        seed,
        anchorType,
        anchorISO: newPlannedISO,
        prev: {
          planned_date: pl.planned_date,
          planned_presow_date: pl.planned_presow_date,
          planned_harvest_start: pl.planned_harvest_start,
          planned_harvest_end: pl.planned_harvest_end,
        },
      });

      try {
        await updatePlanting(task.planting_id, { ...clearActuals, ...plan } as any);
        // optimistisch de lokale state updaten zodat UI gelijk klopt
        setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, ...clearActuals, ...plan } : x));
      } catch {
        // plan past niet → zet iig clear actuals en ping planner
        try { await updatePlanting(task.planting_id, clearActuals as any); } catch {}
        setPlantings(prev => prev.map(x => x.id === task.planting_id ? { ...x, ...clearActuals } : x));
        pingPlannerConflict(task.planting_id, pl.planned_date, plan.planned_date);
        alert("Actie is heropend, maar de nieuwe planning past niet. De Planner toont dit nu bij ‘Conflicten’.");
      }

      // taak terug naar pending (server + optimistisch)
      await updateTask(task.id, { status: "pending" });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "pending" } : t));

      // resync
      const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
      setPlantings(p); setTasks(t);
    } catch (e: any) {
      alert("Kon actie niet heropenen: " + (e?.message ?? e));
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
                        <div className="font-medium truncate">{seed?.name ?? "Onbekend gewas"}</div>
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

                  {/* midden: timeline */}
                  <div className="col-span-12 md:col-span-8">
                    <div className="relative h-12">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded bg-muted" />
                      <div className="absolute top-0 bottom-0 w-[2px] bg-primary/60"
                           style={{ left: `${pctInRange(todayDate, start, end)}%` }} title="Vandaag" />
                      {ms.map((m, idx) => {
                        const baseISO = m.actualISO ?? m.task?.due_date ?? m.plannedISO;
                        if (!baseISO) return null;
                        const d = new Date(baseISO);
                        const pct = pctInRange(d, start, end);
                        const isDone = m.status === "done"; // groen zodra er een actual is (of task.status=done)
                        const isNext = next && idx === next.index && !isDone;
                        const isLatePending = isNext && m.task?.due_date && new Date(m.task.due_date) < todayDate;
                        const dotClasses = [
                          "absolute -translate-x-1/2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border shadow cursor-pointer",
                          isDone ? "bg-green-500 border-green-600"
                                 : isNext ? "bg-yellow-400 border-yellow-500"
                                          : "bg-gray-300 border-gray-400",
                          isLatePending ? "ring-2 ring-red-400" : "",
                        ].join(" ");
                        const title =
                          `${m.label}` +
                          (m.actualISO ? ` • uitgevoerd: ${fmtDMY(m.actualISO)}` :
                           m.task?.due_date ? ` • gepland: ${fmtDMY(m.task.due_date)}` :
                           m.plannedISO ? ` • gepland: ${fmtDMY(m.plannedISO)}` : "");
                        return (
                          <div
                            key={m.id}
                            className={dotClasses}
                            style={{ left: `${pct}%` }}
                            title={title}
                            onClick={() => {
                              const t = m.task;
                              if (!t) return;
                              if (t.status === "done" || m.actualISO) {
                                const def = t.due_date || m.plannedISO || toISO(new Date());
                                setDialog({ mode: "reopen", task: t, dateISO: def! });
                              } else {
                                setDialog({ mode: "run", task: t, dateISO: toISO(new Date()) });
                              }
                            }}
                          >
                            {isDone && <span className="text-[10px] text-white grid place-items-center w-full h-full">✓</span>}
                          </div>
                        );
                      })}
                      <div className="absolute left-0 right-0 -bottom-1.5 flex justify-between text-[10px] text-muted-foreground">
                        <span>{fmtDMY(toISO(start))}</span>
                        <span>{fmtDMY(toISO(end))}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Dialog: uitvoeren / heropenen */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDialog(null)}>
          <div className="bg-card w-full max-w-sm rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">
              {dialog.mode === "run" ? "Actie uitvoeren" : "Actie heropenen / verplaatsen"}
            </h4>
            <p className="text-sm">
              {(() => {
                const p = plantingsById[dialog.task.planting_id];
                return `${labelForType(dialog.task.type, p?.method)} • ${seedNameFor(dialog.task)} • ${bedNameFor(dialog.task)}`;
              })()}
            </p>
            <label className="block text-sm">
              {dialog.mode === "run" ? "Uitgevoerd op" : "Nieuwe geplande datum"}
              <input
                type="date"
                value={dialog.dateISO}
                onChange={(e) => setDialog(d => d ? { ...d, dateISO: e.target.value } : d)}
                className="mt-1 w-full border rounded-md px-2 py-1"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setDialog(null)}>Annuleren</button>
              {dialog.mode === "run" ? (
                <button
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  onClick={() => runTask(dialog.task, dialog.dateISO)}
                  disabled={busyId === dialog.task.id}
                >
                  {busyId === dialog.task.id ? "Opslaan…" : "Opslaan"}
                </button>
              ) : (
                <button
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  onClick={() => reopenTask(dialog.task, dialog.dateISO)}
                  disabled={busyId === dialog.task.id}
                >
                  {busyId === dialog.task.id ? "Heropenen…" : "Heropenen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
