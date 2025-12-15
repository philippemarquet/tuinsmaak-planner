import { useEffect, useState } from "react";
import type { Seed, CropType, UUID } from "../lib/types";
import { createSeed, updateSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { MonthSelector } from "./MonthSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SeedModalProps {
  gardenId: UUID;
  seed: Partial<Seed>;
  onClose: () => void;
  onSaved: (seed: Seed) => void;
}

export function SeedModal({ gardenId, seed, onClose, onSaved }: SeedModalProps) {
  const editing = !!seed.id;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Seed>>({
    garden_id: gardenId,
    name: seed.name ?? "",
    crop_type_id: seed.crop_type_id ?? null,
    purchase_date: seed.purchase_date ?? "",
    row_spacing_cm: seed.row_spacing_cm ?? null,
    plant_spacing_cm: seed.plant_spacing_cm ?? null,
    greenhouse_compatible: seed.greenhouse_compatible ?? false,
    sowing_type: (seed.sowing_type === "presow" ? "presow" : "direct"),
    presow_duration_weeks: seed.presow_duration_weeks ?? null,
    grow_duration_weeks: seed.grow_duration_weeks ?? null,
    harvest_duration_weeks: seed.harvest_duration_weeks ?? null,
    presow_months: seed.presow_months ?? [],
    greenhouse_months: (seed as any).greenhouse_months ?? [],
    direct_plant_months: (seed as any).direct_plant_months ?? (seed as any).direct_sow_months ?? [],
    harvest_months: seed.harvest_months ?? [],
    default_color: seed.default_color ?? "#22c55e",
    notes: seed.notes ?? "",
    in_stock: (seed as any).in_stock !== false,
  });

  useEffect(() => {
    const fetchCropTypes = async () => {
      try {
        const types = await listCropTypes();
        setCropTypes(types);
        localStorage.setItem('cached_crop_types', JSON.stringify(types));
      } catch (err) {
        console.error('Failed to fetch crop types:', err);
        const cached = localStorage.getItem('cached_crop_types');
        if (cached) setCropTypes(JSON.parse(cached));
      }
    };
    fetchCropTypes();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchCropTypes();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  function handleChange<K extends keyof Seed>(field: K, value: Seed[K] | any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<Seed> = {
        ...form,
        crop_type_id: form.crop_type_id || null,
        purchase_date: form.purchase_date || null,
        row_spacing_cm: !form.row_spacing_cm || String(form.row_spacing_cm) === "" ? null : Number(form.row_spacing_cm),
        plant_spacing_cm: !form.plant_spacing_cm || String(form.plant_spacing_cm) === "" ? null : Number(form.plant_spacing_cm),
        presow_duration_weeks: !form.presow_duration_weeks || String(form.presow_duration_weeks) === "" ? null : Number(form.presow_duration_weeks),
        grow_duration_weeks: !form.grow_duration_weeks || String(form.grow_duration_weeks) === "" ? null : Number(form.grow_duration_weeks),
        harvest_duration_weeks: !form.harvest_duration_weeks || String(form.harvest_duration_weeks) === "" ? null : Number(form.harvest_duration_weeks),
        greenhouse_months: form.greenhouse_compatible ? ((form as any).greenhouse_months ?? []) : [],
        notes: form.notes || null,
      };

      const saved = editing
        ? await updateSeed(seed.id as UUID, payload)
        : await createSeed(payload);

      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const selectedDate = form.purchase_date ? new Date(form.purchase_date) : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h3 className="text-lg font-semibold tracking-tight">
            {editing ? "Zaad bewerken" : "Nieuw zaad"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Naam + Kleur */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Naam</label>
              <input
                type="text"
                value={form.name ?? ""}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full bg-transparent border-b-2 border-border/50 focus:border-primary py-2 text-base font-medium outline-none transition-colors"
                placeholder="Bijv. Sla Butterhead"
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kleur</label>
              <input
                type="color"
                value={form.default_color ?? "#22c55e"}
                onChange={(e) => handleChange("default_color", e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer border-2 border-white shadow-md overflow-hidden appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
              />
            </div>
          </div>

          {/* Gewastype + Datum */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gewastype</label>
              <Select
                value={form.crop_type_id ?? ""}
                onValueChange={(val) => handleChange("crop_type_id", val || null)}
              >
                <SelectTrigger className="mt-1.5 h-9 border-0 bg-muted/50 rounded-lg">
                  <SelectValue placeholder="Kies type" />
                </SelectTrigger>
                <SelectContent>
                  {cropTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aankoopdatum</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "w-full mt-1.5 h-9 px-3 flex items-center gap-2 text-sm bg-muted/50 rounded-lg text-left",
                    !selectedDate && "text-muted-foreground"
                  )}>
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {selectedDate ? format(selectedDate, "d MMM yyyy", { locale: nl }) : "Kies datum"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => handleChange("purchase_date", date ? format(date, "yyyy-MM-dd") : null)}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap items-center gap-3">
            <TogglePill
              active={form.in_stock ?? true}
              onChange={(v) => handleChange("in_stock", v)}
              label="In voorraad"
            />
            <TogglePill
              active={!!form.greenhouse_compatible}
              onChange={(v) => handleChange("greenhouse_compatible", v)}
              label="Kas"
            />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Zaaitype:</span>
              <div className="flex rounded-lg overflow-hidden border border-border/50">
                <button
                  type="button"
                  onClick={() => handleChange("sowing_type", "direct")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    form.sowing_type === "direct" ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted"
                  )}
                >
                  Direct
                </button>
                <button
                  type="button"
                  onClick={() => handleChange("sowing_type", "presow")}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    form.sowing_type === "presow" ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted"
                  )}
                >
                  Voorzaai
                </button>
              </div>
            </div>
          </div>

          {/* Afstanden + Duur */}
          <div className="grid grid-cols-5 gap-2">
            <NumberInput
              label="Rij"
              suffix="cm"
              value={form.row_spacing_cm}
              onChange={(v) => handleChange("row_spacing_cm", v)}
            />
            <NumberInput
              label="Plant"
              suffix="cm"
              value={form.plant_spacing_cm}
              onChange={(v) => handleChange("plant_spacing_cm", v)}
            />
            <NumberInput
              label="Voorzaai"
              suffix="wk"
              value={form.presow_duration_weeks}
              onChange={(v) => handleChange("presow_duration_weeks", v)}
              disabled={form.sowing_type === 'direct'}
            />
            <NumberInput
              label="Groei"
              suffix="wk"
              value={form.grow_duration_weeks}
              onChange={(v) => handleChange("grow_duration_weeks", v)}
            />
            <NumberInput
              label="Oogst"
              suffix="wk"
              value={form.harvest_duration_weeks}
              onChange={(v) => handleChange("harvest_duration_weeks", v)}
            />
          </div>

          {/* Maanden */}
          <div className="space-y-2 pt-2">
            <MonthSelector
              label="Voorzaaien"
              value={(form.presow_months ?? []) as number[]}
              onChange={(val) => handleChange("presow_months", val)}
              disabled={form.sowing_type === 'direct'}
            />
            <MonthSelector
              label="In de kas"
              value={((form as any).greenhouse_months ?? []) as number[]}
              onChange={(val) => handleChange("greenhouse_months", val)}
              disabled={!form.greenhouse_compatible}
            />
            <MonthSelector
              label="Volle grond"
              value={(form.direct_plant_months ?? []) as number[]}
              onChange={(val) => handleChange("direct_plant_months", val)}
            />
            <MonthSelector
              label="Oogsten"
              value={(form.harvest_months ?? []) as number[]}
              onChange={(val) => handleChange("harvest_months", val)}
            />
          </div>

          {/* Notities */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notities</label>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => handleChange("notes", e.target.value)}
              className="w-full mt-1.5 bg-muted/30 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              rows={2}
              placeholder="Optionele notities..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border/50 bg-muted/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name?.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Opslaan..." : editing ? "Opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Mini components voor cleaner code */

function TogglePill({ active, onChange, label }: { active: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
        active 
          ? "bg-primary/15 text-primary ring-1 ring-primary/30" 
          : "bg-muted/50 text-muted-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

function NumberInput({ 
  label, 
  suffix, 
  value, 
  onChange,
  disabled = false
}: { 
  label: string; 
  suffix: string; 
  value: number | null | undefined; 
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("text-center", disabled && "opacity-40")}>
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
          className="w-full text-center bg-muted/30 rounded-lg py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}
