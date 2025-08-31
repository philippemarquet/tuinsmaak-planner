import { useEffect, useState } from "react";
import type { Seed, Garden } from "../lib/types";
import { listSeeds, createSeed, updateSeed, deleteSeed } from "../lib/api/seeds";

function SeedCard({ seed, onEdit, onDelete }: { seed: Seed; onEdit: (s: Seed) => void; onDelete: (s: Seed) => void }) {
  return (
    <div className="bg-card border rounded-lg shadow-sm p-4 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">{seed.name}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(seed)}
            className="text-sm px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            Bewerken
          </button>
          <button
            onClick={() => onDelete(seed)}
            className="text-sm px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Verwijderen
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Aangekocht: {seed.purchase_date ?? "?"} | Type: {seed.sowing_type}
      </p>
      <p className="text-sm">
        Voorraad:{" "}
        <span
          className={
            seed.stock_status === "adequate"
              ? "text-green-600"
              : seed.stock_status === "low"
              ? "text-yellow-600"
              : "text-red-600"
          }
        >
          {seed.stock_status}
        </span>
      </p>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded ${seed.default_color ?? "bg-green-500"}`} />
        <span className="text-sm">Kleur</span>
      </div>
    </div>
  );
}

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [editing, setEditing] = useState<Seed | null>(null);

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
  }, [garden.id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fields = {
      name: formData.get("name") as string,
      purchase_date: formData.get("purchase_date") as string,
      sowing_type: formData.get("sowing_type") as string,
      stock_status: formData.get("stock_status") as string,
      default_color: formData.get("default_color") as string,
    };

    try {
      if (editing) {
        const updated = await updateSeed(editing.id, fields);
        setSeeds(seeds.map((s) => (s.id === editing.id ? updated : s)));
      } else {
        const created = await createSeed({ ...fields, garden_id: garden.id });
        setSeeds([...seeds, created]);
      }
      setEditing(null);
    } catch (err: any) {
      alert("Kon zaad niet opslaan: " + err.message);
    }
  }

  async function handleDelete(seed: Seed) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(seed.id);
      setSeeds(seeds.filter((s) => s.id !== seed.id));
    } catch (err: any) {
      alert("Kon zaad niet verwijderen: " + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Voorraad</h2>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {seeds.map((seed) => (
          <SeedCard key={seed.id} seed={seed} onEdit={setEditing} onDelete={handleDelete} />
        ))}
      </div>

      {/* Popup editor */}
      {(editing || true) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">
              {editing ? "Zaad bewerken" : "Nieuw zaad"}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">Naam</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  required
                  className="border rounded-md px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Aankoopdatum</label>
                <input
                  type="date"
                  name="purchase_date"
                  defaultValue={editing?.purchase_date ?? ""}
                  className="border rounded-md px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Zaaitype</label>
                <select
                  name="sowing_type"
                  defaultValue={editing?.sowing_type ?? "direct"}
                  className="border rounded-md px-2 py-1 w-full"
                >
                  <option value="direct">Direct</option>
                  <option value="presow">Voorzaaien</option>
                  <option value="both">Beide</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Voorraadstatus</label>
                <select
                  name="stock_status"
                  defaultValue={editing?.stock_status ?? "adequate"}
                  className="border rounded-md px-2 py-1 w-full"
                >
                  <option value="adequate">Voldoende</option>
                  <option value="low">Bijna op</option>
                  <option value="out">Op</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Kleur</label>
                <select
                  name="default_color"
                  defaultValue={editing?.default_color ?? "bg-green-500"}
                  className="border rounded-md px-2 py-1 w-full"
                >
                  <option value="bg-green-500">Groen</option>
                  <option value="bg-blue-500">Blauw</option>
                  <option value="bg-yellow-500">Geel</option>
                  <option value="bg-red-500">Rood</option>
                  <option value="bg-purple-500">Paars</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3 py-1 border border-border rounded-md bg-muted"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-md bg-primary text-primary-foreground"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
