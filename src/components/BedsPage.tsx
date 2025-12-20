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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {localIds.map((id, index) => {
              const b = items.find(x => x.id === id)!;
              return (
                <SortableCard key={b.id} id={b.id}>
                  {(drag) => (
                    <div
                      className="flex items-center gap-1.5 px-2 py-1.5 border rounded-lg bg-card hover:bg-accent/50 transition cursor-pointer group animate-fade-in"
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
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </button>

                      <span className="font-medium text-xs truncate flex-1">{b.name}</span>
                      
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 hidden sm:inline">
                        {b.segments}s
                      </span>

                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDuplicate(b); }}
                          className="p-0.5 text-muted-foreground hover:text-primary"
                          title="Dupliceren"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
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

/* =======================
 *  Plattegrond Editor - Fotorealistisch design
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

  // Langwerpiger canvas voor realistische tuinverhoudingen
  const CANVAS_W = 3000;
  const CANVAS_H = 1200;
  const pxPerCm = 1;

  const [zoom, setZoom] = useState(0.6);
  const minZoom = 0.15;
  const maxZoom = 2;

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
          <ZoomOut className="h-4 w-4" />
        </button>
        <input type="range" min={minZoom} max={maxZoom} step={0.05} value={zoom} onChange={(e) => setZoomClamped(parseFloat(e.target.value))} className="w-32" />
        <button className="inline-flex items-center gap-1 border rounded-md px-2 py-1 bg-secondary hover:bg-secondary/80" onClick={() => setZoomClamped(zoom + 0.1)} title="Inzoomen">
          <ZoomIn className="h-4 w-4" />
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

      <div 
        ref={viewportRef} 
        className="relative w-full h-[70vh] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl"
        style={{
          background: "linear-gradient(135deg, #2d5016 0%, #3a6b1e 25%, #2d5016 50%, #3a6b1e 75%, #2d5016 100%)",
        }}
      >
        <div className="relative" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
          <div
            className="absolute left-0 top-0"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              borderRadius: 12,
              // Gras textuur effect
              backgroundImage: `
                radial-gradient(ellipse 3px 5px at 20% 30%, rgba(255,255,255,0.03) 0%, transparent 100%),
                radial-gradient(ellipse 2px 4px at 60% 70%, rgba(255,255,255,0.02) 0%, transparent 100%),
                radial-gradient(ellipse 4px 6px at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 100%),
                radial-gradient(ellipse 3px 5px at 40% 80%, rgba(255,255,255,0.02) 0%, transparent 100%),
                repeating-linear-gradient(
                  90deg,
                  transparent 0px,
                  transparent 8px,
                  rgba(0,0,0,0.02) 8px,
                  rgba(0,0,0,0.02) 9px
                ),
                repeating-linear-gradient(
                  0deg,
                  transparent 0px,
                  transparent 12px,
                  rgba(0,0,0,0.015) 12px,
                  rgba(0,0,0,0.015) 13px
                )
              `,
            }}
          >
            {/* Decoratieve elementen */}
            <GardenDecorations />
            
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
      
      {/* Legenda */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-6 h-4 rounded border-2 border-amber-700" style={{ background: "linear-gradient(180deg, #5c4033 0%, #3e2723 100%)" }} />
          <span>Moestuinbak (douglas hout)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-4 rounded border-2 border-sky-300/60" style={{ background: "linear-gradient(135deg, rgba(135,206,235,0.3) 0%, rgba(255,255,255,0.4) 50%, rgba(135,206,235,0.3) 100%)" }} />
          <span>Kas (glas)</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-muted-foreground/60">Sleep de bakken om te verplaatsen</span>
        </div>
      </div>
    </section>
  );
}

/* Decoratieve elementen voor de tuin */
function GardenDecorations() {
  return (
    <>
      {/* Subtiele zonlicht gradient */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 30% 20%, rgba(255,255,200,0.08) 0%, transparent 60%)",
        }}
      />
      
      {/* Pad/gravel strip onderaan (optioneel) */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
        style={{
          background: "linear-gradient(0deg, rgba(139,119,101,0.2) 0%, transparent 100%)",
        }}
      />
    </>
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
  const w = Math.max(60, Math.round((bed.length_cm || 200) * pxPerCm));
  const h = Math.max(40, Math.round((bed.width_cm || 100) * pxPerCm));
  const borderWidth = 8; // Douglas hout rand dikte

  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: bed.location_x ?? 50,
    y: bed.location_y ?? 50,
  });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setPos({ x: bed.location_x ?? 50, y: bed.location_y ?? 50 });
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

  // Kas styling — nu met grondkleur binnenin
  if (bed.is_greenhouse) {
    return (
      <div
        className="absolute cursor-grab active:cursor-grabbing select-none transition-all duration-150"
        style={{ 
          left: pos.x, 
          top: pos.y, 
          width: w, 
          height: h,
          transform: isHovered ? "scale(1.02)" : "scale(1)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Kas schaduw */}
        <div 
          className="absolute -bottom-3 left-2 right-2 h-4 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, transparent 70%)",
          }}
        />
        
        {/* Kas frame (aluminium look) */}
        <div 
          className="absolute inset-0 rounded-lg"
          style={{
            background: "linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 50%, #e8e8e8 100%)",
            padding: 4,
          }}
        >
          {/* Binnenkant: grond i.p.v. grijze ruitjes */}
          <div 
            className="w-full h-full rounded-md overflow-hidden relative"
            style={{
              background: `
                radial-gradient(ellipse at 30% 40%, rgba(101,67,33,1) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 60%, rgba(89,60,31,1) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 30%, rgba(110,75,38,1) 0%, transparent 40%),
                linear-gradient(180deg, #5c4033 0%, #4a3328 50%, #3e2723 100%)
              `,
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {/* Subtiele glas-reflectie zodat het nog kas oogt */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 35%, transparent 70%, rgba(255,255,255,0.08) 100%)",
              }}
            />
            
            {/* (Optioneel) segmentlijnen haaks op de langste zijde */}
            {bed.segments > 1 && (() => {
              const isWide = w >= h; // langste zijde is horizontaal => verticale lijntjes
              const segPercent = 100 / bed.segments;
              const lineColor = "rgba(255,255,255,0.08)";
              const style = isWide
                ? {
                    backgroundImage: `repeating-linear-gradient(
                      90deg,
                      transparent 0,
                      transparent calc(${segPercent}% - 1px),
                      ${lineColor} calc(${segPercent}% - 1px),
                      ${lineColor} ${segPercent}%
                    )`,
                  }
                : {
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      transparent 0,
                      transparent calc(${segPercent}% - 1px),
                      ${lineColor} calc(${segPercent}% - 1px),
                      ${lineColor} ${segPercent}%
                    )`,
                  };
              return <div className="absolute inset-0 pointer-events-none" style={style} />;
            })()}

            {/* Naam label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span 
                className="text-sm font-semibold px-3 py-1 rounded-md"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  color: "#2d5016",
                  textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                }}
              >
                {bed.name}
              </span>
            </div>
          </div>
        </div>
        
        {/* Hover actions */}
        {isHovered && (
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }} 
            title="Dupliceren" 
            className="absolute -top-2 -right-2 p-1.5 rounded-full bg-white shadow-md hover:bg-gray-100 z-10"
          >
            <Copy className="h-3.5 w-3.5 text-gray-600" />
          </button>
        )}
      </div>
    );
  }

  // Normale moestuinbak (douglas hout)
  return (
    <div
      className="absolute cursor-grab active:cursor-grabbing select-none transition-all duration-150"
      style={{ 
        left: pos.x, 
        top: pos.y, 
        width: w, 
        height: h,
        transform: isHovered ? "scale(1.02)" : "scale(1)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Bak schaduw op het gras */}
      <div 
        className="absolute -bottom-4 left-1 right-1 h-5 rounded-full"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)",
        }}
      />
      
      {/* Douglas houten rand */}
      <div 
        className="absolute inset-0 rounded-lg"
        style={{
          background: `
            linear-gradient(180deg, 
              #8B6914 0%, 
              #7a5a12 15%, 
              #6d4f0f 30%,
              #5c4210 50%,
              #6d4f0f 70%,
              #7a5a12 85%,
              #8B6914 100%
            )
          `,
          boxShadow: `
            inset 2px 2px 4px rgba(255,255,255,0.15),
            inset -2px -2px 4px rgba(0,0,0,0.2),
            0 4px 8px rgba(0,0,0,0.3)
          `,
          padding: borderWidth,
        }}
      >
        {/* Hout textuur overlay */}
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none opacity-30"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent 20px,
                rgba(0,0,0,0.1) 20px,
                rgba(0,0,0,0.1) 21px
              ),
              repeating-linear-gradient(
                0deg,
                transparent 0px,
                transparent 3px,
                rgba(255,255,255,0.05) 3px,
                rgba(255,255,255,0.05) 4px
              )
            `,
          }}
        />
        
        {/* Aarde/grond binnen de bak */}
        <div 
          className="w-full h-full rounded-md overflow-hidden relative"
          style={{
            background: `
              radial-gradient(ellipse at 30% 40%, rgba(101,67,33,1) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 60%, rgba(89,60,31,1) 0%, transparent 50%),
              radial-gradient(ellipse at 50% 30%, rgba(110,75,38,1) 0%, transparent 40%),
              linear-gradient(180deg, #5c4033 0%, #4a3328 50%, #3e2723 100%)
            `,
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {/* Grond textuur */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                radial-gradient(circle 2px at 20% 30%, rgba(0,0,0,0.15) 0%, transparent 100%),
                radial-gradient(circle 3px at 60% 20%, rgba(0,0,0,0.1) 0%, transparent 100%),
                radial-gradient(circle 2px at 80% 70%, rgba(0,0,0,0.12) 0%, transparent 100%),
                radial-gradient(circle 2px at 40% 80%, rgba(0,0,0,0.1) 0%, transparent 100%),
                radial-gradient(circle 1px at 15% 60%, rgba(255,255,255,0.05) 0%, transparent 100%),
                radial-gradient(circle 1px at 85% 40%, rgba(255,255,255,0.05) 0%, transparent 100%)
              `,
            }}
          />
          
          {/* Segment lijnen: altijd haaks op de langste zijde */}
          {bed.segments > 1 && (() => {
            const isWide = w >= h; // langste zijde is horizontaal => verticale lijntjes
            const segPercent = 100 / bed.segments;
            const lineColor = "rgba(255,255,255,0.08)";
            const style = isWide
              ? {
                  // verticale lijnen (herhaling over X)
                  backgroundImage: `repeating-linear-gradient(
                    90deg,
                    transparent 0,
                    transparent calc(${segPercent}% - 1px),
                    ${lineColor} calc(${segPercent}% - 1px),
                    ${lineColor} ${segPercent}%
                  )`,
                }
              : {
                  // horizontale lijnen (herhaling over Y)
                  backgroundImage: `repeating-linear-gradient(
                    0deg,
                    transparent 0,
                    transparent calc(${segPercent}% - 1px),
                    ${lineColor} calc(${segPercent}% - 1px),
                    ${lineColor} ${segPercent}%
                  )`,
                };

            return (
              <div
                className="absolute inset-0 pointer-events-none"
                style={style}
              />
            );
          })()}
          
          {/* Naam label - zwevend boven de grond */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span 
              className="text-sm font-semibold px-3 py-1 rounded-md"
              style={{
                background: "rgba(255,255,255,0.9)",
                color: "#3e2723",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              {bed.name}
            </span>
          </div>
        </div>
      </div>
      
      {/* Hover actions */}
      {isHovered && (
        <button 
          type="button" 
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }} 
          title="Dupliceren" 
          className="absolute -top-2 -right-2 p-1.5 rounded-full bg-white shadow-md hover:bg-gray-100 z-10"
        >
          <Copy className="h-3.5 w-3.5 text-gray-600" />
        </button>
      )}
    </div>
  );
}
