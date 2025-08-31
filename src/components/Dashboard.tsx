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

  async function toggleTask(task: Task) {
    try {
      const newStatus = task.status === "done" ? "pending" : "done";
      const updated = await updateTask(task.id, { status: newStatus });
      setTasks(tasks.map((t) => (t.id === task.id ? updated : t)));
    } catch (e: any) {
      alert("Kon taak niet bijwerken: " + e.message);
    }
  }

  function seedName(seedId: string) {
    return seeds.find((s) => s.id === seedId)?.name ?? "Onbekend";
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {/* Beds Overview */}
      <section>
        <h3 className="text-lg font-medium mb-2">Bakken</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {beds.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nog geen bakken toegevoegd.
            </p>
          )}
          {beds.map((bed) => (
            <div
              key={bed.id}
              className="p-4 border rounded-lg bg-card shadow-sm space-y-2"
            >
              <h4 className="font-semibold">{bed.name}</h4>
              <p className="text-xs text-muted-foreground">
                {bed.width_cm}×{bed.length_cm} cm
              </p>
              <div className="flex flex-wrap gap-2">
                {plantings
                  .filter((p) => p.garden_bed_id === bed.id)
                  .map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs"
                    >
                      {seedName(p.seed_id)}
                    </span>
                  ))}
                {plantings.filter((p) => p.garden_bed_id === bed.id).length ===
                  0 && (
                  <p className="text-xs text-muted-foreground">
                    Geen plantings
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tasks */}
      <section>
        <h3 className="text-lg font-medium mb-2">Actielijst</h3>
        <div className="bg-card border border-border rounded-lg divide-y shadow-sm">
          {tasks.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Geen openstaande taken.
            </p>
          )}
          {tasks
            .sort((a, b) => a.due_date.localeCompare(b.due_date))
            .map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3"
              >
                <label className="flex items-center gap-2 text-sm flex-1">
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleTask(t)}
                  />
                  <span
                    className={
                      t.status === "done"
                        ? "line-through text-muted-foreground"
                        : ""
                    }
                  >
                    {labelForTask(t)} ({t.due_date})
                  </span>
                </label>
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
