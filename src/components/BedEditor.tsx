import { useState } from 'react';
import type { GardenBed, UUID } from '../lib/types';
import { createBed, updateBed } from '../lib/api/beds';

type Props = {
  gardenId: UUID;
  bed?: GardenBed | null;
  onClose: () => void;
  onSaved: (b: GardenBed) => void;
};

export default function BedEditor({ gardenId, bed, onClose, onSaved }: Props) {
  const editing = !!bed;
  const [name, setName] = useState(bed?.name ?? '');
  const [width, setWidth] = useState<number | ''>(bed?.width_cm ?? 120);
  const [length, setLength] = useState<number | ''>(bed?.length_cm ?? 200);
  const [isGreenhouse, setIsGreenhouse] = useState<boolean>(bed?.is_greenhouse ?? false);
  const [x, setX] = useState<number | ''>(bed?.location_x ?? '');
  const [y, setY] = useState<number | ''>(bed?.location_y ?? '');

  async function handleSave() {
    const payload: Partial<GardenBed> = {
      garden_id: gardenId,
      name: name.trim() || 'Bak',
      width_cm: width === '' ? 0 : Number(width),
      length_cm: length === '' ? 0 : Number(length),
      is_greenhouse: isGreenhouse,
      location_x: x === '' ? 0 : Number(x),
      location_y: y === '' ? 0 : Number(y),
    };
    const saved = editing ? await updateBed(bed!.id, payload) : await createBed(payload);
    onSaved(saved);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card text-card-foreground border border-border rounded-xl shadow-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{editing ? 'Bak bewerken' : 'Nieuwe bak'}</h3>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">Sluiten</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm">Naam</label>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Breedte (cm)</label>
            <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={width} onChange={e=>setWidth(e.target.value===''? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm">Lengte (cm)</label>
            <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={length} onChange={e=>setLength(e.target.value===''? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm">Locatie X (opt.)</label>
            <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={x} onChange={e=>setX(e.target.value===''? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm">Locatie Y (opt.)</label>
            <input type="number" className="w-full rounded-md border border-input bg-background px-3 py-2" value={y} onChange={e=>setY(e.target.value===''? '' : Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isGreenhouse} onChange={e=>setIsGreenhouse(e.target.checked)} />
              Bak in kas
            </label>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2">
            Annuleren
          </button>
          <button onClick={handleSave} className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2">
            {editing ? 'Opslaan' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  );
}
