import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { getISOWeek, startOfWeek, endOfWeek, format, startOfMonth, endOfMonth, addWeeks } from "date-fns";
import { nl } from "date-fns/locale";
import { cn } from "../lib/utils";
import type { GardenTask } from "../lib/types";

const MONTHS = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December"
];

/** Get all ISO weeks that fall within a given month/year */
function getWeeksInMonth(year: number, month: number): { weekNum: number; label: string }[] {
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  
  const weeks: { weekNum: number; label: string }[] = [];
  const seenWeeks = new Set<number>();
  
  let current = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  while (current <= monthEnd) {
    const weekNum = getISOWeek(current);
    
    if (!seenWeeks.has(weekNum)) {
      seenWeeks.add(weekNum);
      
      const weekStart = startOfWeek(current, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(current, { weekStartsOn: 1 });
      
      const startStr = format(weekStart, "d MMM", { locale: nl });
      const endStr = format(weekEnd, "d MMM", { locale: nl });
      
      weeks.push({
        weekNum,
        label: `Week ${weekNum} (${startStr} - ${endStr})`
      });
    }
    
    current = addWeeks(current, 1);
  }
  
  return weeks;
}

/** Week select component with dynamic weeks based on month/year */
function WeekSelect({ 
  year, 
  month, 
  value, 
  onChange 
}: { 
  year: number; 
  month: number; 
  value: number | null; 
  onChange: (v: number | null) => void;
}) {
  const weeks = useMemo(() => getWeeksInMonth(year, month), [year, month]);

  return (
    <Select
      value={value !== null ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger className="bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
        <SelectValue placeholder="Geen specifieke week" />
      </SelectTrigger>
      <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
        <SelectItem value="none">Geen specifieke week</SelectItem>
        {weeks.map((w) => (
          <SelectItem key={w.weekNum} value={String(w.weekNum)}>
            {w.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface GardenTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: GardenTask | null;
  onSave: (values: {
    title: string;
    description: string | null;
    due_month: number;
    due_week: number | null;
    due_year: number;
    is_recurring: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function GardenTaskModal({
  open,
  onOpenChange,
  task,
  onSave,
  onDelete,
}: GardenTaskModalProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueMonth, setDueMonth] = useState(currentMonth);
  const [dueWeek, setDueWeek] = useState<number | null>(null);
  const [dueYear, setDueYear] = useState(currentYear);
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDueMonth(task.due_month);
      setDueWeek(task.due_week);
      setDueYear(task.due_year);
      setIsRecurring(task.is_recurring);
    } else {
      setTitle("");
      setDescription("");
      setDueMonth(currentMonth);
      setDueWeek(null);
      setDueYear(currentYear);
      setIsRecurring(false);
    }
  }, [task, open, currentMonth, currentYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        due_month: dueMonth,
        due_week: dueWeek,
        due_year: dueYear,
        is_recurring: isRecurring,
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirm("Weet je zeker dat je deze taak wilt verwijderen?")) return;
    
    setSaving(true);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 bg-card/95 backdrop-blur-md border-border/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-gradient-to-r from-emerald-500/10 to-transparent">
          <h3 className="text-lg font-semibold">{task ? "Taak bewerken" : "Nieuwe tuintaak"}</h3>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Titel - Underline style */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Titel *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijv. Hortensia's snoeien"
              required
              className="w-full bg-transparent border-0 border-b-2 border-muted-foreground/20 px-0 py-2 text-base font-medium placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none transition-colors"
            />
          </div>

          {/* Beschrijving */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Beschrijving</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extra notities..."
              rows={2}
              className="w-full bg-muted/20 border-0 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Grid: Maand + Jaar */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Maand *</label>
              <Select
                value={String(dueMonth)}
                onValueChange={(v) => setDueMonth(Number(v))}
              >
                <SelectTrigger className="bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jaar *</label>
              <Select
                value={String(dueYear)}
                onValueChange={(v) => setDueYear(Number(v))}
              >
                <SelectTrigger className="bg-muted/30 border-0 rounded-lg h-10 focus:ring-2 focus:ring-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover/95 backdrop-blur-md border-border/50">
                  {Array.from({ length: 7 }, (_, i) => currentYear - 1 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Week */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Week (optioneel)</label>
            <WeekSelect
              year={dueYear}
              month={dueMonth}
              value={dueWeek}
              onChange={setDueWeek}
            />
          </div>

          {/* Terugkerend - Toggle Pill */}
          <div className="flex items-center justify-between py-2">
            <label className="text-sm font-medium">Terugkerende taak (elk jaar)</label>
            <button
              type="button"
              onClick={() => setIsRecurring(!isRecurring)}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors",
                isRecurring ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform",
                  isRecurring ? "left-[26px]" : "left-0.5"
                )}
              />
            </button>
          </div>

          {/* Footer */}
          <div className="flex gap-2 pt-2 border-t border-border/30">
            {task && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                Verwijderen
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              Annuleren
            </button>
            <button 
              type="submit" 
              disabled={saving || !title.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Opslaan..." : "Opslaan"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}