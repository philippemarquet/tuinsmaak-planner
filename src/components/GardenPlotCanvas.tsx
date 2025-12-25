// src/components/GardenPlotCanvas.tsx — Luxe redesign (drop‑in replacement)
// - behoudt exact dezelfde props als in BedsPage wordt gebruikt
// - veel mooiere, rustige visual met auto‑fit, zoom/pan, snap, schaalbalk
// - duidelijke stijlverschillen tussen Buiten (hout) en Kas (glas)
// - gebruikt bed.location_x / bed.location_y als wereld‑coördinaten
// - geen extra bestanden of libs nodig

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import { ZoomIn, ZoomOut, Scan, Target, Ruler, Copy, Move, Square } from "lucide-react";

/* ================= Types & Props ================= */
export function GardenPlotCanvas({
  beds,
  storagePrefix = "bedsLayout",
  onBedMove,
  onBedDuplicate,
}: {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove: (id: UUID, x: number, y: number) => void | Promise<void>;
  onBedDuplicate?: (bed: GardenBed) => void | Promise<void>;
}) {
  /* ================= State ================= */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<{
    scale: number; // pixels per wereld‑unit
    tx: number; // screen translation x (px)
    ty: number; // screen translation y (px)
    iso: boolean; // visuele isometrische tilt
    showGrid: boolean;
    snap: number; // wereld‑snapmaat
    showLabels: boolean;
  }>(() => {
    const raw = localStorage.getItem(`${storagePrefix}:view`);
    return raw
      ? JSON.parse(raw)
      : { scale: 0.5, tx: 0, ty: 0, iso: false, showGrid: true, snap: 10, showLabels: true };
  });

  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:view`, JSON.stringify(view));
  }, [view, storagePrefix]);

  /* ================= World bounds ================= */
  type Rect = { x: number; y: number; w: number; h: number };
  const bedRects: Map<string, Rect> = useMemo(() => {
    const m = new Map<string, Rect>();
    for (const b of beds) {
      const x = (b.location_x ?? 0);
      const y = (b.location_y ?? 0);
      const w = Math.max(40, Number(b.width_cm ?? 120));
      const h = Math.max(40, Number(b.length_cm ?? 300));
      m.set(b.id, { x, y, w, h });
    }
    return m;
  }, [beds]);

  const worldBounds = useMemo(() => {
    if (beds.length === 0) return { x: 0, y: 0, w: 1000, h: 700 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of bedRects.values()) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    const pad = 100; // wereld‑marge
    return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
  }, [bedRects, beds.length]);

  /* ================= Fit to container ================= */
  const fitToScreen = useCallback((animate = true) => {
    const el = wrapRef.current; if (!el) return;
    const box = el.getBoundingClientRect();
    const pad = 32; // scherm‑marge
    const scaleX = (box.width - pad) / Math.max(100, worldBounds.w);
    const scaleY = (box.height - pad) / Math.max(100, worldBounds.h);
    const scale = clamp(Math.min(scaleX, scaleY), 0.15, 4);
    const tx = Math.round(pad/2 - worldBounds.x * scale + (box.width - (worldBounds.w * scale) - pad)/2);
    const ty = Math.round(pad/2 - worldBounds.y * scale + (box.height - (worldBounds.h * scale) - pad)/2);
    if (!animate) { setView(v => ({ ...v, scale, tx, ty })); return; }
    // eenvoudige animatie
    const start = performance.now();
    const s0 = view.scale, tx0 = view.tx, ty0 = view.ty;
    const dur = 220;
    function step(t: number) {
      const k = Math.min(1, (t - start) / dur);
      const e = easeOutCubic(k);
      setView(v => ({ ...v, scale: lerp(s0, scale, e), tx: lerp(tx0, tx, e), ty: lerp(ty0, ty, e) }));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [worldBounds, view.scale, view.tx, view.ty]);

  useEffect(() => { fitToScreen(false); }, [fitToScreen, beds.length]);

  /* ================= Wheel zoom (pointer‑centered) ================= */
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const delta = e.deltaY;
    const factor = Math.exp(-delta * 0.0015);
    const newScale = clamp(view.scale * factor, 0.15, 4);
    const box = wrapRef.current.getBoundingClientRect();
    const sx = e.clientX - box.left; const sy = e.clientY - box.top;
    const wx = (sx - view.tx) / view.scale; const wy = (sy - view.ty) / view.scale;
    const tx = sx - wx * newScale; const ty = sy - wy * newScale;
    setView(v => ({ ...v, scale: newScale, tx, ty }));
  }, [view.scale, view.tx, view.ty]);

  /* ================= Panning (background drag) ================= */
  const panRef = useRef<{ sx: number; sy: number; tx0: number; ty0: number } | null>(null);
  const onBgPointerDown = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement);
    if (el.closest('[data-bed]')) return; // niet pannen als op bed geklikt
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { sx: e.clientX, sy: e.clientY, tx0: view.tx, ty0: view.ty };
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.sx;
    const dy = e.clientY - panRef.current.sy;
    setView(v => ({ ...v, tx: panRef.current!.tx0 + dx, ty: panRef.current!.ty0 + dy }));
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    panRef.current = null;
  };

  /* ================= Dragging beds (wereld‑coördinaten) ================= */
  type DragState = { id: string; offX: number; offY: number } | null;
  const [drag, setDrag] = useState<DragState>(null);

  const toWorld = (sx: number, sy: number) => ({
    x: (sx - view.tx) / view.scale,
    y: (sy - view.ty) / view.scale,
  });

  const onBedPointerDown = (e: React.PointerEvent, id: string) => {
    const r = bedRects.get(id); if (!r) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - box.left; const sy = e.clientY - box.top;
    const w = toWorld(sx, sy);
    setDrag({ id, offX: w.x - r.x, offY: w.y - r.y });
  };

  const onBedPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const box = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - box.left; const sy = e.clientY - box.top;
    const w = toWorld(sx, sy);
    const nx = w.x - drag.offX; const ny = w.y - drag.offY;
    // live position in map (zonder commit)
    setLivePos({ id: drag.id, x: nx, y: ny });
  };

  const onBedPointerUp = async (e: React.PointerEvent) => {
    if (!drag) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const { id } = drag;
    const lp = livePos; setDrag(null); setLivePos(null);
    const r = bedRects.get(id); if (!r) return;
    const nx = Math.round(applySnap(lp?.x ?? r.x, view.snap));
    const ny = Math.round(applySnap(lp?.y ?? r.y, view.snap));
    if (nx !== r.x || ny !== r.y) await onBedMove(id as UUID, nx, ny);
  };

  const [livePos, setLivePos] = useState<{ id: string; x: number; y: number } | null>(null);

  /* ================= Controls ================= */
  const zoomBy = (f: number) => {
    if (!wrapRef.current) return;
    const box = wrapRef.current.getBoundingClientRect();
    const sx = box.width / 2, sy = box.height / 2; // center zoom
    const newScale = clamp(view.scale * f, 0.15, 4);
    const wx = (sx - view.tx) / view.scale; const wy = (sy - view.ty) / view.scale;
    const tx = sx - wx * newScale; const ty = sy - wy * newScale;
    setView(v => ({ ...v, scale: newScale, tx, ty }));
  };

  /* ================= Rendering helpers ================= */
  const gridStyle: React.CSSProperties = useMemo(() => {
    if (!view.showGrid) return { background: "transparent" };
    const step = Math.max(10, view.snap);
    const s = step * view.scale;
    return {
      backgroundImage:
        `repeating-linear-gradient(0deg, rgba(0,0,0,0.04), rgba(0,0,0,0.04) 1px, transparent 1px, transparent ${s}px),` +
        `repeating-linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.04) 1px, transparent 1px, transparent ${s}px)`,
      backgroundSize: `${s}px ${s}px, ${s}px ${s}px`,
    } as React.CSSProperties;
  }, [view.showGrid, view.scale, view.snap]);

  const styleScene = {
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
    transformOrigin: "0 0",
  } as React.CSSProperties;

  /* ================== UI ================== */
  return (
    <div className="relative h-[70vh] w-full rounded-xl border bg-gradient-to-b from-neutral-50 to-neutral-100 overflow-hidden" ref={wrapRef} onWheel={onWheel}>
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 bg-white/80 backdrop-blur-md border rounded-lg p-1 shadow-sm">
        <button className="icon-btn" title="Zoom uit" onClick={() => zoomBy(0.85)}><ZoomOut className="w-4 h-4"/></button>
        <button className="icon-btn" title="Zoom in" onClick={() => zoomBy(1.15)}><ZoomIn className="w-4 h-4"/></button>
        <div className="w-px h-5 bg-border mx-1"/>
        <button className="icon-btn" title="Auto‑fit" onClick={() => fitToScreen()}><Scan className="w-4 h-4"/></button>
        <div className="w-px h-5 bg-border mx-1"/>
        <button className={cn("chip", view.iso && "chip-active")} onClick={() => setView(v => ({ ...v, iso: !v.iso }))} title="Isometrische weergave">ISO</button>
        <button className={cn("chip", view.showGrid && "chip-active")} onClick={() => setView(v => ({ ...v, showGrid: !v.showGrid }))} title="Raster">Grid</button>
        <button className={cn("chip", view.showLabels && "chip-active")} onClick={() => setView(v => ({ ...v, showLabels: !v.showLabels }))} title="Labels">Labels</button>
        <div className="text-[10px] ml-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">snap {view.snap}</div>
      </div>

      {/* Legend */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-white/80 backdrop-blur-md border rounded-lg p-2 shadow-sm">
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded-sm border shadow-inner" style={{ background: woodFill }}/>
          <span className="text-[11px] text-muted-foreground">Buiten</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded-sm border shadow-inner" style={{ background: glassFill }}/>
          <span className="text-[11px] text-muted-foreground">Kas</span>
        </div>
      </div>

      {/* Scale bar */}
      <ScaleBar scale={view.scale} className="absolute bottom-3 left-3 z-30" />

      {/* Scene */}
      <div
        className="absolute inset-0 cursor-[grab] active:cursor-[grabbing]"
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
      >
        <div className="absolute inset-0" style={styleScene}>
          <div className="absolute" style={{ left: worldBounds.x, top: worldBounds.y, width: worldBounds.w, height: worldBounds.h, ...gridStyle }} />

          {/* Beds */}
          {beds.map((b) => {
            const r = bedRects.get(b.id)!;
            const live = livePos && livePos.id === b.id ? livePos : null;
            const x = live ? live.x : r.x;
            const y = live ? live.y : r.y;
            const w = r.w; const h = r.h;
            return (
              <BedShape
                key={b.id}
                id={b.id}
                name={b.name}
                greenhouse={!!b.is_greenhouse}
                x={x}
                y={y}
                w={w}
                h={h}
                segments={Math.max(1, Number(b.segments ?? 1))}
                iso={view.iso}
                showLabel={view.showLabels}
                onPointerDown={onBedPointerDown}
                onPointerMove={onBedPointerMove}
                onPointerUp={onBedPointerUp}
                onDuplicate={() => onBedDuplicate?.(b)}
              />
            );
          })}
        </div>
      </div>

      {/* Styles (utility classes) */}
      <style>{`
        .icon-btn{ @apply p-1.5 rounded-md hover:bg-muted transition-colors; }
        .chip{ @apply px-2 py-0.5 text-[10px] rounded-md bg-muted text-muted-foreground hover:text-foreground; }
        .chip-active{ @apply bg-primary text-primary-foreground; }
      `}</style>
    </div>
  );
}

/* ================= Bed visual ================= */
const woodFill = "linear-gradient(135deg, #e2c8a3 0%, #c99a66 40%, #b7824a 100%)";
const glassFill = "linear-gradient(180deg, rgba(160,220,255,0.45), rgba(140,210,255,0.3))";

function BedShape({
  id,
  name,
  greenhouse,
  x,
  y,
  w,
  h,
  segments,
  iso,
  showLabel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDuplicate,
}: {
  id: string;
  name: string;
  greenhouse: boolean;
  x: number; y: number; w: number; h: number;
  segments: number;
  iso: boolean;
  showLabel: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDuplicate?: () => void;
}) {
  const paneColor = greenhouse ? glassFill : woodFill;
  const borderCol = greenhouse ? "#63b3ed" : "#9a6b3a";

  const content = (
    <div
      data-bed
      className={cn(
        "group absolute select-none",
        iso ? "[transform:skewY(-8deg)_skewX(0deg)_translateZ(0)]" : ""
      )}
      style={{ left: x, top: y, width: w, height: h }}
      onPointerDown={(e) => onPointerDown(e, id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* body */}
      <div
        className="relative w-full h-full rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.08)] overflow-hidden border"
        style={{
          borderColor: borderCol + "66",
          background: greenhouse
            ? paneColor
            : `radial-gradient(120%_120%_at_20%_10%, rgba(255,255,255,0.25), rgba(255,255,255,0) 45%), ${paneColor}`,
        }}
      >
        {/* inner rim / planks */}
        <div className="absolute inset-1 rounded-md border" style={{ borderColor: borderCol + "66" }} />

        {/* segment lines (langs de lengte => verticale strepen) */}
        {Array.from({ length: Math.max(0, segments - 1) }).map((_, i) => {
          const px = Math.round(((i + 1) / segments) * w);
          return (
            <div key={i} className="absolute top-1 bottom-1 w-px" style={{ left: px, background: greenhouse ? "rgba(80,150,200,0.35)" : "rgba(80,50,20,0.25)" }} />
          );
        })}

        {/* greenhouse panes */}
        {greenhouse && (
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage:
              `linear-gradient(90deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.15) 10%, rgba(255,255,255,0.0) 30%),` +
              `repeating-linear-gradient(90deg, rgba(99,179,237,0.2) 0 2px, transparent 2px 120px)`,
            backgroundSize: `auto, 120px 100%`,
          }} />
        )}

        {/* label */}
        {showLabel && (
          <div className="absolute left-2 top-2 right-2 flex items-center gap-2">
            <div className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-white/80 backdrop-blur-sm border shadow-sm truncate">
              {name}
            </div>
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onDuplicate && (
                <button className="p-1 rounded bg-white/70 hover:bg-white border" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="Dupliceer"><Copy className="w-3.5 h-3.5"/></button>
              )}
              <div className="px-1.5 py-0.5 rounded text-[10px] bg-white/70 border text-muted-foreground flex items-center gap-1"><Move className="w-3 h-3"/> sleep</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return content;
}

/* ================= Scale bar ================= */
function ScaleBar({ scale, className }: { scale: number; className?: string }) {
  // toon een schaalbalk van ~100px op scherm
  const targetPx = 120; // px op scherm
  // wereld‑lengte die bij targetPx hoort
  const worldLen = clamp(Math.round(targetPx / scale), 10, 500);
  const screenLen = Math.round(worldLen * scale);
  return (
    <div className={cn("flex items-end gap-2 bg-white/80 backdrop-blur-md border rounded-lg p-2 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <Ruler className="w-4 h-4"/>
        <div className="h-3 w-[1px] bg-foreground/60"/>
        <div className="relative h-2.5" style={{ width: screenLen }}>
          <div className="absolute inset-0 bg-foreground/70"/>
          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.9) 0, rgba(255,255,255,0.9) 2px, transparent 2px, transparent 10px)" }} />
        </div>
        <div className="text-[11px] text-muted-foreground">≈ {worldLen} units</div>
      </div>
    </div>
  );
}

/* ================= Utils ================= */
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function applySnap(v: number, snap: number) {
  return snap > 0 ? Math.round(v / snap) * snap : v;
}
