import { useState } from "react";
import type { GardenBed } from "../lib/types";
import { updateBed, createBed } from "../lib/api/beds";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BedModalProps {
  bed: GardenBed | null;
  gardenId?: string;
  onClose: () => void;
  onUpdated: (bed: GardenBed) => void;
}

export function BedModal({ bed, gardenId, onClose, onUpdated }: BedModalProps) {
  const editing = !!bed?.id;
  
  const [form, setForm] = useState<Partial<GardenBed>>({
    id: bed?.id,
    name: bed?.name ?? "",
    width_cm: bed?.width_cm ?? 120,
    length_cm: bed?.length_cm ?? 300,
    segments: bed?.segments ?? 1,
    is_greenhouse: bed?.is_greenhouse ?? false,
    location_x: bed?.location_x ?? 0,
    location_y: bed?.location_y ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange<K extends keyof GardenBed>(field: K, value: GardenBed[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!editing && !gardenId) {
      setError("Geen tuin geselecteerd: kan geen bak aanmaken zonder gardenId.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const patch: Partial<GardenBed> = {
        name: (form.name ?? "").toString().trim() || "Nieuwe bak",
        width_cm: Number(form.width_cm) || 120,
        length_cm: Number(form.length_cm) || 300,
        segments: Math.max(1, Number(form.segments) || 1),
        is_greenhouse: Boolean(form.is_greenhouse),
        location_x: Number(form.location_x) || 0,
        location_y: Number(form.location_y) || 0,
      };

      let result: GardenBed;
      if (editing && bed) {
        result = await updateBed(bed.id, patch);
      } else {
        result = await createBed({ ...patch, garden_id: gardenId });
      }

      onUpdated(result);
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h3 className="text-lg font-semibold tracking-tight">
            {editing ? "Bak bewerken" : "Nieuwe bak"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Naam */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Naam</label>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full bg-transparent border-b-2 border-border/50 focus:border-primary py-2 text-base font-medium outline-none transition-colors"
              placeholder="Bijv. Bak 1"
            />
          </div>

          {/* Afmetingen + Segmenten */}
          <div className="grid grid-cols-3 gap-4">
            <NumberInput
              label="Breedte"
              suffix="cm"
              value={form.width_cm}
              onChange={(v) => handleChange("width_cm", v ?? 120)}
            />
            <NumberInput
              label="Lengte"
              suffix="cm"
              value={form.length_cm}
              onChange={(v) => handleChange("length_cm", v ?? 300)}
            />
            <NumberInput
              label="Segmenten"
              suffix=""
              value={form.segments}
              onChange={(v) => handleChange("segments", Math.max(1, v ?? 1))}
              min={1}
              max={24}
            />
          </div>

          {/* Kas toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</span>
            <div className="flex rounded-lg overflow-hidden border border-border/50">
              <button
                type="button"
                onClick={() => handleChange("is_greenhouse", false)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium transition-colors",
                  !form.is_greenhouse ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted"
                )}
              >
                Buiten
              </button>
              <button
                type="button"
                onClick={() => handleChange("is_greenhouse", true)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium transition-colors",
                  form.is_greenhouse ? "bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted"
                )}
              >
                Kas
              </button>
            </div>
          </div>

          {/* Positie */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
              Positie op plattegrond
            </label>
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="X"
                suffix="px"
                value={form.location_x}
                onChange={(v) => handleChange("location_x", v ?? 0)}
              />
              <NumberInput
                label="Y"
                suffix="px"
                value={form.location_y}
                onChange={(v) => handleChange("location_y", v ?? 0)}
              />
            </div>
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

function NumberInput({ 
  label, 
  suffix, 
  value, 
  onChange,
  min,
  max,
}: { 
  label: string; 
  suffix: string; 
  value: number | null | undefined; 
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="text-center">
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full text-center bg-muted/30 rounded-lg py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}
