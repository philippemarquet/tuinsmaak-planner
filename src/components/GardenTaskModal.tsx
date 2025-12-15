import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import type { GardenTask } from "../lib/types";

const MONTHS = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December"
];

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
            <Select
              value={dueWeek ? String(dueWeek) : "none"}
              onValueChange={(v) => setDueWeek(v === "none" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Geen specifieke week" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Geen specifieke week</SelectItem>
                <SelectItem value="1">Week 1</SelectItem>
                <SelectItem value="2">Week 2</SelectItem>
                <SelectItem value="3">Week 3</SelectItem>
                <SelectItem value="4">Week 4</SelectItem>
                <SelectItem value="5">Week 5</SelectItem>
              </SelectContent>
            </Select>
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
