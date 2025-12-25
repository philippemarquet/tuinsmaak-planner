// src/components/GardenPlotCanvas.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import { ZoomIn, ZoomOut, Grid as GridIcon, RotateCcw } from "lucide-react";

type Props = {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove: (id: UUID, x: number, y: number) => Promise<void> | void;
  onBedDuplicate?: (bed: GardenBed) => void; // optioneel, niet gebruikt door deze canvas
};

type Pan = { x: number; y: number };

const LS = {
  zoom: (p: string) => `${p}:zoom`,
  pan: (p: string) => `${p}:pan`,
  snap: (p: string) => `${p}:snap`,
};

export function GardenPlotCanvas({
  beds,
  storagePrefix = "GardenPlot",
  onBedMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ===== View state (met persistence) =====
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

  // ===== Afgeleide data =====
  const worldBeds = useMemo(
    () =>
      (beds || []).map((b) => ({
        ...b,
        x: Number(b.location_x ?? 0),
        y: Number(b.location_y ?? 0),
        w: Math.max(20, Number(b.width_cm) || 20),  // cm ≈ px
        h: Math.max(20, Number(b.length_cm) || 20),
      })),
    [beds]
  );

  // ===== Initial fit (1x als er niets opgeslagen is) =====
  const fittedOnce = useRef(false);
  useEffect(() => {
    if (fittedOnce.current) return;
    if (!worldBeds.length) return;

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
    const bounds = getBounds(worldBeds);
    const vw = Math.max(600, el.clientWidth || 600);
    const vh = Math.max(400, el.clientHeight || 400);
    const sx = (vw - pad * 2) / Math.max(1, bounds.w);
    const sy = (vh - pad * 2) / Math.max(1, bounds.h);
    const z = clamp(Math.min(sx, sy), 0.2, 3);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    setZoom(z);
    setPan({ x: vw / 2 - cx * z, y: vh / 2 - cy * z });
    fittedOnce.current = true;
  }, [worldBeds, storagePrefix]);

  // ===== Interactie: select/drag/pan =====
  const [selectedId, setSelectedId] = useState<UUID | null>(null);
  const [drag, setDrag] = useState<
    | null
    | {
        kind: "pan";
        pid: number;
        startPan: Pan;
        startClient: { x: number; y: number };
      }
    | {
        kind: "bed";
        pid: number;
        bedId: UUID;
        startClient: { x: number; y: number };
        startPos: { x: number; y: number };
        dx: number;
        dy: number;
        moved: boolean;
      }
  >(null);
  const spaceDown = useRef(false);
  useEffect(() => {
    const onSpace = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (e.type === "keydown") spaceDown.current = true;
        if (e.type === "keyup") spaceDown.current = false;
      }
    };
    window.addEventListener("keydown", onSpace);
    window.addEventListener("keyup", onSpace);
    return () => {
      window.removeEventListener("keydown", onSpace);
      window.removeEventListener("keyup", onSpace);
    };
  }, []);

  const gridSize = 10;

  // Wheel: Ctrl/⌘ zoom, anders pan
  const onWheel = (e: React.WheelEvent) => {
    if (!containerRef.current) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      const dz = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nz = clamp(zoom * dz, 0.2, 4);
      const nx = e.clientX - rect.left - cx * nz;
      const ny = e.clientY - rect.top - cy * nz;
      setZoom(nz);
      setPan({ x: nx, y: ny });
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Background pan (alleen bij spatie ingedrukt)
  const bgPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({
      kind: "pan",
      pid: e.pointerId,
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
        setDrag({ ...drag, dx, dy, moved: true });
      } else {
        setDrag({ ...drag, dx, dy });
      }
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "bed") {
      const moved = drag.moved || Math.abs(drag.dx) > 2 || Math.abs(drag.dy) > 2;
      if (moved) {
        const bed = worldBeds.find((b) => b.id === drag.bedId);
        if (bed) {
          let nx = bed.x + drag.dx;
          let ny = bed.y + drag.dy;
          const doSnap = snap && !e.altKey;
          if (doSnap) {
            nx = Math.round(nx / gridSize) * gridSize;
            ny = Math.round(ny / gridSize) * gridSize;
          }
          await onBedMove(bed.id, Math.round(nx), Math.round(ny));
        }
      }
    }
    try {
      (e.target as Element).releasePointerCapture((drag as any).pid);
    } catch {}
    setDrag(null);
  };

  const onBedPointerDown = (e: React.PointerEvent, id: UUID) => {
    if (spaceDown.current) return; // dan pan je de achtergrond
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const b = worldBeds.find((x) => x.id === id);
    if (!b) return;
    setSelectedId(id);
    setDrag({
      kind: "bed",
      pid: e.pointerId,
      bedId: id,
      startClient: { x: e.clientX, y: e.clientY },
      startPos: { x: b.x, y: b.y },
      dx: 0,
      dy: 0,
      moved: false,
    });
  };

  // Cursor
  const bgCursor = drag?.kind === "pan" || spaceDown.current ? "grabbing" : "grab";

  // Bed volgorde: geselecteerde bovenop
  const drawBeds = useMemo(() => {
    if (!selectedId) return worldBeds;
    const rest = worldBeds.filter((b) => b.id !== selectedId);
    const sel = worldBeds.find((b) => b.id === selectedId);
    return sel ? [...rest, sel] : worldBeds;
  }, [worldBeds, selectedId]);

  return (
    <div className="relative w-full h-[70vh] rounded-xl border overflow-hidden bg-[#cfe8cf]">
      {/* Toolbar */}
      <div className="absolute left-3 top-3 z-20 bg-white/90 backdrop-blur rounded-xl shadow px-2 py-1 flex items-center gap-1">
        <button className={toolBtn()} title="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.1, 0.2, 4))}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className={toolBtn()} title="Zoom uit" onClick={() => setZoom((z) => clamp(z / 1.1, 0.2, 4))}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs px-1.5 w-12 text-center tabular-nums">{(zoom * 100).toFixed(0)}%</span>
        <div className="w-px h-5 bg-muted" />
        <button className={toolBtn(snap)} title={`Raster ${snap ? "aan" : "uit"} (Alt = tijdelijk uit)`} onClick={() => setSnap((v) => !v)}>
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
          else setSelectedId(null); // klik op achtergrond deselecteert
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
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <pattern id="grass" width="32" height="32" patternUnits="userSpaceOnUse">
                <rect width="32" height="32" fill="#cfe8cf" />
                <path d="M0 16 H32 M16 0 V32" stroke="#b9d9b9" strokeWidth="1" />
              </pattern>
              <pattern id="grid10" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0 L0 0 0 10" fill="none" stroke="#7aa97a55" strokeWidth="0.8" />
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

            {/* achtergrond */}
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grass)" />
            {snap && <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid10)" opacity="0.6" />}

            {/* bakken */}
            {drawBeds.map((b) => {
              // live drag-offset voor geselecteerde bak
              const isDragging = drag?.kind === "bed" && drag.bedId === b.id;
              const dx = isDragging ? drag.dx : 0;
              const dy = isDragging ? drag.dy : 0;
              const x = b.x + dx;
              const y = b.y + dy;

              const border = 10; // frame
              const innerW = Math.max(1, b.w - border * 2);
              const innerH = Math.max(1, b.h - border * 2);
              const segs = Math.max(1, Math.floor(b.segments ?? 1));
              const longIsH = b.h >= b.w;

              const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
              if (segs > 1) {
                for (let i = 1; i < segs; i++) {
                  if (longIsH) {
                    const yy = border + (innerH * i) / segs;
                    lines.push({ x1: border, y1: yy, x2: border + innerW, y2: yy });
                  } else {
                    const xx = border + (innerW * i) / segs;
                    lines.push({ x1: xx, y1: border, x2: xx, y2: border + innerH });
                  }
                }
              }

              const woodFill = "url(#wood)";
              const innerFill = b.is_greenhouse ? "url(#glass)" : "#7c5f3e"; // aarde of glas
              const innerStroke = b.is_greenhouse ? "#59b6d9" : "#00000020";

              return (
                <g key={b.id} transform={`translate(${x}, ${y})`} style={{ filter: "url(#softShadow)", cursor: "move" }}>
                  {/* hitbox om makkelijk te pakken */}
                  <rect
                    x={-6}
                    y={-6}
                    width={b.w + 12}
                    height={b.h + 12}
                    fill="transparent"
                    onPointerDown={(e) => onBedPointerDown(e, b.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(b.id);
                    }}
                  />
                  {/* hout */}
                  <rect x={0} y={0} width={b.w} height={b.h} rx={6} ry={6} fill={woodFill} stroke="#6f5337" strokeWidth="1.2" />
                  {/* binnen */}
                  <rect x={border} y={border} width={innerW} height={innerH} rx={4} ry={4} fill={innerFill} stroke={innerStroke} strokeWidth={1} />
                  {/* segmentlijnen */}
                  {lines.map((ln, i) => (
                    <line key={i} {...ln} stroke={b.is_greenhouse ? "#3aa2c855" : "#ffffff55"} strokeWidth={1.2} />
                  ))}

                  {/* selectie ring subtiel */}
                  {selectedId === b.id && (
                    <rect
                      x={-3}
                      y={-3}
                      width={b.w + 6}
                      height={b.h + 6}
                      rx={8}
                      ry={8}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                  )}

                  {/* naam op hover */}
                  <title>{b.name}</title>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Hint overlay rechts-onder */}
      <div className="absolute right-3 bottom-3 z-20 text-[11px] bg-white/85 backdrop-blur rounded-md shadow px-2 py-1 border">
        <div className="flex gap-3">
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Spatie</kbd> + slepen = pannen</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Ctrl/⌘</kbd> + scroll = zoomen</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Alt</kbd> = zonder snap</span>
        </div>
      </div>
    </div>
  );
}

/* ===== Utils ===== */
function toolBtn(active = false) {
  return cn(
    "p-1.5 rounded-md border text-foreground/80 hover:bg-muted transition-colors",
    active && "bg-muted"
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function getBounds(beds: { x: number; y: number; w: number; h: number }[]) {
  if (!beds.length) return { x: 0, y: 0, w: 100, h: 100 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const b of beds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
