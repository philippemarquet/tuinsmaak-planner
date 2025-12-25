import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, UUID } from "../lib/types";
import { deleteBed, updateBed, createBed } from "../lib/api/beds";
import { BedModal } from "./BedModal";
import { Trash2, Map as MapIcon, PlusCircle, Copy, GripVertical, ChevronDown } from "lucide-react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "../lib/utils";
import { GardenPlotCanvas } from "./GardenPlotCanvas";

export function BedsPage({ 
  garden,
  beds: initialBeds,
  onDataChange
}: { 
  garden: Garden;
  beds: GardenBed[];
  onDataChange: () => Promise<void>;
}) {
  const [beds, setBeds] = useState<GardenBed[]>(initialBeds);
  const [upsertOpen, setUpsertOpen] = useState<null | Partial<GardenBed>>(null);
  const [layoutMode, setLayoutMode] = useState(false);

  // Sync met centrale data
  useEffect(() => {
    setBeds(initialBeds);
  }, [initialBeds]);

  function upsertLocal(bed: GardenBed) {
    setBeds((prev) => {
      const i = prev.findIndex((b) => b.id === bed.id);
      if (i === -1) return [...prev, bed];
      const next = prev.slice();
      next[i] = bed;
      return next;
    });
  }

  async function handleDelete(bedId: UUID) {
    if (!confirm("Weet je zeker dat je deze bak wilt verwijderen?")) return;
    try {
      await deleteBed(bedId);
      setBeds((prev) => prev.filter((b) => b.id !== bedId));
      await onDataChange();
    } catch (e: any) {
      alert("Kon bak niet verwijderen: " + (e.message ?? String(e)));
    }
  }

  function nextCopyName(name: string) {
    if (name.toLowerCase().includes("(kopie)")) return name + " 2";
    return `${name} (kopie)`;
  }

  async function duplicateBed(b: GardenBed) {
    const group = beds.filter(x => x.is_greenhouse === b.is_greenhouse);
    const maxOrder = group.length ? Math.max(...group.map(x => x.sort_order ?? 0)) : 0;

    try {
      const created = await createBed({
        garden_id: b.garden_id,
        name: nextCopyName(b.name),
        width_cm: b.width_cm,
        length_cm: b.length_cm,
        segments: b.segments,
        is_greenhouse: b.is_greenhouse,
        location_x: (b.location_x ?? 0) + 20,
        location_y: (b.location_y ?? 0) + 20,
        sort_order: (maxOrder + 1)
      });
      upsertLocal(created);
      await onDataChange();
    } catch (e: any) {
      alert("Dupliceren mislukt: " + (e.message ?? String(e)));
    }
  }

  // Groepen + sortering
  const outdoor = useMemo(
    () => beds.filter(b => !b.is_greenhouse).sort((a,b)=> (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at)),
    [beds]
  );
  const greenhouse = useMemo(
    () => beds.filter(b => b.is_greenhouse).sort((a,b)=> (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at)),
    [beds]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bakken</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayoutMode((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all",
              layoutMode
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title="Plattegrond bewerken"
          >
            <MapIcon className="h-4 w-4" />
            {layoutMode ? "Plattegrond sluiten" : "Plattegrond"}
          </button>
          <button
            onClick={() => setUpsertOpen({})}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Nieuwe bak
          </button>
        </div>
      </div>

      {/* Cards (gesplitst in Buiten / Kas) */}
      {!layoutMode && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Section
            title="Buiten"
            items={outdoor}
            onEdit={(b)=> setUpsertOpen(b)}
            onDelete={handleDelete}
            onDuplicate={duplicateBed}
            onReorder={async (orderedIds) => {
              const idToOrder: Record<string, number> = {};
              orderedIds.forEach((id, idx) => (idToOrder[id] = idx));
              const updates = outdoor
                .map(b => ({ ...b, sort_order: idToOrder[b.id] }))
                .filter(b => b.sort_order !== (beds.find(x => x.id===b.id)?.sort_order ?? 0));
              if (updates.length) {
                setBeds(prev => prev.map(b => updates.find(u => u.id===b.id) ?? b));
                await Promise.all(updates.map(u => updateBed(u.id, { sort_order: u.sort_order })));
                await onDataChange();
              }
            }}
          />

          <Section
            title="Kas"
            items={greenhouse}
            onEdit={(b)=> setUpsertOpen(b)}
            onDelete={handleDelete}
            onDuplicate={duplicateBed}
            onReorder={async (orderedIds) => {
              const idToOrder: Record<string, number> = {};
              orderedIds.forEach((id, idx) => (idToOrder[id] = idx));
              const updates = greenhouse
                .map(b => ({ ...b, sort_order: idToOrder[b.id] }))
                .filter(b => b.sort_order !== (beds.find(x => x.id===b.id)?.sort_order ?? 0));
              if (updates.length) {
                setBeds(prev => prev.map(b => updates.find(u => u.id===b.id) ?? b));
                await Promise.all(updates.map(u => updateBed(u.id, { sort_order: u.sort_order })));
                await onDataChange();
              }
            }}
          />
        </div>
      )}

      {/* Plattegrond editor */}
      {layoutMode && (
        <GardenPlotCanvas
          beds={beds}
          storagePrefix="bedsLayout"
          onBedMove={async (id, x, y) => {
            try {
              const updated = await updateBed(id, { location_x: Math.round(x), location_y: Math.round(y) });
              upsertLocal(updated);
              await onDataChange();
            } catch (e: any) {
              alert("Kon positie niet opslaan: " + (e.message ?? String(e)));
            }
          }}
          onBedDuplicate={duplicateBed}
        />
      )}

      {/* Modal */}
      {upsertOpen && (
        <BedModal
          gardenId={garden.id}
          bed={"id" in upsertOpen && upsertOpen.id ? (upsertOpen as GardenBed) : null}
          onClose={() => setUpsertOpen(null)}
          onUpdated={async (b) => {
            upsertLocal(b);
            await onDataChange();
          }}
        />
      )}
    </div>
  );
}

/* ===========
 * Section (kaartweergave met stapel-effect en drag-sort via handle)
 * =========== */

function Section({
  title,
  items,
  onEdit,
  onDelete,
  onDuplicate,
  onReorder,
}: {
  title: string;
  items: GardenBed[];
  onEdit: (b: GardenBed) => void;
  onDelete: (id: UUID) => void;
  onDuplicate: (b: GardenBed) => void;
  onReorder: (orderedIds: UUID[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(true); // Default open for compact cards
  const [localIds, setLocalIds] = useState<UUID[]>(() => items.map((i) => i.id));
  const count = items.length;

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i] as const)),
    [items]
  );
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    // Houd lokale volgorde vast, maar verwijder ids die niet meer in deze sectie zitten
    // (bv. als een bak van Buiten -> Kas wordt verplaatst) en append nieuwe ids.
    setLocalIds((prev) => {
      const allowed = new Set(itemIds);
      const kept = prev.filter((id) => allowed.has(id));
      const keptSet = new Set(kept);
      const missing = itemIds.filter((id) => !keptSet.has(id));
      return [...kept, ...missing];
    });
  }, [itemIds]);

  const orderedItems = useMemo(
    () =>
      localIds
        .map((id) => itemsById.get(id))
        .filter((b): b is GardenBed => Boolean(b)),
    [localIds, itemsById]
  );

  function handleDragEnd(evt: DragEndEvent) {
    const activeId = String(evt.active.id);
    const overId = evt.over?.id ? String(evt.over.id) : null;
    if (!overId || activeId === overId) return;

    setLocalIds((prev) => {
      const current = prev.filter((id) => itemsById.has(id));
      const oldIndex = current.indexOf(activeId);
      const newIndex = current.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const next = current.slice();
      next.splice(newIndex, 0, next.splice(oldIndex, 1)[0]);
      onReorder(next);
      return next;
    });
  }

  if (count === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">Geen bakken in deze categorie.</p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      {/* Clickable header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-left group"
      >
        <ChevronDown 
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180"
          )} 
        />
        <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
          {title} <span className="text-sm text-muted-foreground font-normal">({count})</span>
        </h3>
      </button>

      {/* Cards grid */}
      {isOpen && (
        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {orderedItems.map((b, index) => {
              return (
                <SortableCard key={b.id} id={b.id}>
                  {(drag) => (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 border rounded-lg bg-card hover:bg-accent/50 transition cursor-pointer group animate-fade-in"
                      style={{ animationDelay: `${index * 20}ms`, animationFillMode: "backwards" }}
                      onClick={() => onEdit(b)}
                    >
                      {/* Drag handle */}
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-muted cursor-grab active:cursor-grabbing flex-shrink-0"
                        aria-label="Verslepen"
                        onClick={(e) => e.stopPropagation()}
                        {...drag.listeners}
                        {...drag.attributes}
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </button>

                      <span className="font-medium text-xs truncate flex-1">{b.name}</span>

                      <span className="text-[10px] text-muted-foreground flex-shrink-0 hidden sm:inline">
                        {b.segments}s
                      </span>

                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(b);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-primary"
                          title="Dupliceren"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(b.id);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-destructive"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </SortableCard>
              );
            })}
          </div>
        </DndContext>
      )}
    </section>
  );
}

/* SortableCard met render-prop: we geven alleen de drag listeners/attributes aan de handle door */
function SortableCard({
  id,
  children,
}: {
  id: string;
  children: (drag: { listeners: any; attributes: any; isDragging: boolean }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node as any);
      }}
      style={style}
      className={`relative ${isDragging ? "z-50 opacity-90" : ""} ${isOver ? "ring-2 ring-primary/50 rounded-xl" : ""}`}
    >
      {children({ listeners, attributes, isDragging })}
    </div>
  );
}