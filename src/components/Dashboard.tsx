import { useEffect, useMemo, useState } from 'react';
import type { Garden, GardenBed, Task, BedOccupancyWeek } from '../lib/types';
import { listBeds } from '../lib/api/beds';
import { tasksUpcoming } from '../lib/api/tasks';
import { occupancyCurrentWeeks } from '../lib/api/occupancy';

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occ, setOcc] = useState<BedOccupancyWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listBeds(garden.id),
      tasksUpcoming(garden.id, 21),
      occupancyCurrentWeeks(garden.id, 8),
    ])
      .then(([b, t, o]) => {
        setBeds(b);
        setTasks(t);
        setOcc(o);
      })
      .finally(() => setLoading(false));
  }, [garden.id]);

  const occByWeek = useMemo(() => {
    const map = new Map<string, BedOccupancyWeek[]>();
    for (const row of occ) {
      const arr = map.get(row.week_start) ?? [];
      arr.push(row);
      map.set(row.week_start, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [occ]);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Dashboard — {garden.name}</h2>
        <span style={{ fontSize: 12, opacity: 0.6 }}>Join code: {garden.join_code}</span>
      </header>

      {loading && <p>Bezig met laden…</p>}

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Bakken</h3>
        {beds.length === 0 ? (
          <p>Nog geen bakken. Voeg er een paar toe onder “Bakken”.</p>
        ) : (
          <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, listStyle: 'none', padding: 0 }}>
            {beds.map(b => (
              <li key={b.id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{b.width_cm} × {b.length_cm} cm {b.is_greenhouse ? '· kas' : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Acties (komende 3 weken)</h3>
        {tasks.length === 0 ? (
          <p>Geen taken gepland. Plan een teelt in de Planner.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {tasks.map(t => (
              <li key={t.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                <strong>{new Date(t.due_date).toLocaleDateString()}</strong>
                <span style={{ marginLeft: 8, textTransform: 'capitalize' }}>{t.type.replace('_', ' ')}</span>
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>({t.status})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Bezetting (8 weken)</h3>
        {occByWeek.length === 0 ? (
          <p>Nog geen bezettingsdata. Voeg plantings toe in de Planner.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {occByWeek.map(([week, rows]) => (
              <div key={week} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(week).toLocaleDateString()}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {rows.map(r => (
                    <div key={r.garden_bed_id}
                         title={`Bed bezetting: ${Math.round(r.occupancy_pct)}%`}
                         style={{
                           background: '#e8f5e9',
                           border: '1px solid #dcefe0',
                           borderRadius: 8,
                           padding: '2px 8px',
                           fontSize: 12
                         }}>
                      {r.garden_bed_id.slice(0, 4)}: {Math.round(r.occupancy_pct)}%
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
