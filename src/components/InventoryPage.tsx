import { useEffect, useState } from "react";
import type { Garden, Seed } from "../lib/types";
import { listSeeds, saveSeed, deleteSeed } from "../lib/api/seeds";

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [editing, setEditing] = useState<Seed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSeeds(garden.id).then(setSeeds).catch(console.error);
  }, [garden.id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const presow_duration_weeks = Number(formData.get("presow_duration_weeks")) || 0;
    const grow_duration_weeks = Number(formData.get("grow_duration_weeks")) || 0;
    const harvest_duration_weeks = Number(formData.get("harvest_duration_weeks")) || 0;

    const presow_months = formData.getAll("presow_months").map(Number);
    const direct_sow_months = formData.getAll("direct_sow_months").map(Number);
    const plant_months = formData.getAll("plant_months").map(Number);
    const harvest_months = formData.getAll("harvest_months").map(Number);

    const fields: Partial<Seed> = {
      garden_id: garden.id,
      name: (formData.get("name") as string) || "",
      purchase_date: (formData.get("purchase_date") as string) || null,
      sowing_type: (formData.get("sowing_type") as "direct" | "presow" | "both") ?? "both",
      stock_status: (formData.get("stock_status") as "adequate" | "low" | "out") ?? "adequate",
      presow_duration_weeks,
      grow_duration_weeks,
      harvest_duration_weeks,
      presow_months,
      direct_sow_months,
      plant_months,
      harvest_months,
    };

    try {
      const saved = await saveSeed(editing?.id, fields);
      if (editing && editing.id) {
        setSeeds(seeds.map((s) => (s.id === editing.id ? saved : s)));
      } else {
        setSeeds([...seeds, saved]);
      }
      setEditing(null);
      setError(null);
    } catch (err) {
      setError("Opslaan mislukt: " + (err as any).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(id);
      setSeeds(seeds.filter((s) => s.id !== id));
    } catch {
      alert("Verwijderen mislukt");
    }
  }

  const months = ["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <button
          onClick={() =>
            setEditing({
              id: "" as any,
              garden_id: garden.id,
              name: "",
              crop_type_id: null,
              purchase_date: null,
              stock_status: "adequate",
              stock_quantity: 0,
              row_spacing_cm: null,
              plant_spacing_cm: null,
              greenhouse_compatible: false,
              sowing_type: "both",
              presow_duration_weeks: 0,
              grow_duration_weeks: 0,
              harvest_duration_weeks: 0,
              presow_months: [],
              direct_sow_months: [],
              plant_months: [],
              harvest_months: [],
              notes: null,
              default_color: null,
              created_at: "",
              updated_at: "",
            } as Seed)
          }
          className="px-3 py-1 rounded bg-primary text-primary-foreground"
        >
          Nieuw zaad
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {seeds.map((seed) => (
          <div key={seed.id} className="border rounded-lg p-4 shadow-sm bg-card">
            <h3 className="font-semibold">{seed.name}</h3>
            <p className="text-sm text-muted-foreground">
              Aangekocht: {seed.purchase_date ?? "-"}
            </p>
            <p className="text-sm">Zaaitype: {seed.sowing_type}</p>
            <p className="text-sm">Voorraad: {seed.stock_status}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setEditing(seed)} className="px-2 py-1 text-xs rounded bg-secondary">
                Bewerken
              </button>
              <button onClick={() => handleDelete(seed.id)} className="px-2 py-1 text-xs rounded bg-red-500 text-white">
                Verwijderen
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Popup */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg w-full max-w-2xl space-y-4 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-semibold">
              Zaad {editing.id ? "bewerken" : "toevoegen"}
            </h3>
            {error && <div className="text-red-600">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm">Naam</label>
                <input type="text" name="name" defaultValue={editing.name ?? ""} required className="border rounded px-2 py-1 w-full" />
              </div>
              <div>
                <label className="block text-sm">Aankoopdatum</label>
                <input type="date" name="purchase_date" defaultValue={editing.purchase_date ?? ""} className="border rounded px-2 py-1 w-full" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm">Voorzaai (weken)</label>
                  <input type="number" name="presow_duration_weeks" defaultValue={editing.presow_duration_weeks ?? 0} className="border rounded px-2 py-1 w-full" />
                </div>
                <div>
                  <label className="block text-sm">Groei (weken)</label>
                  <input type="number" name="grow_duration_weeks" defaultValue={editing.grow_duration_weeks ?? 0} className="border rounded px-2 py-1 w-full" />
                </div>
                <div>
                  <label className="block text-sm">Oogst (weken)</label>
                  <input type="number" name="harvest_duration_weeks" defaultValue={editing.harvest_duration_weeks ?? 0} className="border rounded px-2 py-1 w-full" />
                </div>
              </div>
              {[
                { name: "presow_months", label: "Voorzaaimaanden", values: editing.presow_months ?? [] },
                { name: "direct_sow_months", label: "Direct zaaimaanden", values: editing.direct_sow_months ?? [] },
                { name: "plant_months", label: "Plantmaanden", values: editing.plant_months ?? [] },
                { name: "harvest_months", label: "Oogstmaanden", values: editing.harvest_months ?? [] },
              ].map((section) => (
                <div key={section.name}>
                  <label className="block text-sm mb-1">{section.label}</label>
                  <div className="grid grid-cols-6 gap-1">
                    {months.map((m, idx) => (
                      <label key={idx} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name={section.name} value={idx + 1} defaultChecked={(section.values ?? []).includes(idx + 1)} />
                        {m}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-sm">Zaaiwijze</label>
                <select name="sowing_type" defaultValue={editing.sowing_type ?? "both"} className="border rounded px-2 py-1 w-full">
                  <option value="direct">Direct</option>
                  <option value="presow">Voorzaaien</option>
                  <option value="both">Beide</option>
                </select>
              </div>
              <div>
                <label className="block text-sm">Voorraadstatus</label>
                <select name="stock_status" defaultValue={editing.stock_status ?? "adequate"} className="border rounded px-2 py-1 w-full">
                  <option value="adequate">Voldoende</option>
                  <option value="low">Bijna op</option>
                  <option value="out">Op</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="px-3 py-1 border rounded bg-muted">
                  Annuleren
                </button>
                <button type="submit" className="px-3 py-1 rounded bg-primary text-primary-foreground">
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
