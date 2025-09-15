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
function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  return d;
}
function weekLabel(dtISO: string) {
  const d = new Date(dtISO);
  const monday = mondayOf(d);
  const sunday = addDays(monday, 6);
  const wk = isoWeekNumber(monday);
  return { key: `${monday.getFullYear()}-W${String(wk).padStart(2,"0")}`, title: `WK ${wk} • ${monday.getDate()}/${monday.getMonth()+1}–${sunday.getDate()}/${sunday.getMonth()+1}`, monday };
}
function labelForTask(task: Task) {
  switch (task.type) {
    case "presow": return "Voorzaaien";
    case "sow": return "Zaaien";
    case "plant_out": return "Uitplanten";
    case "harvest_start": return "Start oogst";
    case "harvest_end": return "Einde oogst";
    default: return task.type;
  }
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

  const plantingById = useMemo(
    () => Object.fromEntries(plantings.map(p => [p.id, p])),
    [plantings]
  );
  const bedById = useMemo(
    () => Object.fromEntries(beds.map(b => [b.id, b])),
    [beds]
  );
  const seedById = useMemo(
    () => Object.fromEntries(seeds.map(s => [s.id, s])),
    [seeds]
  );

  async function toggleTask(t: Task) {
    try {
      const newStatus = t.status === "done" ? "pending" : "done";
      const updated = await updateTask(t.id, { status: newStatus });
      setTasks(prev => prev.map(x => x.id === t.id ? updated : x));
      // NB: server-triggers schuiven plantings & toekomstige taken door
    } catch (e: any) {
      alert("Kon taak niet bijwerken: " + (e?.message ?? e));
    }
  }

  function seedName(seedId: string) {
    return seedById[seedId]?.name ?? "Onbekend";
  }
  function bedNameForTask(t: Task) {
    const p = plantingById[t.planting_id];
    if (!p) return "—";
    const b = bedById[p.garden_bed_id];
    return b?.name ?? "—";
  }

  // groepeer per ISO-week
  const groups = useMemo(() => {
    const map: Record<string, { title: string; items: Task[]; monday: Date }> = {};
    tasks
      .slice()
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .forEach(t => {
        const { key, title, monday } = weekLabel(t.due_date);
        if (!map[key]) map[key] = { title, items: [], monday };
        map[key].items.push(t);
      });
    // gesorteerd op week
    return Object.values(map).sort((a,b) => a.monday.getTime() - b.monday.getTime());
  }, [tasks]);

  return (
    <div className="space-y-12">
      <h2 className="text-3xl font-bold">Dashboard</h2>

      {/* Bakken overzicht (ongewijzigd, compact) */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Mijn bakken</h3>
        {beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen bakken toegevoegd.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {beds.map((bed) => {
              const bedPlantings = plantings.filter((p) => p.garden_bed_id === bed.id);
              return (
                <div key={bed.id} className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-lg">{bed.name}</h4>
                      <p className="text-xs text-muted-foreground">{bed.width_cm} × {bed.length_cm} cm</p>
                    </div>
                    {bed.is_greenhouse && (
                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Kas</span>
                    )}
                  </div>

                  {bedPlantings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Geen plantings</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bedPlantings.map((p) => (
                        <span key={p.id} className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs">
                          {seedName(p.seed_id)}
                        </span>
                      ))}
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

        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">Geen openstaande taken.</p>
        )}

        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.title} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <h4 className="text-sm font-semibold">{g.title}</h4>
              </div>
              <div className="divide-y">
                {g.items.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 hover:bg-muted/40 transition">
                    <label className="flex items-center gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        onChange={() => toggleTask(t)}
                        className="h-4 w-4"
                      />
                      <div className="flex flex-col">
                        <span className={`text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {labelForTask(t)} — {seedName(plantingById[t.planting_id]?.seed_id || "")}
                          <span className="text-muted-foreground"> • {bedNameForTask(t)}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Vervaldatum: {t.due_date}
                        </span>
                      </div>
                    </label>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      t.status === "done" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {t.status === "done" ? "Afgerond" : "Open"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
