import { useEffect, useMemo, useState } from "react";
import { getISOWeek } from "date-fns";
import type { Garden, GardenBed, Planting, Seed, Task, GardenTask } from "../lib/types";
import { updatePlanting } from "../lib/api/plantings";
import { updateTask } from "../lib/api/tasks";
import { createGardenTask, updateGardenTask, deleteGardenTask, completeGardenTask } from "../lib/api/gardenTasks";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { useConflictFlags } from "../hooks/useConflictFlags";
import { useIsMobile } from "../hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { CalendarView } from "./CalendarView";
import { GardenTaskModal } from "./GardenTaskModal";
import { Plus, AlertCircle, Check, Sprout, Trash2 } from "lucide-react";
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
export function Dashboard({ 
  garden, 
  beds: initialBeds, 
  seeds: initialSeeds, 
  plantings: initialPlantings, 
  tasks: initialTasks,
  gardenTasks: initialGardenTasks,
  onDataChange
}: { 
  garden: Garden;
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  tasks: Task[];
  gardenTasks: GardenTask[];
  onDataChange: () => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("overview");
  
  const [beds, setBeds] = useState<GardenBed[]>(initialBeds);
  const [plantings, setPlantings] = useState<Planting[]>(initialPlantings);
  const [seeds, setSeeds] = useState<Seed[]>(initialSeeds);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [gardenTasks, setGardenTasks] = useState<GardenTask[]>(initialGardenTasks);
  const [showAll, setShowAll] = useState(false);

  const [dialog, setDialog] = useState<{
    task: Task;
    dateISO: string;
    hasActual: boolean;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  // Garden task modal state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingGardenTask, setEditingGardenTask] = useState<GardenTask | null>(null);

  // Sync met centrale data
  useEffect(() => {
    setBeds(initialBeds);
    setSeeds(initialSeeds);
    setPlantings(initialPlantings);
    setTasks(initialTasks);
    setGardenTasks(initialGardenTasks);
  }, [initialBeds, initialSeeds, initialPlantings, initialTasks, initialGardenTasks]);

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
    await onDataChange();
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
      await reloadAll();
      const cmap = buildConflictsMap(plantings, seeds);
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

  /* ---------- helper: check if garden task is overdue ---------- */
  const isGardenTaskOverdue = (task: GardenTask): boolean => {
    if (task.status === "done") return false;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentISOWeek = getISOWeek(now);
    
    // Check year first
    if (task.due_year < currentYear) return true;
    if (task.due_year > currentYear) return false;
    
    // Same year, check month
    if (task.due_month < currentMonth) return true;
    if (task.due_month > currentMonth) return false;
    
    // Same month, check ISO week if specified
    if (task.due_week) {
      if (task.due_week < currentISOWeek) return true;
    }
    
    return false;
  };

  /* ---------- format garden task deadline ---------- */
  const formatGardenTaskDeadline = (task: GardenTask): string => {
    const months = ["januari", "februari", "maart", "april", "mei", "juni",
                    "juli", "augustus", "september", "oktober", "november", "december"];
    let result = `${months[task.due_month - 1]} ${task.due_year}`;
    if (task.due_week) {
      result += `, week ${task.due_week}`;
    }
    return result;
  };

  /* ---------- render garden tasks section ---------- */
  const GardenTasksSection = ({
    gardenTasks,
    isMobile,
    onAddTask,
    onEditTask,
    onCompleteTask,
    onDeleteTask,
  }: {
    gardenTasks: GardenTask[];
    isMobile: boolean;
    onAddTask: () => void;
    onEditTask: (task: GardenTask) => void;
    onCompleteTask: (task: GardenTask) => void;
    onDeleteTask: (task: GardenTask) => void;
  }) => {
    // Filter: pending tasks first, then done ones
    const pendingTasks = gardenTasks.filter(t => t.status === "pending");
    const doneTasks = gardenTasks.filter(t => t.status === "done");

    return (
      <section className="mt-8 pt-6 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground flex items-center gap-2">
            <Sprout className="w-4 h-4" />
            Tuin taken
          </h3>
          <button
            onClick={onAddTask}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-3 h-3" />
            Toevoegen
          </button>
        </div>

        {pendingTasks.length === 0 && doneTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen tuintaken. Voeg een taak toe om te beginnen.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingTasks.map((task) => {
              const overdue = isGardenTaskOverdue(task);
              return (
                <div
                  key={task.id}
                  className={`border rounded-lg ${isMobile ? 'p-3' : 'p-3'} bg-card flex items-center gap-3 ${
                    overdue ? 'border-destructive bg-destructive/5' : ''
                  }`}
                >
                  {/* Complete button */}
                  <button
                    onClick={() => onCompleteTask(task)}
                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      overdue 
                        ? 'border-destructive hover:bg-destructive hover:text-destructive-foreground' 
                        : 'border-muted-foreground/30 hover:bg-primary hover:border-primary hover:text-primary-foreground'
                    }`}
                    title="Markeer als voltooid"
                  >
                    <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                  </button>

                  {/* Task content - clickable to edit */}
                  <button
                    onClick={() => onEditTask(task)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className={`${isMobile ? 'text-base' : 'text-sm'} font-medium flex items-center gap-2`}>
                      {overdue && (
                        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                      )}
                      <span className={overdue ? 'text-destructive' : ''}>{task.title}</span>
                      {task.is_recurring && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          🔄
                        </span>
                      )}
                    </div>
                    <div className={`${isMobile ? 'text-sm' : 'text-xs'} ${overdue ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                      {formatGardenTaskDeadline(task)}
                    </div>
                  </button>
                </div>
              );
            })}

            {/* Done tasks (grayed out) */}
            {doneTasks.map((task) => (
              <div
                key={task.id}
                className="border rounded-lg p-3 bg-muted/50 flex items-center gap-3 opacity-60"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-green-500 bg-green-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <button
                  onClick={() => onEditTask(task)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className={`${isMobile ? 'text-base' : 'text-sm'} font-medium line-through`}>
                    {task.title}
                  </div>
                  <div className={`${isMobile ? 'text-sm' : 'text-xs'} text-muted-foreground`}>
                    {formatGardenTaskDeadline(task)}
                  </div>
                </button>
                {/* Delete button for done tasks */}
                <button
                  onClick={async () => {
                    if (confirm("Weet je zeker dat je deze afgeronde taak wilt verwijderen?")) {
                      await onDeleteTask(task);
                    }
                  }}
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Verwijderen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  /* ---------- render ---------- */
  return (
    <div className={`mx-auto ${isMobile ? 'max-w-full px-4 py-4' : 'max-w-5xl py-6'}`}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overzicht</TabsTrigger>
          <TabsTrigger value="calendar">Kalender</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Filter buttons */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setShowAll(false)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!showAll ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              Komende 2 weken
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showAll ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              Alle acties
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
            ) : upcomingPlantings.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Huidige acties ({upcomingPlantings.length})
                </h3>
                {upcomingPlantings.map(renderPlantingCard)}
              </div>
            ) : null}
          </section>

          {/* Tuin taken sectie */}
          <GardenTasksSection
            gardenTasks={gardenTasks}
            isMobile={isMobile}
            onAddTask={() => {
              setEditingGardenTask(null);
              setTaskModalOpen(true);
            }}
            onEditTask={(task) => {
              setEditingGardenTask(task);
              setTaskModalOpen(true);
            }}
            onCompleteTask={async (task) => {
              try {
                await completeGardenTask(task.id);
                
                // Als het een recurring task is, maak een nieuwe aan voor volgend jaar
                if (task.is_recurring) {
                  await createGardenTask({
                    garden_id: task.garden_id,
                    title: task.title,
                    description: task.description,
                    due_month: task.due_month,
                    due_week: task.due_week,
                    due_year: task.due_year + 1,
                    is_recurring: true,
                    status: "pending",
                  });
                }
                
                await reloadAll();
              } catch (e: any) {
                alert("Kon taak niet afronden: " + (e?.message ?? e));
              }
            }}
            onDeleteTask={async (task) => {
              try {
                await deleteGardenTask(task.id);
                await reloadAll();
              } catch (e: any) {
                alert("Kon taak niet verwijderen: " + (e?.message ?? e));
              }
            }}
          />

          {/* Garden Task Modal */}
          <GardenTaskModal
            open={taskModalOpen}
            onOpenChange={setTaskModalOpen}
            task={editingGardenTask}
            onSave={async (values) => {
              if (editingGardenTask) {
                await updateGardenTask(editingGardenTask.id, values);
              } else {
                await createGardenTask({
                  ...values,
                  garden_id: garden.id,
                  status: "pending",
                  is_recurring: values.is_recurring,
                });
              }
              await reloadAll();
            }}
            onDelete={editingGardenTask ? async () => {
              await deleteGardenTask(editingGardenTask.id);
              await reloadAll();
            } : undefined}
          />

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
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarView
            beds={beds}
            plantings={plantings}
            seeds={seeds}
            tasks={tasks}
            gardenTasks={gardenTasks}
            bedsById={bedsById}
            seedsById={seedsById}
            plantingsById={plantingsById}
            tasksIndex={tasksIndex}
            busyId={busyId}
            onApplyActual={applyActual}
            onClearActual={clearActual}
            onCompleteGardenTask={async (task) => {
              try {
                await completeGardenTask(task.id);
                if (task.is_recurring) {
                  await createGardenTask({
                    garden_id: task.garden_id,
                    title: task.title,
                    description: task.description,
                    due_month: task.due_month,
                    due_week: task.due_week,
                    due_year: task.due_year + 1,
                    is_recurring: true,
                    status: "pending",
                  });
                }
                await reloadAll();
              } catch (e: any) {
                alert("Kon taak niet afronden: " + (e?.message ?? e));
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
