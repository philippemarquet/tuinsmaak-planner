import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, UUID } from "../lib/types";
import { listBeds, deleteBed, updateBed, createBed } from "../lib/api/beds";
import { BedModal } from "./BedModal";
import { Pencil, Trash2, Map as MapIcon, PlusCircle, ZoomIn, ZoomOut, Maximize2, Copy, GripVertical } from "lucide-react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";

export function BedsPage({ garden }: { garden: Garden }) {
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [upsertOpen, setUpsertOpen] = useState<null | Partial<GardenBed>>(null);
  const [layoutMode, setLayoutMode] = useState(false); // plattegrond editor

  useEffect(() => {
    listBeds(garden.id).then(setBeds).catch(console.error);
  }, [garden.id]);

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Bakken</h2>
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
        <div className="space-y-10">
          <Section
            title="Buiten"
            items={outdoor}
            onEdit={(b)=> setUpsertOpen(b)}
            onDelete={handleDelete}
            onDuplicate={duplicateBed}
            onReorder={async (orderedIds) => {
              // pas sort_order aan volgens de nieuwe volgorde
              const idToOrder: Record<string, number> = {};
              orderedIds.forEach((id, idx) => (idToOrder[id] = idx));
              const updates = outdoor
                .map(b => ({ ...b, sort_order: idToOrder[b.id] }))
                .filter(b => b.sort_order !== (beds.find(x => x.id===b.id)?.sort_order ?? 0));
              if (updates.length) {
                // Optimistisch updaten
                setBeds(prev => prev.map(b => updates.find(u => u.id===b.id) ?? b));
                await Promise.all(updates.map(u => updateBed(u.id, { sort_order: u.sort_order })));
                // refresh? niet nodig, we hebben al lokaal gezet
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
          gardenId={garden.id}
          bed={("id" in upsertOpen && upsertOpen.id) ? (upsertOpen as GardenBed) : null}
          onClose={() => setUpsertOpen(null)}
          onUpdated={(b) => upsertLocal(b)}
        />
      )}
    </div>
  );
}

/* ===========
 * Section (kaartweergave met drag-sort)
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
  const [localIds, setLocalIds] = useState<UUID[]>(items.map(i => i.id));

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

  return (
    <section className="space-y-3">
      <h3 className="text-xl font-semibold">{title}</h3>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {localIds.map((id) => {
            const b = items.find(x => x.id === id)!;
            return (
              <SortableCard key={b.id} id={b.id}>
                <div className="p-5 border rounded-xl bg-card shadow-md hover:shadow-lg transition space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <GripHandle />
                      <div>
                        <h4 className="font-semibold text-lg">{b.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {b.width_cm} × {b.length_cm} cm — {b.segments} segment(en)
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onDuplicate(b)}
                        className="p-1 text-muted-foreground hover:text-primary"
                        title="Dupliceren"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEdit(b)}
                        className="p-1 text-muted-foreground hover:text-primary"
                        title="Bewerken"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(b.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Verwijderen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {b.is_greenhouse && (
                      <span className="text-xs bg-green-600/90 text-white px-2 py-0.5 rounded">
                        Kas
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Positie: x {b.location_x ?? 0}, y {b.location_y ?? 0}
                    </span>
                  </div>
                </div>
              </SortableCard>
            );
          })}
        </div>
      </DndContext>
    </section>
  );
}

function GripHandle() {
  return <GripVertical className="h-4 w-4 text-muted-foreground" />;
}

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  // Draggable
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  // Droppable (zodat we ook "over" een kaart kunnen droppen)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node as any);
      }}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative ${isDragging ? 'z-50 opacity-90' : ''} ${isOver ? 'ring-2 ring-primary/50 rounded-xl' : ''}`}
    >
      {children}
    </div>
  );
}

/* =======================
 *  Plattegrond Editor (ongewijzigd vs vorige versie)
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
