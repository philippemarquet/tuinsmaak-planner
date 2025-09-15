import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

/* helpers */
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
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

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAll, setShowAll] = useState(false);

  // modal state voor "actie uitvoeren"
  const [runDialog, setRunDialog] = useState<{ task: Task; dateISO: string } | null>(null);
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
    // sort keys
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

  async function runTask(task: Task, performedISO: string) {
    setBusyId(task.id);
    try {
      // 1) plantings: zet de juiste actual_* datum
      const payload: any = {};
      if (task.type === "sow") payload.actual_presow_date = performedISO;
      else if (task.type === "plant_out") payload.actual_ground_date = performedISO;
      else if (task.type === "harvest_start") payload.actual_harvest_start = performedISO;
      else if (task.type === "harvest_end") payload.actual_harvest_end = performedISO;

      if (Object.keys(payload).length) {
        await updatePlanting(task.planting_id, payload);
        // optimistisch ook lokaal bijwerken
        setPlantings(prev => prev.map(p => p.id === task.planting_id ? { ...p, ...payload } : p));
      }

      // 2) taak afronden
      const updated = await updateTask(task.id, { status: "done" });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch (e: any) {
      alert("Kon actie niet afronden: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
      setRunDialog(null);
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
                          onClick={() => !isDone && setRunDialog({ task: t, dateISO: toISO(new Date()) })}
                          className={`w-full text-left p-4 hover:bg-muted/40 transition flex items-center justify-between gap-3 ${isDone ? "opacity-70" : ""}`}
                          disabled={isDone}
                          title={isDone ? "Al afgerond" : "Klik om uit te voeren"}
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

      {/* Dialog: actie uitvoeren */}
      {runDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setRunDialog(null)}>
          <div className="bg-card w-full max-w-sm rounded-lg shadow-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold">Actie uitvoeren</h4>
            <p className="text-sm">
              {labelForTask(runDialog.task)} • {seedName(runDialog.task)} • {bedName(runDialog.task)}
            </p>
            <label className="block text-sm">
              Uitgevoerd op
              <input
                type="date"
                value={runDialog.dateISO}
                onChange={(e) => setRunDialog(d => d ? { ...d, dateISO: e.target.value } : d)}
                className="mt-1 w-full border rounded-md px-2 py-1"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-md border" onClick={() => setRunDialog(null)}>Annuleren</button>
              <button
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                onClick={() => runTask(runDialog.task, runDialog.dateISO)}
                disabled={busyId === runDialog.task.id}
              >
                {busyId === runDialog.task.id ? "Opslaan…" : "Opslaan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
