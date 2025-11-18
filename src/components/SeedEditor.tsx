// src/components/SeedEditor.tsx
import { useEffect, useMemo, useState } from "react";
import type { Seed } from "../lib/types";
import { updateSeed } from "../lib/api/seeds";

type Props = {
  seed: Seed;
  onClose: () => void;
  onSaved?: (seed: Seed) => void;
};

const MONTHS = [
  { v: 1, l: "Jan" }, { v: 2, l: "Feb" }, { v: 3, l: "Mrt" }, { v: 4, l: "Apr" },
  { v: 5, l: "Mei" }, { v: 6, l: "Jun" }, { v: 7, l: "Jul" }, { v: 8, l: "Aug" },
  { v: 9, l: "Sep" }, { v: 10, l: "Okt" }, { v: 11, l: "Nov" }, { v: 12, l: "Dec" },
];

function ToggleMonth({
  value, selected, onChange, disabled = false
}: { value: number; selected: number[]; onChange: (arr: number[]) => void; disabled?: boolean }) {
  const on = selected.includes(value);
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "px-2 py-1 rounded border text-sm",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      ].join(" ")}
      onClick={() => {
        if (disabled) return;
        onChange(on ? selected.filter(m => m !== value) : [...selected, value]);
      }}
    >
      {MONTHS[value - 1].l}
    </button>
  );
}

export default function SeedEditor({ seed, onClose, onSaved }: Props) {
  // Local form state
  const [name, setName] = useState(seed.name ?? "");
  const [sowingType, setSowingType] = useState<"direct" | "presow">(
    (seed.sowing_type === "presow" ? "presow" : "direct")
  );

  const [presowDurationWeeks, setPresowDurationWeeks] = useState<number | null>(
    seed.presow_duration_weeks ?? null
  );
  const [presowMonths, setPresowMonths] = useState<number[]>(
    seed.presow_months ?? []
  );

  // definitieve 3: presow_months, direct_plant_months, harvest_months
  const [directPlantMonths, setDirectPlantMonths] = useState<number[]>(
    // veldnaam in DB: direct_plant_months
    (seed as any).direct_plant_months ?? []
  );
  const [harvestMonths, setHarvestMonths] = useState<number[]>(
    seed.harvest_months ?? []
  );
  const [greenhouseMonths, setGreenhouseMonths] = useState<number[]>(
    (seed as any).greenhouse_months ?? []
  );

  const [growWeeks, setGrowWeeks] = useState<number | null>(seed.grow_duration_weeks ?? null);
  const [harvestWeeks, setHarvestWeeks] = useState<number | null>(seed.harvest_duration_weeks ?? null);

  const [greenhouse, setGreenhouse] = useState<boolean>(!!seed.greenhouse_compatible);
  const [defaultColor, setDefaultColor] = useState<string>(seed.default_color ?? "#22c55e");
  const [notes, setNotes] = useState<string>(seed.notes ?? "");

  // Wanneer je naar DIRECT wisselt, wis voorzaai velden en disable invoer
  useEffect(() => {
    if (sowingType === "direct") {
      if (presowDurationWeeks !== null) setPresowDurationWeeks(null);
      if (presowMonths.length) setPresowMonths([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sowingType]);

  async function handleSave() {
    const payload: Partial<Seed> & Record<string, any> = {
      name,
      sowing_type: sowingType,          // alleen 'direct' of 'presow'
      presow_duration_weeks: sowingType === "presow" ? presowDurationWeeks : null,
      presow_months: sowingType === "presow" ? presowMonths : [],
      direct_plant_months: directPlantMonths,
      harvest_months: harvestMonths,
      greenhouse_months: greenhouse ? greenhouseMonths : [],
      grow_duration_weeks: growWeeks,
      harvest_duration_weeks: harvestWeeks,
      greenhouse_compatible: greenhouse,
      default_color: defaultColor,
      notes,
    };

    const updated = await updateSeed(seed.id, payload as any);
    onSaved?.(updated);
    onClose();
  }

  const presowDisabled = sowingType !== "presow";

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold">Zaad bewerken</h3>

      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Naam</span>
          <input
            className="border rounded px-2 py-1"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bijv. Wortel Nantes"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Zaaimethode</span>
          <select
            className="border rounded px-2 py-1"
            value={sowingType}
            onChange={e => setSowingType(e.target.value as "direct" | "presow")}
          >
            <option value="direct">Direct</option>
            <option value="presow">Voorzaaien</option>
          </select>
          <span className="text-xs text-muted-foreground">
            Er is geen “beide” meer; kies één vaste methode per zaad.
          </span>
        </label>

        {/* Voorzaai veld(en) alleen zichtbaar/bruikbaar bij 'presow' */}
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Voorzaai-weken</label>
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 w-28"
              placeholder="bijv. 4"
              value={presowDurationWeeks ?? ""}
              disabled={presowDisabled}
              onChange={(e) => setPresowDurationWeeks(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Voorzaai-maanden</div>
            <div className="flex flex-wrap gap-1">
              {MONTHS.map(m => (
                <ToggleMonth
                  key={m.v}
                  value={m.v}
                  selected={presowMonths}
                  onChange={setPresowMonths}
                  disabled={presowDisabled}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Zaaien/Planten in de kas (alleen zichtbaar als kas-geschikt aangevinkt staat) */}
        {greenhouse && (
          <div>
            <div className="text-sm font-medium mb-1">Zaaien/Planten in de kas</div>
            <div className="flex flex-wrap gap-1">
              {MONTHS.map(m => (
                <ToggleMonth
                  key={m.v}
                  value={m.v}
                  selected={greenhouseMonths}
                  onChange={setGreenhouseMonths}
                />
              ))}
            </div>
          </div>
        )}

        {/* Direct/Plant maanden (altijd zichtbaar, want dit is de grond-datumlogica) */}
        <div>
          <div className="text-sm font-medium mb-1">Direct/Plant maanden</div>
          <div className="flex flex-wrap gap-1">
            {MONTHS.map(m => (
              <ToggleMonth
                key={m.v}
                value={m.v}
                selected={directPlantMonths}
                onChange={setDirectPlantMonths}
              />
            ))}
          </div>
        </div>

        {/* Oogstmaanden */}
        <div>
          <div className="text-sm font-medium mb-1">Oogstmaanden</div>
          <div className="flex flex-wrap gap-1">
            {MONTHS.map(m => (
              <ToggleMonth
                key={m.v}
                value={m.v}
                selected={harvestMonths}
                onChange={setHarvestMonths}
              />
            ))}
          </div>
        </div>

        {/* Durations */}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Groei (weken)</span>
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1"
              value={growWeeks ?? ""}
              onChange={e => setGrowWeeks(e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Oogstduur (weken)</span>
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1"
              value={harvestWeeks ?? ""}
              onChange={e => setHarvestWeeks(e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        </div>

        {/* Overig */}
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={greenhouse} onChange={e => setGreenhouse(e.target.checked)} />
          Kas-geschikt
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Kleur (HEX of rgb())</span>
          <input
            className="border rounded px-2 py-1"
            value={defaultColor}
            onChange={e => setDefaultColor(e.target.value)}
            placeholder="#22c55e"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm font-medium">Notities</span>
          <textarea
            className="border rounded px-2 py-1 min-h-[80px]"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optioneel"
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button className="px-3 py-1 border rounded bg-muted" type="button" onClick={onClose}>
          Annuleren
        </button>
        <button className="px-3 py-1 rounded bg-primary text-primary-foreground" type="button" onClick={handleSave}>
          Opslaan
        </button>
      </div>
    </div>
  );
}
