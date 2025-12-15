import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, Sprout } from "lucide-react";
import { getISOWeek } from "date-fns";
import { Button } from "./ui/button";
import type { GardenBed, Planting, Seed, Task, GardenTask } from "../lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface CalendarViewProps {
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  tasks: Task[];
  gardenTasks: GardenTask[];
  bedsById: Record<string, GardenBed>;
  seedsById: Record<string, Seed>;
  plantingsById: Record<string, Planting>;
  tasksIndex: Map<string, Map<Task["type"], Task>>;
  busyId: string | null;
  onApplyActual: (task: Task, performedISO: string) => Promise<void>;
  onClearActual: (task: Task) => Promise<void>;
}

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

function fmtDMY(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth()+1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function CalendarView({
  beds,
  plantings,
  seeds,
  tasks,
  gardenTasks,
  bedsById,
  seedsById,
  plantingsById,
  tasksIndex,
  busyId,
  onApplyActual,
  onClearActual,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dialog, setDialog] = useState<{
    task: Task;
    dateISO: string;
    hasActual: boolean;
  } | null>(null);

  // Helper functies
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

  function firstOpenMilestone(p: Planting): { ms: Milestone; index: number } | null {
    const ms = milestonesFor(p);
    for (let i = 0; i < ms.length; i++) {
      if (ms[i].status !== "done") return { ms: ms[i], index: i };
    }
    return null;
  }

  // Kalender logica
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const monthName = currentDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });

  // Groepeer acties per datum
  const actionsByDate = useMemo(() => {
    const map = new Map<string, Array<{ planting: Planting; milestone: Milestone; isFirst: boolean }>>();
    
    plantings.forEach(p => {
      const ms = milestonesFor(p);
      const firstOpen = firstOpenMilestone(p);
      
      ms.forEach((m, idx) => {
        const dateISO = m.task?.due_date ?? m.plannedISO;
        if (!dateISO) return;
        
        const isFirst = firstOpen ? idx === firstOpen.index : false;
        
        if (!map.has(dateISO)) {
          map.set(dateISO, []);
        }
        map.get(dateISO)!.push({ planting: p, milestone: m, isFirst });
      });
    });
    
    return map;
  }, [plantings, tasksIndex]);

  function previousMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function handleActionClick(action: { planting: Planting; milestone: Milestone; isFirst: boolean }) {
    if (!action.isFirst || !action.milestone.task) return;
    
    const hasActual = !!action.milestone.actualISO;
    const dateISO = action.milestone.actualISO || action.milestone.task.due_date;
    
    setDialog({
      task: action.milestone.task,
      dateISO,
      hasActual,
    });
  }

  async function confirmDate() {
    if (!dialog) return;
    await onApplyActual(dialog.task, dialog.dateISO);
    setDialog(null);
  }

  async function clearDate() {
    if (!dialog) return;
    await onClearActual(dialog.task);
    setDialog(null);
  }

  // Render kalender grid
  const calendarDays = [];
  
  // Empty cells voor dagen vóór de eerste dag van de maand
  for (let i = 0; i < (startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1); i++) {
    calendarDays.push(<div key={`empty-${i}`} className="min-h-[80px] p-1 border border-border/50" />);
  }
  
  // Dagen van de maand
  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const actions = actionsByDate.get(dateISO) || [];
    
    calendarDays.push(
      <div key={day} className="min-h-[80px] p-1 border border-border/50 bg-card">
        <div className="text-xs font-medium text-muted-foreground mb-1">{day}</div>
        <div className="space-y-0.5">
          {actions.map((action, idx) => {
            const seed = seedsById[action.planting.seed_id];
            const isDone = action.milestone.status === "done";
            const isClickable = action.isFirst && !isDone;
            
            return (
              <button
                key={idx}
                onClick={() => isClickable && handleActionClick(action)}
                disabled={!isClickable}
                className={`w-full text-left text-[10px] px-1 py-0.5 rounded transition-colors ${
                  isDone 
                    ? 'bg-muted/50 text-muted-foreground line-through' 
                    : isClickable
                    ? 'bg-primary/10 text-foreground hover:bg-primary/20 cursor-pointer'
                    : 'bg-muted/30 text-muted-foreground cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded flex-shrink-0"
                    style={{ background: action.planting.color || "#22c55e" }}
                  />
                  <span className="truncate">{seed?.name}</span>
                </div>
                <div className="text-[9px] opacity-70 truncate">{action.milestone.label}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Filter garden tasks voor de huidige maand
  const gardenTasksForMonth = useMemo(() => {
    const viewMonth = month + 1; // 1-indexed
    const viewYear = year;
    
    return gardenTasks.filter(t => {
      // Moet in hetzelfde jaar en maand vallen
      if (t.due_year !== viewYear || t.due_month !== viewMonth) return false;
      return true;
    }).sort((a, b) => {
      // Sorteer op week (null = geen specifieke week, komt laatst)
      if (a.due_week === null && b.due_week === null) return 0;
      if (a.due_week === null) return 1;
      if (b.due_week === null) return -1;
      return a.due_week - b.due_week;
    });
  }, [gardenTasks, month, year]);

  // Helper: check of garden task overdue is
  const isGardenTaskOverdue = (task: GardenTask): boolean => {
    if (task.status === "done") return false;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentISOWeek = getISOWeek(now);
    
    if (task.due_year < currentYear) return true;
    if (task.due_year > currentYear) return false;
    if (task.due_month < currentMonth) return true;
    if (task.due_month > currentMonth) return false;
    if (task.due_week && task.due_week < currentISOWeek) return true;
    
    return false;
  };

  // Format garden task week display
  const formatTaskWeek = (task: GardenTask): string => {
    if (!task.due_week) return "";
    return `Week ${task.due_week}`;
  };

  return (
    <div className="flex gap-6">
      {/* Kalender */}
      <div className="flex-1 space-y-4">
        {/* Maand navigator */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Kalender grid */}
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Weekdag headers */}
          <div className="grid grid-cols-7 bg-muted/50">
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(day => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground border-r border-border/50 last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          
          {/* Dagen grid */}
          <div className="grid grid-cols-7">
            {calendarDays}
          </div>
        </div>
      </div>

      {/* Tuintaken zijpaneel */}
      <div className="w-64 flex-shrink-0">
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground flex items-center gap-2 mb-4">
            <Sprout className="w-4 h-4" />
            Tuintaken
          </h3>
          
          {gardenTasksForMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen tuintaken deze maand.
            </p>
          ) : (
            <div className="space-y-2">
              {gardenTasksForMonth.map((task) => {
                const overdue = isGardenTaskOverdue(task);
                const isDone = task.status === "done";
                
                return (
                  <div
                    key={task.id}
                    className={`p-2 rounded-md border text-sm ${
                      isDone 
                        ? 'bg-muted/50 border-border opacity-60' 
                        : overdue 
                        ? 'bg-destructive/5 border-destructive' 
                        : 'bg-background border-border'
                    }`}
                  >
                    <div className={`font-medium flex items-center gap-1 ${isDone ? 'line-through' : ''}`}>
                      {overdue && !isDone && (
                        <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
                      )}
                      <span className={overdue && !isDone ? 'text-destructive' : ''}>{task.title}</span>
                    </div>
                    {task.due_week && (
                      <div className={`text-xs ${overdue && !isDone ? 'text-destructive/80' : 'text-muted-foreground'}`}>
                        {formatTaskWeek(task)}
                      </div>
                    )}
                    {task.is_recurring && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        🔄 Terugkerend
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialog voor datum bevestigen */}
      {dialog && (() => {
        const pl = plantingsById[dialog.task.planting_id];
        const seed = pl ? seedsById[pl.seed_id] : null;
        const bed = pl ? bedsById[pl.garden_bed_id] : null;
        
        return (
          <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {dialog.hasActual ? "Datum wijzigen" : "Actie voltooien"}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Gewas:</span> {seed?.name ?? "Onbekend"}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Bak:</span> {bed?.name ?? "Onbekend"}
                    {pl?.start_segment != null && (
                      <> • Segment {pl.start_segment + 1}{(pl.segments_used ?? 1) > 1 ? `-${pl.start_segment + (pl.segments_used ?? 1)}` : ''}</>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Uitgevoerd op</Label>
                  <Input
                    id="date"
                    type="date"
                    value={dialog.dateISO}
                    onChange={(e) => setDialog({ ...dialog, dateISO: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter className="flex gap-2">
                {dialog.hasActual && (
                  <Button
                    variant="outline"
                    onClick={clearDate}
                    disabled={busyId === dialog.task.id}
                  >
                    Leegmaken
                  </Button>
                )}
                <Button
                  onClick={confirmDate}
                  disabled={busyId === dialog.task.id}
                >
                  {busyId === dialog.task.id ? "Bezig..." : "Opslaan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
