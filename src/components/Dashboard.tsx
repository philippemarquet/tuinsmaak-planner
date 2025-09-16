// src/components/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

/* Helpers */
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, w: number) { const x = new Date(d); x.setDate(x.getDate() + w * 7); return x; }
function startOfMondayWeek(d: Date) {
  const x = new Date(d); const day = x.getDay() || 7; // 1=ma .. 7=zo
  x.setHours(0,0,0,0);
  if (day > 1) x.setDate(x.getDate() - (day - 1));
  return x;
}
function endOfSundayWeek(d: Date) { const x = startOfMondayWeek(d); x.setDate(x.getDate()+6); x.setHours(23,59,59,999); return x; }
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // @ts-ignore
  return Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
}
function formatWeekRange(d: Date) {
  const mon = startOfMondayWeek(d);
  const sun = endOfSundayWeek(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `WK ${isoWeekNumber(mon)} • ${pad(mon.getDate())}/${pad(mon.getMonth()+1)} – ${pad(sun.getDate())}/${pad(sun.getMonth()+1)}`;
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
      // back-calculate ground date
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
        // back-calc ground from harvest_start
        planned_date = toISO(addWeeks(hs, -growW));
        if (method === "presow" && presowW != null) planned_presow_date = toISO(addWeeks(new Date(planned_date), -presowW));
        if (method === "direct") planned_presow_date = null;
      }
    }
  }

  return {
    planned_date,
    planned_presow_date,
    planned_harvest_start,
    planned_harvest_end,
  };
}

/* UI component */
export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAll, setShowAll] = useState(false);

  // Dialoog state
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
      .then(([b, p, s, t]) => {
        setBeds(b);
        setPlantings(p);
        setSeeds(s);
        setTasks(t);
      })
      .catch(console.error);
  }, [garden.id]);

  const bedsById = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const plantingsById = useMemo(() => Object.fromEntries(plantings.map(p => [p.id, p])), [plantings]);

  /* filtering/groeperen */
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = addDays(today, 14); horizon.setHours(23,59,59,999);

  function withinNext2Weeks(due: string) {
    const d = new Date(due);
    return d >= today && d <= horizon;
  }

  const tasksSorted = useMemo(
    () => tasks.slice().sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
    [tasks]
  );

  const tasksUpcoming = useMemo(
    () => tasksSorted.filter(t => withinNext2Weeks(t.due_date)),
    [tasksSorted]
  );

  // groepeer per week (ma-zo)
  function groupByWeek(ts: Task[]) {
    const map = new Map<string, Task[]>();
    for (const t of ts) {
      const d = new Date(t.due_date);
      const wkStart = toISO(startOfMondayWeek(d));
      if (!map.has(wkStart)) map.set(wkStart, []);
      map.get(wkStart)!.push(t);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map(k => ({ weekStartISO: k, tasks: map.get(k)!.sort((a,b)=>a.due_date.localeCompare(b.due_date)) }));
  }

  const sections = groupByWeek(showAll ? tasksSorted : tasksUpcoming);

  function seedName(task: Task) {
    const pl = plantingsById[task.planting_id];
    const seed = pl ? seedsById[pl.seed_id] : null;
    return seed?.name ?? "Onbekend gewas";
  }
  function bedName(task: Task) {
    const pl = plantingsById[task.planting_id];
    const bed = pl ? bedsById[pl.garden_bed_id] : null;
    return bed?.name ?? "Onbekende bak";
  }
  function labelForTask(task: Task) {
    switch (task.type) {
      case "sow": return "Zaaien";
      case "plant_out": return "Uitplanten";
      case "harvest_start": return "Start oogst";
      case "harvest_end": return "Einde oogst";
      default: return task.type;
    }
  }

  /* ========= Kernlogica voor ankeren & schuiven ========= */

  // Uitvoeren: schrijf actual_* en herbereken planned_* vanaf de gekozen actie (anker)
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
      setPlantings(prev => prev.map(p => p.id === task.planting_id ? { ...p, ...payload } : p));

      // info voor Planner: highlight de verschoven periode
      try {
        localStorage.setItem("plannerFlashFrom", pl.planned_date ?? "");
        localStorage.setItem("plannerFlashTo", plan.planned_date ?? "");
        localStorage.setItem("plannerFlashAt", String(Date.now()));
      } catch {}

      // 3) taak afronden (triggers kunnen velden aanpassen)
      await updateTask(task.id, { status: "done" });

      // 4) herladen plantings én tasks zodat UI gelijkloopt met triggers
      const [p, t] = await Promise.all([
        listPlantings(garden.id),
        listTasks(garden.id),
      ]);
      setPlantings(p);
      setTasks(t);
    } catch (e: any) {
      alert("Kon actie niet afronden: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setRunDialog(null);
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
      setPlantings(prev => prev.map(p => p.id === task.planting_id ? { ...p, ...payload } : p));

      try {
        localStorage.setItem("plannerFlashFrom", pl.planned_date ?? "");
        localStorage.setItem("plannerFlashTo", plan.planned_date ?? "");
        localStorage.setItem("plannerFlashAt", String(Date.now()));
      } catch {}

      // taak terug naar pending
      const updatedTask = await updateTask(task.id, { status: "pending" });
      setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));

      try {
        const fresh = await listTasks(garden.id);
        setTasks(fresh);
      } catch {}
    } catch (e: any) {
      alert("Kon actie niet heropenen: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setDialog(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <button
          onClick={() => setShowAll(s => !s)}
          className="px-3 py-1.5 rounded-md border text-sm"
          title={showAll ? "Toon alleen komende 2 weken" : "Toon alle weken"}
        >
          {showAll ? "Alleen komende 2 weken" : "Toon alle weken"}
        </button>
      </div>

      {/* Actielijst */}
      <section>
        <h3 className="text-xl font-semibold mb-3">
          Acties {showAll ? "(alle weken)" : "(komende 2 weken)"}
        </h3>

        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showAll ? "Geen acties gevonden." : "Geen acties in de komende 2 weken."}
          </p>
        ) : (
          <div className="space-y-4">
            {sections.map(({ weekStartISO, tasks }) => {
              const wkStart = new Date(weekStartISO);
              return (
                <div key={weekStartISO} className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-muted/60 border-b text-sm font-medium">
                    {formatWeekRange(wkStart)}
                  </div>
                  <div className="divide-y">
                    {tasks.map((t) => {
                      const isDone = t.status === "done";
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            const defaultDate = isDone ? (t.due_date || toISO(new Date())) : toISO(new Date());
                            setDialog({ mode: isDone ? "reopen" : "run", task: t, dateISO: defaultDate });
                          }}
                          className="w-full text-left p-4 hover:bg-muted/40 transition flex items-center justify-between gap-3"
                          title={isDone ? "Klik om te heropenen/verplaatsen" : "Klik om uit te voeren"}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${isDone ? "bg-green-500" : "bg-yellow-500"}`}
                              aria-hidden
                            />
                            <div className="flex flex-col">
                              <span className={`text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>
                                {labelForTask(t)} • {seedName(t)} • {bedName(t)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                gepland: {t.due_date}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${isDone ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                          >
                            {isDone ? "Afgerond" : "Open"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dialog */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDialog(null)}>
          <div className="bg-card w-full max-w-sm rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">
              {dialog.mode === "run" ? "Actie uitvoeren" : "Actie heropenen / verplaatsen"}
            </h4>
            <p className="text-sm">
              {labelForTask(dialog.task)} • {seedName(dialog.task)} • {bedName(dialog.task)}
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
