import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertCircle, Sprout, Check, CalendarIcon, X } from "lucide-react";
import { getISOWeek, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "./ui/button";
import type { GardenBed, Planting, Seed, Task, GardenTask } from "../lib/types";
import { Dialog, DialogContent } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { cn } from "../lib/utils";

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
  onCompleteGardenTask: (task: GardenTask) => Promise<void>;
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
  onCompleteGardenTask,
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

  function goToToday() {
    setCurrentDate(new Date());
  }

  // Check of een dag vandaag is
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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

  // Render kalender grid - nu met weeknummers
  const calendarWeeks: React.ReactNode[][] = [];
  let currentWeek: React.ReactNode[] = [];
  
  // Empty cells voor dagen vóór de eerste dag van de maand
  const emptyDays = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
  for (let i = 0; i < emptyDays; i++) {
    currentWeek.push(<div key={`empty-${i}`} className="min-h-[80px] p-1 border border-border/50" />);
  }
  
  // Dagen van de maand
  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const actions = actionsByDate.get(dateISO) || [];
    const isToday = dateISO === todayISO;
    
    currentWeek.push(
      <div key={day} className={`min-h-[80px] p-1 border border-border/50 ${isToday ? 'bg-green-50 dark:bg-green-950/30' : 'bg-card'}`}>
        <div className={`text-xs font-medium mb-1 ${isToday ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>{day}</div>
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
    
    // Als we 7 dagen hebben of het is de laatste dag, sluit de week af
    if (currentWeek.length === 7 || day === daysInMonth) {
      // Vul resterende dagen op als het de laatste week is
      while (currentWeek.length < 7) {
        currentWeek.push(<div key={`empty-end-${currentWeek.length}`} className="min-h-[80px] p-1 border border-border/50" />);
      }
      calendarWeeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Helper: check of garden task overdue is (defined early for use in filtering)
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

  // Garden tasks: overdue tasks + tasks for the current month
  const gardenTasksForSidebar = useMemo(() => {
    const viewMonth = month + 1; // Convert to 1-based
    const viewYear = year;
    
    // Get overdue tasks (always show regardless of month)
    const overdueTasks = gardenTasks.filter(t => isGardenTaskOverdue(t));
    
    // Get tasks for current viewing month (excluding overdue to avoid duplicates)
    const monthTasks = gardenTasks.filter(t => {
      if (isGardenTaskOverdue(t)) return false; // Already in overdue
      if (t.due_year !== viewYear || t.due_month !== viewMonth) return false;
      return true;
    });
    
    // Sort each group by week
    const sortByWeek = (a: GardenTask, b: GardenTask) => {
      if (a.due_week === null && b.due_week === null) return 0;
      if (a.due_week === null) return 1;
      if (b.due_week === null) return -1;
      return a.due_week - b.due_week;
    };
    
    overdueTasks.sort(sortByWeek);
    monthTasks.sort(sortByWeek);
    
    return { overdueTasks, monthTasks };
  }, [gardenTasks, month, year]);

  // Format garden task deadline (month + year + optional week)
  const formatGardenTaskDeadline = (task: GardenTask): string => {
    const months = ["januari", "februari", "maart", "april", "mei", "juni",
                    "juli", "augustus", "september", "oktober", "november", "december"];
    let result = `${months[task.due_month - 1]} ${task.due_year}`;
    if (task.due_week) {
      result += `, week ${task.due_week}`;
    }
    return result;
  };

  // Render a single garden task card
  const renderGardenTask = (task: GardenTask) => {
    const overdue = isGardenTaskOverdue(task);
    const isDone = task.status === "done";

    if (isDone) {
      return (
        <div
          key={task.id}
          className="border rounded-lg p-2 bg-muted/50 flex items-center gap-2 opacity-60"
        >
          <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-green-500 bg-green-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium line-through">{task.title}</div>
            <div className="text-xs text-muted-foreground">
              {formatGardenTaskDeadline(task)}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={`border rounded-lg p-2 bg-card flex items-center gap-2 ${
          overdue ? 'border-destructive bg-destructive/5' : ''
        }`}
      >
        {/* Complete button - cirkel */}
        <button
          onClick={() => onCompleteGardenTask(task)}
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            overdue 
              ? 'border-destructive hover:bg-destructive hover:text-destructive-foreground' 
              : 'border-muted-foreground/30 hover:bg-primary hover:border-primary hover:text-primary-foreground'
          }`}
          title="Markeer als voltooid"
        >
          <Check className="w-3 h-3 opacity-0 hover:opacity-100" />
        </button>

        {/* Task content */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {overdue && (
              <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
            )}
            <span className={overdue ? 'text-destructive' : ''}>{task.title}</span>
            {task.is_recurring && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                🔄
              </span>
            )}
          </div>
          <div className={`text-xs ${overdue ? 'text-destructive/80' : 'text-muted-foreground'}`}>
            {formatGardenTaskDeadline(task)}
          </div>
        </div>
      </div>
    );
  };

  // Helper voor ISO date string
  const toISO = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex gap-6">
      {/* Kalender */}
      <div className="flex-1 space-y-4">
        {/* Maand navigator - Modern */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={previousMonth}
              className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={goToToday}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              Vandaag
            </button>
          </div>
          <h2 className="text-lg font-semibold capitalize">{monthName}</h2>
          <button 
            onClick={nextMonth}
            className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Kalender grid */}
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Weekdag headers - met extra kolom voor weeknummer */}
          <div className="grid grid-cols-[auto_repeat(7,1fr)] bg-muted/50">
            <div className="w-8 p-2 text-center text-[10px] font-medium text-muted-foreground border-r border-border/50">
              Wk
            </div>
            {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(day => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground border-r border-border/50 last:border-r-0">
                {day}
              </div>
            ))}
          </div>
          
          {/* Weken met weeknummer */}
          {calendarWeeks.map((week, weekIdx) => {
            // Bereken het weeknummer gebaseerd op de eerste dag met een nummer in deze week
            let weekNumber = 0;
            const emptyDays = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
            const firstDayOfWeek = weekIdx === 0 ? 1 : (weekIdx * 7) - emptyDays + 1;
            if (firstDayOfWeek >= 1 && firstDayOfWeek <= daysInMonth) {
              const dateForWeek = new Date(year, month, firstDayOfWeek);
              weekNumber = getISOWeek(dateForWeek);
            } else if (weekIdx === 0) {
              // Eerste week, pak eerste dag van maand
              weekNumber = getISOWeek(new Date(year, month, 1));
            }
            
            return (
              <div key={weekIdx} className="grid grid-cols-[auto_repeat(7,1fr)]">
                <div className="w-8 p-1 flex items-start justify-center text-[10px] font-medium text-muted-foreground bg-muted/30 border-r border-border/50 border-b border-border/50">
                  {weekNumber}
                </div>
                {week}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tuintaken zijpaneel - Modern */}
      <div className="w-64 flex-shrink-0">
        <div className="border border-border/50 rounded-xl p-4 bg-card/50 backdrop-blur-sm">
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Sprout className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            Tuintaken
          </h3>
          
          {/* Overdue tasks - altijd bovenaan */}
          {gardenTasksForSidebar.overdueTasks.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="text-[10px] font-medium text-destructive uppercase tracking-wide flex items-center gap-1 px-1">
                <AlertCircle className="w-3 h-3" />
                Te laat
              </div>
              {gardenTasksForSidebar.overdueTasks.map(renderGardenTask)}
            </div>
          )}
          
          {/* Current month tasks */}
          {gardenTasksForSidebar.monthTasks.length > 0 ? (
            <div className="space-y-2">
              {gardenTasksForSidebar.monthTasks.map(renderGardenTask)}
            </div>
          ) : gardenTasksForSidebar.overdueTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Geen tuintaken deze maand.
            </p>
          ) : null}
        </div>
      </div>

      {/* Dialog voor datum bevestigen - Modern */}
      {dialog && (() => {
        const pl = plantingsById[dialog.task.planting_id];
        const seed = pl ? seedsById[pl.seed_id] : null;
        const bed = pl ? bedsById[pl.garden_bed_id] : null;
        
        return (
          <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
            <DialogContent className="sm:max-w-md p-0 gap-0 bg-card/95 backdrop-blur-md border-border/50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                <h3 className="text-lg font-semibold">
                  {dialog.hasActual ? "Datum wijzigen" : "Actie voltooien"}
                </h3>
                <button 
                  onClick={() => setDialog(null)}
                  className="p-2 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              
              {/* Content */}
              <div className="p-5 space-y-5">
                {/* Task info */}
                <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ background: pl?.color || "#22c55e" }}
                  />
                  <div>
                    <p className="text-sm font-medium">{seed?.name ?? "Onbekend"}</p>
                    <p className="text-xs text-muted-foreground">
                      {bed?.name ?? "Onbekend"}
                      {pl?.start_segment != null && (
                        <> • Segment {pl.start_segment + 1}{(pl.segments_used ?? 1) > 1 ? `-${pl.start_segment + (pl.segments_used ?? 1)}` : ''}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Date picker */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Uitgevoerd op
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full bg-muted/30 border-0 rounded-lg h-12 px-4 text-left text-sm flex items-center gap-3 focus:ring-2 focus:ring-primary/20 transition-all hover:bg-muted/50",
                          !dialog.dateISO && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {dialog.dateISO ? format(new Date(dialog.dateISO), "d MMMM yyyy", { locale: nl }) : "Kies datum"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-popover/95 backdrop-blur-md border-border/50" align="start">
                      <Calendar
                        mode="single"
                        selected={dialog.dateISO ? new Date(dialog.dateISO) : undefined}
                        onSelect={(d) => {
                          if (d) {
                            setDialog({ ...dialog, dateISO: toISO(d) });
                          }
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Footer */}
                <div className="flex gap-2 pt-2 border-t border-border/30 justify-end">
                  {dialog.hasActual && (
                    <button
                      onClick={clearDate}
                      disabled={busyId === dialog.task.id}
                      className="px-4 py-2.5 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Leegmaken
                    </button>
                  )}
                  <button
                    onClick={confirmDate}
                    disabled={busyId === dialog.task.id}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {busyId === dialog.task.id ? "Bezig..." : "Opslaan"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
