// src/components/GardenPlotCanvas.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import { ZoomIn, ZoomOut, Grid as GridIcon, RotateCcw, Copy, Move } from "lucide-react";

type Props = {
  beds: GardenBed[];
  storagePrefix?: string; // gebruikt voor rotatie & view-state
  onBedMove: (id: UUID, x: number, y: number) => Promise<void> | void;
  onBedDuplicate?: (bed: GardenBed) => void;
};

type Pan = { x: number; y: number };
type DragState =
  | null
  | {
      kind: "pan";
      pointerId: number;
      startPan: Pan;
      startClient: { x: number; y: number };
    }
  | {
      kind: "bed";
      bedId: UUID;
      pointerId: number;
      startClient: { x: number; y: number };
      startPos: { x: number; y: number };
      moved: boolean;
    };

const LS = {
  zoom: (prefix: string) => `${prefix}:zoom`,
  pan: (prefix: string) => `${prefix}:pan`,
  snap: (prefix: string) => `${prefix}:snap`,
  rotMap: (prefix: string) => `${prefix}:rotations`,
};

export function GardenPlotCanvas({
  beds,
  storagePrefix = "GardenPlot",
  onBedMove,
  onBedDuplicate,
}: Props) {
  // ---------- viewport state ----------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(() => {
    const v = Number(localStorage.getItem(LS.zoom(storagePrefix)));
    return Number.isFinite(v) && v > 0 ? v : 1;
  });
  const [pan, setPan] = useState<Pan>(() => {
    try {
      const obj = JSON.parse(localStorage.getItem(LS.pan(storagePrefix)) || "{}");
      if (Number.isFinite(obj?.x) && Number.isFinite(obj?.y)) return { x: obj.x, y: obj.y };
    } catch {}
    return { x: 0, y: 0 };
  });
  const [snap, setSnap] = useState<boolean>(() => localStorage.getItem(LS.snap(storagePrefix)) !== "0");

  useEffect(() => localStorage.setItem(LS.zoom(storagePrefix), String(zoom)), [zoom, storagePrefix]);
  useEffect(() => localStorage.setItem(LS.pan(storagePrefix), JSON.stringify(pan)), [pan, storagePrefix]);
  useEffect(() => localStorage.setItem(LS.snap(storagePrefix), snap ? "1" : "0"), [snap, storagePrefix]);

  // ---------- rotation (local only) ----------
  const [rotations, setRotations] = useState<Record<string, number>>(() => {
    try {
      const obj = JSON.parse(localStorage.getItem(LS.rotMap(storagePrefix)) || "{}");
      if (obj && typeof obj === "object") return obj;
    } catch {}
    return {};
  });
  const setRotation = (id: string, deg: number) => {
    setRotations((prev) => {
      const next = { ...prev, [id]: normalizeDeg(deg) };
      localStorage.setItem(LS.rotMap(storagePrefix), JSON.stringify(next));
      return next;
    });
  };

  // ---------- derived ----------
  const gridSize = 10; // px
  const worldBeds = useMemo(
    () =>
      beds.map((b) => ({
        ...b,
        x: b.location_x ?? 0,
        y: b.location_y ?? 0,
        w: Math.max(20, Number(b.width_cm) || 20), // interpret cm ~ px @ zoom=1
        h: Math.max(20, Number(b.length_cm) || 20),
        r: rotations[b.id] ?? 0,
      })),
    [beds, rotations]
  );

  // ---------- initial fit (first mount only if empty pan/zoom) ----------
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (fittedOnce.current) return;
    if (!worldBeds.length) return;

    // als er nog geen pan/zoom opgeslagen is, fitten we in het scherm
    const hasSaved =
      localStorage.getItem(LS.zoom(storagePrefix)) ||
      localStorage.getItem(LS.pan(storagePrefix));
    if (hasSaved) {
      fittedOnce.current = true;
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const pad = 60;
    const minW = 600;
    const minH = 400;

    const bounds = getBounds(worldBeds);
    const viewW = Math.max(minW, el.clientWidth || minW);
    const viewH = Math.max(minH, el.clientHeight || minH);

    const scaleX = (viewW - pad * 2) / Math.max(1, bounds.w);
    const scaleY = (viewH - pad * 2) / Math.max(1, bounds.h);
    const z = clamp(Math.min(scaleX, scaleY), 0.2, 3);

    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const panX = viewW / 2 - cx * z;
    const panY = viewH / 2 - cy * z;

    setZoom(z);
    setPan({ x: panX, y: panY });
    fittedOnce.current = true;
  }, [worldBeds, storagePrefix]);

  // ---------- interaction ----------
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<UUID | null>(null);
  const spaceDown = useRef(false);

  // keyboard: rotate, reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;

      const fine = e.shiftKey ? 1 : 5;
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setRotation(selectedId, (rotations[selectedId] ?? 0) - fine);
      } else if (e.key.toLowerCase() === "e") {
        e.preventDefault();
        setRotation(selectedId, (rotations[selectedId] ?? 0) + fine);
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        setRotation(selectedId, 0);
      }
    };
    const onSpace = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.type === "keydown") spaceDown.current = true;
        if (e.type === "keyup") spaceDown.current = false;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onSpace);
    window.addEventListener("keyup", onSpace);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onSpace);
      window.removeEventListener("keyup", onSpace);
    };
  }, [selectedId, rotations]);

  // wheel: ctrl/⌘ to zoom, otherwise pan
  const onWheel = (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;

      const dz = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = clamp(zoom * dz, 0.2, 4);

      // zoom rond cursor
      const nx = e.clientX - rect.left - cx * newZoom;
      const ny = e.clientY - rect.top - cy * newZoom;
      setZoom(newZoom);
      setPan({ x: nx, y: ny });
    } else {
      // pan via wheel
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // background pointer for panning
  const bgPointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({
      kind: "pan",
      pointerId: e.pointerId,
      startPan: pan,
      startClient: { x: e.clientX, y: e.clientY },
    });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
    } else if (drag.kind === "bed") {
      const dx = (e.clientX - drag.startClient.x) / zoom;
      const dy = (e.clientY - drag.startClient.y) / zoom;
      if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        setDrag({ ...drag, moved: true });
      } else {
        // live move (no snapping yet; snap bij loslaten tenzij Alt)
        const idx = worldBeds.findIndex((b) => b.id === drag.bedId);
        if (idx !== -1) {
          const nb = worldBeds[idx];
          nb.x = drag.startPos.x + dx;
          nb.y = drag.startPos.y + dy;
          // we updaten niet direct de server; alleen visueel
          // force re-render
          _forceRerender();
        }
      }
    }
  };
  const onPointerUp = async (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "bed") {
      const dx = (e.clientX - drag.startClient.x) / zoom;
      const dy = (e.clientY - drag.startClient.y) / zoom;
      const moved = drag.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
      const bed = worldBeds.find((b) => b.id === drag.bedId);
      if (bed && moved) {
        let nx = drag.startPos.x + dx;
        let ny = drag.startPos.y + dy;
        const snapActive = snap && !e.altKey;
        if (snapActive) {
          nx = Math.round(nx / gridSize) * gridSize;
          ny = Math.round(ny / gridSize) * gridSize;
        }
        // update server
        await onBedMove(bed.id, Math.round(nx), Math.round(ny));
      }
    }
    setDrag(null);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // bed drag start
  const onBedPointerDown = (e: React.PointerEvent, bed: GardenBed) => {
    // space to pan: ignore bed drag
    if (spaceDown.current) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(bed.id);
    const wb = worldBeds.find((b) => b.id === bed.id)!;
    setDrag({
      kind: "bed",
      bedId: bed.id,
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startPos: { x: wb.x, y: wb.y },
      moved: false,
    });
  };

  // force render helper (for live drag visual)
  const [, setTick] = useState(0);
  const _forceRerender = () => setTick((t) => t + 1);

  // cursor
  const bgCursor =
    drag?.kind === "pan" || spaceDown.current ? "grabbing" : "grab";

  // ---------- render ----------
  return (
    <div className="relative w-full h-[70vh] rounded-xl border overflow-hidden bg-[#cfe8cf]">
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-20 bg-white/90 backdrop-blur rounded-xl shadow px-2 py-1 flex items-center gap-1">
        <button
          className={toolBtn()}
          title="Zoom in"
          onClick={() => setZoom((z) => clamp(z * 1.1, 0.2, 4))}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          className={toolBtn()}
          title="Zoom uit"
          onClick={() => setZoom((z) => clamp(z / 1.1, 0.2, 4))}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs px-1.5 w-12 text-center tabular-nums">
          {(zoom * 100).toFixed(0)}%
        </span>
        <div className="w-px h-5 bg-muted" />
        <button
          className={toolBtn(snap)}
          title={`Raster ${snap ? "aan" : "uit"} (Alt = tijdelijk omzeilen)`}
          onClick={() => setSnap((v) => !v)}
        >
          <GridIcon className="w-4 h-4" />
        </button>
        <button
          className={toolBtn()}
          title="Centreren"
          onClick={() => {
            fittedOnce.current = false;
            localStorage.removeItem(LS.zoom(storagePrefix));
            localStorage.removeItem(LS.pan(storagePrefix));
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={(e) => {
          if (spaceDown.current) bgPointerDown(e);
        }}
        style={{ cursor: bgCursor }}
      >
        {/* world */}
        <div
          className="absolute inset-0 will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* background grass pattern */}
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <pattern id="grass" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect width="32" height="32" fill="#cfe8cf" />
                <path d="M0 16 H32 M16 0 V32" stroke="#b9d9b9" strokeWidth="1" />
              </pattern>
              <pattern id="grid10" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#7aa97a55" strokeWidth="0.8" />
              </pattern>
              <linearGradient id="wood" x1="0" x2="1">
                <stop offset="0%" stopColor="#b3875a" />
                <stop offset="100%" stopColor="#8d6a46" />
              </linearGradient>
              <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c3f1ff" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#a0e3ff" stopOpacity="0.55" />
              </linearGradient>
              <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
              </filter>
            </defs>

            {/* optional grid */}
            {snap && <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid10)" />}

            {/* beds */}
            {worldBeds.map((b) => (
              <BedShape
                key={b.id}
                bed={b}
                selected={selectedId === b.id}
                onPointerDown={(e) => onBedPointerDown(e, b)}
                onClick={() => setSelectedId(b.id)}
                onRotateLeft={() => setRotation(b.id, (rotations[b.id] ?? 0) - 5)}
                onRotateRight={() => setRotation(b.id, (rotations[b.id] ?? 0) + 5)}
                onRotateReset={() => setRotation(b.id, 0)}
                onDuplicate={onBedDuplicate}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ========== Bed shape ========== */
function BedShape({
  bed,
  selected,
  onPointerDown,
  onClick,
  onRotateLeft,
  onRotateRight,
  onRotateReset,
  onDuplicate,
}: {
  bed: {
    id: UUID;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    r: number; // degrees
    is_greenhouse?: boolean | null;
    segments?: number | null;
  };
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onRotateReset: () => void;
  onDuplicate?: (b: any) => void;
}) {
  const border = 10; // wood frame thickness (px at zoom=1)
  const innerW = Math.max(1, bed.w - border * 2);
  const innerH = Math.max(1, bed.h - border * 2);

  const segs = Math.max(1, Math.floor(bed.segments ?? 1));
  const longIsH = bed.h >= bed.w; // langste zijde => H true = height is longer
  // lijnen moeten haaks op de langste zijde staan:
  // dus delen we op langs de langste zijde en tekenen we lijnen dwars erop.
  const sliceCount = segs;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (sliceCount > 1) {
    for (let i = 1; i < sliceCount; i++) {
      if (longIsH) {
        // long side = height => lijnen dwars = horizontaal
        const y = border + (innerH * i) / sliceCount;
        lines.push({ x1: border, y1: y, x2: border + innerW, y2: y });
      } else {
        // long side = width => lijnen dwars = verticaal
        const x = border + (innerW * i) / sliceCount;
        lines.push({ x1: x, y1: border, x2: x, y2: border + innerH });
      }
    }
  }

  const woodFill = "url(#wood)";
  const innerFill = bed.is_greenhouse ? "url(#glass)" : "#7c5f3e"; // soil vs glass
  const innerStroke = bed.is_greenhouse ? "#59b6d9" : "#00000020";

  return (
    <g
      transform={`translate(${bed.x}, ${bed.y}) rotate(${bed.r})`}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: "move", filter: "url(#softShadow)" }}
    >
      {/* hitbox */}
      <rect x={-6} y={-6} width={bed.w + 12} height={bed.h + 12} fill="transparent" />

      {/* wood frame */}
      <rect x={0} y={0} width={bed.w} height={bed.h} rx={6} ry={6} fill={woodFill} stroke="#6f5337" strokeWidth="1.2" />
      {/* inner area */}
      <rect
        x={border}
        y={border}
        width={innerW}
        height={innerH}
        rx={4}
        ry={4}
        fill={innerFill}
        stroke={innerStroke}
        strokeWidth={1}
      />
      {/* segment lines */}
      {lines.map((ln, i) => (
        <line key={i} {...ln} stroke={bed.is_greenhouse ? "#3aa2c855" : "#ffffff55"} strokeWidth={1.2} />
      ))}

      {/* hover name tooltip (SVG title) */}
      <title>{bed.name}</title>

      {/* selection affordances (no blue ball!) */}
      {selected && (
        <g transform={`translate(${bed.w - 6}, ${-10})`}>
          <foreignObject x={-110} y={-30} width="120" height="28">
            <div className="pointer-events-auto flex items-center gap-1 rounded-md bg-white/95 shadow px-1.5 py-1 border">
              <button className="icon-btn" title="Rotate -5° (Q)" onClick={(e) => { e.stopPropagation(); onRotateLeft(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24"><path d="M2 12a10 10 0 1 0 3-7.3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M2 3v6h6" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              </button>
              <button className="icon-btn" title="Rotate +5° (E)" onClick={(e) => { e.stopPropagation(); onRotateRight(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: "scaleX(-1)" }}><path d="M2 12a10 10 0 1 0 3-7.3" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M2 3v6h6" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
              </button>
              <button className="icon-btn" title="Reset rotatie (R)" onClick={(e) => { e.stopPropagation(); onRotateReset(); }}>
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              {onDuplicate && (
                <button className="icon-btn" title="Dupliceren" onClick={(e) => { e.stopPropagation(); onDuplicate(bed as any); }}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="ml-1 text-[11px] text-muted-foreground flex items-center gap-1">
                <Move className="w-3 h-3" /> slepen
              </span>
            </div>
          </foreignObject>
        </g>
      )}
    </g>
  );
}

/* ========== utils & styles ========== */
function getBounds(beds: { x: number; y: number; w: number; h: number }[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  beds.forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  if (!beds.length) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function normalizeDeg(d: number) {
  let x = d % 360;
  if (x < 0) x += 360;
  return x;
}
function toolBtn(active = false) {
  return cn(
    "p-1.5 rounded-md border text-foreground/80 hover:bg-muted transition-colors",
    active && "bg-muted"
  );
}

/* Tailwind alias voor de kleine icon buttons in foreignObject */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // so React knows foreignObject within SVG
      foreignObject: React.DetailedHTMLProps<React.SVGProps<SVGForeignObjectElement>, SVGForeignObjectElement>;
    }
  }
}
