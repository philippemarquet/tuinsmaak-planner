import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, UUID } from "../lib/types";
import { deleteBed, updateBed, createBed } from "../lib/api/beds";
import { BedModal } from "./BedModal";
import { Trash2, Map as MapIcon, PlusCircle, ZoomIn, ZoomOut, Maximize2, Copy, GripVertical, ChevronDown } from "lucide-react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "../lib/utils";

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
            className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-border bg-secondary hover:bg-secondary/80"
            title="Plattegrond bewerken"
          >
            <MapIcon className="h-4 w-4" />
            {layoutMode ? "Plattegrond sluiten" : "Plattegrond bewerken"}
          </button>
          <button
            onClick={() => setUpsertOpen({})}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1 rounded-md"
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
        <LayoutEditor
          beds={beds}
          onMove={async (id, x, y) => {
            try {
              const updated = await updateBed(id, { location_x: Math.round(x), location_y: Math.round(y) });
              upsertLocal(updated);
              await onDataChange();
            } catch (e: any) {
              alert("Kon positie niet opslaan: " + (e.message ?? String(e)));
            }
          }}
          onDuplicate={duplicateBed}
        />
      )}

      {/* Modal */}
      {upsertOpen && (
        <BedModal
          // Als jouw BedModal geen gardenId nodig heeft, laat deze prop weg
          // gardenId={garden.id}
          bed={("id" in upsertOpen && upsertOpen.id) ? (upsertOpen as GardenBed) : null}
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
  const [localIds, setLocalIds] = useState<UUID[]>(items.map(i => i.id));
  const count = items.length;

  useEffect(() => {
    setLocalIds(items.map(i => i.id));
  }, [items]);

  function handleDragEnd(evt: DragEndEvent) {
    const activeId = String(evt.active.id);
    const overId = evt.over?.id ? String(evt.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndex = localIds.indexOf(activeId);
    const newIndex = localIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = localIds.slice();
    next.splice(newIndex, 0, next.splice(oldIndex, 1)[0]);
    setLocalIds(next);
    onReorder(next);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {localIds.map((id, index) => {
              const b = items.find(x => x.id === id)!;
              return (
                <SortableCard key={b.id} id={b.id}>
                  {(drag) => (
                    <div
                      className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-card hover:bg-accent/50 transition cursor-pointer group animate-fade-in"
                      style={{ animationDelay: `${index * 20}ms`, animationFillMode: 'backwards' }}
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
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>

                      <span className="font-medium text-sm truncate flex-1">{b.name}</span>
                      
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {b.width_cm}×{b.length_cm}cm • {b.segments} seg
                      </span>

                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicate(b); }}
                          className="p-1 text-muted-foreground hover:text-primary"
                          title="Dupliceren"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

/* =======================
 *  Plattegrond Editor (zoals hiervoor)
 * ======================= */

function LayoutEditor({
  beds,
  onMove,
  onDuplicate,
}: {
  beds: GardenBed[];
  onMove: (id: UUID, x: number, y: number) => void;
  onDuplicate: (bed: GardenBed) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const CANVAS_W = 2400;
  const CANVAS_H = 1400;
  const pxPerCm = 1;

  const [zoom, setZoom] = useState(0.8);
  const minZoom = 0.25;
  const maxZoom = 3;

  function setZoomClamped(v: number) {
    setZoom(Math.max(minZoom, Math.min(maxZoom, v)));
  }

  function fitToViewport() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth - 24;
    const vh = vp.clientHeight - 24;
    const zx = vw / CANVAS_W;
    const zy = vh / CANVAS_H;
    setZoomClamped(Math.min(zx, zy));
  }

  function ZoomControls() {
    return (
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom - 0.1)} title="Uitzoomen">
          <ZoomOut className="h-4 w-4" />-
        </button>
        <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e) => setZoomClamped(parseFloat(e.target.value))} className="w-40" />
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom + 0.1)} title="Inzoomen">
          <ZoomIn className="h-4 w-4" />+
        </button>
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={() => setZoomClamped(1)} title="100%">
          100%
        </button>
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1" onClick={fitToViewport} title="Passend maken">
          <Maximize2 className="h-4 w-4" /> Fit
        </button>
        <span className="text-xs text-muted-foreground ml-1">{Math.round(zoom * 100)}%</span>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Plattegrond</h3>
        <ZoomControls />
      </div>

      <div ref={viewportRef} className="relative w-full h-[70vh] rounded-xl border border-border overflow-auto bg-background">
        <div className="relative" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
          <div
            className="absolute left-0 top-0"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              backgroundImage:
                "linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(180deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              borderRadius: 12,
            }}
          >
            {beds.map((b) => (
              <BedBlock
                key={b.id}
                bed={b}
                pxPerCm={1}
                canvasSize={{ w: CANVAS_W, h: CANVAS_H }}
                zoom={zoom}
                onMove={onMove}
                onDuplicate={() => onDuplicate(b)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BedBlock({
  bed,
  pxPerCm,
  canvasSize,
  zoom,
  onMove,
  onDuplicate,
}: {
  bed: GardenBed;
  pxPerCm: number;
  canvasSize: { w: number; h: number };
  zoom: number;
  onMove: (id: UUID, x: number, y: number) => void;
  onDuplicate: () => void;
}) {
  const w = Math.max(40, Math.round((bed.length_cm || 200) * pxPerCm));
  const h = Math.max(24, Math.round((bed.width_cm || 100) * pxPerCm));

  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: bed.location_x ?? 20,
    y: bed.location_y ?? 20,
  });

  useEffect(() => {
    setPos({ x: bed.location_x ?? 20, y: bed.location_y ?? 20 });
  }, [bed.location_x, bed.location_y]);

  const dragging = useRef(false);
  const start = useRef<{ mx: number; my: number; x: number; y: number }>({ mx: 0, my: 0, x: 0, y: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    start.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const dx = (e.clientX - start.current.mx) / zoom;
    const dy = (e.clientY - start.current.my) / zoom;
    const nx = Math.max(0, Math.min(canvasSize.w - w, start.current.x + dx));
    const ny = Math.max(0, Math.min(canvasSize.h - h, start.current.y + dy));
    setPos({ x: nx, y: ny });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onMove(bed.id, pos.x, pos.y);
  }

  return (
    <div
      className={`absolute rounded-lg shadow-sm border cursor-grab active:cursor-grabbing select-none ${bed.is_greenhouse ? "border-green-600/60 bg-green-50" : "bg-white"}`}
      style={{ left: pos.x, top: pos.y, width: w, height: h }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/50 rounded-t-lg">
        <span className="text-xs font-medium truncate">{bed.name}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Dupliceren" className="p-1 rounded hover:bg-muted">
            <Copy className="h-3.5 w-3.5" />
          </button>
          {bed.is_greenhouse && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white">Kas</span>
          )}
        </div>
      </div>
      <div className="p-2">
        <div className="text-[11px] text-muted-foreground">
          {bed.width_cm}×{bed.length_cm} cm • {bed.segments} seg
        </div>
        <div className="text-[10px] text-muted-foreground">
          x:{Math.round(pos.x)} y:{Math.round(pos.y)}
        </div>
      </div>
    </div>
  );
}
