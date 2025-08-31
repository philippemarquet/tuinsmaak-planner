import { useEffect, useState } from 'react';
import type { Garden, GardenBed } from '../lib/types';
import { listBeds, deleteBed } from '../lib/api/beds';
import BedEditor from './BedEditor';

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editBed, setEditBed] = useState<GardenBed | null>(null);

  async function load() {
    setLoading(true);
    const data = await listBeds(garden.id);
    setBeds(data);
    setLoading(false);
  }
  useEffect(() => { load(); }, [garden.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Bakken — {garden.name}</h2>
        <button
          onClick={() => { setEditBed(null); setShowEditor(true); }}
          className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
        >
          + Nieuwe bak
        </button>
      </div>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Mijn bakken</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bakken toegevoegd.</p>
        ) : (
          <ul className="divide-y divide-border">
            {beds.map(b => (
              <li key={b.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{b.name} {b.is_greenhouse && <span className="ml-2 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">kas</span>}</div>
                  <div className="text-xs text-muted-foreground">{b.width_cm}×{b.length_cm} cm {b.location_x || b.location_y ? ` · (${b.location_x ?? 0}, ${b.location_y ?? 0})` : ''}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditBed(b); setShowEditor(true); }}
                    className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1 text-sm"
                  >
                    Bewerken
                  </button>
                  <button
                    onClick={async () => { if (!confirm(`Verwijder ${b.name}?`)) return; await deleteBed(b.id); load(); }}
                    className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1 text-sm"
                  >
                    Verwijder
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showEditor && (
        <BedEditor
          gardenId={garden.id}
          bed={editBed}
          onClose={() => setShowEditor(false)}
          onSaved={_ => { setShowEditor(false); load(); }}
        />
      )}
    </div>
  );
}
