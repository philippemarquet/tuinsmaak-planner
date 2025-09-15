import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

/* helpers */
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function isoWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7);
}
function startOfWeek(d: Date) {
  const day = d.getDay() || 7; // maandag=1 ... zondag=7
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.all([
      listBeds(garden.id),
      listPlantings(garden.id),
      listSeeds(garden.id),
      listTasks(garden.id),
    ])
      .then(([b, p, s, t]) => {
        setBeds(b);
        setPlantings(p);
        setSeeds(s);
        setTasks(t);
      })
      .catch(console.error);
  }, [garden.id]);

  /* snelle mappen */
  const bedById = useMemo(() => Object.fromEntries(beds.map(b => [b.id, b])), [beds]);
  const plantingById = useMemo(() => Object.fromEntries(plantings.map(p => [p.id, p])), [plantings]);
  const seedById = useMemo(() => Object.fromEntries(seeds.map(s => [s.id, s])), [seeds]);

  async function toggleTask(task: Task) {
    try {
      const newStatus = task.status === "done" ? "pending" : "done";
      const updated = await updateTask(task.id, { status: newStatus });
      setTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    } catch (e: any) {
      alert("Kon taak niet bijwerken: " + e.message);
    }
  }

  function labelForTask(task: Task) {
    switch (task.type) {
      case "sow": return "Zaaien";
      case "plant_out": return "Uitplanten";
      case "harvest_start": return "Start oogst";
      case "harvest_end": return "Einde oogst";
      default: return task.type;
    }
  }

  /* groepeer tasks per week (ma-zo) */
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    const sorted = tasks.slice().sort((a, b) => a.due_date.localeCompare(b.due_date));
    for (const t of sorted) {
      if (!t.due_date) continue;
      const d = new Date(t.due_date);
      const wk = startOfWeek(d); // maandag
      const key = toISO(wk);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  function taskLine(t: Task) {
    const p = plantingById[t.planting_id];
    const seed = p ? seedById[p.seed_id] : null;
    const bed = p ? bedById[p.garden_bed_id] : null;

    return (
      <div
        key={t.id}
        className="flex items-center justify-between p-3 hover:bg-muted/40 transition rounded-md"
      >
        <label className="flex items-center gap-3 flex-1 cursor-pointer">
          <input
            type="checkbox"
            checked={t.status === "done"}
            onChange={() => toggleTask(t)}
            className="h-4 w-4"
          />
          <div className="flex flex-col">
            <span className={`text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
              <strong>{labelForTask(t)}</strong>
              {seed && <> • {seed.name}</>}
              {bed && <> • {bed.name}</>}
            </span>
            <span className="text-xs text-muted-foreground">
              {t.due_date}
            </span>
          </div>
        </label>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            t.status === "done"
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {t.status === "done" ? "Afgerond" : "Open"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <h2 className="text-3xl font-bold">Dashboard</h2>

      {/* Bakken overzicht (ongewijzigd behalve kleine defensieve checks) */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Mijn bakken</h3>
        {beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bakken toegevoegd.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {beds.map((bed) => {
              const bedPlantings = plantings.filter((p) => p.garden_bed_id === bed.id);
              return (
                <div
                  key={bed.id}
                  className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-lg">{bed.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {bed.width_cm} × {bed.length_cm} cm
                      </p>
                    </div>
                    {bed.is_greenhouse && (
                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                        Kas
                      </span>
                    )}
                  </div>

                  {bedPlantings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Geen plantings</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bedPlantings.map((p) => {
                        const s = seedById[p.seed_id];
                        return (
                          <span
                            key={p.id}
                            className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs"
                            title={s?.name ?? "Onbekend"}
                          >
                            {s?.name ?? "Onbekend"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Actielijst per week */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Actielijst</h3>
        {tasks.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground border rounded-lg bg-card">Geen openstaande taken.</p>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([weekISO, arr]) => {
                const wkStart = new Date(weekISO);
                const wkEnd = addDays(wkStart, 6);
                const wkNr = isoWeekNumber(wkStart);
                return (
                  <div key={weekISO} className="bg-card border border-border rounded-lg shadow-sm">
                    <div className="px-4 py-2 border-b flex items-center justify-between">
                      <div className="font-semibold">
                        WK {wkNr} • {wkStart.getDate()}/{wkStart.getMonth() + 1} – {wkEnd.getDate()}/{wkEnd.getMonth() + 1}
                      </div>
                      <div className="text-xs text-muted-foreground">{arr.length} actie(s)</div>
                    </div>
                    <div className="divide-y">
                      {arr.map(taskLine)}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
