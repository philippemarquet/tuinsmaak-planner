// src/components/Dashboard.tsx
import { useEffect, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, Task } from "../lib/types";
import { listBeds } from "../lib/api/beds";
import { listPlantings } from "../lib/api/plantings";
import { listSeeds } from "../lib/api/seeds";
import { listTasks, updateTask } from "../lib/api/tasks";

export function Dashboard({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        // Use robust listBeds: will fallback to unfiltered if filtered is empty
        const [b, p, s, t] = await Promise.all([
          listBeds(garden?.id),   // <= robust now
          listPlantings(garden?.id),
          listSeeds(garden?.id),
          listTasks(garden?.id),
        ]);
        if (cancelled) return;

        // Keep ordering consistent with Planner (sort_order then created_at)
        const sortedBeds = (b ?? []).slice().sort((a, c) =>
          (a.sort_order ?? 0) - (c.sort_order ?? 0) ||
          a.created_at.localeCompare(c.created_at)
        );

        setBeds(sortedBeds);
        setPlantings(p ?? []);
        setSeeds(s ?? []);
        setTasks(t ?? []);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [garden?.id]);

  async function toggleTask(task: Task) {
    try {
      const newStatus = task.status === "done" ? "pending" : "done";
      const updated = await updateTask(task.id, { status: newStatus });
      setTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    } catch (e: any) {
      alert("Kon taak niet bijwerken: " + (e?.message ?? e));
    }
  }

  function seedName(seedId: string) {
    return seeds.find((s) => s.id === seedId)?.name ?? "Onbekend";
  }

  return (
    <div className="space-y-12">
      <h2 className="text-3xl font-bold">Dashboard</h2>

      {/* Status */}
      {loading && (
        <p className="text-sm text-muted-foreground">Gegevens laden…</p>
      )}
      {loadError && (
        <p className="text-sm text-red-600">
          Fout bij laden: {loadError}
        </p>
      )}

      {/* Bakken overzicht */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Mijn bakken</h3>

        {!loading && beds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen bakken gevonden. (Controleer tuinselectie of rechten.)
          </p>
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

                  {/* Plantings */}
                  {bedPlantings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Geen plantings
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bedPlantings.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs"
                        >
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

      {/* Actielijst */}
      <section>
        <h3 className="text-xl font-semibold mb-4">Actielijst</h3>
        <div className="bg-card border border-border rounded-lg shadow-sm divide-y">
          {(!loading && tasks.length === 0) && (
            <p className="p-4 text-sm text-muted-foreground">
              Geen openstaande taken.
            </p>
          )}
          {tasks
            .slice()
            .sort((a, b) => a.due_date.localeCompare(b.due_date))
            .map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-4 hover:bg-muted/40 transition"
              >
                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleTask(t)}
                    className="h-4 w-4"
                  />
                  <span
                    className={`text-sm ${
                      t.status === "done"
                        ? "line-through text-muted-foreground"
                        : ""
                    }`}
                  >
                    {labelForTask(t)}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({t.due_date})
                    </span>
                  </span>
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
            ))}
        </div>
      </section>
    </div>
  );
}

function labelForTask(task: Task) {
  switch (task.type) {
    case "sow":
      return "Zaaien";
    case "plant_out":
      return "Uitplanten";
    case "harvest_start":
      return "Start oogst";
    case "harvest_end":
      return "Einde oogst";
    default:
      return task.type;
  }
}
