import { useEffect, useState } from 'react';
import type { Garden, GardenBed } from '../lib/types';
import { listBeds, createBed, deleteBed } from '../lib/api/beds';

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  async function load() {
    setLoading(true);
    const data = await listBeds(garden.id);
    setBeds(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [garden.id]);

  return (
    <div style={{ maxWidth: 720, margin: '1rem auto', display: 'grid', gap: 24 }}>
      <h2>Bakken — {garden.name}</h2>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Mijn bakken</h3>
        {loading && <p>Laden…</p>}
        {!loading && beds.length === 0 && <p>Nog geen bakken toegevoegd.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {beds.map(b => (
            <li key={b.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee', display: 'flex', justifyContent: 'space-between' }}>
              <span>{b.name} ({b.width_cm}×{b.length_cm} cm)</span>
              <button onClick={async () => { await deleteBed(b.id); load(); }}>❌</button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Nieuwe bak toevoegen</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Naam van de bak"
                 style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button
            onClick={async () => {
              if (!newName) return;
              await createBed({ garden_id: garden.id, name: newName, width_cm: 120, length_cm: 200 });
              setNewName('');
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
