import { useEffect, useState } from "react";
import type { Garden, Seed, CropType } from "../lib/types";
import { listSeeds, createSeed, deleteSeed } from "../lib/api/seeds";
import { listCropTypes } from "../lib/api/cropTypes";
import { SeedModal } from "./SeedModal";
import { PlusCircle, Pencil, Trash2 } from "lucide-react";

export function InventoryPage({ garden }: { garden: Garden }) {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [newName, setNewName] = useState("");
  const [editingSeed, setEditingSeed] = useState<Seed | null>(null);

  useEffect(() => {
    Promise.all([listSeeds(garden.id), listCropTypes()])
      .then(([s, ct]) => {
        setSeeds(s);
        setCropTypes(ct);
      })
      .catch(console.error);
  }, [garden.id]);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      const seed = await createSeed({
        garden_id: garden.id,
        name: newName.trim(),
        stock_status: "adequate",
      });
      setSeeds([...seeds, seed]);
      setNewName("");
    } catch (e: any) {
      alert("Kon zaad niet toevoegen: " + e.message);
    }
  }

  async function handleDelete(seedId: string) {
    if (!confirm("Weet je zeker dat je dit zaad wilt verwijderen?")) return;
    try {
      await deleteSeed(seedId);
      setSeeds(seeds.filter((s) => s.id !== seedId));
    } catch (e: any) {
      alert("Kon zaad niet verwijderen: " + e.message);
    }
  }

  function handleUpdated(seed: Seed) {
    setSeeds(seeds.map((s) => (s.id === seed.id ? seed : s)));
  }

  function cropTypeName(id: string | null) {
    return cropTypes.find((c) => c.id === id)?.name ?? "Onbekend";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Voorraad</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nieuw zaad"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="border rounded-md px-2 py-1"
          />
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-md"
          >
            <PlusCircle className="h-4 w-4" />
            Toevoegen
          </button>
        </div>
      </div>

      {seeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen zaden toegevoegd.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {seeds.map((s) => (
            <div
              key={s.id}
              className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-lg">{s.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {cropTypeName(s.crop_type_id)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingSeed(s)}
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Bewerken"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Kerninfo */}
              <div className="text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Voorraad:</span>{" "}
                  {s.stock_status === "adequate"
                    ? "✔ Genoeg"
                    : s.stock_status === "low"
                    ? "⚠ Bijna op"
                    : "✖ Op"}
                </p>
                {s.purchase_date && (
                  <p>
                    <span className="text-muted-foreground">Aangekocht:</span>{" "}
                    {new Date(s.purchase_date).toLocaleDateString()}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Zaaitype:</span>{" "}
                  {s.sowing_type === "direct"
                    ? "Direct"
                    : s.sowing_type === "presow"
                    ? "Voorzaaien"
                    : "Beide"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingSeed && (
        <SeedModal
          seed={editingSeed}
          cropTypes={cropTypes}
          onClose={() => setEditingSeed(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
