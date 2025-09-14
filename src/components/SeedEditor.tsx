import { useEffect, useMemo, useState } from 'react';
import type { CropType, Seed, UUID } from '../lib/types';
import { listCropTypes } from '../lib/api/cropTypes';
import { createSeed, updateSeed } from '../lib/api/seeds';
import { MonthSelector } from './MonthSelector';

type Props = {
  gardenId: UUID;
  seed?: Seed | null; // bewerken als meegegeven
  onClose: () => void;
  onSaved: (s: Seed) => void;
};

export default function SeedEditor({
  gardenId,
  seed,
  onClose,
  onSaved
}: Props) {
  const editing = !!seed;
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);

  // basis
  const [name, setName] = useState(seed?.name ?? '');
  const [cropTypeId, setCropTypeId] = useState<string | ''>(seed?.crop_type_id ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string>(seed?.purchase_date ?? '');

  // voorraad (boolean i.p.v. status/quantity)
  const [inStock, setInStock] = useState<boolean>((seed as any)?.in_stock ?? true);

  // afstanden
  const [rowSpacing, setRowSpacing] = useState<number | ''>(seed?.row_spacing_cm ?? '');
  const [plantSpacing, setPlantSpacing] = useState<number | ''>(seed?.plant_spacing_cm ?? '');

  // kas
  const [greenhouse, setGreenhouse] = useState<boolean>(seed?.greenhouse_compatible ?? false);

  // zaaitype
  const [sowingType, setSowingType] = useState<Seed['sowing_type']>(seed?.sowing_type ?? 'both');

  // duurvelden
  const [presowWeeks, setPresowWeeks] = useState<number | ''>(seed?.presow_duration_weeks ?? '');
  const [growWeeks, setGrowWeeks] = useState<number | ''>(seed?.grow_duration_weeks ?? '');
  const [harvestWeeks, setHarvestWeeks] = useState<number | ''>(seed?.harvest_duration_weeks ?? '');

  // maanden
  const [presowMonths, setPresowMonths] = useState<number[]>(seed?.presow_months ?? []);
  const [directSowMonths, setDirectSowMonths] = useState<number[]>(seed?.direct_sow_months ?? []);
  const [plantMonths, setPlantMonths] = useState<number[]>(seed?.plant_months ?? []);
  const [harvestMonths, setHarvestMonths] = useState<number[]>(seed?.harvest_months ?? []);

  // overige
  const [color, setColor] = useState<string>(seed?.default_color ?? '#22c55e');
  const [notes, setNotes] = useState<string>(seed?.notes ?? '');

  // UX state
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    listCropTypes().then(setCropTypes).catch(console.error);
  }, []);

  // Als zaaitype → Direct: presow-weken disablen én leegmaken
  useEffect(() => {
    if (sowingType === 'direct' && presowWeeks !== '') {
      setPresowWeeks('');
    }
  }, [sowingType]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = useMemo(() => name.trim().length > 0, [name]);

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: Partial<Seed> = {
        garden_id: gardenId,
        name: name.trim(),
        crop_type_id: cropTypeId || null,
        purchase_date: purchaseDate || null,

        // boolean voorraad
        ...(inStock !== undefined ? ({ in_stock: !!inStock } as any) : {}),

        // afstanden
        row_spacing_cm: rowSpacing === '' ? null : Number(rowSpacing),
        plant_spacing_cm: plantSpacing === '' ? null : Number(plantSpacing),

        greenhouse_compatible: greenhouse,

        // zaaitype + duur
        sowing_type: sowingType,
        presow_duration_weeks:
          sowingType === 'direct'
            ? null
            : (presowWeeks === '' ? null : Number(presowWeeks)),
        grow_duration_weeks: growWeeks === '' ? null : Number(growWeeks),
        harvest_duration_weeks: harvestWeeks === '' ? null : Number(harvestWeeks),

        // maanden
        presow_months: presowMonths,
        direct_sow_months: directSowMonths,
        plant_months: plantMonths,
        harvest_months: harvestMonths,

        default_color: color || '#22c55e',
        notes: notes || null
      };

      const saved = editing
        ? await updateSeed(seed!.id, payload)
        : await createSeed(payload);

      onSaved(saved);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  }

  const showPresowMonths = sowingType !== 'direct'; // alleen Voorzaai/Beide

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? 'Zaad bewerken' : 'Nieuw zaad'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:underline"
            disabled={saving}
          >
            Sluiten
          </button>
        </div>

        {/* twee kolommen */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* links */}
          <div className="space-y-2">
            <label className="text-sm">Naam</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={name}
              onChange={e => setName(e.target.value)}
            />

            <label className="text-sm">Gewastype</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={cropTypeId}
              onChange={e => setCropTypeId(e.target.value)}
            >
              <option value="">(geen)</option>
              {cropTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>

            <label className="text-sm">Aankoopdatum</label>
            <input
              type="date"
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={e => setInStock(e.target.checked)}
                />
                In voorraad
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Rijafstand (cm)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={rowSpacing}
                  onChange={e => setRowSpacing(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm">Plantafstand (cm)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={plantSpacing}
                  onChange={e => setPlantSpacing(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={greenhouse}
                  onChange={e => setGreenhouse(e.target.checked)}
                />
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
                    {opt === 'direct' ? 'Direct'
                      : opt === 'presow' ? 'Voorzaai'
                      : 'Beide'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* rechts */}
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm">Voorzaaien (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={presowWeeks}
                  onChange={e => setPresowWeeks(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={sowingType === 'direct'}
                  placeholder={sowingType === 'direct' ? 'Niet van toepassing' : ''}
                  title={sowingType === 'direct' ? 'Niet van toepassing bij zaaitype Direct' : ''}
                />
              </div>
              <div>
                <label className="text-sm">Groei → oogst (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={growWeeks}
                  onChange={e => setGrowWeeks(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-sm">Oogstduur (weken)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={harvestWeeks}
                  onChange={e => setHarvestWeeks(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>

            {/* Maanden */}
            {sowingType !== 'direct' && (
              <MonthSelector label="Voorzaaimaanden" value={presowMonths} onChange={setPresowMonths} />
            )}
            <MonthSelector label="Direct zaaien" value={directSowMonths} onChange={setDirectSowMonths} />
            <MonthSelector label="Plantmaanden" value={plantMonths} onChange={setPlantMonths} />
            <MonthSelector label="Oogstmaanden" value={harvestMonths} onChange={setHarvestMonths} />

            {/* Kleur */}
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
              <p className="text-xs text-muted-foreground mt-1">
                Voer een <strong>HEX</strong> (bijv. <code>#22c55e</code>) of <strong>rgb()</strong> in.
              </p>
            </div>

            <label className="text-sm">Notities</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* foutmelding */}
        {errorMsg && (
          <div className="mt-3 text-sm text-red-600">
            {errorMsg}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2"
            disabled={saving}
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSave}
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : (editing ? 'Opslaan' : 'Toevoegen')}
          </button>
        </div>
      </div>
    </div>
  );
}
