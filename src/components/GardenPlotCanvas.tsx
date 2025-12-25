// src/components/GardenPlotCanvas.tsx — VERVANGING (drop‑in)
// Props blijven identiek aan je huidige BedsPage-import:
// <GardenPlotCanvas beds={beds} storagePrefix="bedsLayout" onBedMove onBedDuplicate />
//
// Highlights:
// - Auto‑fit om alles netjes in beeld te brengen (knop + initial)
// - Zoom (muiswiel / knoppen) en pannen (slepen op achtergrond)
// - Snappen aan raster (toggle) + raster overlay (toggle)
// - Draggen van bakken; bij loslaten wordt onBedMove(id, x, y) aangeroepen
// - Minimap + schaalbalk
// - Houten rand + aarde‑vlak binnenin; segment‑markeringen; naam‑label
// - Transform (zoom/positie) en toggles worden bewaard met storagePrefix

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import { ZoomIn, ZoomOut, Maximize2, Grid3X3, Magnet, Copy, Move, Ruler } from "lucide-react";

/* =============================
   Config & helpers
============================= */
const CM_TO_PX = 2; // render-schaal voor cm → px in de wereld-coördinaten
const FIT_PADDING = 40; // wereld-padding in px bij fit
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const GRID_STEP = 50; // wereld-px (voor raster)
const SNAP_STEP = 10; // wereld-px (snappen)

function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect; setSize({ w: r.width, h: r.height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function loadBool(key: string, def = false) { try { return localStorage.getItem(key) === "1" ? true : def; } catch { return def; } }
function saveBool(key: string, v: boolean) { try { localStorage.setItem(key, v ? "1" : "0") } catch {} }
function loadNumber(key: string, def = 0) { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) ? v : def; } catch { return def; } }
function saveNumber(key: string, v: number) { try { localStorage.setItem(key, String(v)) } catch {} }

function woodBg() {
  return {
    background:
      "repeating-linear-gradient( 45deg, #d6b58c, #d6b58c 6px, #c7a076 6px, #c7a076 12px )",
  } as React.CSSProperties;
}
function soilBg() {
  return {
    background:
      "radial-gradient(#3f3f3f 1px, transparent 1px) 0 0/6px 6px, #2b2b2b",
  } as React.CSSProperties;
}

/* =============================
   Types
============================= */
export type GardenPlotCanvasProps = {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove?: (id: UUID, x: number, y: number) => void | Promise<void>;
  onBedDuplicate?: (bed: GardenBed) => void | Promise<void>;
};

/* =============================
   Component
============================= */
export function GardenPlotCanvas({ beds, storagePrefix = "gardenPlot", onBedMove, onBedDuplicate }: GardenPlotCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const { w: wrapW, h: wrapH } = useSize(wrapRef);

  // transform (wereld → scherm)
  const [scale, setScale] = useState(() => loadNumber(`${storagePrefix}:scale`, 1));
  const [tx, setTx] = useState(() => loadNumber(`${storagePrefix}:tx`, 0));
  const [ty, setTy] = useState(() => loadNumber(`${storagePrefix}:ty`, 0));

  // toggles
  const [showGrid, setShowGrid] = useState(() => loadBool(`${storagePrefix}:grid`, true));
  const [snap, setSnap] = useState(() => loadBool(`${storagePrefix}:snap`, true));

  useEffect(() => { saveNumber(`${storagePrefix}:scale`, scale); }, [scale, storagePrefix]);
  useEffect(() => { saveNumber(`${storagePrefix}:tx`, tx); }, [tx, storagePrefix]);
  useEffect(() => { saveNumber(`${storagePrefix}:ty`, ty); }, [ty, storagePrefix]);
  useEffect(() => { saveBool(`${storagePrefix}:grid`, showGrid); }, [showGrid, storagePrefix]);
  useEffect(() => { saveBool(`${storagePrefix}:snap`, snap); }, [snap, storagePrefix]);

  // lokaal tijdens draggen
  const [dragBedId, setDragBedId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // pannen van de achtergrond
  const [panning, setPanning] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; stx: number; sty: number } | null>(null);

  // wereldrects van bedden (px)
  const worldBeds = useMemo(() => {
    return (beds || []).map((b) => {
      const bw = Math.max(10, (b.width_cm ?? 100) * CM_TO_PX);
      const bh = Math.max(10, (b.length_cm ?? 100) * CM_TO_PX);
      const x = Math.round(b.location_x ?? 0);
      const y = Math.round(b.location_y ?? 0);
      return { b, x, y, w: bw, h: bh };
    });
  }, [beds]);

  // wereld-bounds
  const worldBounds = useMemo(() => {
    if (worldBeds.length === 0) return { minX: 0, minY: 0, maxX: 1000, maxY: 700 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of worldBeds) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    // altijd wat padding
    return { minX: minX - FIT_PADDING, minY: minY - FIT_PADDING, maxX: maxX + FIT_PADDING, maxY: maxY + FIT_PADDING };
  }, [worldBeds]);

  const worldW = worldBounds.maxX - worldBounds.minX;
  const worldH = worldBounds.maxY - worldBounds.minY;

  // initial fit (eenmalig bij mount of wanneer er nog nooit gespeelde transform is)
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current) return;
    // Herken default state: wanneer tx,ty,scale uit storage allemaal 0/1 en container heeft afmeting
    if (wrapW > 0 && wrapH > 0 && loadNumber(`${storagePrefix}:init`, 0) !== 1) {
      fitToScreen();
      saveNumber(`${storagePrefix}:init`, 1);
      didInitialFit.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapW, wrapH, worldW, worldH]);

  function fitToScreen() {
    if (!wrapW || !wrapH) return;
    const s = Math.min(wrapW / worldW, wrapH / worldH);
    const targetScale = clamp(s, 0.1, 1.5);
    const nt = (wrapW - worldW * targetScale) / 2 - worldBounds.minX * targetScale;
    const ny = (wrapH - worldH * targetScale) / 2 - worldBounds.minY * targetScale;
    setScale(targetScale); setTx(nt); setTy(ny);
  }

  // muiswiel zoom rond cursor
  function handleWheel(e: React.WheelEvent) {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left; // scherm
    const cy = e.clientY - rect.top;

    const delta = -e.deltaY; // naar boven = inzoomen
    const zoomFactor = Math.exp(delta * 0.0015); // soepel
    const newScale = clamp(scale * zoomFactor, MIN_SCALE, MAX_SCALE);

    // wereld-coörd van cursor vóór
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;

    // nieuwe translate zodat dezelfde wereld-coörd onder de cursor blijft
    const ntx = cx - wx * newScale;
    const nty = cy - wy * newScale;

    setScale(newScale); setTx(ntx); setTy(nty);
  }

  // pannen door achtergrond te slepen
  function onBgPointerDown(e: React.PointerEvent) {
    // alleen linker muisknop
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPanning(true);
    panRef.current = { sx: e.clientX, sy: e.clientY, stx: tx, sty: ty };
  }
  function onBgPointerMove(e: React.PointerEvent) {
    if (!panning || !panRef.current) return;
    const dx = e.clientX - panRef.current.sx;
    const dy = e.clientY - panRef.current.sy;
    setTx(panRef.current.stx + dx);
    setTy(panRef.current.sty + dy);
  }
  function onBgPointerUp(e: React.PointerEvent) {
    if (!panning) return;
    setPanning(false);
    panRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }

  // dragging van individuele bedden (wereld-coördinaten)
  function worldFromClient(clientX: number, clientY: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const sx = clientX - rect.left; const sy = clientY - rect.top;
    return { wx: (sx - tx) / scale, wy: (sy - ty) / scale };
  }

  function onBedPointerDown(e: React.PointerEvent, r: { b: GardenBed; x: number; y: number; w: number; h: number }) {
    e.stopPropagation(); // voorkom panning
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { wx, wy } = worldFromClient(e.clientX, e.clientY);
    dragRef.current = { startX: wx, startY: wy, origX: r.x, origY: r.y };
    setDragBedId(r.b.id);
  }
  function onBedPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !dragBedId) return;
    const { wx, wy } = worldFromClient(e.clientX, e.clientY);
    const dx = wx - dragRef.current.startX;
    const dy = wy - dragRef.current.startY;
    const nx = dragRef.current.origX + dx;
    const ny = dragRef.current.origY + dy;
    // live positie updaten door state te vervangen (zonder globale mutaties)
    // We gebruiken hier setLocalShift zodat alleen het gesleepte bed visueel verplaatst.
    setLocalShift({ id: dragBedId, x: nx, y: ny });
  }
  function onBedPointerUp(_: React.PointerEvent) {
    if (!dragRef.current || !dragBedId) return;
    const nx = currentBedPos(dragBedId).x;
    const ny = currentBedPos(dragBedId).y;
    // snap
    const sx = snap ? Math.round(nx / SNAP_STEP) * SNAP_STEP : Math.round(nx);
    const sy = snap ? Math.round(ny / SNAP_STEP) * SNAP_STEP : Math.round(ny);

    // persist via callback
    if (onBedMove) onBedMove(dragBedId as UUID, sx, sy);

    // reset drag
    dragRef.current = null;
    setDragBedId(null);
    setLocalShift(null);
  }

  // live verschuiving voor 1 bed
  const [localShift, setLocalShift] = useState<{ id: string; x: number; y: number } | null>(null);
  function currentBedPos(id: string) {
    const w = worldBeds.find((r) => r.b.id === id);
    if (!w) return { x: 0, y: 0 };
    if (localShift && localShift.id === id) return { x: localShift.x, y: localShift.y };
    return { x: w.x, y: w.y };
  }

  // toolbar acties
  function zoom(step: number) {
    const factor = step > 0 ? 1.2 : 1 / 1.2;
    const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    // zoom naar center van viewport
    const cx = wrapW / 2, cy = wrapH / 2;
    const wx = (cx - tx) / scale, wy = (cy - ty) / scale;
    const ntx = cx - wx * newScale, nty = cy - wy * newScale;
    setScale(newScale); setTx(ntx); setTy(nty);
  }

  // schaalbalk (ongeveer): 100 wereld‑px = ? cm
  const pxPerCm = CM_TO_PX; // 1 cm = 2 px in wereld
  const screenPxPer10cm = 10 * pxPerCm * scale; // 10 cm op scherm in px
  // Kies mooie stap (10 cm of 50 cm of 1 m)
  const niceSteps = [10, 20, 50, 100]; // cm
  const { scaleCm, scalePx } = useMemo(() => {
    let cm = 10; let px = screenPxPer10cm;
    for (const s of niceSteps) {
      const p = s * pxPerCm * scale;
      if (p >= 60 && p <= 180) { cm = s; px = p; break; }
    }
    return { scaleCm: cm, scalePx: Math.max(1, Math.round(px)) };
  }, [scale]);

  /* =============================
     Render
  ============================= */
  return (
    <div className="relative w-full h-[70vh] rounded-xl border bg-background overflow-hidden" ref={wrapRef} onWheel={handleWheel}>
      {/* Toolbar */}
      <div className="absolute z-20 top-3 left-3 flex items-center gap-1 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg p-1 shadow-sm">
        <button className="p-2 rounded hover:bg-muted" title="Uitzoomen" onClick={() => zoom(-1)}><ZoomOut className="w-4 h-4" /></button>
        <button className="p-2 rounded hover:bg-muted" title="Inzoomen" onClick={() => zoom(1)}><ZoomIn className="w-4 h-4" /></button>
        <button className="p-2 rounded hover:bg-muted" title="Passend maken" onClick={fitToScreen}><Maximize2 className="w-4 h-4" /></button>
        <div className="w-px h-5 bg-border mx-1" />
        <button className={cn("p-2 rounded hover:bg-muted", showGrid && "bg-muted") } title="Raster tonen/verbergen" onClick={() => setShowGrid(v => !v)}><Grid3X3 className="w-4 h-4" /></button>
        <button className={cn("p-2 rounded hover:bg-muted", snap && "bg-muted") } title="Snappen aan raster" onClick={() => setSnap(v => !v)}><Magnet className="w-4 h-4" /></button>
      </div>

      {/* Schaalbalk */}
      <div className="absolute z-20 bottom-3 left-3 flex items-center gap-2 px-2 py-1 rounded bg-background/80 border shadow-sm">
        <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="h-[6px] bg-foreground/80" style={{ width: `${scalePx}px` }} />
        <span className="text-[10px] text-muted-foreground">{scaleCm} cm</span>
      </div>

      {/* Minimap */}
      <Minimap
        className="absolute z-20 bottom-3 right-3"
        width={160}
        height={110}
        world={{ x: worldBounds.minX, y: worldBounds.minY, w: worldW, h: worldH }}
        view={{ tx, ty, scale, vw: wrapW, vh: wrapH }}
        beds={worldBeds}
      />

      {/* Achtergrond (pannen) + raster */}
      <div
        className={cn("absolute inset-0 cursor-", panning ? "grabbing" : "grab")}
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
      >
        {/* Wereld layer met transform */}
        <div
          className="absolute top-0 left-0 will-change-transform"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}
        >
          {/* Raster */}
          {showGrid && (
            <div
              className="pointer-events-none"
              style={{
                position: "absolute",
                left: worldBounds.minX,
                top: worldBounds.minY,
                width: worldW,
                height: worldH,
                backgroundImage:
                  `linear-gradient(to right, rgba(0,0,0,.05) 1px, transparent 1px),` +
                  `linear-gradient(to bottom, rgba(0,0,0,.05) 1px, transparent 1px)`,
                backgroundSize: `${GRID_STEP}px ${GRID_STEP}px`,
              }}
            />
          )}

          {/* Bakken */}
          {worldBeds.map((r) => {
            const pos = currentBedPos(r.b.id);
            const selected = dragBedId === r.b.id;
            const greenhouse = !!r.b.is_greenhouse;
            const showSeg = Math.max(1, r.b.segments ?? 1);

            return (
              <div
                key={r.b.id}
                className={cn("absolute select-none", selected && "[filter:drop-shadow(0_6px_14px_rgba(0,0,0,.25))]")}
                style={{ left: pos.x, top: pos.y, width: r.w, height: r.h }}
                onPointerDown={(e) => onBedPointerDown(e, r)}
                onPointerMove={onBedPointerMove}
                onPointerUp={onBedPointerUp}
              >
                {/* Houten rand */}
                <div className="relative w-full h-full rounded-xl" style={woodBg()}>
                  <div className={cn("absolute inset-1 rounded-lg overflow-hidden", greenhouse && "ring-2 ring-emerald-500/60")}
                       style={soilBg()}>
                    {/* segment strepen (langs lengte) */}
                    {showSeg > 1 && (
                      <div className="absolute inset-0 pointer-events-none">
                        {Array.from({ length: showSeg - 1 }).map((_, i) => (
                          <div key={i} className="absolute left-0 right-0 border-t border-white/10"
                               style={{ top: ((i + 1) * 100) / showSeg + "%" }} />
                        ))}
                      </div>
                    )}
                    {/* naam label */}
                    <div className="absolute top-1 left-1 right-1 flex items-center justify-between text-[10px] text-white/90">
                      <span className="px-1 py-0.5 bg-black/30 rounded">{r.b.name}</span>
                      {greenhouse && <span className="px-1 py-0.5 bg-emerald-600/40 rounded">Kas</span>}
                    </div>
                  </div>
                </div>

                {/* Acties (rechtsboven) */}
                <div className="absolute -top-2 -right-2 flex gap-1">
                  {onBedDuplicate && (
                    <button
                      className="p-1 rounded-full bg-background border shadow hover:bg-muted"
                      title="Dupliceren"
                      onClick={(e) => { e.stopPropagation(); onBedDuplicate(r.b); }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className="p-1 rounded-full bg-background border shadow text-muted-foreground cursor-move"><Move className="w-3.5 h-3.5" /></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =============================
   Minimap
============================= */
function Minimap({ className, width, height, world, view, beds }:{
  className?: string;
  width: number; height: number;
  world: { x: number; y: number; w: number; h: number };
  view: { tx: number; ty: number; scale: number; vw: number; vh: number };
  beds: Array<{ b: GardenBed; x: number; y: number; w: number; h: number }>;
}) {
  const s = Math.min(width / world.w, height / world.h);
  const ox = -world.x * s;
  const oy = -world.y * s;

  // zichtbare viewport als wereld→screen→minimap
  const vx1w = (0 - view.tx) / view.scale; // wereld x van linker schermrand
  const vy1w = (0 - view.ty) / view.scale;
  const vx2w = (view.vw - view.tx) / view.scale;
  const vy2w = (view.vh - view.ty) / view.scale;

  const vLeft = vx1w * s + ox;
  const vTop = vy1w * s + oy;
  const vW = (vx2w - vx1w) * s;
  const vH = (vy2w - vy1w) * s;

  return (
    <div className={cn("pointer-events-none rounded-lg border bg-background/80 backdrop-blur shadow-sm p-1", className)} style={{ width, height }}>
      <div className="relative w-full h-full overflow-hidden rounded" style={{ background: "repeating-linear-gradient( 45deg, #f5f5f5, #f5f5f5 6px, #eee 6px, #eee 12px )" }}>
        {/* beds */}
        {beds.map((r) => (
          <div key={r.b.id} className={cn("absolute", r.b.is_greenhouse ? "bg-emerald-500/50" : "bg-stone-600/50")}
               style={{ left: r.x * s + ox, top: r.y * s + oy, width: r.w * s, height: r.h * s }} />
        ))}
        {/* viewport */}
        <div className="absolute ring-2 ring-primary/70 rounded-sm" style={{ left: vLeft, top: vTop, width: vW, height: vH }} />
      </div>
    </div>
  );
}

export default GardenPlotCanvas;
