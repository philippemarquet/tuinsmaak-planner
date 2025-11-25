import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings, updatePlanting } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { useIsMobile } from "../hooks/use-mobile";

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
  const isMobile = useIsMobile();
  
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

  /* ---------- filter/sort: verlopen acties + komende 2 weken of alles ---------- */
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = addDays(today, 14);

  const { overduePlantings, upcomingPlantings } = useMemo(() => {
    const withKeys = plantings.map(p => {
      const nxt = firstOpenMilestone(p);
      const keyDate = nxt?.whenISO ? new Date(nxt.whenISO) : (p.planned_harvest_end ? new Date(p.planned_harvest_end) : addDays(today, 365));
      const isOverdue = nxt && new Date(nxt.whenISO) < today;
      return { p, nxt, keyDate, isOverdue };
    });

    // Verlopen acties: altijd tonen
    const overdue = withKeys.filter(x => x.isOverdue);
    overdue.sort((a,b) => a.keyDate.getTime() - b.keyDate.getTime());

    // Niet-verlopen acties: filter op basis van showAll
    const upcoming = showAll
      ? withKeys.filter(x => !x.isOverdue)
      : withKeys.filter(x => !x.isOverdue && x.nxt && (() => {
          const d = new Date(x.nxt!.whenISO);
          return d >= today && d <= horizon;
        })());
    upcoming.sort((a,b) => a.keyDate.getTime() - b.keyDate.getTime());

    return {
      overduePlantings: overdue.map(x => x.p),
      upcomingPlantings: upcoming.map(x => x.p)
    };
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

  /* ---------- render helper voor een planting card ---------- */
  const renderPlantingCard = (p: Planting) => {
    const seed = seedsById[p.seed_id];
    const bed = bedsById[p.garden_bed_id];
    const ms = milestonesFor(p);
    const next = firstOpenMilestone(p);

    const conflictCount = conflictsMap.get(p.id)?.length ?? 0;
    const hasConflict = conflictCount > 0;

    // Vind de eerste openstaande milestone index
    const firstOpenIndex = next ? next.index : -1;

    return (
      <div key={p.id} className={`border rounded-lg ${isMobile ? 'p-3' : 'p-3'} bg-card`}>
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start gap-2">
            <span
              className={`inline-block ${isMobile ? 'w-4 h-4 mt-0.5' : 'w-3 h-3 mt-1'} rounded flex-shrink-0`}
              style={{ background: p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e" }}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className={`${isMobile ? 'text-base' : 'text-sm'} font-medium flex items-center gap-2 flex-wrap`}>
                <span>{seed?.name ?? "Onbekend gewas"}</span>
                {hasConflict && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-200">
                    ⚠️ Conflict
                  </span>
                )}
              </div>
              <div className={`${isMobile ? 'text-sm' : 'text-xs'} text-muted-foreground`}>
                {bed?.name ?? "Onbekende bak"}
                {p.start_segment != null && (
                  <> • Segment {p.start_segment + 1}{p.segments_used > 1 ? `-${p.start_segment + p.segments_used}` : ''}</>
                )}
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-2' : 'grid-cols-2 md:grid-cols-4 gap-2'}`}>
            {ms.map((m, idx) => {
              const isDone = m.status === "done";
              const isPending = m.status === "pending";
              const isFirst = idx === 0;
              const isLast = idx === ms.length - 1;
              const statusIcon = isDone ? "✔" : isPending ? "→" : "—";
              const baseISO = m.actualISO ?? m.plannedISO;
              
              // Alleen de eerste openstaande actie is clickable
              const isClickable = isDone || idx === firstOpenIndex;
              const isGrayedOut = !isDone && idx !== firstOpenIndex;
              
              const borderColor = isDone ? "border-green-500" : isPending ? "border-yellow-500" : "border-border";
              const borderRad = isMobile
                ? "rounded-md"
                : isFirst
                  ? "rounded-l-md"
                  : isLast
                    ? "rounded-r-md"
                    : "";

              return (
                <button
                  key={idx}
                  disabled={!isClickable || !m.task}
                  onClick={() => {
                    if (!m.task || !isClickable) return;
                    const chosenDate = m.actualISO ?? m.task.due_date ?? m.plannedISO ?? "";
                    setDialog({ task: m.task, dateISO: chosenDate, hasActual: !!m.actualISO });
                  }}
                  className={`${borderRad} border ${borderColor} p-2 text-left transition-colors disabled:cursor-not-allowed ${isMobile ? 'text-sm' : 'text-xs'} ${isGrayedOut ? 'opacity-40' : ''} ${isClickable && !isDone ? 'hover:bg-muted' : ''}`}
                  title={isClickable && m.task ? "Klik om datum te bewerken" : isGrayedOut ? "Voer eerst de vorige actie uit" : "Geen taak"}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={isDone ? "text-green-600" : isPending ? "text-yellow-600" : "text-muted-foreground"}>
                      {statusIcon}
                    </span>
                    <span className="font-medium">{m.label}</span>
                  </span>
                  <span className="block text-muted-foreground">
                    {baseISO ? fmtDMY(baseISO) : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- render ---------- */
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <button
          onClick={() => setShowAll(s => !s)}
          className="px-3 py-1.5 rounded-md border text-sm"
        >
          {showAll ? "Komende 2 weken" : "Alle acties"}
        </button>
      </div>

      {/* Conflict banner (alleen info; geen auto-oplossen meer) */}
      {totalConflicts > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 flex items-center justify-between">
          <div className="text-sm">
            ⚠️ {totalConflicts} conflict{totalConflicts!==1?"en":""} gedetecteerd. Bekijk en los op in de Planner (tabblad "Conflicten").
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
        {/* Verlopen acties sectie */}
        {overduePlantings.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide">
              Verlopen acties ({overduePlantings.length})
            </h3>
            {overduePlantings.map(renderPlantingCard)}
          </div>
        )}

        {/* Komende/alle acties */}
        {upcomingPlantings.length === 0 && overduePlantings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {showAll ? "Geen plantingen gevonden." : "Geen acties in de komende 2 weken."}
          </p>
        ) : (
          upcomingPlantings.map(renderPlantingCard)
        )}
      </section>

      {/* Dialog: actie uitvoeren / bewerken of leegmaken */}
      {dialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDialog(null)}>
          <div className={`bg-card w-full ${isMobile ? 'max-w-full' : 'max-w-sm'} rounded-lg shadow-lg ${isMobile ? 'p-6' : 'p-5'} space-y-4`} onClick={(e) => e.stopPropagation()}>
            <h4 className={`${isMobile ? 'text-xl' : 'text-lg'} font-semibold`}>Actie {dialog.hasActual ? "bewerken" : "uitvoeren"}</h4>
            <p className={`${isMobile ? 'text-base' : 'text-sm'}`}>
              {(() => {
                const p = plantingsById[dialog.task.planting_id];
                return `${labelForType(dialog.task.type, p?.method)} • ${seedNameFor(dialog.task)} • ${bedNameFor(dialog.task)}`;
              })()}
            </p>
            <label className={`block ${isMobile ? 'text-base' : 'text-sm'}`}>
              Datum
              <input
                type="date"
                value={dialog.dateISO}
                onChange={(e) => setDialog(d => d ? { ...d, dateISO: e.target.value } : d)}
                className={`mt-2 w-full border border-input bg-background rounded-md ${isMobile ? 'px-4 py-3 text-base' : 'px-2 py-1'}`}
              />
            </label>
            <div className={`flex ${isMobile ? 'flex-col' : 'justify-end'} gap-2`}>
              <button 
                className={`${isMobile ? 'w-full py-3 text-base' : 'px-3 py-1.5'} rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80`} 
                onClick={() => setDialog(null)}
              >
                Annuleren
              </button>
              {dialog.hasActual && (
                <button
                  className={`${isMobile ? 'w-full py-3 text-base' : 'px-3 py-1.5'} rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50`}
                  onClick={() => clearActual(dialog.task)}
                  disabled={busyId === dialog.task.id}
                >
                  {busyId === dialog.task.id ? "Leegmaken…" : "Leegmaken"}
                </button>
              )}
              <button
                className={`${isMobile ? 'w-full py-3 text-base' : 'px-3 py-1.5'} rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
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
