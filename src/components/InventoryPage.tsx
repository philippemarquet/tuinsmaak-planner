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
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Voorraad — {garden.name}</h2>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Zadenlijst</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : seeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen zaden toegevoegd.</p>
        ) : (
          <ul className="divide-y divide-border">
            {seeds.map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between">
                <span>{s.name}</span>
                <button
                  onClick={async () => { await deleteSeed(s.id); load(); }}
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
        <h3 className="text-lg font-semibold mb-3">Nieuw zaad toevoegen</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Naam van het gewas"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={async () => {
              if (!newName.trim()) return;
              await createSeed({ garden_id: garden.id, name: newName.trim() });
              setNewName('');
              load();
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
