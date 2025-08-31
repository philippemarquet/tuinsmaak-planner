import { useEffect, useMemo, useState } from 'react';
import type { Garden, Seed } from '../lib/types';
import { listSeeds, deleteSeed } from '../lib/api/seeds';
import SeedEditor from './SeedEditor';

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all'|'adequate'|'low'|'out'>('all');

  const [showEditor, setShowEditor] = useState(false);
  const [editSeed, setEditSeed] = useState<Seed | null>(null);

  async function load() {
    setLoading(true);
    const data = await listSeeds(garden.id);
    setSeeds(data);
    setLoading(false);
  }
  useEffect(() => { load(); }, [garden.id]);

  const filtered = useMemo(() => {
    return seeds
      .filter(s => (status==='all' ? true : s.stock_status === status))
      .filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
  }, [seeds, q, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Voorraad — {garden.name}</h2>
        <button
          onClick={() => { setEditSeed(null); setShowEditor(true); }}
          className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
        >
          + Nieuw zaad
        </button>
      </div>

      <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-3">
          <input
            className="rounded-md border border-input bg-background px-3 py-2 w-full sm:w-72"
            placeholder="Zoek op naam…"
            value={q}
            onChange={e=>setQ(e.target.value)}
          />
          <select
            className="rounded-md border border-input bg-background px-3 py-2 w-full sm:w-48"
            value={status}
            onChange={e=>setStatus(e.target.value as any)}
          >
            <option value="all">Alle statussen</option>
            <option value="adequate">Voldoende</option>
            <option value="low">Bijna op</option>
            <option value="out">Op</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen resultaten.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Naam</th>
                <th className="py-2">Type</th>
                <th className="py-2">Voorraad</th>
                <th className="py-2">Kas</th>
                <th className="py-2">Zaaitype</th>
                <th className="py-2 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="py-2">{s.name}</td>
                  <td className="py-2">{/* (optioneel: toon croptype naam via join) */}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 ${s.stock_status==='out'
                      ? 'bg-red-100 text-red-700'
                      : s.stock_status==='low' ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800'}`}>
                      {s.stock_status} {s.stock_quantity ? `(${s.stock_quantity})` : ''}
                    </span>
                  </td>
                  <td className="py-2">{s.greenhouse_compatible ? '✅' : '—'}</td>
                  <td className="py-2">{s.sowing_type}</td>
                  <td className="py-2">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setEditSeed(s); setShowEditor(true); }}
                        className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1"
                      >
                        Bewerken
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Verwijder ${s.name}?`)) return;
                          await deleteSeed(s.id); load();
                        }}
                        className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1"
                      >
                        Verwijder
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEditor && (
        <SeedEditor
          gardenId={garden.id}
          seed={editSeed}
          onClose={() => setShowEditor(false)}
          onSaved={_ => { setShowEditor(false); load(); }}
        />
      )}
    </div>
  );
}
