import { useEffect, useMemo, useState } from 'react';
import type { Garden, GardenBed, Task, BedOccupancyWeek } from '../lib/types';
import { listBeds } from '../lib/api/beds';
import { tasksUpcoming, setTaskStatus } from '../lib/api/tasks';
import { occupancyBetween } from '../lib/api/occupancy';

function addDays(d: Date, days: number) {
  const dd = new Date(d);
  dd.setDate(dd.getDate() + days);
  return dd;
}

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occ, setOcc] = useState<BedOccupancyWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<number>(8);

  async function load() {
    setLoading(true);
    const today = new Date();
    const to = addDays(today, weeks * 7);
    const [b, t, o] = await Promise.all([
      listBeds(garden.id),
      tasksUpcoming(garden.id, 21),
      occupancyBetween(garden.id, today.toISOString().slice(0,10), to.toISOString().slice(0,10))
    ]);
    setBeds(b); setTasks(t); setOcc(o); setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [garden.id, weeks]);

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
                <div className="font-medium">{b.name} {b.is_greenhouse && <span className="ml-2 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">kas</span>}</div>
                <div className="text-xs text-muted-foreground">{b.width_cm} × {b.length_cm} cm</div>
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
                <div>
                  <span className="text-sm">{new Date(t.due_date).toLocaleDateString()}</span>
                  <span className="ml-2 inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-xs capitalize">
                    {t.type.replace('_',' ')}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">({t.status})</span>
                </div>
                <div className="flex gap-2">
                  {t.status !== 'done' && (
                    <button
                      onClick={async ()=>{ await setTaskStatus(t.id, 'done'); load(); }}
                      className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2 py-1 text-sm"
                    >
                      Markeer als gedaan
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Bezetting</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Weken:</span>
            <input type="range" min={4} max={26} value={weeks} onChange={e=>setWeeks(Number(e.target.value))} />
            <span>{weeks}</span>
          </div>
        </div>

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
