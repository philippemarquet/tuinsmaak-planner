import { useEffect, useState } from 'react';
import { createGarden, joinGardenByCode, myGardens } from '../lib/api/gardens';
import type { Garden } from '../lib/types';

export function GardenSetup({ onSelected }: { onSelected: (g: Garden) => void }) {
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [newName, setNewName] = useState('Onze Tuin');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setErr(null);
      setLoading(true);
      const data = await myGardens();
      setGardens(data);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth: 720, margin: '1rem auto', display: 'grid', gap: 24 }}>
      <h2 style={{ margin: 0 }}>Kies of maak je tuin</h2>

      {err && <div style={{ color: 'crimson' }}>{err}</div>}

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Mijn tuinen</h3>
        {loading && <p>Bezig met laden…</p>}
        {!loading && gardens.length === 0 && <p>Nog geen tuinen. Maak er hieronder één aan of join met een code.</p>}
        {gardens.length > 0 && (
          <ul style={{ paddingLeft: 18 }}>
            {gardens.map(g => (
              <li key={g.id} style={{ marginBottom: 8 }}>
                <button onClick={() => onSelected(g)} style={{ padding: '6px 10px', borderRadius: 8 }}>
                  {g.name}
                </button>
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>code: {g.join_code}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Nieuwe tuin aanmaken</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Naam van de tuin"
                 style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button
            onClick={async () => {
              const g = await createGarden(newName || 'Onze Tuin');
              onSelected(g);
            }}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Aanmaken
          </button>
        </div>
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Tuin joinen met code</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="JOINCODE"
                 style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button
            onClick={async () => {
              if (!code) return alert('Vul een code in');
              const g = await joinGardenByCode(code.trim());
              onSelected(g);
            }}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Join
          </button>
        </div>
      </section>
    </div>
  );
}
