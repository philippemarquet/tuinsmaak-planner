import { useState } from "react";

export function InventoryPage() {
  const [items, setItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setItems([...items, newItem.trim()]);
    setNewItem("");
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Voorraad (Dummy)</h2>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Nieuw zaad"
          className="border rounded px-2 py-1 flex-1"
        />
        <button type="submit" className="px-3 py-1 rounded bg-primary text-primary-foreground">
          Toevoegen
        </button>
      </form>

      <ul className="list-disc pl-6">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
