// src/components/PlantingEditor.tsx
import { useEffect, useMemo, useState } from 'react';
import type { GardenBed, Planting, Seed, UUID } from '../lib/types';
import { listSeeds } from '../lib/api/seeds';
import { listBeds } from '../lib/api/beds';
import { listPlantings } from '../lib/api/plantings';
import { createPlanting, updatePlanting } from '../lib/api/plantings';

type Props = {
  gardenId: UUID;
  planting?: Planting | null;
  onClose: () => void;
  onSaved: (p: Planting) => void;
};

function parseISO(iso?: string | null) {
  return iso ? new Date(iso) : null;
}
function toISO(d: Date) { return d.toISOString().slice(0,10); }
function addDays(d: Date, n: number) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function addWeeks(d: Date, w: number) { return addDays(d, w*7); }

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart <= bEnd && bStart <= aEnd;
}
function segmentsOverlap(aStartSeg: number, aUsed: number, bStartSeg: number, bUsed: number) {
  const aEnd = aStartSeg + aUsed - 1;
  const bEnd = bStartSeg + bUsed - 1;
  return aStartSeg <= bEnd && bStartSeg <= aEnd;
}
function findFirstFreeSegment(all: Planting[], bed: GardenBed, start: Date, end: Date, used: number, ignoreId?: string): number | null {
  const max = Math.max(1, bed.segments);
  for (let seg = 0; seg <= max - used; seg++) {
    let clash = false;
    for (const p of all) {
      if (p.garden_bed_id !== bed.id) continue;
      if (ignoreId && p.id === ignoreId) continue;
      const s = parseISO(p.planned_date), e = parseISO(p.planned_harvest_end);
      if (!s || !e) continue;
      if (!intervalsOverlap(start, end, s, e)) continue;
      const ps = p.start_segment ?? 0, pu = p.segments_used ?? 1;
      if (segmentsOverlap(seg, used, ps, pu)) { clash = true; break; }
    }
    if (!clash) return seg;
  }
  return null;
}

export default function PlantingEditor({ gardenId, planting, onClose, onSaved }: Props) {
  const editing = !!planting;
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [allPlantings, setAllPlantings] = useState<Planting[]>([]);

  const [seedId, setSeedId] = useState<string>(planting?.seed_id ?? '');
  const [bedId, setBedId] = useState<string>(planting?.garden_bed_id ?? '');
  const [method, setMethod] = useState<'direct'|'presow'>( (planting?.method as any) ?? 'direct');

  const [sowDate, setSowDate] = useState<string>(planting?.planned_presow_date ?? '');
  const [plantDate, setPlantDate] = useState<string>(planting?.planned_date ?? '');
  const [harvestStart, setHarvestStart] = useState<string>(planting?.planned_harvest_start ?? '');
  const [harvestEnd, setHarvestEnd] = useState<string>(planting?.planned_harvest_end ?? '');

  const [rows, setRows] = useState<number>(planting?.rows ?? 1);
  const [plantsPerRow, setPlantsPerRow] = useState<number>(planting?.plants_per_row ?? 1);
  const [status, setStatus] = useState<Planting['status']>(planting?.status ?? 'planned');
  const [notes, setNotes] = useState<string>(planting?.notes ?? '');

  const curSeed = useMemo(()=>seeds.find(s=>s.id===seedId) ?? null,[seeds, seedId]);

  useEffect(() => {
    Promise.all([listSeeds(gardenId), listBeds(gardenId), listPlantings(gardenId)])
      .then(([s,b,p])=>{ setSeeds(s); setBeds(b); setAllPlantings(p); });
  }, [gardenId]);

  // Bepaal candidate bezetting (voorkeur: plantDate + grow/harvest → einddag inclusief)
  const candidateRange = useMemo(() => {
    const base = plantDate || sowDate || harvestStart || harvestEnd || null;
    if (!base) return null;
    if (!curSeed) return null;
    const ground = plantDate ? new Date(plantDate) : new Date(base);
    const hs = addWeeks(ground, curSeed.grow_duration_weeks ?? 0);
    const he = addDays(addWeeks(hs, curSeed.harvest_duration_weeks ?? 0), -1);
    return { start: ground, end: he, used: Math.max(1, planting?.segments_used ?? 1) };
  }, [plantDate, sowDate, harvestStart, harvestEnd, curSeed, planting?.segments_used]);

  const fittingBeds = useMemo(() => {
    if (!candidateRange) return [];
    const { start, end, used } = candidateRange;
    const ignore = planting?.id;
    const arr: Array<{ bed: GardenBed; seg: number }> = [];
    for (const b of beds) {
      const seg = findFirstFreeSegment(allPlantings, b, start, end, used, ignore);
      if (seg != null) arr.push({ bed: b, seg });
    }
    return arr;
  }, [candidateRange, beds, allPlantings, planting?.id]);

  useEffect(() => {
    if (fittingBeds.length > 0 && !fittingBeds.some(f => f.bed.id === bedId)) {
      setBedId(fittingBeds[0].bed.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fittingBeds.map(f=>f.bed.id).join("|")]);

  async function handleSave() {
    const pd = method === 'presow' ? (plantDate || sowDate) : (sowDate || plantDate);
    const payloadUpdate: Partial<Planting> = {
      method,
      planned_date: pd || null,
      planned_harvest_start: harvestStart || null,
      planned_harvest_end: harvestEnd || null,
      rows,
      plants_per_row: plantsPerRow,
      status,
      notes: notes || null,
      garden_bed_id: bedId || undefined,
    };

    if (editing) {
      const saved = await updatePlanting(planting!.id, payloadUpdate as any);
      onSaved(saved); return;
    }

    const today = new Date().toISOString().slice(0,10);
    const baseDate = pd || today;

    const saved = await createPlanting({
      seed_id: seedId,
      garden_id: gardenId,
      garden_bed_id: bedId,
      method,
      planned_date: baseDate,
      planned_harvest_start: harvestStart || baseDate,
      planned_harvest_end:   harvestEnd   || harvestStart || baseDate,
      start_segment: 0,
      segments_used: 1,
      color: null,
      status,
    } as any);
    onSaved(saved);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? 'Teelt bewerken' : 'Nieuwe teelt'}</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Sluiten</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm">Gewas</label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={seedId} onChange={e=>setSeedId(e.target.value)} disabled={editing}>
              <option value="">Kies gewas</option>
              {seeds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <label className="text-sm font-medium">Bak {editing && <span className="text-xs text-muted-foreground">(kan worden aangepast)</span>}</label>
            <select className="w-full rounded-md border-2 border-input bg-card px-3 py-2.5"
              value={bedId}
              onChange={e=>setBedId(e.target.value)}
            >
              {fittingBeds.map(f => <option key={f.bed.id} value={f.bed.id}>{f.bed.name} — vrije start: segment {f.seg+1}</option>)}
              {fittingBeds.length===0 && <option value="">(geen passende bakken voor gekozen datums)</option>}
            </select>

            <div>
              <div className="text-sm mb-1">Methode</div>
              <div className="flex gap-3 text-sm">
                {(['direct','presow'] as const).map(opt => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input type="radio" checked={method===opt} onChange={()=>setMethod(opt)} />
                    {opt === 'direct' ? 'Direct zaaien' : 'Voorzaaien'}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm">Rijen</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={rows} onChange={e=>setRows(Number(e.target.value)||1)} />
              </div>
              <div>
                <label className="text-sm">Planten per rij</label>
                <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={plantsPerRow} onChange={e=>setPlantsPerRow(Number(e.target.value)||1)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm">Plan: Zaaien</label>
            <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={sowDate} onChange={e=>setSowDate(e.target.value)} />

            <label className="text-sm">Plan: Uitplanten (optioneel)</label>
            <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={plantDate} onChange={e=>setPlantDate(e.target.value)} />

            <label className="text-sm">Plan: Oogst start (optioneel)</label>
            <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={harvestStart} onChange={e=>setHarvestStart(e.target.value)} />

            <label className="text-sm">Plan: Oogst einde (optioneel)</label>
            <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-2" value={harvestEnd} onChange={e=>setHarvestEnd(e.target.value)} />

            <label className="text-sm">Status</label>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={status} onChange={e=>setStatus(e.target.value as any)}>
              {(['planned','sown','planted','growing','harvesting','completed'] as const).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <label className="text-sm">Notities</label>
            <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[80px]" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2">Annuleren</button>
          <button onClick={handleSave} disabled={fittingBeds.length===0} className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2">
            {editing ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
