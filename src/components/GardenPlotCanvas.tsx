import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import {
  Copy,
  Edit3,
  Maximize,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  TreeDeciduous,
  TreePine,
  Warehouse,
  ZoomIn,
  ZoomOut,
  Rows3,
  Flower2,
  Ruler,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

// --- Types ---
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path" | "pond";

type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  /** Called when the user *drops* a bed (commit). */
  onBedMove: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  onBedEdit?: (bed: GardenBed) => void;
  storagePrefix?: string;
}

// --- Constants ---
const SCALE_FACTOR = 0.5; // cm -> px
const DEFAULT_BED_HEIGHT_CM = 25;
const MIN_TILT = 0;
const MAX_TILT = 80;

// --- Helpers ---
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const snap = (n: number, step = 10) => Math.round(n / step) * step;
const cmToPx = (cm: number) => cm * SCALE_FACTOR;
const pxToCm = (px: number) => px / SCALE_FACTOR;

function hslVar(name: string) {
  return `hsl(var(${name}))`;
}

function skyGradient(isDay: boolean) {
  return isDay
    ? `linear-gradient(180deg, ${hslVar("--scene-sky-day-top")} 0%, ${hslVar("--scene-sky-day-mid")} 50%, ${hslVar("--scene-sky-day-bottom")} 100%)`
    : `linear-gradient(180deg, ${hslVar("--scene-sky-night-top")} 0%, ${hslVar("--scene-sky-night-mid")} 50%, ${hslVar("--scene-sky-night-bottom")} 100%)`;
}

function toNumber(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// --- Main ---
export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  onBedEdit,
  storagePrefix = "gardenPlot",
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [pan, setPan] = useState({ x: 0, y: 0 }); // px (screen space)
  const [zoom, setZoom] = useState(1);
  const [rotZ, setRotZ] = useState(0); // degrees
  const [tilt, setTilt] = useState(55); // degrees
  const [isDayMode, setIsDayMode] = useState(true);

  // Objects
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    try {
      const stored = localStorage.getItem(`${storagePrefix}:objects`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Draft positions for beds while dragging (smooth preview, no DB calls)
  const [bedDraft, setBedDraft] = useState<Record<string, { x: number; y: number }>>({});

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Interaction tracking
  const hasInteractedRef = useRef(false);

  // Drag engine refs
  const dragRef = useRef<
    | null
    | {
        kind: "bed" | "object" | "pan" | "rotate";
        id?: string;
        startClient: { x: number; y: number };
        startPan?: { x: number; y: number };
        startRot?: { rotZ: number; tilt: number };
        startItem?: { x: number; y: number };
        moved: boolean;
      }
  >(null);

  // rAF batching for bed drag
  const rafRef = useRef<number | null>(null);
  const pendingBedMoveRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const scheduleBedDraftUpdate = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const p = pendingBedMoveRef.current;
      if (!p) return;
      setBedDraft((prev) => ({ ...prev, [p.id]: { x: p.x, y: p.y } }));
    });
  }, []);

  // Persist objects
  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:objects`, JSON.stringify(objects));
  }, [objects, storagePrefix]);

  // Cleanup rAF
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getBedPos = useCallback(
    (b: GardenBed) => {
      const draft = bedDraft[b.id];
      return {
        x: draft?.x ?? (b.location_x ?? 0),
        y: draft?.y ?? (b.location_y ?? 0),
      };
    },
    [bedDraft]
  );

  const allItemsForBounds = useMemo(() => {
    return [
      ...beds.map((b) => {
        const pos = getBedPos(b);
        return { x: pos.x, y: pos.y, w: b.width_cm, h: b.length_cm };
      }),
      ...objects.map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
    ];
  }, [beds, objects, getBedPos]);

  const fitToView = useCallback(
    (opts?: { force?: boolean }) => {
      if (!containerRef.current) return;
      if (hasInteractedRef.current && !opts?.force) return;

      const screenW = containerRef.current.clientWidth;
      const screenH = containerRef.current.clientHeight;

      if (allItemsForBounds.length === 0) {
        setPan({ x: 0, y: 0 });
        setZoom(1);
        return;
      }

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      for (const item of allItemsForBounds) {
        const px = cmToPx(item.x);
        const py = cmToPx(item.y);
        const pw = cmToPx(item.w);
        const ph = cmToPx(item.h);
        minX = Math.min(minX, px - pw / 2);
        maxX = Math.max(maxX, px + pw / 2);
        minY = Math.min(minY, py - ph / 2);
        maxY = Math.max(maxY, py + ph / 2);
      }

      // Minimal, adaptive padding
      const pad = clamp(Math.min(screenW, screenH) * 0.08, 36, 96);
      const contentW = maxX - minX + pad * 2;
      const contentH = maxY - minY + pad * 2;

      // With tilt, the projected height shrinks; compensate a bit.
      const tiltFactor = 1 - (clamp(tilt, 0, 70) / 70) * 0.28;

      const nextZoom = clamp(
        Math.min((screenW - pad * 2) / contentW, ((screenH - pad * 2) / contentH) * tiltFactor, 2.2),
        0.25,
        2.5
      );

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      setZoom(nextZoom);
      // translate is applied after scale in our transform chain -> multiply by zoom
      setPan({ x: -centerX * nextZoom, y: -centerY * nextZoom });
    },
    [allItemsForBounds, tilt]
  );

  // Auto-fit on first load / data changes (but not after user interacts)
  useEffect(() => {
    const t = setTimeout(() => fitToView(), 60);
    return () => clearTimeout(t);
  }, [beds.length, objects.length, fitToView]);

  // Fit on resize (only if user hasn't interacted)
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => fitToView());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToView]);

  // Remove draft entries when parent catches up
  useEffect(() => {
    setBedDraft((prev) => {
      const next = { ...prev };
      for (const b of beds) {
        const d = prev[b.id];
        if (!d) continue;
        const bx = b.location_x ?? 0;
        const by = b.location_y ?? 0;
        if (Math.abs(bx - d.x) < 0.5 && Math.abs(by - d.y) < 0.5) {
          delete next[b.id];
        }
      }
      return next;
    });
  }, [beds]);

  const selectedBed = useMemo(() => beds.find((b) => b.id === selectedId) ?? null, [beds, selectedId]);
  const selectedObject = useMemo(() => objects.find((o) => o.id === selectedId) ?? null, [objects, selectedId]);

  const startDragBed = useCallback(
    (e: React.PointerEvent, bed: GardenBed) => {
      e.preventDefault();
      e.stopPropagation();
      hasInteractedRef.current = true;

      const container = containerRef.current;
      container?.setPointerCapture(e.pointerId);

      const pos = getBedPos(bed);
      dragRef.current = {
        kind: "bed",
        id: bed.id,
        startClient: { x: e.clientX, y: e.clientY },
        startItem: { x: pos.x, y: pos.y },
        moved: false,
      };

      setSelectedId(bed.id);
    },
    [getBedPos]
  );

  const startDragObject = useCallback((e: React.PointerEvent, obj: PlotObject) => {
    e.preventDefault();
    e.stopPropagation();
    hasInteractedRef.current = true;

    const container = containerRef.current;
    container?.setPointerCapture(e.pointerId);

    dragRef.current = {
      kind: "object",
      id: obj.id,
      startClient: { x: e.clientX, y: e.clientY },
      startItem: { x: obj.x, y: obj.y },
      moved: false,
    };

    setSelectedId(obj.id);
  }, []);

  const startPan = useCallback((e: React.PointerEvent) => {
    hasInteractedRef.current = true;
    const container = containerRef.current;
    container?.setPointerCapture(e.pointerId);

    dragRef.current = {
      kind: "pan",
      startClient: { x: e.clientX, y: e.clientY },
      startPan: { x: pan.x, y: pan.y },
      moved: false,
    };

    setSelectedId(null);
  }, [pan.x, pan.y]);

  const startRotate = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    hasInteractedRef.current = true;
    const container = containerRef.current;
    container?.setPointerCapture(e.pointerId);

    dragRef.current = {
      kind: "rotate",
      startClient: { x: e.clientX, y: e.clientY },
      startRot: { rotZ, tilt },
      moved: false,
    };
  }, [rotZ, tilt]);

  const handlePointerDownCanvas = useCallback(
    (e: React.PointerEvent) => {
      // Right mouse = rotate
      if (e.button === 2) return startRotate(e);
      if (e.button !== 0) return;

      // Left mouse on empty space = pan
      startPan(e);
    },
    [startPan, startRotate]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const dx = e.clientX - d.startClient.x;
      const dy = e.clientY - d.startClient.y;

      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;

      if (d.kind === "pan" && d.startPan) {
        setPan({ x: d.startPan.x + dx, y: d.startPan.y + dy });
        return;
      }

      if (d.kind === "rotate" && d.startRot) {
        setRotZ(d.startRot.rotZ + dx * 0.25);
        setTilt(clamp(d.startRot.tilt - dy * 0.25, MIN_TILT, MAX_TILT));
        return;
      }

      if (!d.startItem || !d.id) return;

      // Screen -> world, account for Z-rotation
      const a = (-rotZ * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);

      const localDxPx = (dx * cos - dy * sin) / zoom;
      const localDyPx = (dx * sin + dy * cos) / zoom;

      const worldDx = pxToCm(localDxPx);
      const worldDy = pxToCm(localDyPx);

      const nextX = snap(d.startItem.x + worldDx, 10);
      const nextY = snap(d.startItem.y + worldDy, 10);

      if (d.kind === "bed") {
        pendingBedMoveRef.current = { id: d.id, x: nextX, y: nextY };
        scheduleBedDraftUpdate();
        return;
      }

      if (d.kind === "object") {
        setObjects((prev) => prev.map((o) => (o.id === d.id ? { ...o, x: nextX, y: nextY } : o)));
      }
    },
    [rotZ, zoom, scheduleBedDraftUpdate]
  );

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;

    if (d?.kind === "bed" && d.id && d.moved) {
      const draft = pendingBedMoveRef.current;
      const finalPos = draft?.id === d.id ? draft : bedDraft[d.id] ? { id: d.id, ...bedDraft[d.id] } : null;
      if (finalPos) {
        onBedMove(d.id as UUID, Math.round(finalPos.x), Math.round(finalPos.y));
      }
    }
  }, [bedDraft, onBedMove]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      hasInteractedRef.current = true;

      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom((z) => clamp(z * delta, 0.25, 3));
        return;
      }

      // scroll pans by default
      setPan((p) => ({ x: p.x - e.deltaX * 0.6, y: p.y - e.deltaY * 0.6 }));
    },
    []
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const spawnObject = useCallback(
    (type: PlotObjectType) => {
      hasInteractedRef.current = true;

      const sizes: Record<PlotObjectType, { w: number; h: number }> = {
        greenhouse: { w: 400, h: 300 },
        grass: { w: 200, h: 200 },
        shrub: { w: 60, h: 60 },
        gravel: { w: 150, h: 100 },
        tree: { w: 80, h: 80 },
        path: { w: 300, h: 60 },
        pond: { w: 150, h: 100 },
      };

      const center = beds.length
        ? beds.reduce(
            (acc, b) => {
              const pos = getBedPos(b);
              return { x: acc.x + pos.x, y: acc.y + pos.y };
            },
            { x: 0, y: 0 }
          )
        : { x: 0, y: 0 };

      const cx = beds.length ? center.x / beds.length : 0;
      const cy = beds.length ? center.y / beds.length : 0;

      const offset = objects.filter((o) => o.type === type).length * 60;
      const size = sizes[type];

      const obj: PlotObject = {
        id: crypto.randomUUID(),
        type,
        x: snap(cx + offset - 250, 10),
        y: snap(cy + offset - 150, 10),
        w: size.w,
        h: size.h,
      };

      setObjects((p) => [...p, obj]);
      setSelectedId(obj.id);
      toast.success("Object toegevoegd");
    },
    [beds, objects, getBedPos]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const isObject = objects.some((o) => o.id === selectedId);
    if (!isObject) return;
    setObjects((p) => p.filter((o) => o.id !== selectedId));
    setSelectedId(null);
    toast.success("Object verwijderd");
  }, [objects, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;

    const bed = beds.find((b) => b.id === selectedId);
    if (bed && onBedDuplicate) return onBedDuplicate(bed);

    const obj = objects.find((o) => o.id === selectedId);
    if (!obj) return;

    const clone: PlotObject = {
      ...obj,
      id: crypto.randomUUID(),
      x: obj.x + 50,
      y: obj.y + 50,
    };
    setObjects((p) => [...p, clone]);
    setSelectedId(clone.id);
    toast.success("Object gedupliceerd");
  }, [beds, objects, onBedDuplicate, selectedId]);

  const resetView = useCallback(() => {
    hasInteractedRef.current = false;
    setRotZ(0);
    setTilt(55);
    fitToView({ force: true });
  }, [fitToView]);

  const setTopView = useCallback(() => {
    hasInteractedRef.current = true;
    setTilt(0);
  }, []);

  const setIsoView = useCallback(() => {
    hasInteractedRef.current = true;
    setTilt(55);
  }, []);

  // Sorted render list
  const renderList = useMemo(() => {
    const list: Array<
      | { kind: "bed"; id: string; bed: GardenBed; x: number; y: number; w: number; h: number }
      | { kind: "obj"; id: string; obj: PlotObject; x: number; y: number; w: number; h: number }
    > = [];

    for (const b of beds) {
      const pos = getBedPos(b);
      list.push({ kind: "bed", id: b.id, bed: b, x: pos.x, y: pos.y, w: b.width_cm, h: b.length_cm });
    }

    for (const o of objects) {
      list.push({ kind: "obj", id: o.id, obj: o, x: o.x, y: o.y, w: o.w, h: o.h });
    }

    return list.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  }, [beds, objects, getBedPos]);

  const scene = useMemo(() => {
    const day = isDayMode;
    return {
      sky: skyGradient(day),
      grass: day ? hslVar("--scene-grass-day") : hslVar("--scene-grass-night"),
      grass2: day ? hslVar("--scene-grass-day-2") : hslVar("--scene-grass-night-2"),
      soil: day ? hslVar("--scene-soil-day") : hslVar("--scene-soil-night"),
      wood: day ? hslVar("--scene-wood-day") : hslVar("--scene-wood-night"),
      wood2: day ? hslVar("--scene-wood-day-2") : hslVar("--scene-wood-night-2"),
      wood3: day ? hslVar("--scene-wood-day-3") : hslVar("--scene-wood-night-3"),
      stone: day ? hslVar("--scene-stone-day") : hslVar("--scene-stone-night"),
      water1: day ? hslVar("--scene-water-day-1") : hslVar("--scene-water-night-1"),
      water2: day ? hslVar("--scene-water-day-2") : hslVar("--scene-water-night-2"),
      glass: day ? hslVar("--scene-glass-day") : hslVar("--scene-glass-night"),
    };
  }, [isDayMode]);

  // Object inspector helpers
  const updateSelectedObject = useCallback((patch: Partial<PlotObject>) => {
    if (!selectedObject) return;
    setObjects((prev) => prev.map((o) => (o.id === selectedObject.id ? { ...o, ...patch } : o)));
  }, [selectedObject]);

  return (
    <div className="relative w-full h-[700px] rounded-xl overflow-hidden shadow-2xl border border-border/50">
      {/* Sky */}
      <div className="absolute inset-0 transition-all duration-700" style={{ background: scene.sky }} />

      {/* Sun / Moon */}
      <div className={cn("absolute top-8 transition-all duration-700 z-10", isDayMode ? "right-12" : "right-20")}>
        {isDayMode ? (
          <div
            className="w-16 h-16 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${hslVar("--scene-sun-1")} 0%, ${hslVar("--scene-sun-2")} 60%, ${hslVar("--scene-sun-3")} 100%)`,
              boxShadow: `0 0 60px 18px ${hslVar("--scene-sun-glow")} / 0.35`,
            }}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${hslVar("--scene-moon-1")} 0%, ${hslVar("--scene-moon-2")} 100%)`,
              boxShadow: `0 0 40px 12px ${hslVar("--scene-moon-glow")} / 0.18`,
            }}
          />
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn("absolute inset-0 overflow-hidden", dragRef.current?.kind === "pan" && "cursor-grabbing")}
        style={{ perspective: "1200px", perspectiveOrigin: "50% 40%" }}
        onPointerDown={handlePointerDownCanvas}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        {/* World */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: 0,
            height: 0,
            transformStyle: "preserve-3d",
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotateX(${tilt}deg) rotateZ(${rotZ}deg) scale(${zoom})`,
            transition: dragRef.current ? "none" : "transform 200ms cubic-bezier(0.2, 0.9, 0.2, 1)",
          }}
        >
          {/* Ground */}
          <div
            className="absolute"
            style={{
              width: "5200px",
              height: "5200px",
              left: "-2600px",
              top: "-2600px",
              transform: "translateZ(0px)",
              background: `radial-gradient(circle at 50% 50%, ${scene.grass2} 0%, ${scene.grass} 100%)`,
            }}
          >
            {/* Subtle texture */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `radial-gradient(circle at 20% 30%, ${scene.grass} / 0.25 1px, transparent 1px), radial-gradient(circle at 60% 70%, ${scene.grass} / 0.18 1px, transparent 1px)`
                  .replaceAll(" / ", "/"),
                backgroundSize: "34px 34px",
              }}
            />
            {/* Grid */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `linear-gradient(${hslVar("--border")} / 0.25 1px, transparent 1px), linear-gradient(90deg, ${hslVar("--border")} / 0.25 1px, transparent 1px)`
                  .replaceAll(" / ", "/"),
                backgroundSize: `${cmToPx(100)}px ${cmToPx(100)}px`,
              }}
            />
          </div>

          {/* Items */}
          {renderList.map((it) => {
            const isSelected = selectedId === it.id;
            const left = cmToPx(it.x) - cmToPx(it.w) / 2;
            const top = cmToPx(it.y) - cmToPx(it.h) / 2;
            const w = cmToPx(it.w);
            const h = cmToPx(it.h);

            if (it.kind === "bed") {
              const bed = it.bed;
              const bedHeightPx = cmToPx(DEFAULT_BED_HEIGHT_CM);

              return (
                <div
                  key={it.id}
                  className={cn("absolute select-none", "cursor-grab active:cursor-grabbing")}
                  style={{ left, top, width: w, height: h, transformStyle: "preserve-3d" }}
                  onPointerDown={(e) => startDragBed(e, bed)}
                  onDoubleClick={() => onBedEdit?.(bed)}
                >
                  {/* Base on ground */}
                  <div className="absolute inset-0 rounded-lg" style={{ background: scene.wood3, transform: "translateZ(0px)" }} />

                  {/* Side */}
                  <div
                    className="absolute left-0 right-0"
                    style={{
                      height: bedHeightPx,
                      bottom: 0,
                      background: `linear-gradient(180deg, ${scene.wood2} 0%, ${scene.wood} 100%)`,
                      transform: "rotateX(-90deg)",
                      transformOrigin: "bottom",
                      borderRadius: "0 0 8px 8px",
                    }}
                  />

                  {/* Top */}
                  <div
                    className={cn("absolute inset-0 rounded-lg transition-all duration-150", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: `translateZ(${bedHeightPx}px)`,
                      background: `linear-gradient(135deg, ${scene.wood2} 0%, ${scene.wood} 100%)`,
                      boxShadow: `0 10px 30px -16px ${hslVar("--foreground")} / 0.35`.replaceAll(" / ", "/"),
                    }}
                  >
                    {/* Soil */}
                    <div
                      className="absolute rounded"
                      style={{
                        left: 6,
                        top: 6,
                        right: 6,
                        bottom: 6,
                        background: `radial-gradient(circle at 30% 30%, ${scene.soil} / 0.85 0%, ${scene.soil} 100%)`.replaceAll(" / ", "/"),
                        boxShadow: `inset 0 2px 10px ${hslVar("--foreground")} / 0.35`.replaceAll(" / ", "/"),
                      }}
                    />

                    {/* Label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span
                        className="font-semibold text-center"
                        style={{
                          color: hslVar("--primary-foreground"),
                          fontSize: clamp(Math.min(w, h) / 5, 10, 18),
                          textShadow: `0 2px 10px ${hslVar("--foreground")} / 0.5`.replaceAll(" / ", "/"),
                          paddingInline: 8,
                        }}
                      >
                        {bed.name}
                      </span>
                    </div>

                    {/* Hint */}
                    <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity">
                      <div
                        className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1"
                        style={{ background: `${hslVar("--foreground")} / 0.35`.replaceAll(" / ", "/"), color: hslVar("--primary-foreground") }}
                      >
                        <Edit3 className="h-3 w-3" />
                        Dubbelklik
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Object
            const obj = it.obj;
            return (
              <div
                key={it.id}
                className={cn("absolute select-none", "cursor-grab active:cursor-grabbing")}
                style={{ left, top, width: w, height: h, transformStyle: "preserve-3d" }}
                onPointerDown={(e) => startDragObject(e, obj)}
              >
                {obj.type === "greenhouse" && (
                  <div
                    className={cn("absolute inset-0 rounded-lg transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: `translateZ(${cmToPx(140)}px)`,
                      background: `linear-gradient(135deg, ${scene.glass} / 0.75 0%, ${scene.glass} / 0.45 100%)`.replaceAll(" / ", "/"),
                      border: `3px solid ${hslVar("--border")}`,
                      boxShadow: `0 16px 30px -18px ${hslVar("--foreground")} / 0.45`.replaceAll(" / ", "/"),
                    }}
                  />
                )}

                {obj.type === "path" && (
                  <div
                    className={cn("absolute inset-0 rounded-md transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(1px)",
                      background: `linear-gradient(135deg, ${scene.stone} / 0.95 0%, ${scene.stone} / 0.75 100%)`.replaceAll(" / ", "/"),
                      boxShadow: `inset 0 2px 8px ${hslVar("--foreground")} / 0.2`.replaceAll(" / ", "/"),
                    }}
                  />
                )}

                {obj.type === "gravel" && (
                  <div
                    className={cn("absolute inset-0 rounded-md transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(1px)",
                      background: `linear-gradient(135deg, ${scene.stone} / 0.85 0%, ${scene.stone} / 0.65 100%)`.replaceAll(" / ", "/"),
                    }}
                  />
                )}

                {obj.type === "grass" && (
                  <div
                    className={cn("absolute inset-0 rounded-lg transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(1px)",
                      background: `radial-gradient(circle at 50% 50%, ${scene.grass2} 0%, ${scene.grass} 100%)`,
                    }}
                  />
                )}

                {obj.type === "shrub" && (
                  <div
                    className={cn("absolute inset-0 rounded-full transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: `translateZ(${cmToPx(30)}px)`,
                      background: `radial-gradient(circle at 30% 30%, ${scene.grass2} 0%, ${scene.grass} 70%, ${scene.grass} 100%)`,
                      boxShadow: `inset -6px -6px 16px ${hslVar("--foreground")} / 0.25`.replaceAll(" / ", "/"),
                    }}
                  />
                )}

                {obj.type === "tree" && (
                  <>
                    <div
                      className={cn("absolute inset-0 rounded-full transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        transform: `translateZ(${cmToPx(120)}px)`,
                        background: `radial-gradient(circle at 30% 30%, ${scene.grass2} 0%, ${scene.grass} 65%, ${scene.grass} 100%)`,
                        boxShadow: `0 18px 36px -22px ${hslVar("--foreground")} / 0.55`.replaceAll(" / ", "/"),
                      }}
                    />
                  </>
                )}

                {obj.type === "pond" && (
                  <div
                    className={cn("absolute inset-0 rounded-[40%] transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(-2px)",
                      background: `linear-gradient(180deg, ${scene.water1} 0%, ${scene.water2} 100%)`,
                      boxShadow: `inset 0 0 24px ${hslVar("--primary-foreground")} / 0.18`.replaceAll(" / ", "/"),
                    }}
                  >
                    <div
                      className="absolute top-2 left-2 w-1/3 h-1/3 rounded-full"
                      style={{ background: `${hslVar("--primary-foreground")} / 0.25`.replaceAll(" / ", "/") }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
        <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => clamp(z * 1.25, 0.25, 3))} className="h-9 w-9 p-0 rounded-full">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom((z) => clamp(z * 0.8, 0.25, 3))} className="h-9 w-9 p-0 rounded-full">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={resetView} className="h-9 w-9 p-0 rounded-full" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fitToView({ force: true })} className="h-9 w-9 p-0 rounded-full" title="Fit">
            <Maximize className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant={isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(true)} className="h-9 w-9 p-0 rounded-full" title="Dag">
            <Sun className="h-4 w-4" />
          </Button>
          <Button variant={!isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(false)} className="h-9 w-9 p-0 rounded-full" title="Nacht">
            <Moon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <span className="text-xs font-medium text-muted-foreground">Hoek</span>
          <Slider value={[tilt]} onValueChange={([v]) => setTilt(v)} min={0} max={80} step={1} className="w-28" />
          <span className="text-xs text-muted-foreground w-9 tabular-nums">{Math.round(tilt)}°</span>
          <div className="w-px h-6 bg-border" />
          <Button variant="ghost" size="sm" onClick={setTopView} className="h-8 px-3 rounded-full text-xs">
            Top
          </Button>
          <Button variant="ghost" size="sm" onClick={setIsoView} className="h-8 px-3 rounded-full text-xs">
            3D
          </Button>
        </div>
      </div>

      {/* Bottom dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-3 z-20">
        <div className="flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-border/50">
          <span className="text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider">Toevoegen</span>
          <ObjectButton icon={Warehouse} label="Kas" onClick={() => spawnObject("greenhouse")} />
          <ObjectButton icon={TreePine} label="Boom" onClick={() => spawnObject("tree")} />
          <ObjectButton icon={Flower2} label="Struik" onClick={() => spawnObject("shrub")} />
          <ObjectButton icon={TreeDeciduous} label="Gras" onClick={() => spawnObject("grass")} />
          <ObjectButton icon={Rows3} label="Pad" onClick={() => spawnObject("path")} />
          <ObjectButton icon={Ruler} label="Grind" onClick={() => spawnObject("gravel")} />
        </div>

        {selectedId && (
          <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-2xl shadow-xl animate-in slide-in-from-bottom-3">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70 mr-2">
              {selectedBed ? "Bak" : "Object"}
            </span>
            {selectedBed && onBedEdit && (
              <Button variant="ghost" size="sm" onClick={() => onBedEdit(selectedBed)} className="h-9 w-9 p-0 rounded-lg hover:bg-primary-foreground/20" title="Bewerken">
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={duplicateSelected} className="h-9 w-9 p-0 rounded-lg hover:bg-primary-foreground/20" title="Dupliceren">
              <Copy className="h-4 w-4" />
            </Button>
            {!selectedBed && (
              <Button variant="ghost" size="sm" onClick={deleteSelected} className="h-9 w-9 p-0 rounded-lg hover:bg-destructive" title="Verwijderen">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Object inspector */}
      {selectedObject && (
        <div className="absolute bottom-4 left-4 z-20 w-[280px] bg-background/90 backdrop-blur-md border border-border/50 rounded-xl shadow-xl p-4 animate-enter">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground">Geselecteerd</div>
              <div className="font-semibold text-sm">{labelForObject(selectedObject.type)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Breedte (cm)</label>
              <Input
                type="number"
                value={selectedObject.w}
                onChange={(e) => updateSelectedObject({ w: Math.max(10, toNumber(e.target.value)) })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lengte (cm)</label>
              <Input
                type="number"
                value={selectedObject.h}
                onChange={(e) => updateSelectedObject({ h: Math.max(10, toNumber(e.target.value)) })}
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Tip: versleep object om te positioneren; pas afmetingen aan voor kas/paden.
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 text-xs text-primary-foreground bg-foreground/40 backdrop-blur-sm px-3 py-2 rounded-lg z-10">
        <div className="flex flex-col gap-0.5">
          <span>Sleep item = verplaatsen</span>
          <span>Sleep lege ruimte = pannen</span>
          <span>Rechtermuisknop + sleep = draaien</span>
          <span>Ctrl/⌘ + scroll = zoomen</span>
        </div>
      </div>

      {/* Counter */}
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-border/50 z-20">
        <span className="text-sm font-semibold">{beds.length} {beds.length === 1 ? "bak" : "bakken"}</span>
      </div>
    </div>
  );
}

function labelForObject(t: PlotObjectType) {
  switch (t) {
    case "greenhouse":
      return "Kas";
    case "grass":
      return "Gras";
    case "shrub":
      return "Struik";
    case "gravel":
      return "Grind";
    case "tree":
      return "Boom";
    case "path":
      return "Pad";
    case "pond":
      return "Vijver";
  }
}

function ObjectButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1 px-2 py-1 transition-transform duration-200 hover:-translate-y-1">
      <div className="p-2.5 rounded-xl bg-muted/50 border border-border/50 transition-all duration-200 group-hover:bg-accent group-hover:border-accent group-hover:shadow-lg">
        <Icon className="h-5 w-5 text-foreground" />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  );
}
