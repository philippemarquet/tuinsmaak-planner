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
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Bakken — {garden.name}</h2>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Mijn bakken</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bakken toegevoegd.</p>
        ) : (
          <ul className="divide-y divide-border">
            {beds.map((b) => (
              <li key={b.id} className="py-2 flex items-center justify-between">
                <span>{b.name} ({b.width_cm}×{b.length_cm} cm)</span>
                <button
                  onClick={async () => { await deleteBed(b.id); load(); }}
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
        <h3 className="text-lg font-semibold mb-3">Nieuwe bak toevoegen</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Naam van de bak"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={async () => {
              if (!newName.trim()) return;
              await createBed({ garden_id: garden.id, name: newName.trim(), width_cm: 120, length_cm: 200 });
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
