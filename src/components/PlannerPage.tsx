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
    const [p, s, b] = await Promise.all([
      listPlantings(garden.id),
      listSeeds(garden.id),
      listBeds(garden.id),
    ]);
    setPlantings(p);
    setSeeds(s);
    setBeds(b);
    setLoading(false);
  }

  useEffect(() => { load(); }, [garden.id]);

  return (
    <div style={{ maxWidth: 720, margin: '1rem auto', display: 'grid', gap: 24 }}>
      <h2>Planner — {garden.name}</h2>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Geplande teelten</h3>
        {loading && <p>Laden…</p>}
        {!loading && plantings.length === 0 && <p>Nog niets gepland.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {plantings.map(p => (
            <li key={p.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee', display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {seeds.find(s => s.id === p.seed_id)?.name ?? 'Onbekend'} → {beds.find(b => b.id === p.garden_bed_id)?.name ?? 'Onbekende bak'}
              </span>
              <button onClick={async () => { await deletePlanting(p.id); load(); }}>❌</button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Nieuwe planting</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedSeed} onChange={e => setSelectedSeed(e.target.value)} style={{ flex: 1 }}>
            <option value="">Kies gewas</option>
            {seeds.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={selectedBed} onChange={e => setSelectedBed(e.target.value)} style={{ flex: 1 }}>
            <option value="">Kies bak</option>
            {beds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
              setSelectedSeed('');
              setSelectedBed('');
              load();
            }}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Toevoegen
          </button>
        </div>
      </section>
    </div>
  );
}
