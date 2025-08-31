import { useEffect, useState } from 'react';
import type { Garden, Planting, Seed, GardenBed } from '../lib/types';
import { listPlantings, deletePlanting } from '../lib/api/plantings';
import { listSeeds } from '../lib/api/seeds';
import { listBeds } from '../lib/api/beds';
import PlantingEditor from './PlantingEditor';

export function PlannerPage({ garden }: { garden: Garden }) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEditor, setShowEditor] = useState(false);
  const [editPlanting, setEditPlanting] = useState<Planting | null>(null);

  async function load() {
    setLoading(true);
    const [p, s, b] = await Promise.all([listPlantings(garden.id), listSeeds(garden.id), listBeds(garden.id)]);
    setPlantings(p); setSeeds(s); setBeds(b); setLoading(false);
  }

  useEffect(() => { load(); }, [garden.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Planner — {garden.name}</h2>
        <button
          onClick={() => { setEditPlanting(null); setShowEditor(true); }}
          className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
        >
          + Nieuwe teelt
        </button>
      </div>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Geplande teelten</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : plantings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog niets gepland.</p>
        ) : (
          <ul className="divide-y divide-border">
            {plantings.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {seeds.find((s) => s.id === p.seed_id)?.name ?? 'Onbekend'}
                    {' '}→{' '}
                    {beds.find((b) => b.id === p.garden_bed_id)?.name ?? 'Onbekende bak'}
                    {' '}{p.method === 'presow' ? <span className="ml-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">voorzaai</span> : <span className="ml-1 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">direct</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Zaaien: {p.planned_sow_date ?? '—'} · Uitplanten: {p.planned_plant_date ?? '—'} · Oogst: {p.planned_harvest_start ?? '—'} → {p.planned_harvest_end ?? '—'} · {p.rows} rijen × {p.plants_per_row}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditPlanting(p); setShowEditor(true); }}
                    className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1 text-sm"
                  >
                    Bewerken
                  </button>
                  <button
                    onClick={async () => { if (!confirm('Verwijderen?')) return; await deletePlanting(p.id); load(); }}
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
        <PlantingEditor
          gardenId={garden.id}
          planting={editPlanting}
          onClose={() => setShowEditor(false)}
          onSaved={_ => { setShowEditor(false); load(); }}
        />
      )}
    </div>
  );
}
