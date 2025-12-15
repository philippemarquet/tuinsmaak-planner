import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { getISOWeek, startOfWeek, endOfWeek, format, startOfMonth, endOfMonth, addWeeks } from "date-fns";
import { nl } from "date-fns/locale";
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
  
  // Start from the Monday of the week containing the first day of the month
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
  
  // Reset selection if current week is no longer valid for the new month
  useEffect(() => {
    if (value !== null && !weeks.some(w => w.weekNum === value)) {
      onChange(null);
    }
  }, [weeks, value, onChange]);

  return (
    <Select
      value={value ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Geen specifieke week" />
      </SelectTrigger>
      <SelectContent>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Taak bewerken" : "Nieuwe tuintaak"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bijv. Hortensia's snoeien"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beschrijving</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extra notities..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Maand *</Label>
              <Select
                value={String(dueMonth)}
                onValueChange={(v) => setDueMonth(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Jaar *</Label>
              <Select
                value={String(dueYear)}
                onValueChange={(v) => setDueYear(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => currentYear - 1 + i).map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Week (optioneel)</Label>
            <WeekSelect
              year={dueYear}
              month={dueMonth}
              value={dueWeek}
              onChange={setDueWeek}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="recurring" className="cursor-pointer">
              Terugkerende taak (elk jaar)
            </Label>
            <Switch
              id="recurring"
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
            />
          </div>

          <div className="flex gap-2 pt-2">
            {task && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
              >
                Verwijderen
              </Button>
            )}
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
