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
      .then(([b, t, o]) => { setBeds(b); setTasks(t); setOcc(o); })
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
    <div className="space-y-6">
      <header className="flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold">Dashboard — {garden.name}</h2>
        <span className="text-xs text-muted-foreground">Join code: {garden.join_code}</span>
      </header>

      {loading && (
        <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
          Laden…
        </div>
      )}

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Bakken</h3>
        {beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bakken. Voeg er een paar toe onder “Bakken”.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {beds.map((b) => (
              <li key={b.id} className="border border-border rounded-lg p-3 bg-background">
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {b.width_cm} × {b.length_cm} cm {b.is_greenhouse ? '· kas' : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Acties (komende 3 weken)</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen taken gepland.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between">
                <span className="text-sm">{new Date(t.due_date).toLocaleDateString()}</span>
                <span className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-xs capitalize">
                  {t.type.replace('_',' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Bezetting (8 weken)</h3>
        {occByWeek.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bezettingsdata. Voeg plantings toe in de Planner.</p>
        ) : (
          <div className="space-y-3">
            {occByWeek.map(([week, rows]) => (
              <div key={week} className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-3 items-center">
                <div className="text-xs text-muted-foreground">{new Date(week).toLocaleDateString()}</div>
                <div className="space-y-2">
                  {rows.map((r) => {
                    const pct = Math.round(r.occupancy_pct);
                    return (
                      <div key={r.garden_bed_id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Bed {r.garden_bed_id.slice(0,4)}</span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="h-2 rounded bg-secondary">
                          <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
