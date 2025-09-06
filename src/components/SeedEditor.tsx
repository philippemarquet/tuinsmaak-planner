import { useEffect, useMemo, useState } from 'react';
import type { CropType, Seed, UUID } from '../lib/types';
import { listCropTypes } from '../lib/api/cropTypes';
import { createSeed, updateSeed } from '../lib/api/seeds';

type Props = {
  gardenId: UUID;
  seed?: Seed | null;         // meegegeven => bewerken
  onClose: () => void;
  onSaved: (s: Seed) => void; // nieuw of updated seed teruggeven
};

const MONTHS = [
  { n: 1,  label: 'Jan' }, { n: 2,  label: 'Feb' }, { n: 3,  label: 'Mrt' },
  { n: 4,  label: 'Apr' }, { n: 5,  label: 'Mei' }, { n: 6,  label: 'Jun' },
  { n: 7,  label: 'Jul' }, { n: 8,  label: 'Aug' }, { n: 9,  label: 'Sep' },
  { n: 10, label: 'Okt' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dec' },
];

function toggleInArray(arr: number[], v: number): number[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v].sort((a,b)=>a-b);
}

export default function SeedEditor({ gardenId, seed, onClose, onSaved }: Props) {
  const editing = !!seed;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);

  // Basis
  const [name, setName] = useState(seed?.name ?? '');
  const [cropTypeId, setCropTypeId] = useState<string | ''>(seed?.crop_type_id ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string>(seed?.purchase_date ?? '');
  const [notes, setNotes] = useState<string>(seed?.notes ?? '');

  // Voorraad (checkbox i.p.v. dropdown)
  const [inStock, setInStock] = useState<boolean>((seed?.stock_status ?? 'adequate') !== 'out');
  const [stockQty, setStockQty] = useState<number>(seed?.stock_quantity ?? 0);

  // Afstanden & kas
  const [rowSpacing, setRowSpacing] = useState<number | ''>(seed?.row_spacing_cm ?? '');
  const [plantSpacing, setPlantSpacing] = useState<number | ''>(seed?.plant_spacing_cm ?? '');
  const [greenhouse, setGreenhouse] = useState<boolean>(seed?.greenhouse_compatible ?? false);

  // Zaaitype
  const [sowingType, setSowingType] = useState<Seed['sowing_type']>(seed?.sowing_type ?? 'both');

  // Duur (weken)
  const [presowWeeks, setPresowWeeks] = useState<number | ''>(seed?.presow_duration_weeks ?? '');
  const [growWeeks, setGrowWeeks] = useState<number | ''>(seed?.grow_duration_weeks ?? '');
  const [harvestWeeks, setHarvestWeeks] = useState<number | ''>(seed?.harvest_duration_weeks ?? '');

  // Maanden
  const [presowMonths, setPresowMonths] = useState<number[]>(seed?.presow_months ?? []);
  const [directSowMonths, setDirectSowMonths] = useState<number[]>(seed?.direct_sow_months ?? []);
  const [plantMonths, setPlantMonths] = useState<number[]>(seed?.plant_months ?? []);
  const [harvestMonths, setHarvestMonths] = useState<number[]>(seed?.harvest_months ?? []);

  // Kleur (HEX/RGB)
  const [color, setColor] = useState<string>(seed?.default_color ?? '#22c55e');

  useEffect(() => { listCropTypes().then(setCropTypes).catch(console.error); }, []);

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  async function handleSave() {
    const payload: Partial<Seed> = {
      garden_id: gardenId,
      name: name.trim(),
      crop_type_id: cropTypeId || null,
      purchase_date: purchaseDate || null,

      // mapping checkbox → stock_status
      stock_status: inStock ? 'adequate' : 'out',
      stock_quantity: Number(stockQty) || 0,

      row_spacing_cm: rowSpacing === '' ? null : Number(rowSpacing),
      plant_spacing_cm: plantSpacing === '' ? null : Number(plantSpacing),
      greenhouse_compatible: greenhouse,

      sowing_type: sowingType,

      presow_duration_weeks: presowWeeks === '' ? null : Number(presowWeeks),
      grow_duration_weeks:   growWeeks   === '' ? null : Number(growWeeks),
      harvest_duration_weeks:harvestWeeks=== '' ? null : Number(harvestWeeks),

      presow_months:    presowMonths,
      direct_sow_months:directSowMonths,
      plant_months:     plantMonths,
      harvest_months:   harvestMonths,

      default_color: color || '#22c55e',
      notes: notes || null,
    };

    const saved = editing
      ? await updateSeed(seed!.id, payload)
      : await createSeed(payload);

    onSaved(saved);
  }

  function MonthPicker({
    value, onChange, label
  }: { value: number[]; onChange: (arr:number[])=>void; label: string }) {
    return (
      <div>
        <div className="text-sm font-medium mb-1">{label}</div>
        <div className="grid grid-cols-6 gap-1">
          {MONTHS.map(m => {
            const active = value.includes(m.n);
            return (
              <label
                key={m.n}
                className={`text-xs px-2 py-1 rounded border select-none cursor-pointer
                ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border"}`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onChange(toggleInArray(value, m.n))}
                  className="hidden"
                />
                {m.label}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  // fallback voor browsers die geen color-picker tonen: we laten altijd de text input ook zien
  const colorIsHex = color.startsWith("#");

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? 'Zaad bewerken' : 'Nieuw zaad'}</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Sluiten</button>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Linkerkolom */}
          <div className="space-y-3">
            <div>
              <label className="text-sm">Naam</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={name}
                onChange={e=>setName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm">Gewastype</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={cropTypeId}
                onChange={e=>setCropTypeId(e.target.value)}
              >
                <option value="">(geen)</option>
                {cropTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm">Aankoopdatum</label>
              <input
                type="date"
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={purchaseDate}
                onChange={e=>setPurchaseDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e)=>setInStock(e.target.checked)}
                />
                In voorraad
              </label>
              <div>
                <label className="text-sm">Aantal</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={stockQty}
                  onChange={e=>setStockQty(Number(e.target.value)||0)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Rijafstand (cm)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={rowSpacing}
                  onChange={e=>setRowSpacing(e.target.value===''? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm">Plantafstand (cm)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={plantSpacing}
                  onChange={e=>setPlantSpacing(e.target.value===''? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={greenhouse}
                onChange={e=>setGreenhouse(e.target.checked)}
              />
              Geschikt voor kas
            </label>

            <div>
              <div className="text-sm mb-1">Zaaitype</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {(['direct','presow','both'] as const).map(opt => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input type="radio" checked={sowingType===opt} onChange={()=>setSowingType(opt)} />
                    {opt === 'direct' ? 'direct' : opt === 'presow' ? 'voorzaai' : 'beide'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Rechterkolom */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm">Voorzaaien (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={presowWeeks}
                  onChange={e=>setPresowWeeks(e.target.value===''? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm">Groei → oogst (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={growWeeks}
                  onChange={e=>setGrowWeeks(e.target.value===''? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm">Oogstduur (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={harvestWeeks}
                  onChange={e=>setHarvestWeeks(e.target.value===''? '' : Number(e.target.value))}
                />
              </div>
            </div>

            {/* Maand-selectors (jouw stijl) */}
            <MonthPicker label="Voorzaaimaanden" value={presowMonths} onChange={setPresowMonths} />
            <MonthPicker label="Direct zaaien" value={directSowMonths} onChange={setDirectSowMonths} />
            <MonthPicker label="Plantmaanden" value={plantMonths} onChange={setPlantMonths} />
            <MonthPicker label="Oogstmaanden" value={harvestMonths} onChange={setHarvestMonths} />

            {/* Kleurkeuze */}
            <div>
              <label className="text-sm">Standaardkleur</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colorIsHex ? color : "#22c55e"}
                  onChange={(e)=>setColor(e.target.value)}
                  className="w-12 h-8 p-0 border-none cursor-pointer bg-transparent"
                  title="Kies een kleur"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e)=>setColor(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2"
                  placeholder="#22c55e of rgb(34,197,94)"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Je kunt een <strong>HEX</strong> (bijv. <code>#22c55e</code>) of <strong>rgb()</strong> ingeven.
              </p>
            </div>

            <div>
              <label className="text-sm">Notities</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]"
                value={notes}
                onChange={e=>setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2"
          >
            Annuleren
          </button>
          <button
            disabled={!canSave}
            onClick={handleSave}
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 disabled:opacity-50"
          >
            {editing ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
