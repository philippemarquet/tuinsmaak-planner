import { useEffect, useState } from 'react';
import type { Garden, Seed } from '../lib/types';
import { listSeeds, createSeed, deleteSeed } from '../lib/api/seeds';

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  async function load() {
    setLoading(true);
    const data = await listSeeds(garden.id);
    setSeeds(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [garden.id]);

  return (
    <div style={{ maxWidth: 720, margin: '1rem auto', display: 'grid', gap: 24 }}>
      <h2>Voorraad — {garden.name}</h2>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Zadenlijst</h3>
        {loading && <p>Laden…</p>}
        {!loading && seeds.length === 0 && <p>Nog geen zaden toegevoegd.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {seeds.map(s => (
            <li key={s.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee', display: 'flex', justifyContent: 'space-between' }}>
              <span>{s.name}</span>
              <button onClick={async () => { await deleteSeed(s.id); load(); }}>❌</button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Nieuw zaad toevoegen</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Naam van het gewas"
                 style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button
            onClick={async () => {
              if (!newName) return;
              await createSeed({ garden_id: garden.id, name: newName });
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
