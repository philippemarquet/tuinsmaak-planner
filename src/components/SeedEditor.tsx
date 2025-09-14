// src/components/SeedEditor.tsx
import { useEffect, useMemo, useState } from 'react';
import type { CropType, Seed, UUID } from '../lib/types';
import { listCropTypes } from '../lib/api/cropTypes';
import { createSeed, updateSeed } from '../lib/api/seeds';
import { MonthSelector } from './MonthSelector';

type Props = {
  gardenId: UUID;
  seed?: Seed | null; // als meegegeven => bewerken
  onClose: () => void;
  onSaved: (s: Seed) => void; // nieuw of updated seed teruggeven
};

export default function SeedEditor({
  gardenId,
  seed,
  onClose,
  onSaved
}: Props) {
  const editing = !!seed;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);

  const [name, setName] = useState(seed?.name ?? '');
  const [cropTypeId, setCropTypeId] = useState<string | ''>(seed?.crop_type_id ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string>((seed as any)?.purchase_date ?? '');

  // Voorraad (boolean; of gebruik je bestaande stock_status -> in_stock migratie)
  const [inStock, setInStock] = useState<boolean>((seed as any)?.in_stock ?? ((seed?.stock_status ?? 'adequate') !== 'out'));

  // Zaaitype & duur
  const [sowingType, setSowingType] = useState<Seed['sowing_type']>(seed?.sowing_type ?? 'both');
  const [presowWeeks, setPresowWeeks] = useState<number | ''>(seed?.presow_duration_weeks ?? '');

  const [growWeeks, setGrowWeeks] = useState<number | ''>(seed?.grow_duration_weeks ?? '');
  const [harvestWeeks, setHarvestWeeks] = useState<number | ''>(seed?.harvest_duration_weeks ?? '');

  // Maanden — definitief: presow_months, direct_plant_months, harvest_months
  const [presowMonths, setPresowMonths] = useState<number[]>(seed?.presow_months ?? []);
  const [directPlantMonths, setDirectPlantMonths] = useState<number[]>( (seed as any)?.direct_plant_months ?? []);
  const [harvestMonths, setHarvestMonths] = useState<number[]>(seed?.harvest_months ?? []);

  const [greenhouse, setGreenhouse] = useState<boolean>(seed?.greenhouse_compatible ?? false);
  const [rowSpacing, setRowSpacing] = useState<number | ''>((seed as any)?.row_spacing_cm ?? '');
  const [plantSpacing, setPlantSpacing] = useState<number | ''>((seed as any)?.plant_spacing_cm ?? '');
  const [color, setColor] = useState<string>(seed?.default_color ?? '#22c55e');
  const [notes, setNotes] = useState<string>(seed?.notes ?? '');

  useEffect(() => {
    listCropTypes().then(setCropTypes).catch(console.error);
  }, []);

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  // wanneer DIRECT wordt gekozen: voorzaai-weken leegmaken en presowMonths niet tonen
  useEffect(() => {
    if (sowingType === 'direct') {
      setPresowWeeks('');
      // presowMonths blijven we bewaren, maar je ziet ze niet; wil je ze wissen, uncomment:
      // setPresowMonths([]);
    }
  }, [sowingType]);

  async function handleSave() {
    const payload: Partial<Seed> = {
      garden_id: gardenId,
      name: name.trim(),
      crop_type_id: cropTypeId || null,
      purchase_date: purchaseDate || null,

      // Voorraad (boolean)
      ...(typeof (seed as any)?.in_stock === 'boolean'
        ? { in_stock: !!inStock }
        : { stock_status: inStock ? 'adequate' : 'out' }),

      // Zaaitype & weken
      sowing_type: sowingType,
      presow_duration_weeks: sowingType === 'direct' ? null : (presowWeeks === '' ? null : Number(presowWeeks)),
      grow_duration_weeks:  growWeeks   === '' ? null : Number(growWeeks),
      harvest_duration_weeks: harvestWeeks === '' ? null : Number(harvestWeeks),

      // Maanden (definitieve drie)
      presow_months: presowMonths,
      direct_plant_months: directPlantMonths,
      harvest_months: harvestMonths,

      greenhouse_compatible: greenhouse,
      row_spacing_cm: rowSpacing === '' ? null : Number(rowSpacing),
      plant_spacing_cm: plantSpacing === '' ? null : Number(plantSpacing),

      default_color: color || '#22c55e',
      notes: notes || null
    };

    const saved = editing ? await updateSeed(seed!.id, payload) : await createSeed(payload);
    onSaved(saved);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? 'Zaad bewerken' : 'Nieuw zaad'}</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Sluiten</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Linkerkolom */}
          <div className="space-y-2">
            <label className="text-sm">Naam</label>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={name} onChange={e => setName(e.target.value)} />

            <label className="text-sm">Gewastype</label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={cropTypeId} onChange={e => setCropTypeId(e.target.value)}>
              <option value="">(geen)</option>
              {cropTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>

            <label className="text-sm">Aankoopdatum</label>
            <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} />
              In voorraad
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Rijafstand (cm)</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={rowSpacing} onChange={e => setRowSpacing(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm">Plantafstand (cm)</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={plantSpacing} onChange={e => setPlantSpacing(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={greenhouse} onChange={e => setGreenhouse(e.target.checked)} />
                Geschikt voor kas
              </label>
            </div>

            <div>
              <div className="text-sm mb-1">Zaaitype</div>
              <div className="flex gap-3 text-sm">
                {(['direct', 'presow', 'both'] as const).map(opt => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      checked={sowingType === opt}
                      onChange={() => setSowingType(opt)}
                    />
                    {opt === 'direct' ? 'Direct' : opt === 'presow' ? 'Voorzaaien' : 'Beide'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Rechterkolom */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm">Voorzaai (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={presowWeeks}
                  onChange={e => setPresowWeeks(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={sowingType === 'direct'}
                />
                {sowingType === 'direct' && (
                  <p className="text-xs text-muted-foreground mt-1">Niet van toepassing bij <strong>Direct</strong>.</p>
                )}
              </div>
              <div>
                <label className="text-sm">Groei → oogst (weken)</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={growWeeks} onChange={e => setGrowWeeks(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm">Oogstduur (weken)</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={harvestWeeks} onChange={e => setHarvestWeeks(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            {/* Maanden */}
            {sowingType !== 'direct' && (
              <MonthSelector label="Voorzaaimaanden" value={presowMonths} onChange={setPresowMonths} />
            )}

            <MonthSelector label="Direct/Plant maanden (grond in)" value={directPlantMonths} onChange={setDirectPlantMonths} />
            <MonthSelector label="Oogstmaanden" value={harvestMonths} onChange={setHarvestMonths} />

            <div>
              <label className="text-sm">Standaardkleur</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color.startsWith('#') ? color : '#22c55e'}
                  onChange={e => setColor(e.target.value)}
                  className="w-12 h-8 p-0 border-none cursor-pointer bg-transparent"
                  title="Kies een kleur"
                />
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2"
                  placeholder="#22c55e of rgb(34,197,94)"
                />
              </div>
            </div>

            <label className="text-sm">Notities</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2">
            Annuleren
          </button>
          <button disabled={!canSave} onClick={handleSave} className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 disabled:opacity-50">
            {editing ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
