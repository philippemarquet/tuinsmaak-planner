// src/components/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

/* ---------- helpers ---------- */
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addWeeks = (d: Date, w: number) => addDays(d, w * 7);
const fmtDMY = (iso?: string | null) => !iso ? "" : new Date(iso).toLocaleDateString();

/** Recompute planned_* from a given anchor. */
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

/* ---------- types ---------- */
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

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dialog, setDialog] = useState<null | { mode: "run" | "reopen"; task: Task; dateISO: string }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listBeds(garden.id), listPlantings(garden.id), listSeeds(garden.id), listTasks(garden.id)])
      .then(([b, p, s, t]) => { setBeds(b); setPlantings(p); setSeeds(s); setTasks(t); })
      .catch(console.error);
  }, [garden.id]);

  const bedsById = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);
  const plantingsById = useMemo(() => Object.fromEntries(plantings.map(p => [p.id, p])), [plantings]);

  const tasksIndex = useMemo(() => {
    const map = new Map<string, Map<Task["type"], Task>>();
    for (const t of tasks) {
      if (!map.has(t.planting_id)) map.set(t.planting_id, new Map());
      map.get(t.planting_id)!.set(t.type, t);
    }
    return map;
  }, [tasks]);

  function milestonesFor(p: Planting): Milestone[] {
    const method = p.method as "direct" | "presow" | null;
    const tmap = tasksIndex.get(p.id);
    const status = (actual?: string | null, task?: Task | null) => actual ? "done" : (task?.status ?? "pending");

    const out: Milestone[] = [];
    if (method === "presow") {
      const tSow = tmap?.get("sow") ?? null;
      out.push({ id: "presow", label: "Voorzaaien", taskType: "sow", plannedISO: p.planned_presow_date, actualISO: p.actual_presow_date, task: tSow, status: status(p.actual_presow_date, tSow) as any });
      const tPlant = tmap?.get("plant_out") ?? null;
      out.push({ id: "ground", label: "Uitplanten", taskType: "plant_out", plannedISO: p.planned_date, actualISO: p.actual_ground_date, task: tPlant, status: status(p.actual_ground_date, tPlant) as any });
    } else {
      const tSow = tmap?.get("sow") ?? null;
      out.push({ id: "ground", label: "Zaaien", taskType: "sow", plannedISO: p.planned_date, actualISO: p.actual_ground_date, task: tSow, status: status(p.actual_ground_date, tSow) as any });
    }
    const tHs = tmap?.get("harvest_start") ?? null;
    out.push({ id: "harvest_start", label: "Start oogst", taskType: "harvest_start", plannedISO: p.planned_harvest_start, actualISO: p.actual_harvest_start, task: tHs, status: status(p.actual_harvest_start, tHs) as any });
    const tHe = tmap?.get("harvest_end") ?? null;
    out.push({ id: "harvest_end", label: "Einde oogst", taskType: "harvest_end", plannedISO: p.planned_harvest_end, actualISO: p.actual_harvest_end, task: tHe, status: status(p.actual_harvest_end, tHe) as any });
    return out;
  }

  function pingPlannerConflict(plantingId: string) {
    try {
      localStorage.setItem("plannerNeedsAttention", "1");
      localStorage.setItem("plannerConflictFocusId", plantingId);
      localStorage.setItem("plannerOpenTab", "conflicts");
    } catch {}
  }

  async function runTask(task: Task, performedISO: string) {
    setBusyId(task.id);
    try {
      const pl = plantingsById[task.planting_id];
      const seed = pl ? seedsById[pl.seed_id] : null;
      if (!pl || !seed) throw new Error("Planting/seed niet gevonden");

      // 1) schrijf actual
      const actuals: any = {};
      if (task.type === "sow") { pl.method === "presow" ? actuals.actual_presow_date = performedISO : actuals.actual_ground_date = performedISO; }
      else if (task.type === "plant_out") actuals.actual_ground_date = performedISO;
      else if (task.type === "harvest_start") actuals.actual_harvest_start = performedISO;
      else if (task.type === "harvest_end") actuals.actual_harvest_end = performedISO;
      await updatePlanting(task.planting_id, actuals as any);

      // 2) plan herberekenen vanaf de actual (niet forceren bij conflict)
      const anchorType: any =
        task.type === "sow" ? (pl.method === "presow" ? "presow" : "ground")
        : task.type === "plant_out" ? "ground"
        : task.type === "harvest_start" ? "harvest_start"
        : "harvest_end";

      const plan = computePlanFromAnchor({
        method: pl.method as any, seed,
        anchorType, anchorISO: performedISO,
        prev: {
          planned_date: pl.planned_date,
          planned_presow_date: pl.planned_presow_date,
          planned_harvest_start: pl.planned_harvest_start,
          planned_harvest_end: pl.planned_harvest_end,
        },
      });

      let applied = false;
      try { await updatePlanting(task.planting_id, plan as any); applied = true; } catch { pingPlannerConflict(task.planting_id); }

      await updateTask(task.id, { status: "done" });
      const [p, t] = await Promise.all([ listPlantings(garden.id), listTasks(garden.id) ]);
      setPlantings(p); setTasks(t);
      if (!applied) pingPlannerConflict(task.planting_id);
    } finally {
      setBusyId(null); setDialog(null);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Dashboard</h2>

      {/* super minimal list; unchanged besides conflict pinging */}
      <div className="text-sm text-muted-foreground">
        Taken uitvoeren kan hier; conflicten los je op in de Planner ➜ tab “Conflicten”.
      </div>

      {dialog && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={()=>setDialog(null)}>
          <div className="bg-card p-4 rounded shadow max-w-sm w-full" onClick={e=>e.stopPropagation()}>
            <h4 className="font-semibold mb-2">{dialog.mode === "run" ? "Actie uitvoeren" : "Actie heropenen"}</h4>
            <label className="block text-sm">
              Datum
              <input type="date" value={dialog.dateISO} onChange={e=>setDialog(d=>d?{...d, dateISO: e.target.value}:d)} className="mt-1 w-full border rounded px-2 py-1"/>
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button className="border rounded px-3 py-1" onClick={()=>setDialog(null)}>Annuleren</button>
              <button className="bg-primary text-primary-foreground rounded px-3 py-1 disabled:opacity-50"
                disabled={busyId===dialog.task.id}
                onClick={()=>runTask(dialog.task, dialog.dateISO)}>
                Opslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
