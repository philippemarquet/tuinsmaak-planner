import { useEffect, useState } from 'react';
import type { Garden, Planting, Seed, GardenBed } from '../lib/types';
import { listPlantings, createPlanting, deletePlanting } from '../lib/api/plantings';
import { listSeeds } from '../lib/api/seeds';
import { listBeds } from '../lib/api/beds';

export function PlannerPage({ garden }: { garden: Garden }) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeed, setSelectedSeed] = useState<string>('');
  const [selectedBed, setSelectedBed] = useState<string>('');

  async function load() {
    setLoading(true);
    const [p, s, b] = await Promise.all([listPlantings(garden.id), listSeeds(garden.id), listBeds(garden.id)]);
    setPlantings(p); setSeeds(s); setBeds(b); setLoading(false);
  }

  useEffect(() => { load(); }, [garden.id]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Planner — {garden.name}</h2>

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
                <span>
                  {seeds.find((s) => s.id === p.seed_id)?.name ?? 'Onbekend'} → {beds.find((b) => b.id === p.garden_bed_id)?.name ?? 'Onbekende bak'}
                </span>
                <button
                  onClick={async () => { await deletePlanting(p.id); load(); }}
                  className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1 text-sm"
                >
                  Verwijder
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Nieuwe planting</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="flex-1 rounded-md border border-input bg-background px-3 py-2"
            value={selectedSeed}
            onChange={(e) => setSelectedSeed(e.target.value)}
          >
            <option value="">Kies gewas</option>
            {seeds.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            className="flex-1 rounded-md border border-input bg-background px-3 py-2"
            value={selectedBed}
            onChange={(e) => setSelectedBed(e.target.value)}
          >
            <option value="">Kies bak</option>
            {beds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button
            onClick={async () => {
              if (!selectedSeed || !selectedBed) return alert('Kies zowel gewas als bak');
              await createPlanting({
                garden_id: garden.id,
                seed_id: selectedSeed,
                garden_bed_id: selectedBed,
                method: 'direct',
                planned_sow_date: new Date().toISOString().slice(0, 10),
              });
              setSelectedSeed(''); setSelectedBed(''); load();
            }}
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
          >
            Toevoegen
          </button>
        </div>
      </section>
    </div>
  );
}
