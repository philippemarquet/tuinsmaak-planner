// src/components/Dashboard.tsx
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

  const [dialog, setDialog] = useState<{ mode: "run" | "reopen"; task: Task; dateISO: string } | null>(null);
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

  /* ---------- helpers voor labels ---------- */
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

    const m: Milestone[] = [];

    if (method === "presow") {
      m.push({
        id: "presow",
        label: "Voorzaaien",
        taskType: "sow",
        plannedISO: p.planned_presow_date,
        actualISO: p.actual_presow_date,
        task: tmap?.get("sow") ?? null,
        status: (tmap?.get("sow")?.status ?? (p.actual_presow_date ? "done" : "pending")) as any,
      });
      m.push({
        id: "ground",
        label: "Uitplanten",
        taskType: "plant_out",
        plannedISO: p.planned_date,
        actualISO: p.actual_ground_date,
        task: tmap?.get("plant_out") ?? null,
        status: (tmap?.get("plant_out")?.status ?? (p.actual_ground_date ? "done" : "pending")) as any,
      });
    } else {
      m.push({
        id: "ground",
        label: "Zaaien",
        taskType: "sow",
        plannedISO: p.planned_date,
        actualISO: p.actual_ground_date,
        task: tmap?.get("sow") ?? null,
        status: (tmap?.get("sow")?.status ?? (p.actual_ground_date ? "done" : "pending")) as any,
      });
    }

    m.push({
      id: "harvest_start",
      label: "Start oogst",
      taskType: "harvest_start",
      plannedISO: p.planned_harvest_start,
      actualISO: p.actual_harvest_start,
      task: tmap?.get("harvest_start") ?? null,
      status: (tmap?.get("harvest_start")?.status ?? (p.actual_harvest_start ? "done" : "pending")) as any,
    });
    m.push({
      id: "harvest_end",
      label: "Einde oogst",
      taskType: "harvest_end",
      plannedISO: p.planned_harvest_end,
      actualISO: p.actual_harvest_end,
      task: tmap?.get("harvest_end") ?? null,
      status: (tmap?.get("harvest_end")?.status ?? (p.actual_harvest_end ? "done" : "pending")) as any,
    });

    return m;
  }

  function firstOpenMilestone(p: Planting): { ms: Milestone; whenISO: string } | null {
    const ms = milestonesFor(p);
    for (const m of ms) {
      const t = m.task;
      const due = t?.due_date ?? m.plannedISO ?? null;
      if (m.status !== "done" && due) return { ms: m, whenISO: due };
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

  /* ---------- acties uitvoeren/heropenen ---------- */

  // Uitvoeren: schrijf actual_* en herbereken planned_* vanaf de gekozen actie (anker), daarna alles herladen
  async function runTask(task: Task, performedISO: string) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      const seed = pl ? seedsById[pl.seed_id] : null;
      if (!pl || !seed) throw new Error("Planting/seed niet gevonden");

      // 1) actuals
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

      // 2) anchored recompute
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

      const payload = { ...actuals, ...plan };
      await updatePlanting(task.planting_id, payload as any);

      // optionele mini-feedback voor Planner (flash)
      try {
        localStorage.setItem("plannerFlashFrom", pl.planned_date ?? "");
        localStorage.setItem("plannerFlashTo", plan.planned_date ?? "");
        localStorage.setItem("plannerFlashAt", String(Date.now()));
      } catch {}

      // 3) taak afronden (triggers kunnen velden aanpassen)
      await updateTask(task.id, { status: "done" });

      // 4) herladen plantings én tasks zodat UI gelijkloopt met triggers
      const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
      setPlantings(p);
      setTasks(t);
    } catch (e: any) {
      alert("Kon actie niet afronden: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  // Heropenen: status pending, wis relevante actual_*, en plan opnieuw vanaf gekozen actie-datum (anker)
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

      const payload = { ...clearActuals, ...plan };
      await updatePlanting(task.planting_id, payload as any);

      // terug naar pending
      await updateTask(task.id, { status: "pending" });

      // herladen
      const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
      setPlantings(p);
      setTasks(t);
    } catch (e: any) {
      alert("Kon actie niet heropenen: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  /* ---------- UI helpers timeline ---------- */
  function dateOrNull(s?: string | null) { return s ? new Date(s) : null; }

  function rangeForRow(p: Planting) {
    const ms = milestonesFor(p);
    // range = min(planned/actual van eerste milestone t/m planned/actual harvest_end)
    const dates: Date[] = [];
    for (const m of ms) {
      if (m.plannedISO) dates.push(new Date(m.plannedISO));
      if (m.actualISO) dates.push(new Date(m.actualISO));
    }
    if (dates.length === 0) {
      const today = new Date();
      return { start: today, end: addDays(today, 7) };
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

  const todayPctCache = useMemo(() => new Map<string, number>(), []);
  const todayDate = new Date();

  /* ---------- render ---------- */
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <button
          onClick={() => setShowAll(s => !s)}
          className="px-3 py-1.5 rounded-md border text-sm"
          title={showAll ? "Toon alleen plantingen met een actie in de komende 2 weken" : "Toon alle plantingen"}
        >
          {showAll ? "Komende 2 weken" : "Alle plantingen"}
        </button>
      </div>

      {/* Timeline lijst: één rij per planting */}
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
            const { start, end } = rangeForRow(p);

            // today marker cache key
            const key = `${start.toISOString()}_${end.toISOString()}`;
            let todayPct = todayPctCache.get(key);
            if (todayPct == null) {
              todayPct = pctInRange(todayDate, start, end);
              todayPctCache.set(key, todayPct);
            }

            // welke is de eerstvolgende open actie?
            const nextOpen = ms.find(m => m.status !== "done" && (m.task?.due_date || m.plannedISO));
            const nextDueISO = nextOpen ? (nextOpen.task?.due_date ?? nextOpen.plannedISO) : null;

            return (
              <div key={p.id} className="border rounded-lg p-3 bg-card">
                <div className="grid grid-cols-12 gap-3 items-center">
                  {/* links: label */}
                  <div className="col-span-12 md:col-span-3 flex items-center gap-2">
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

                  {/* midden: timeline */}
                  <div className="col-span-12 md:col-span-7">
                    <div className="relative h-12">
                      {/* baseline */}
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded bg-muted" />

                      {/* vandaag marker */}
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-primary/60"
                        style={{ left: `${todayPct}%` }}
                        title="Vandaag"
                      />

                      {/* milestones */}
                      {ms.map((m, idx) => {
                        const baseISO = m.actualISO ?? m.task?.due_date ?? m.plannedISO;
                        if (!baseISO) return null;
                        const d = new Date(baseISO);
                        const pct = pctInRange(d, start, end);

                        const isDone = m.status === "done";
                        const isLatePending = m.status !== "done" && m.task?.due_date && new Date(m.task.due_date) < todayDate;

                        const dotClasses = [
                          "absolute -translate-x-1/2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border shadow",
                          isDone ? "bg-green-500 border-green-600" : "bg-amber-400 border-amber-500",
                          isLatePending ? "ring-2 ring-red-400" : "",
                          "cursor-pointer",
                        ].join(" ");

                        const title =
                          `${m.label}` +
                          (m.actualISO ? ` • uitgevoerd: ${m.actualISO}` :
                           m.task?.due_date ? ` • gepland: ${m.task.due_date}` :
                           m.plannedISO ? ` • gepland: ${m.plannedISO}` : "");

                        return (
                          <div
                            key={m.id}
                            className={dotClasses}
                            style={{ left: `${pct}%` }}
                            title={title}
                            onClick={() => {
                              const t = m.task;
                              if (!t) return;
                              if (t.status === "done") {
                                const def = t.due_date || m.plannedISO || toISO(new Date());
                                setDialog({ mode: "reopen", task: t, dateISO: def! });
                              } else {
                                setDialog({ mode: "run", task: t, dateISO: toISO(new Date()) });
                              }
                            }}
                          >
                            {isDone && (
                              <span className="text-[10px] text-white leading-none grid place-items-center w-full h-full">✓</span>
                            )}
                          </div>
                        );
                      })}

                      {/* labels onderaan (optioneel compact) */}
                      <div className="absolute left-0 right-0 -bottom-1.5 flex justify-between text-[10px] text-muted-foreground">
                        <span>{toISO(start)}</span>
                        <span>{toISO(end)}</span>
                      </div>
                    </div>
                  </div>

                  {/* rechts: CTA */}
                  <div className="col-span-12 md:col-span-2 text-right">
                    {nextOpen && nextDueISO ? (
                      <button
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
                        onClick={() => setDialog({ mode: "run", task: nextOpen.task!, dateISO: toISO(new Date()) })}
                        disabled={!nextOpen.task}
                        title={nextOpen.task ? "Volgende actie uitvoeren" : "Geen taak gekoppeld"}
                      >
                        {labelForType(nextOpen.taskType, p.method)} • {nextDueISO}
                      </button>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Klaar</span>
                    )}
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
              {labelForType(dialog.task.type, plantingsById[dialog.task.planting_id]?.method)} • {seedNameFor(dialog.task)} • {bedNameFor(dialog.task)}
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
