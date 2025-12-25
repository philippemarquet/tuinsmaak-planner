import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";

/*
  GardenPlotCanvas — COMPLETE REPLACEMENT
  -------------------------------------------------
  Doelen (op basis van je feedback):
  - Segmentlijnen: altijd haaks op de LANGSTE zijde van de bak.
  - Baknaam: enkel als hover (native tooltip), geen vaste labels.
  - Kleuren/stijl: grasachtergrond, houten rand voor buitenbakken, glaslook voor kasbakken, aarde in vulling.
  - Schaallegenda: dynamisch (10/20/50/100/200 cm), schaalt correct mee met zoom.
  - Posities (location_x/location_y) blijven leidend; auto-fit verschuift camera, niet de data.
  - Draggen zonder “spoor”; snap-to-grid in wereld-coördinaten.
  - Geen nieuwe bestanden of externe libs nodig.

  Publieke API (zoals gebruikt in BedsPage):
    <GardenPlotCanvas
      beds={beds}
      storagePrefix="bedsLayout"
      onBedMove={(id, x, y) => Promise<void>}
      onBedDuplicate={(bed) => Promise<void>}
    />
*/

// ---------- Instellingen ----------
const INITIAL_CM_SCALE = 2; // wereld-px per cm bij zoom=1 (houd dit stabiel; zoom verandert voor fit)
const GRID_SIZE_WORLD = 10; // snap-to-grid in wereld-px (niet scherm-px)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.5;
const FIT_MARGIN = 120; // scherm-px marge rondom inhoud

// Hulptypes
type Pt = { x: number; y: number };

type Props = {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove: (id: UUID, x: number, y: number) => void | Promise<void>;
  onBedDuplicate?: (bed: GardenBed) => void | Promise<void>;
};

export function GardenPlotCanvas({ beds, storagePrefix = "beds", onBedMove, onBedDuplicate }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cmScale] = useState<number>(INITIAL_CM_SCALE); // wereld-px per cm (constant)
  const [zoom, setZoom] = useState<number>(() => loadNumber(`${storagePrefix}:zoom`, 1));
  const [pan, setPan] = useState<Pt>(() => loadPoint(`${storagePrefix}:pan`, { x: 0, y: 0 }));
  const [showGrid, setShowGrid] = useState<boolean>(() => loadBool(`${storagePrefix}:grid`, true));

  // UI interacties
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef<Pt>({ x: 0, y: 0 });
  const draggingRef = useRef<null | { id: UUID; startWorld: Pt; grabOff: Pt }>(null);

  // Container afmetingen (voor auto-fit en zoom rond cursor)
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setWrapSize({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Wereld-bounds uit data
  const worldBounds = useMemo(() => {
    if (!beds.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of beds) {
      const x = (b.location_x ?? 0);
      const y = (b.location_y ?? 0);
      const w = (b.width_cm ?? 100) * cmScale;
      const h = (b.length_cm ?? 100) * cmScale;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1000; maxY = 800; }
    return { minX, minY, maxX, maxY };
  }, [beds, cmScale]);

  // Auto-fit bij init of wanneer bed-afmetingen drastisch veranderen
  useEffect(() => {
    if (!wrapSize.w || !wrapSize.h) return;
    // Als er al eens gepand/gezoomd is door de gebruiker, respecteer dat
    const touched = localStorage.getItem(`${storagePrefix}:touched`) === "1";
    if (touched) return;

    const boundsW = worldBounds.maxX - worldBounds.minX;
    const boundsH = worldBounds.maxY - worldBounds.minY;
    if (boundsW <= 0 || boundsH <= 0) return;

    const zx = (wrapSize.w - FIT_MARGIN) / Math.max(1, boundsW);
    const zy = (wrapSize.h - FIT_MARGIN) / Math.max(1, boundsH);
    const nextZoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);

    const worldCx = (worldBounds.minX + worldBounds.maxX) / 2;
    const worldCy = (worldBounds.minY + worldBounds.maxY) / 2;
    const screenCx = wrapSize.w / 2;
    const screenCy = wrapSize.h / 2;
    const nextPanX = screenCx - worldCx * nextZoom;
    const nextPanY = screenCy - worldCy * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, [wrapSize.w, wrapSize.h, worldBounds, storagePrefix]);

  // Persist basic view state
  useEffect(() => { saveNumber(`${storagePrefix}:zoom`, zoom); }, [zoom, storagePrefix]);
  useEffect(() => { savePoint(`${storagePrefix}:pan`, pan); }, [pan, storagePrefix]);
  useEffect(() => { saveBool(`${storagePrefix}:grid`, showGrid); }, [showGrid, storagePrefix]);

  // Helpers conversie
  const worldToScreen = (p: Pt): Pt => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y });
  const screenToWorld = (p: Pt): Pt => ({ x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom });

  // Zoom op muiswiel (rond cursor)
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldBefore = screenToWorld(cursor);

    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const nextZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const nextPan = {
      x: cursor.x - worldBefore.x * nextZoom,
      y: cursor.y - worldBefore.y * nextZoom,
    };
    setZoom(nextZoom);
    setPan(nextPan);
    localStorage.setItem(`${storagePrefix}:touched`, "1");
  };

  // Pannen (slepen op achtergrond)
  const onMouseDownBg: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return; // alleen links
    // klik niet op bed? (we detecteren dat middels data-attr)
    const target = e.target as HTMLElement;
    if (target.closest('[data-bed]')) return;
    isPanningRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMoveBg: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    localStorage.setItem(`${storagePrefix}:touched`, "1");
  };
  const onMouseUpBg: React.MouseEventHandler<HTMLDivElement> = () => {
    isPanningRef.current = false;
  };

  // Bed drag (wereld-coördinaten; snap op GRID_SIZE_WORLD)
  function startDragBed(e: React.MouseEvent, bed: GardenBed) {
    e.stopPropagation();
    const rect = wrapRef.current!.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(cursor);
    const startWorld = { x: bed.location_x ?? 0, y: bed.location_y ?? 0 };
    const grabOff = { x: world.x - startWorld.x, y: world.y - startWorld.y };
    draggingRef.current = { id: bed.id, startWorld, grabOff };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    (window as any)._draggingBed = true; // voorkom tekstselectie in sommige browsers
    document.body.style.userSelect = "none";
  }

  function onMouseMoveWindow(e: MouseEvent) {
    if (!draggingRef.current) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(cursor);
    const { id, grabOff } = draggingRef.current;
    const proposed = { x: world.x - grabOff.x, y: world.y - grabOff.y };
    // snap
    const snapped = {
      x: Math.round(proposed.x / GRID_SIZE_WORLD) * GRID_SIZE_WORLD,
      y: Math.round(proposed.y / GRID_SIZE_WORLD) * GRID_SIZE_WORLD,
    };
    // tijdelijke visuele move (zonder DB)
    tempMovesRef.current = new Map(tempMovesRef.current);
    tempMovesRef.current.set(id, snapped);
    setTick((t) => t + 1);
  }

  async function onMouseUpWindow() {
    document.body.style.userSelect = "";
    if (!draggingRef.current) return;
    const { id } = draggingRef.current;
    draggingRef.current = null;
    const pos = tempMovesRef.current.get(id);
    if (pos) {
      try { await onBedMove(id, Math.round(pos.x), Math.round(pos.y)); }
      catch (e) { /* noop UI */ }
    }
    tempMovesRef.current.delete(id);
  }

  useEffect(() => {
    const mm = (e: MouseEvent) => onMouseMoveWindow(e);
    const mu = () => onMouseUpWindow();
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, []);

  // Tijdelijke client-side bedposities (slepen zonder "+spoor+")
  const tempMovesRef = useRef<Map<UUID, Pt>>(new Map());
  const [tick, setTick] = useState(0); // force rerender bij temp move

  // Dynamische schaallegenda stap (in cm) rond 80–180px breed op scherm
  const pxPerCm = cmScale * zoom;
  const legendStepCm = useMemo(() => chooseScaleStep(pxPerCm), [pxPerCm]);
  const legendStepPx = legendStepCm * pxPerCm;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full h-[72vh] md:h-[74vh] rounded-xl overflow-hidden border",
        "bg-[radial-gradient(circle_at_25%_25%,rgba(34,197,94,0.12),transparent_40%),radial-gradient(circle_at_75%_75%,rgba(16,185,129,0.12),transparent_40%)]",
        "[background-color:#e9f7ec]"
      )}
      onWheel={onWheel}
      onMouseDown={onMouseDownBg}
      onMouseMove={onMouseMoveBg}
      onMouseUp={onMouseUpBg}
    >
      {/* Grid (optioneel) */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              `linear-gradient(transparent 95%, rgba(0,0,0,0.04) 95%), linear-gradient(90deg, transparent 95%, rgba(0,0,0,0.04) 95%)`,
            backgroundSize: `${GRID_SIZE_WORLD * zoom}px ${GRID_SIZE_WORLD * zoom}px`,
          }}
        />
      )}

      {/* Wereldlaag */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        {/* Gazon textuur subtiel */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              `radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)`,
            backgroundSize: `${24 / zoom}px ${24 / zoom}px`,
          }}
        />

        {beds.map((bed) => (
          <BedView
            key={bed.id}
            bed={bed}
            cmScale={cmScale}
            zoom={zoom}
            tempMove={tempMovesRef.current.get(bed.id) ?? null}
            onStartDrag={startDragBed}
            onDuplicate={onBedDuplicate}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <div className="rounded-lg overflow-hidden shadow-sm border bg-white/90 backdrop-blur">
          <div className="flex">
            <ToolbarBtn label="Fit" onClick={() => fitToBounds()} />
            <ToolbarBtn label="−" onClick={() => setZoom((z) => clamp(z * 0.88, MIN_ZOOM, MAX_ZOOM))} />
            <ToolbarBtn label="+" onClick={() => setZoom((z) => clamp(z * 1.12, MIN_ZOOM, MAX_ZOOM))} />
            <ToolbarToggle label="Grid" active={showGrid} onClick={() => setShowGrid((v) => !v)} />
          </div>
        </div>
      </div>

      {/* Schaallegenda */}
      <div className="absolute right-4 bottom-4 select-none">
        <div className="px-2 py-1.5 rounded-md bg-white/90 shadow border text-[11px] text-muted-foreground">
          <div className="h-2 mb-1 flex items-end">
            <div className="h-[6px] bg-neutral-900" style={{ width: `${legendStepPx}px` }} />
          </div>
          <div className="text-center leading-none">{legendStepCm} cm</div>
        </div>
      </div>
    </div>
  );

  // --- helpers ---
  function fitToBounds() {
    if (!wrapRef.current) return;
    const W = wrapRef.current.clientWidth;
    const H = wrapRef.current.clientHeight;
    const boundsW = worldBounds.maxX - worldBounds.minX;
    const boundsH = worldBounds.maxY - worldBounds.minY;
    if (boundsW <= 0 || boundsH <= 0) return;
    const zx = (W - FIT_MARGIN) / Math.max(1, boundsW);
    const zy = (H - FIT_MARGIN) / Math.max(1, boundsH);
    const nextZoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);

    const worldCx = (worldBounds.minX + worldBounds.maxX) / 2;
    const worldCy = (worldBounds.minY + worldBounds.maxY) / 2;
    const screenCx = W / 2;
    const screenCy = H / 2;

    setZoom(nextZoom);
    setPan({ x: screenCx - worldCx * nextZoom, y: screenCy - worldCy * nextZoom });
    localStorage.setItem(`${storagePrefix}:touched`, "1");
  }
}

// ---------- Bed View ----------
function BedView({ bed, cmScale, zoom, tempMove, onStartDrag, onDuplicate }: {
  bed: GardenBed;
  cmScale: number;
  zoom: number;
  tempMove: Pt | null;
  onStartDrag: (e: React.MouseEvent, bed: GardenBed) => void;
  onDuplicate?: (b: GardenBed) => void | Promise<void>;
}) {
  const worldPos = tempMove ?? { x: bed.location_x ?? 0, y: bed.location_y ?? 0 };
  const widthW = (bed.width_cm ?? 100) * cmScale; // wereld-px
  const heightW = (bed.length_cm ?? 100) * cmScale; // wereld-px

  // Visuele parameters
  const frameCm = 4; // dikte rand in cm
  const frameW = frameCm * cmScale; // wereld-px
  const framePxOnScreen = frameW * zoom;
  const framePx = clamp(framePxOnScreen, 2, 18); // visueel clampen

  const innerW = Math.max(0, widthW - frameW * 2);
  const innerH = Math.max(0, heightW - frameW * 2);

  const isKas = !!bed.is_greenhouse;

  // Segmentlijnen — ALTJD haaks op LANGSTE zijde
  const segs = Math.max(1, bed.segments ?? 1);
  const longIsY = (bed.length_cm ?? 0) >= (bed.width_cm ?? 0);
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (segs > 1) {
    if (longIsY) {
      // langste zijde = Y (lengte), lijnen HORIZONTAAL (haaks op langste zijde)
      const step = innerH / segs; // wereld-px
      for (let i = 1; i < segs; i++) {
        const y = frameW + step * i;
        lines.push({ x1: frameW, y1: y, x2: frameW + innerW, y2: y });
      }
    } else {
      // langste zijde = X (breedte), lijnen VERTICAAL
      const step = innerW / segs;
      for (let i = 1; i < segs; i++) {
        const x = frameW + step * i;
        lines.push({ x1: x, y1: frameW, x2: x, y2: frameW + innerH });
      }
    }
  }

  // Scherm-transform van wereld → via parent transform (scale/translate). Hier posities in wereld.
  const styleWorld = {
    position: "absolute" as const,
    left: `${worldPos.x}px`,
    top: `${worldPos.y}px`,
    width: `${widthW}px`,
    height: `${heightW}px`,
  };

  return (
    <div
      data-bed
      title={bed.name || "Bak"}
      style={styleWorld}
      className={cn(
        "group rounded-xl shadow-[0_1px_8px_rgba(0,0,0,0.12)]",
        "border border-black/10 relative",
        isKas ? "bg-gradient-to-br from-cyan-50 to-sky-100/60" : "bg-[#c29a6b]"
      )}
      onMouseDown={(e) => onStartDrag(e, bed)}
    >
      {/* Houten/metal frame */}
      <div
        className="absolute inset-0 pointer-events-none rounded-xl"
        style={{
          boxShadow: isKas
            ? `inset 0 0 0 ${framePx}px rgba(120,144,156,0.55), inset 0 0 0 ${framePx + 1}px rgba(0,0,0,0.08)`
            : `inset 0 0 0 ${framePx}px #8b5a2b, inset 0 0 0 ${framePx + 1}px rgba(0,0,0,0.12)`,
          backgroundImage: isKas
            ? undefined
            : `repeating-linear-gradient( 45deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 6px )`,
        }}
      />

      {/* Binnenvulling: aarde of glas */}
      <div
        className="absolute rounded-lg overflow-hidden"
        style={{
          left: `${frameW}px`,
          top: `${frameW}px`,
          width: `${innerW}px`,
          height: `${innerH}px`,
          background: isKas
            ? `linear-gradient(180deg, rgba(255,255,255,0.7), rgba(224,242,254,0.7))`
            : `linear-gradient(180deg, #8a5a44, #6b402d)`,
          boxShadow: isKas ? "inset 0 0 20px rgba(255,255,255,0.4)" : "inset 0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        {!isKas && (
          <div
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: `${16 / zoom}px ${16 / zoom}px`,
            }}
          />
        )}

        {/* Kas ruitlijnen subtiel */}
        {isKas && (
          <div className="absolute inset-0 opacity-50 pointer-events-none">
            <KasPaneLines innerW={innerW} innerH={innerH} step={Math.max(80, 120 / zoom)} />
          </div>
        )}

        {/* Segment lijnen */}
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${widthW} ${heightW}`} preserveAspectRatio="none">
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={isKas ? "rgba(3,105,161,0.35)" : "rgba(255,255,255,0.45)"} strokeWidth={Math.max(1, 1.2 / Math.max(0.5, zoom))} />
          ))}
        </svg>
      </div>

      {/* Hover actions (rechtsboven) */}
      {onDuplicate && (
        <button
          className="absolute right-1.5 top-1.5 text-[10px] px-2 py-1 rounded-md bg-white/90 border shadow opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onDuplicate(bed); }}
        >
          Kopieer
        </button>
      )}
    </div>
  );
}

function KasPaneLines({ innerW, innerH, step }: { innerW: number; innerH: number; step: number }) {
  const v: JSX.Element[] = [];
  for (let x = step; x < innerW; x += step) {
    v.push(<div key={`v-${x}`} style={{ position: "absolute", left: x, top: 0, width: 1, height: innerH, background: "rgba(255,255,255,0.55)" }} />);
  }
  for (let y = step; y < innerH; y += step) {
    v.push(<div key={`h-${y}`} style={{ position: "absolute", left: 0, top: y, width: innerW, height: 1, background: "rgba(255,255,255,0.55)" }} />);
  }
  return <>{v}</>;
}

// ---------- Toolbar helpers ----------
function ToolbarBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="px-3 py-1 text-xs border-r last:border-r-0 hover:bg-neutral-50"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
function ToolbarToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn("px-3 py-1 text-xs last:border-r-0", active ? "bg-neutral-900 text-white" : "hover:bg-neutral-50 border-l")}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

// ---------- Utils ----------
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function loadNumber(k: string, def: number) { const v = localStorage.getItem(k); const n = v == null ? NaN : Number(v); return isFinite(n) ? n : def; }
function saveNumber(k: string, n: number) { localStorage.setItem(k, String(n)); }
function loadBool(k: string, def: boolean) { const v = localStorage.getItem(k); return v == null ? def : v === "1"; }
function saveBool(k: string, b: boolean) { localStorage.setItem(k, b ? "1" : "0"); }
function loadPoint(k: string, def: Pt): Pt { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } }
function savePoint(k: string, p: Pt) { localStorage.setItem(k, JSON.stringify(p)); }

function chooseScaleStep(pxPerCm: number): number {
  // streefbreedte ~ 80–180 px
  const targets = [10, 20, 50, 100, 200, 500];
  let best = targets[0];
  for (const t of targets) {
    const px = t * pxPerCm;
    if (px >= 80 && px <= 180) { best = t; break; }
    if (px < 80) best = t; // ga door naar grotere t
  }
  return best;
}

export default GardenPlotCanvas;
