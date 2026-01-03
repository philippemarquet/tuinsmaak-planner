import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import {
  Copy,
  Edit3,
  Grid3x3,
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
  Footprints,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

// Lazy load the 3D walk mode component
const GardenWalkMode3D = lazy(() => import("./GardenWalkMode3D").then(m => ({ default: m.GardenWalkMode3D })));

// --- Types ---
export type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path" | "woodchips" | "tiles";

export type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  zIndex?: number; // higher = on top; beds always render on top of all objects
};

interface PlantingOverlay {
  id: string;
  bedId: string;
  startSegment: number;
  segmentsUsed: number;
  color: string;
  iconUrl?: string | null;
  label?: string;
  cropType?: string;
}

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  /** Called when the user *drops* a bed (commit). */
  onBedMove?: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  onBedEdit?: (bed: GardenBed) => void;
  storagePrefix?: string;
  /** If true, hides add/edit controls - just viewing */
  readOnly?: boolean;
  /** Plantings to overlay on beds */
  plantings?: PlantingOverlay[];
  /** Plot objects (kas, pad, boom, etc.) from database */
  plotObjects?: PlotObject[];
  /** Callbacks for plot object CRUD operations */
  onObjectCreate?: (type: PlotObjectType, x: number, y: number, w: number, h: number, zIndex: number) => Promise<PlotObject | void>;
  onObjectUpdate?: (id: string, patch: Partial<PlotObject>) => Promise<void>;
  onObjectDelete?: (id: string) => Promise<void>;
}

// --- Constants ---
const SCALE_FACTOR = 0.5; // cm -> px
const DEFAULT_BED_HEIGHT_CM = 25;
const MIN_TILT = 0;
const MAX_TILT = 80;
const GRID_SIZE_CM = 50; // 50cm grid

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
// Shared storage key for objects across all canvas instances
const SHARED_OBJECTS_KEY = "gardenPlotObjects";

// Migration: merge old localStorage keys into shared key (run once)
function migrateObjectsStorage(): PlotObject[] {
  const legacyKeys = ["bedsLayout:objects", "plannerMap:objects", "gardenPlot:objects"];
  const migrated = localStorage.getItem("gardenPlotObjectsMigrated");
  
  if (migrated) {
    // Already migrated, just return current
    try {
      const stored = localStorage.getItem(SHARED_OBJECTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
  
  // Merge all legacy keys
  const merged = new Map<string, PlotObject>();
  for (const key of legacyKeys) {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const arr: PlotObject[] = JSON.parse(data);
        for (const obj of arr) {
          // Use type+position as dedup key
          const dedupKey = `${obj.type}-${Math.round(obj.x)}-${Math.round(obj.y)}`;
          if (!merged.has(dedupKey)) {
            merged.set(dedupKey, obj);
          }
        }
      }
    } catch {}
  }
  
  const result = Array.from(merged.values());
  localStorage.setItem(SHARED_OBJECTS_KEY, JSON.stringify(result));
  localStorage.setItem("gardenPlotObjectsMigrated", "1");
  
  // Cleanup old keys
  for (const key of legacyKeys) {
    localStorage.removeItem(key);
  }
  
  return result;
}

export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  onBedEdit,
  storagePrefix = "gardenPlot",
  readOnly = false,
  plantings: plantingsOverlay = [],
  plotObjects: externalObjects,
  onObjectCreate,
  onObjectUpdate,
  onObjectDelete,
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [pan, setPan] = useState({ x: 0, y: 0 }); // px (screen space)
  const [zoom, setZoom] = useState(1);
  const [rotZ, setRotZ] = useState(0); // degrees
  const [tilt, setTilt] = useState(0); // degrees - start in top view
  const [isDayMode, setIsDayMode] = useState(true);
  const [gridSnap, setGridSnap] = useState(true); // grid snap on by default

  // Walk mode state
  const [walkMode, setWalkMode] = useState(false);
  const [walkPos, setWalkPos] = useState({ x: 0, y: 0 }); // position in cm
  const [walkDir, setWalkDir] = useState(0); // direction in degrees (0 = looking "up"/north)

  // Objects - prefer external (Supabase), fallback to localStorage for migration
  const [localObjects, setLocalObjects] = useState<PlotObject[]>(() => migrateObjectsStorage());
  
  // Use external objects if provided, otherwise fallback to local (for backwards compat during migration)
  const objects = externalObjects ?? localObjects;
  const setObjects = externalObjects ? (() => {}) as any : setLocalObjects; // Disable local setter when using external

  // Draft positions for beds while dragging (smooth preview, no DB calls)

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

  // Persist objects to shared storage (only when using local state, not external)
  useEffect(() => {
    if (!externalObjects) {
      localStorage.setItem(SHARED_OBJECTS_KEY, JSON.stringify(localObjects));
    }
  }, [localObjects, externalObjects]);

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

  const snapValue = useCallback((v: number) => {
    return gridSnap ? snap(v, GRID_SIZE_CM) : snap(v, 10);
  }, [gridSnap]);

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

      const nextX = snapValue(d.startItem.x + worldDx);
      const nextY = snapValue(d.startItem.y + worldDy);

      if (d.kind === "bed") {
        pendingBedMoveRef.current = { id: d.id, x: nextX, y: nextY };
        scheduleBedDraftUpdate();
        return;
      }

      if (d.kind === "object") {
        // Update local state for visual feedback during drag
        if (externalObjects) {
          // We need a local draft for external objects too during drag
          pendingObjectMoveRef.current = { id: d.id, x: nextX, y: nextY };
        } else {
          setLocalObjects((prev) => prev.map((o) => (o.id === d.id ? { ...o, x: nextX, y: nextY } : o)));
        }
      }
    },
    [rotZ, zoom, scheduleBedDraftUpdate, snapValue]
  );

  // Track object drag state for commit on pointer up
  const pendingObjectMoveRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const handlePointerUp = useCallback(async () => {
    const d = dragRef.current;
    dragRef.current = null;

    if (d?.kind === "bed" && d.id && d.moved && onBedMove) {
      const draft = pendingBedMoveRef.current;
      const finalPos = draft?.id === d.id ? draft : bedDraft[d.id] ? { id: d.id, ...bedDraft[d.id] } : null;
      if (finalPos) {
        onBedMove(d.id as UUID, Math.round(finalPos.x), Math.round(finalPos.y));
      }
    }

    // Commit object move to database if using external callbacks
    if (d?.kind === "object" && d.id && d.moved && onObjectUpdate) {
      const objPos = pendingObjectMoveRef.current;
      if (objPos && objPos.id === d.id) {
        try {
          await onObjectUpdate(d.id, { x: Math.round(objPos.x), y: Math.round(objPos.y) });
        } catch (e: any) {
          toast.error("Kon positie niet opslaan: " + (e.message ?? String(e)));
        }
      }
      pendingObjectMoveRef.current = null;
    }
  }, [bedDraft, onBedMove, onObjectUpdate]);

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
    async (type: PlotObjectType) => {
      hasInteractedRef.current = true;

      const sizes: Record<PlotObjectType, { w: number; h: number }> = {
        greenhouse: { w: 400, h: 300 },
        grass: { w: 200, h: 200 },
        shrub: { w: 80, h: 80 },
        gravel: { w: 150, h: 100 },
        tree: { w: 100, h: 100 },
        path: { w: 300, h: 60 },
        woodchips: { w: 150, h: 100 },
        tiles: { w: 200, h: 150 },
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

      // New objects get the highest zIndex so they appear on top
      const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex ?? 0), 0);
      const x = snapValue(cx + offset - 250);
      const y = snapValue(cy + offset - 150);
      const zIndex = maxZ + 1;

      // Use external callback if provided (Supabase), otherwise local state
      if (onObjectCreate) {
        try {
          const created = await onObjectCreate(type, x, y, size.w, size.h, zIndex);
          if (created) {
            setSelectedId(created.id);
          }
          toast.success("Object toegevoegd");
        } catch (e: any) {
          toast.error("Kon object niet opslaan: " + (e.message ?? String(e)));
        }
      } else {
        const obj: PlotObject = {
          id: crypto.randomUUID(),
          type,
          x,
          y,
          w: size.w,
          h: size.h,
          zIndex,
        };
        setLocalObjects((p) => [...p, obj]);
        setSelectedId(obj.id);
        toast.success("Object toegevoegd");
      }
    },
    [beds, objects, getBedPos, snapValue, onObjectCreate]
  );

  const deleteSelected = useCallback(async () => {
    if (!selectedId) return;
    const isObject = objects.some((o) => o.id === selectedId);
    if (!isObject) return;
    
    if (onObjectDelete) {
      try {
        await onObjectDelete(selectedId);
        setSelectedId(null);
        toast.success("Object verwijderd");
      } catch (e: any) {
        toast.error("Kon object niet verwijderen: " + (e.message ?? String(e)));
      }
    } else {
      setLocalObjects((p) => p.filter((o) => o.id !== selectedId));
      setSelectedId(null);
      toast.success("Object verwijderd");
    }
  }, [objects, selectedId, onObjectDelete]);

  const duplicateSelected = useCallback(async () => {
    if (!selectedId) return;

    const bed = beds.find((b) => b.id === selectedId);
    if (bed && onBedDuplicate) return onBedDuplicate(bed);

    const obj = objects.find((o) => o.id === selectedId);
    if (!obj) return;

    const maxZ = objects.reduce((max, o) => Math.max(max, o.zIndex ?? 0), 0);
    
    if (onObjectCreate) {
      try {
        const created = await onObjectCreate(
          obj.type as PlotObjectType,
          obj.x + 50,
          obj.y + 50,
          obj.w,
          obj.h,
          maxZ + 1
        );
        if (created) {
          setSelectedId(created.id);
        }
        toast.success("Object gedupliceerd");
      } catch (e: any) {
        toast.error("Kon object niet dupliceren: " + (e.message ?? String(e)));
      }
    } else {
      const clone: PlotObject = {
        ...obj,
        id: crypto.randomUUID(),
        x: obj.x + 50,
        y: obj.y + 50,
        zIndex: maxZ + 1,
      };
      setLocalObjects((p) => [...p, clone]);
      setSelectedId(clone.id);
      toast.success("Object gedupliceerd");
    }
  }, [beds, objects, onBedDuplicate, selectedId, onObjectCreate]);

  const resetView = useCallback(() => {
    hasInteractedRef.current = false;
    setRotZ(0);
    setTilt(55);
    fitToView({ force: true });
  }, [fitToView]);

  const setTopView = useCallback(() => {
    hasInteractedRef.current = true;
    setTilt(0);
    setWalkMode(false);
  }, []);

  const setIsoView = useCallback(() => {
    hasInteractedRef.current = true;
    setTilt(55);
    setWalkMode(false);
  }, []);

  // Walk mode helpers
  const enterWalkMode = useCallback(() => {
    hasInteractedRef.current = true;
    // Set initial walk position to center of all items
    const cx = allItemsForBounds.length
      ? allItemsForBounds.reduce((sum, it) => sum + it.x, 0) / allItemsForBounds.length
      : 0;
    const cy = allItemsForBounds.length
      ? allItemsForBounds.reduce((sum, it) => sum + it.y, 0) / allItemsForBounds.length
      : 0;
    // Start a bit south so we look towards the garden
    setWalkPos({ x: cx, y: cy + 300 });
    setWalkDir(0); // facing north
    setWalkMode(true);
  }, [allItemsForBounds]);

  const exitWalkMode = useCallback(() => {
    setWalkMode(false);
    fitToView({ force: true });
  }, [fitToView]);

  // Note: Walk mode keyboard controls are now handled in GardenWalkMode3D component

  // Sorted render list
  const renderList = useMemo(() => {
    const list: Array<
      | { kind: "bed"; id: string; bed: GardenBed; x: number; y: number; w: number; h: number; zIndex: number }
      | { kind: "obj"; id: string; obj: PlotObject; x: number; y: number; w: number; h: number; zIndex: number }
    > = [];

    // Objects get their zIndex (default 0 for old objects without zIndex)
    for (const o of objects) {
      list.push({ kind: "obj", id: o.id, obj: o, x: o.x, y: o.y, w: o.w, h: o.h, zIndex: o.zIndex ?? 0 });
    }

    // Beds always on top: give them a very high zIndex
    const maxObjZ = objects.reduce((max, o) => Math.max(max, o.zIndex ?? 0), 0);
    for (const b of beds) {
      const pos = getBedPos(b);
      list.push({ kind: "bed", id: b.id, bed: b, x: pos.x, y: pos.y, w: b.width_cm, h: b.length_cm, zIndex: maxObjZ + 1000 });
    }

    // Sort by zIndex first, then by Y position for depth within the same layer
    return list.sort((a, b) => {
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return (a.y + a.h / 2) - (b.y + b.h / 2);
    });
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
      bark: day ? "hsl(25, 45%, 25%)" : "hsl(25, 35%, 18%)",
      gravel: day ? "hsl(30, 8%, 55%)" : "hsl(30, 6%, 40%)",
    };
  }, [isDayMode]);

  // Object inspector helpers
  const updateSelectedObject = useCallback(async (patch: Partial<PlotObject>) => {
    if (!selectedObject) return;
    
    if (onObjectUpdate) {
      try {
        await onObjectUpdate(selectedObject.id, patch);
      } catch (e: any) {
        toast.error("Kon object niet bijwerken: " + (e.message ?? String(e)));
      }
    } else {
      setLocalObjects((prev) => prev.map((o) => (o.id === selectedObject.id ? { ...o, ...patch } : o)));
    }
  }, [selectedObject, onObjectUpdate]);

  // Grid visibility based on tilt (more visible in top view)
  const showGrid = gridSnap || tilt < 20;
  const gridSizePx = cmToPx(GRID_SIZE_CM);

  // Note: walkTransform is no longer needed - 3D rendering is handled by GardenWalkMode3D

  // Render 3D walk mode if active
  if (walkMode) {
    return (
      <div className="relative w-full h-[700px] rounded-xl overflow-hidden shadow-2xl border border-border/50">
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-muted-foreground">3D omgeving laden...</div>
          </div>
        }>
          <GardenWalkMode3D
            beds={beds}
            objects={objects}
            plantings={plantingsOverlay}
            isDayMode={isDayMode}
            initialPosition={walkPos}
            initialDirection={walkDir}
            onExit={exitWalkMode}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[700px] rounded-xl overflow-hidden shadow-2xl border border-border/50" tabIndex={0}>
      {/* Sky */}
      <div className="absolute inset-0 transition-all duration-700" style={{ background: scene.sky }} />
      <div className={cn("absolute top-8 transition-all duration-700 z-10", isDayMode ? "right-12" : "right-20")}>
        {isDayMode ? (
          <div
            className="w-16 h-16 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${hslVar("--scene-sun-1")} 0%, ${hslVar("--scene-sun-2")} 60%, ${hslVar("--scene-sun-3")} 100%)`,
              boxShadow: `0 0 60px 18px hsl(var(--scene-sun-glow) / 0.35)`,
            }}
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${hslVar("--scene-moon-1")} 0%, ${hslVar("--scene-moon-2")} 100%)`,
              boxShadow: `0 0 40px 12px hsl(var(--scene-moon-glow) / 0.18)`,
            }}
          />
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className={cn("absolute inset-0 overflow-hidden", dragRef.current?.kind === "pan" && "cursor-grabbing")}
        style={{
          perspective: "1200px",
          perspectiveOrigin: "50% 40%",
        }}
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
                backgroundImage: `radial-gradient(circle at 20% 30%, hsl(var(--scene-grass-day) / 0.25) 1px, transparent 1px), radial-gradient(circle at 60% 70%, hsl(var(--scene-grass-day) / 0.18) 1px, transparent 1px)`,
                backgroundSize: "34px 34px",
              }}
            />
            {/* Grid (more visible when snap enabled or in top view) */}
            <div
              className="absolute inset-0 transition-opacity duration-300"
              style={{
                opacity: showGrid ? 0.4 : 0.1,
                backgroundImage: `linear-gradient(hsl(var(--foreground) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.3) 1px, transparent 1px)`,
                backgroundSize: `${gridSizePx}px ${gridSizePx}px`,
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
              const segments = bed.segments || 1;
              // Segments haaks op lange zijde
              const isHorizontal = bed.width_cm > bed.length_cm;

              // Get plantings for this bed
              const bedPlantings = plantingsOverlay.filter(p => p.bedId === bed.id);

              return (
                <div
                  key={it.id}
                  className={cn("absolute select-none", !readOnly && "cursor-grab active:cursor-grabbing")}
                  style={{ left, top, width: w, height: h, transformStyle: "preserve-3d" }}
                  onPointerDown={readOnly ? undefined : (e) => startDragBed(e, bed)}
                  onDoubleClick={readOnly ? undefined : () => onBedEdit?.(bed)}
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
                    className={cn("absolute inset-0 rounded-lg transition-all duration-150", isSelected && !readOnly && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: `translateZ(${bedHeightPx}px)`,
                      background: `linear-gradient(135deg, ${scene.wood2} 0%, ${scene.wood} 100%)`,
                      boxShadow: `0 10px 30px -16px hsl(var(--foreground) / 0.35)`,
                    }}
                  >
                    {/* Soil */}
                    <div
                      className="absolute rounded overflow-hidden"
                      style={{
                        left: 6,
                        top: 6,
                        right: 6,
                        bottom: 6,
                        background: `radial-gradient(circle at 30% 30%, ${scene.soil} 0%, ${scene.soil} 100%)`,
                        boxShadow: `inset 0 2px 10px hsl(var(--foreground) / 0.35)`,
                      }}
                    >
                      {/* Segment lines */}
                      {segments > 1 && (
                        <div className="absolute inset-0 flex" style={{ flexDirection: isHorizontal ? "row" : "column" }}>
                          {Array.from({ length: segments }).map((_, i) => (
                            <div
                              key={i}
                              className="flex-1 relative"
                              style={{
                                borderRight: isHorizontal && i < segments - 1 ? "1px dashed rgba(255,255,255,0.3)" : undefined,
                                borderBottom: !isHorizontal && i < segments - 1 ? "1px dashed rgba(255,255,255,0.3)" : undefined,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Plantings overlay */}
                      {bedPlantings.length > 0 && (
                        <div className="absolute inset-0">
                          {bedPlantings.map((planting) => {
                            const startSeg = planting.startSegment;
                            const usedSegs = Math.max(1, planting.segmentsUsed);
                            const soilW = w - 12; // subtract padding
                            const soilH = h - 12;
                            const segW = isHorizontal ? soilW / segments : soilW;
                            const segH = isHorizontal ? soilH : soilH / segments;

                            const rect = isHorizontal
                              ? { left: startSeg * segW, top: 0, width: usedSegs * segW, height: soilH }
                              : { left: 0, top: startSeg * segH, width: soilW, height: usedSegs * segH };

                            return (
                              <div
                                key={planting.id}
                                className="absolute rounded-sm overflow-hidden"
                                style={{
                                  ...rect,
                                  backgroundColor: planting.color,
                                }}
                                title={planting.label}
                              >
                                {/* Icon tiling - fewer but larger icons (3-4 per segment) */}
                                {planting.iconUrl && (
                                  <div className="absolute inset-0 pointer-events-none flex flex-wrap items-center justify-center gap-2 p-2 opacity-85">
                                    {Array.from({ length: Math.min(4, Math.max(1, usedSegs)) * 3 }).map((_, idx) => (
                                      <img
                                        key={idx}
                                        src={planting.iconUrl!}
                                        alt=""
                                        className="w-8 h-8 object-contain drop-shadow-md"
                                        draggable={false}
                                      />
                                    ))}
                                  </div>
                                )}
                                {/* Label - larger hover tooltip */}
                                {planting.label && (
                                  <div className="absolute inset-0 flex items-center justify-center group">
                                    <span
                                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black/50 text-white truncate max-w-full shadow-lg transition-all duration-200 group-hover:text-base group-hover:px-4 group-hover:py-2 group-hover:bg-black/80 group-hover:scale-125 group-hover:z-50"
                                      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}
                                    >
                                      {planting.label}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span
                        className="font-semibold text-center"
                        style={{
                          color: hslVar("--primary-foreground"),
                          fontSize: clamp(Math.min(w, h) / 5, 10, 16),
                          textShadow: `0 2px 10px hsl(var(--foreground) / 0.5)`,
                          paddingInline: 8,
                        }}
                      >
                        {bed.name}
                      </span>
                    </div>

                    {/* Hint - only in edit mode */}
                    {!readOnly && (
                      <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity">
                        <div
                          className="text-[10px] px-2 py-1 rounded-md flex items-center gap-1"
                          style={{ background: `hsl(var(--foreground) / 0.35)`, color: hslVar("--primary-foreground") }}
                        >
                          <Edit3 className="h-3 w-3" />
                          Dubbelklik
                        </div>
                      </div>
                    )}
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
                {/* Greenhouse - Realistic glass house with proper pitched roof */}
                {obj.type === "greenhouse" && (
                  <>
                    {/* Shadow on ground */}
                    <div
                      className="absolute"
                      style={{
                        left: "-5%",
                        right: "-5%",
                        top: "60%",
                        bottom: "-15%",
                        transform: "translateZ(0px)",
                        background: `radial-gradient(ellipse at 50% 30%, hsl(var(--foreground) / 0.25) 0%, transparent 70%)`,
                      }}
                    />
                    {/* Floor / Foundation */}
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: "translateZ(0px)",
                        background: `linear-gradient(135deg, hsl(0, 0%, 55%) 0%, hsl(0, 0%, 45%) 100%)`,
                        borderRadius: 2,
                        boxShadow: `inset 0 0 8px hsl(var(--foreground) / 0.2)`,
                      }}
                    />
                    {/* Left wall */}
                    <div
                      className="absolute"
                      style={{
                        left: 0,
                        width: cmToPx(8),
                        top: 0,
                        bottom: 0,
                        transform: `translateZ(${cmToPx(80)}px)`,
                        background: `linear-gradient(90deg, hsl(200, 30%, 85%) 0%, hsl(200, 20%, 92%) 50%, hsl(200, 30%, 88%) 100%)`,
                        borderLeft: `2px solid hsl(0, 0%, 70%)`,
                        borderRight: `1px solid hsl(200, 20%, 80%)`,
                      }}
                    />
                    {/* Right wall */}
                    <div
                      className="absolute"
                      style={{
                        right: 0,
                        width: cmToPx(8),
                        top: 0,
                        bottom: 0,
                        transform: `translateZ(${cmToPx(80)}px)`,
                        background: `linear-gradient(90deg, hsl(200, 20%, 92%) 0%, hsl(200, 30%, 85%) 100%)`,
                        borderLeft: `1px solid hsl(200, 20%, 80%)`,
                        borderRight: `2px solid hsl(0, 0%, 70%)`,
                      }}
                    />
                    {/* Front wall */}
                    <div
                      className="absolute"
                      style={{
                        top: 0,
                        height: cmToPx(8),
                        left: 0,
                        right: 0,
                        transform: `translateZ(${cmToPx(80)}px)`,
                        background: `linear-gradient(180deg, hsl(200, 30%, 85%) 0%, hsl(200, 20%, 92%) 100%)`,
                        borderTop: `2px solid hsl(0, 0%, 70%)`,
                      }}
                    />
                    {/* Back wall */}
                    <div
                      className="absolute"
                      style={{
                        bottom: 0,
                        height: cmToPx(8),
                        left: 0,
                        right: 0,
                        transform: `translateZ(${cmToPx(80)}px)`,
                        background: `linear-gradient(180deg, hsl(200, 20%, 92%) 0%, hsl(200, 30%, 85%) 100%)`,
                        borderBottom: `2px solid hsl(0, 0%, 70%)`,
                      }}
                    />
                    {/* Main glass walls */}
                    <div
                      className={cn("absolute transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        left: cmToPx(8),
                        right: cmToPx(8),
                        top: cmToPx(8),
                        bottom: cmToPx(8),
                        transform: `translateZ(${cmToPx(80)}px)`,
                        background: `linear-gradient(135deg, hsl(200, 60%, 85% / 0.7) 0%, hsl(200, 80%, 92% / 0.5) 50%, hsl(200, 60%, 88% / 0.6) 100%)`,
                        border: `1px solid hsl(200, 20%, 75%)`,
                        boxShadow: `inset 0 0 40px hsl(200, 80%, 95% / 0.4), 0 15px 30px -15px hsl(var(--foreground) / 0.3)`,
                      }}
                    >
                      {/* Glass panel grid */}
                      <div className="absolute inset-0 grid grid-cols-6 grid-rows-3">
                        {Array.from({ length: 18 }).map((_, i) => (
                          <div
                            key={i}
                            className="border-r border-b"
                            style={{ borderColor: `hsl(200, 20%, 70% / 0.5)` }}
                          />
                        ))}
                      </div>
                      {/* Reflection */}
                      <div
                        className="absolute top-0 left-0 w-1/3 h-1/2"
                        style={{
                          background: `linear-gradient(135deg, hsl(0, 0%, 100% / 0.35) 0%, transparent 60%)`,
                        }}
                      />
                    </div>
                    {/* Roof ridge (center beam) */}
                    <div
                      className="absolute"
                      style={{
                        left: "48%",
                        right: "48%",
                        top: 0,
                        bottom: 0,
                        transform: `translateZ(${cmToPx(130)}px)`,
                        background: `linear-gradient(90deg, hsl(0, 0%, 60%) 0%, hsl(0, 0%, 80%) 50%, hsl(0, 0%, 60%) 100%)`,
                        borderRadius: 2,
                      }}
                    />
                    {/* Left roof panel */}
                    <div
                      className="absolute"
                      style={{
                        left: -2,
                        right: "50%",
                        top: -2,
                        bottom: -2,
                        transform: `translateZ(${cmToPx(105)}px) rotateY(-18deg)`,
                        transformOrigin: "right center",
                        background: `linear-gradient(90deg, hsl(200, 50%, 80% / 0.6) 0%, hsl(200, 70%, 90% / 0.4) 100%)`,
                        border: `1px solid hsl(0, 0%, 75%)`,
                        borderRadius: "2px 0 0 2px",
                        boxShadow: `inset 0 0 15px hsl(200, 80%, 95% / 0.3)`,
                      }}
                    >
                      <div className="absolute inset-0 grid grid-cols-4 grid-rows-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="border-r" style={{ borderColor: `hsl(200, 20%, 70% / 0.4)` }} />
                        ))}
                      </div>
                    </div>
                    {/* Right roof panel */}
                    <div
                      className="absolute"
                      style={{
                        left: "50%",
                        right: -2,
                        top: -2,
                        bottom: -2,
                        transform: `translateZ(${cmToPx(105)}px) rotateY(18deg)`,
                        transformOrigin: "left center",
                        background: `linear-gradient(90deg, hsl(200, 70%, 90% / 0.4) 0%, hsl(200, 50%, 80% / 0.6) 100%)`,
                        border: `1px solid hsl(0, 0%, 75%)`,
                        borderRadius: "0 2px 2px 0",
                        boxShadow: `inset 0 0 15px hsl(200, 80%, 95% / 0.3)`,
                      }}
                    >
                      <div className="absolute inset-0 grid grid-cols-4 grid-rows-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="border-r" style={{ borderColor: `hsl(200, 20%, 70% / 0.4)` }} />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Path - Realistic bark/wood chips with depth */}
                {obj.type === "path" && (
                  <>
                    {/* Sunken edge shadow */}
                    <div
                      className="absolute"
                      style={{
                        left: -2,
                        right: -2,
                        top: -2,
                        bottom: -2,
                        transform: "translateZ(-1px)",
                        background: `hsl(var(--foreground) / 0.15)`,
                        borderRadius: 6,
                      }}
                    />
                    <div
                      className={cn("absolute inset-0 transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        transform: "translateZ(1px)",
                        background: `linear-gradient(135deg, hsl(25, 45%, 28%) 0%, hsl(25, 40%, 24%) 50%, hsl(25, 35%, 20%) 100%)`,
                        borderRadius: 4,
                        boxShadow: `inset 0 3px 10px hsl(var(--foreground) / 0.35), inset 0 -2px 6px hsl(25, 50%, 35% / 0.3)`,
                      }}
                    >
                      {/* Large bark chips layer */}
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `
                            radial-gradient(ellipse 8px 4px at 15% 20%, hsl(25, 55%, 38%) 0%, transparent 100%),
                            radial-gradient(ellipse 10px 5px at 45% 35%, hsl(25, 50%, 35%) 0%, transparent 100%),
                            radial-gradient(ellipse 7px 4px at 75% 25%, hsl(25, 48%, 32%) 0%, transparent 100%),
                            radial-gradient(ellipse 9px 5px at 25% 55%, hsl(25, 52%, 36%) 0%, transparent 100%),
                            radial-gradient(ellipse 8px 4px at 60% 65%, hsl(25, 45%, 30%) 0%, transparent 100%),
                            radial-gradient(ellipse 11px 5px at 85% 75%, hsl(25, 50%, 33%) 0%, transparent 100%),
                            radial-gradient(ellipse 7px 4px at 35% 85%, hsl(25, 55%, 37%) 0%, transparent 100%),
                            radial-gradient(ellipse 9px 4px at 70% 90%, hsl(25, 48%, 31%) 0%, transparent 100%)
                          `,
                          backgroundSize: "60px 50px",
                        }}
                      />
                      {/* Small chips layer */}
                      <div
                        className="absolute inset-0 opacity-70"
                        style={{
                          backgroundImage: `
                            radial-gradient(ellipse 3px 2px at 10% 15%, hsl(25, 60%, 40%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 30% 25%, hsl(25, 45%, 28%) 0%, transparent 100%),
                            radial-gradient(ellipse 3px 2px at 55% 18%, hsl(25, 52%, 35%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 80% 30%, hsl(25, 48%, 32%) 0%, transparent 100%),
                            radial-gradient(ellipse 3px 2px at 20% 45%, hsl(25, 55%, 38%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 50% 55%, hsl(25, 42%, 26%) 0%, transparent 100%),
                            radial-gradient(ellipse 3px 2px at 70% 48%, hsl(25, 50%, 34%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 90% 60%, hsl(25, 58%, 36%) 0%, transparent 100%),
                            radial-gradient(ellipse 3px 2px at 15% 75%, hsl(25, 45%, 30%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 40% 80%, hsl(25, 52%, 33%) 0%, transparent 100%),
                            radial-gradient(ellipse 3px 2px at 65% 72%, hsl(25, 48%, 29%) 0%, transparent 100%),
                            radial-gradient(ellipse 4px 2px at 85% 85%, hsl(25, 55%, 35%) 0%, transparent 100%)
                          `,
                          backgroundSize: "35px 30px",
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Gravel - Realistic stone/pebble texture */}
                {obj.type === "gravel" && (
                  <>
                    {/* Sunken edge */}
                    <div
                      className="absolute"
                      style={{
                        left: -1,
                        right: -1,
                        top: -1,
                        bottom: -1,
                        transform: "translateZ(-1px)",
                        background: `hsl(var(--foreground) / 0.12)`,
                        borderRadius: 5,
                      }}
                    />
                    <div
                      className={cn("absolute inset-0 transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        transform: "translateZ(1px)",
                        background: `linear-gradient(145deg, hsl(30, 8%, 58%) 0%, hsl(30, 6%, 52%) 50%, hsl(30, 5%, 48%) 100%)`,
                        borderRadius: 4,
                        boxShadow: `inset 0 2px 6px hsl(var(--foreground) / 0.2)`,
                      }}
                    >
                      {/* Large pebbles */}
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `
                            radial-gradient(ellipse 6px 5px at 12% 18%, hsl(30, 5%, 68%) 0%, hsl(30, 4%, 55%) 60%, transparent 100%),
                            radial-gradient(ellipse 7px 6px at 38% 25%, hsl(25, 6%, 62%) 0%, hsl(25, 5%, 50%) 60%, transparent 100%),
                            radial-gradient(ellipse 5px 5px at 65% 15%, hsl(35, 7%, 65%) 0%, hsl(35, 5%, 52%) 60%, transparent 100%),
                            radial-gradient(ellipse 8px 6px at 85% 28%, hsl(28, 5%, 60%) 0%, hsl(28, 4%, 48%) 60%, transparent 100%),
                            radial-gradient(ellipse 6px 5px at 22% 45%, hsl(32, 6%, 64%) 0%, hsl(32, 5%, 52%) 60%, transparent 100%),
                            radial-gradient(ellipse 7px 5px at 52% 42%, hsl(26, 5%, 58%) 0%, hsl(26, 4%, 46%) 60%, transparent 100%),
                            radial-gradient(ellipse 5px 5px at 78% 50%, hsl(30, 7%, 66%) 0%, hsl(30, 5%, 54%) 60%, transparent 100%),
                            radial-gradient(ellipse 6px 6px at 15% 72%, hsl(28, 6%, 61%) 0%, hsl(28, 5%, 49%) 60%, transparent 100%),
                            radial-gradient(ellipse 7px 5px at 42% 68%, hsl(33, 5%, 63%) 0%, hsl(33, 4%, 51%) 60%, transparent 100%),
                            radial-gradient(ellipse 6px 5px at 68% 75%, hsl(27, 6%, 59%) 0%, hsl(27, 5%, 47%) 60%, transparent 100%),
                            radial-gradient(ellipse 5px 5px at 88% 70%, hsl(31, 5%, 65%) 0%, hsl(31, 4%, 53%) 60%, transparent 100%),
                            radial-gradient(ellipse 7px 6px at 30% 88%, hsl(29, 6%, 62%) 0%, hsl(29, 5%, 50%) 60%, transparent 100%),
                            radial-gradient(ellipse 6px 5px at 58% 92%, hsl(34, 5%, 60%) 0%, hsl(34, 4%, 48%) 60%, transparent 100%),
                            radial-gradient(ellipse 5px 5px at 82% 88%, hsl(26, 7%, 67%) 0%, hsl(26, 5%, 55%) 60%, transparent 100%)
                          `,
                          backgroundSize: "50px 45px",
                        }}
                      />
                      {/* Small pebbles layer */}
                      <div
                        className="absolute inset-0 opacity-80"
                        style={{
                          backgroundImage: `
                            radial-gradient(circle 2px at 8% 12%, hsl(28, 4%, 70%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 25% 8%, hsl(32, 5%, 55%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 48% 15%, hsl(30, 4%, 62%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 72% 10%, hsl(27, 5%, 58%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 92% 18%, hsl(33, 4%, 65%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 18% 35%, hsl(29, 5%, 60%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 58% 32%, hsl(31, 4%, 56%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 82% 38%, hsl(28, 5%, 63%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 5% 55%, hsl(34, 4%, 59%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 35% 52%, hsl(26, 5%, 66%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 62% 58%, hsl(30, 4%, 54%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 88% 55%, hsl(32, 5%, 61%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 12% 78%, hsl(28, 4%, 68%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 45% 75%, hsl(33, 5%, 57%) 0%, transparent 100%),
                            radial-gradient(circle 2px at 75% 82%, hsl(29, 4%, 64%) 0%, transparent 100%),
                            radial-gradient(circle 3px at 95% 78%, hsl(31, 5%, 52%) 0%, transparent 100%)
                          `,
                          backgroundSize: "30px 28px",
                        }}
                      />
                      {/* Highlight spots */}
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: `
                            radial-gradient(circle 1px at 20% 22%, hsl(0, 0%, 90%) 0%, transparent 100%),
                            radial-gradient(circle 1px at 55% 35%, hsl(0, 0%, 88%) 0%, transparent 100%),
                            radial-gradient(circle 1px at 78% 48%, hsl(0, 0%, 92%) 0%, transparent 100%),
                            radial-gradient(circle 1px at 32% 65%, hsl(0, 0%, 85%) 0%, transparent 100%),
                            radial-gradient(circle 1px at 68% 78%, hsl(0, 0%, 90%) 0%, transparent 100%)
                          `,
                          backgroundSize: "40px 38px",
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Grass patch - Lush realistic grass with varied blades */}
                {obj.type === "grass" && (
                  <div
                    className={cn("absolute inset-0 transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(2px)",
                      background: `radial-gradient(ellipse at 40% 40%, hsl(104, 50%, 42%) 0%, hsl(104, 45%, 35%) 40%, hsl(104, 40%, 28%) 100%)`,
                      borderRadius: 6,
                      boxShadow: `inset 0 0 20px hsl(104, 35%, 20% / 0.3)`,
                    }}
                  >
                    {/* Base grass texture */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `
                          linear-gradient(172deg, transparent 46%, hsl(104, 50%, 38%) 48%, hsl(104, 50%, 38%) 50%, transparent 52%),
                          linear-gradient(168deg, transparent 46%, hsl(104, 45%, 32%) 48%, hsl(104, 45%, 32%) 50%, transparent 52%),
                          linear-gradient(176deg, transparent 46%, hsl(104, 55%, 42%) 48%, hsl(104, 55%, 42%) 50%, transparent 52%),
                          linear-gradient(170deg, transparent 46%, hsl(104, 48%, 35%) 48%, hsl(104, 48%, 35%) 50%, transparent 52%)
                        `,
                        backgroundSize: "6px 14px, 8px 16px, 5px 12px, 7px 15px",
                        backgroundPosition: "0 0, 3px 2px, 1px 4px, 4px 1px",
                      }}
                    />
                    {/* Lighter grass highlights */}
                    <div
                      className="absolute inset-0 opacity-60"
                      style={{
                        backgroundImage: `
                          linear-gradient(174deg, transparent 47%, hsl(104, 58%, 48%) 49%, hsl(104, 58%, 48%) 51%, transparent 53%),
                          linear-gradient(166deg, transparent 47%, hsl(104, 52%, 45%) 49%, hsl(104, 52%, 45%) 51%, transparent 53%),
                          linear-gradient(178deg, transparent 47%, hsl(104, 60%, 52%) 49%, hsl(104, 60%, 52%) 51%, transparent 53%)
                        `,
                        backgroundSize: "9px 18px, 11px 20px, 7px 16px",
                        backgroundPosition: "2px 0, 5px 3px, 0 5px",
                      }}
                    />
                    {/* Dark grass shadows */}
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage: `
                          linear-gradient(171deg, transparent 46%, hsl(104, 35%, 22%) 48%, hsl(104, 35%, 22%) 50%, transparent 52%),
                          linear-gradient(169deg, transparent 46%, hsl(104, 30%, 18%) 48%, hsl(104, 30%, 18%) 50%, transparent 52%)
                        `,
                        backgroundSize: "10px 22px, 13px 24px",
                        backgroundPosition: "1px 1px, 6px 4px",
                      }}
                    />
                    {/* Subtle light reflection */}
                    <div
                      className="absolute top-0 left-0 w-2/3 h-1/2"
                      style={{
                        background: `linear-gradient(145deg, hsl(104, 55%, 50% / 0.2) 0%, transparent 50%)`,
                      }}
                    />
                  </div>
                )}

                {/* Shrub - Realistic bush with multiple foliage clusters */}
                {obj.type === "shrub" && (
                  <>
                    {/* Shadow on ground */}
                    <div
                      className="absolute"
                      style={{
                        left: "5%",
                        right: "5%",
                        top: "45%",
                        bottom: "-15%",
                        transform: "translateZ(0px)",
                        background: `radial-gradient(ellipse at 50% 30%, hsl(var(--foreground) / 0.3) 0%, transparent 65%)`,
                      }}
                    />
                    {/* Base woody stems (visible at bottom) */}
                    <div
                      className="absolute"
                      style={{
                        left: "30%",
                        right: "50%",
                        top: "70%",
                        bottom: "20%",
                        transform: `translateZ(${cmToPx(3)}px)`,
                        background: `linear-gradient(90deg, hsl(25, 35%, 25%) 0%, hsl(25, 40%, 32%) 100%)`,
                        borderRadius: 2,
                      }}
                    />
                    <div
                      className="absolute"
                      style={{
                        left: "55%",
                        right: "25%",
                        top: "65%",
                        bottom: "25%",
                        transform: `translateZ(${cmToPx(3)}px)`,
                        background: `linear-gradient(90deg, hsl(25, 40%, 32%) 0%, hsl(25, 35%, 25%) 100%)`,
                        borderRadius: 2,
                      }}
                    />
                    {/* Back foliage cluster */}
                    <div
                      className="absolute"
                      style={{
                        left: "15%",
                        right: "25%",
                        top: "10%",
                        bottom: "25%",
                        transform: `translateZ(${cmToPx(25)}px)`,
                        background: `radial-gradient(circle at 40% 40%, hsl(104, 40%, 35%) 0%, hsl(104, 35%, 28%) 60%, hsl(104, 30%, 22%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `inset -5px -5px 15px hsl(var(--foreground) / 0.2)`,
                      }}
                    />
                    {/* Left foliage cluster */}
                    <div
                      className="absolute"
                      style={{
                        left: "5%",
                        right: "45%",
                        top: "20%",
                        bottom: "15%",
                        transform: `translateZ(${cmToPx(38)}px)`,
                        background: `radial-gradient(circle at 35% 40%, hsl(104, 48%, 42%) 0%, hsl(104, 42%, 32%) 50%, hsl(104, 35%, 25%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `inset 3px 3px 10px hsl(104, 55%, 50% / 0.25), inset -4px -4px 12px hsl(var(--foreground) / 0.15)`,
                      }}
                    />
                    {/* Right foliage cluster */}
                    <div
                      className="absolute"
                      style={{
                        left: "40%",
                        right: "8%",
                        top: "15%",
                        bottom: "20%",
                        transform: `translateZ(${cmToPx(42)}px)`,
                        background: `radial-gradient(circle at 55% 35%, hsl(104, 50%, 45%) 0%, hsl(104, 45%, 35%) 50%, hsl(104, 38%, 28%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `inset 4px 4px 12px hsl(104, 58%, 52% / 0.3), inset -5px -5px 15px hsl(var(--foreground) / 0.18)`,
                      }}
                    />
                    {/* Top highlight cluster */}
                    <div
                      className={cn("absolute transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        left: "25%",
                        right: "25%",
                        top: "5%",
                        bottom: "35%",
                        transform: `translateZ(${cmToPx(52)}px)`,
                        background: `radial-gradient(circle at 40% 35%, hsl(104, 55%, 50%) 0%, hsl(104, 48%, 40%) 40%, hsl(104, 40%, 30%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `0 15px 30px -20px hsl(var(--foreground) / 0.4), inset 3px 3px 8px hsl(104, 60%, 55% / 0.3)`,
                      }}
                    />
                  </>
                )}

                {/* Tree - Realistic with layered foliage */}
                {obj.type === "tree" && (
                  <>
                    {/* Shadow on ground */}
                    <div
                      className="absolute"
                      style={{
                        left: "-10%",
                        right: "-10%",
                        top: "30%",
                        bottom: "-30%",
                        transform: "translateZ(0px)",
                        background: `radial-gradient(ellipse at 50% 20%, hsl(var(--foreground) / 0.35) 0%, transparent 65%)`,
                      }}
                    />
                    {/* Trunk base (wider) */}
                    <div
                      className="absolute"
                      style={{
                        left: "35%",
                        right: "35%",
                        top: "60%",
                        bottom: "35%",
                        transform: `translateZ(${cmToPx(2)}px)`,
                        background: `linear-gradient(90deg, hsl(25, 40%, 18%) 0%, hsl(25, 45%, 28%) 30%, hsl(25, 50%, 32%) 50%, hsl(25, 45%, 28%) 70%, hsl(25, 40%, 18%) 100%)`,
                        borderRadius: "4px 4px 8px 8px",
                        boxShadow: `inset 2px 0 4px hsl(25, 30%, 12%), inset -2px 0 4px hsl(25, 30%, 12%)`,
                      }}
                    >
                      {/* Bark texture */}
                      <div
                        className="absolute inset-0 opacity-40"
                        style={{
                          backgroundImage: `repeating-linear-gradient(180deg, transparent 0px, transparent 3px, hsl(25, 30%, 15%) 3px, hsl(25, 30%, 15%) 4px)`,
                        }}
                      />
                    </div>
                    {/* Trunk main */}
                    <div
                      className="absolute"
                      style={{
                        left: "38%",
                        right: "38%",
                        top: "35%",
                        bottom: "45%",
                        transform: `translateZ(${cmToPx(50)}px)`,
                        background: `linear-gradient(90deg, hsl(25, 40%, 18%) 0%, hsl(25, 50%, 30%) 50%, hsl(25, 40%, 18%) 100%)`,
                        borderRadius: 3,
                      }}
                    />
                    {/* Lower foliage layer */}
                    <div
                      className="absolute"
                      style={{
                        left: "5%",
                        right: "5%",
                        top: "15%",
                        bottom: "15%",
                        transform: `translateZ(${cmToPx(90)}px)`,
                        background: `radial-gradient(circle at 45% 45%, hsl(104, 45%, 38%) 0%, hsl(104, 40%, 30%) 60%, hsl(104, 35%, 22%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `inset -8px -8px 20px hsl(var(--foreground) / 0.25)`,
                      }}
                    />
                    {/* Middle foliage layer */}
                    <div
                      className="absolute"
                      style={{
                        left: "12%",
                        right: "12%",
                        top: "8%",
                        bottom: "22%",
                        transform: `translateZ(${cmToPx(120)}px)`,
                        background: `radial-gradient(circle at 40% 40%, hsl(104, 50%, 45%) 0%, hsl(104, 45%, 35%) 50%, hsl(104, 35%, 25%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `inset 5px 5px 15px hsl(104, 60%, 55% / 0.3), inset -6px -6px 15px hsl(var(--foreground) / 0.2)`,
                      }}
                    />
                    {/* Top foliage layer (crown) */}
                    <div
                      className={cn("absolute transition-all", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                      style={{
                        left: "20%",
                        right: "20%",
                        top: "2%",
                        bottom: "35%",
                        transform: `translateZ(${cmToPx(150)}px)`,
                        background: `radial-gradient(circle at 35% 35%, hsl(104, 55%, 52%) 0%, hsl(104, 50%, 42%) 40%, hsl(104, 40%, 30%) 100%)`,
                        borderRadius: "50%",
                        boxShadow: `0 25px 50px -30px hsl(var(--foreground) / 0.5), inset 4px 4px 12px hsl(104, 60%, 60% / 0.3)`,
                      }}
                    />
                  </>
                )}

                {/* Woodchips */}
                {obj.type === "woodchips" && (
                  <div
                    className={cn("absolute inset-0 rounded-lg transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(1px)",
                      background: `linear-gradient(135deg, hsl(25, 50%, 30%) 0%, hsl(20, 45%, 25%) 50%, hsl(25, 40%, 22%) 100%)`,
                      boxShadow: `inset 0 2px 8px hsl(var(--foreground) / 0.3)`,
                    }}
                  >
                    {/* Woodchip texture pattern */}
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        backgroundImage: `radial-gradient(ellipse at 20% 30%, hsl(30, 40%, 35%) 2px, transparent 3px), radial-gradient(ellipse at 70% 60%, hsl(25, 35%, 28%) 3px, transparent 4px), radial-gradient(ellipse at 40% 80%, hsl(20, 45%, 32%) 2px, transparent 3px)`,
                        backgroundSize: "18px 14px",
                      }}
                    />
                  </div>
                )}

                {/* Tiles */}
                {obj.type === "tiles" && (
                  <div
                    className={cn("absolute inset-0 rounded-sm transition-all overflow-hidden", isSelected && "ring-4 ring-[hsl(var(--scene-highlight))]")}
                    style={{
                      transform: "translateZ(1px)",
                      background: `linear-gradient(135deg, hsl(0, 0%, 60%) 0%, hsl(0, 0%, 52%) 100%)`,
                      boxShadow: `inset 0 1px 4px hsl(var(--foreground) / 0.2)`,
                    }}
                  >
                    {/* Tile grid pattern */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `linear-gradient(hsl(0, 0%, 45%) 2px, transparent 2px), linear-gradient(90deg, hsl(0, 0%, 45%) 2px, transparent 2px)`,
                        backgroundSize: "25px 25px",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top controls - hidden in walk mode */}
      {!walkMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
          <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
            <Button variant="ghost" size="sm" onClick={() => setZoom((z) => clamp(z * 1.25, 0.25, 3))} className="h-9 w-9 p-0 rounded-full">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom((z) => clamp(z * 0.8, 0.25, 3))} className="h-9 w-9 p-0 rounded-full">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
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
            <div className="w-px h-6 bg-border" />
            <Button
              variant={gridSnap ? "default" : "ghost"}
              size="sm"
              onClick={() => setGridSnap(!gridSnap)}
              className="h-8 px-3 rounded-full text-xs gap-1"
              title="Grid snap (50cm)"
            >
              <Grid3x3 className="h-3 w-3" />
              Grid
            </Button>
            <div className="w-px h-6 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={enterWalkMode}
              className="h-8 px-3 rounded-full text-xs gap-1"
              title="Wandel door je tuin"
            >
              <Footprints className="h-3 w-3" />
              Wandel
            </Button>
          </div>
        </div>
      )}

      {/* Walk mode controls */}
      {walkMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-3 bg-background/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl border border-border/50">
            <Footprints className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Wandelmodus</span>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant={isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(true)} className="h-8 w-8 p-0 rounded-full" title="Dag">
              <Sun className="h-4 w-4" />
            </Button>
            <Button variant={!isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(false)} className="h-8 w-8 p-0 rounded-full" title="Nacht">
              <Moon className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant="default" size="sm" onClick={exitWalkMode} className="h-8 px-4 rounded-full text-xs">
              Verlaat wandelmodus
            </Button>
          </div>
        </div>
      )}

      {/* Bottom dock - hidden in walk mode and in readOnly mode */}
      {!walkMode && !readOnly && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-3 z-20" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-border/50" onPointerDown={(e) => e.stopPropagation()}>
            <span className="text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider">Toevoegen</span>
            <ObjectButton icon={Warehouse} label="Kas" onClick={() => spawnObject("greenhouse")} />
            <ObjectButton icon={TreePine} label="Boom" onClick={() => spawnObject("tree")} />
            <ObjectButton icon={Flower2} label="Struik" onClick={() => spawnObject("shrub")} />
            <ObjectButton icon={TreeDeciduous} label="Gras" onClick={() => spawnObject("grass")} />
            <ObjectButton icon={Rows3} label="Pad" onClick={() => spawnObject("path")} />
            <ObjectButton icon={Ruler} label="Grind" onClick={() => spawnObject("gravel")} />
            <ObjectButton icon={TreeDeciduous} label="Schors" onClick={() => spawnObject("woodchips")} />
            <ObjectButton icon={Grid3x3} label="Tegels" onClick={() => spawnObject("tiles")} />
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
      )}

      {/* Object inspector - hidden in readOnly mode */}
      {selectedObject && !readOnly && (
        <div className="absolute bottom-4 left-4 z-20 w-[280px] bg-background/90 backdrop-blur-md border border-border/50 rounded-xl shadow-xl p-4 animate-enter">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-muted-foreground">Geselecteerd</div>
              <div className="font-semibold text-sm">{labelForObject(selectedObject.type)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DimensionInput
              label="Breedte (cm)"
              value={selectedObject.w}
              onChange={(v) => updateSelectedObject({ w: v })}
              min={10}
            />
            <DimensionInput
              label="Lengte (cm)"
              value={selectedObject.h}
              onChange={(v) => updateSelectedObject({ h: v })}
              min={10}
            />
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Tip: versleep object om te positioneren; pas afmetingen aan voor kas/paden.
          </div>
        </div>
      )}

      {/* Instructions - different in walk mode */}
      <div className="absolute bottom-4 right-4 text-xs text-primary-foreground bg-foreground/40 backdrop-blur-sm px-3 py-2 rounded-lg z-10">
        {walkMode ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold mb-1">Besturing:</span>
            <div className="flex items-center gap-1">
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">W</span>
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">↑</span>
              <span>Vooruit</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">S</span>
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">↓</span>
              <span>Achteruit</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">A</span>
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">D</span>
              <span>Zijwaarts</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">←</span>
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">→</span>
              <span>Draaien</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</span>
              <span>Verlaat</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span>Sleep item = verplaatsen</span>
            <span>Sleep lege ruimte = pannen</span>
            <span>Rechtermuisknop + sleep = draaien</span>
            <span>Ctrl/⌘ + scroll = zoomen</span>
            {gridSnap && <span className="text-scene-highlight font-medium">Grid snap actief (50cm)</span>}
          </div>
        )}
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
    case "woodchips":
      return "Houtschors";
    case "tiles":
      return "Tegels";
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
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent canvas from capturing click
    e.preventDefault();
    onClick();
  };
  
  return (
    <button 
      type="button"
      onClick={handleClick} 
      className="group flex flex-col items-center gap-1 px-2 py-1 transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="p-2.5 rounded-xl bg-muted/50 border border-border/50 transition-all duration-200 group-hover:bg-accent group-hover:border-accent group-hover:shadow-lg">
        <Icon className="h-5 w-5 text-foreground" />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  );
}

// Dimension input with string state for easy overwriting
function DimensionInput({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  const [inputValue, setInputValue] = useState(String(value));
  const [error, setError] = useState(false);

  // Sync when external value changes (e.g., different object selected)
  useEffect(() => {
    setInputValue(String(value));
    setError(false);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow any input while typing
    setInputValue(e.target.value);
    setError(false);
  };

  const handleBlur = () => {
    const trimmed = inputValue.trim();
    if (trimmed === "") {
      setError(true);
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < min) {
      setError(true);
      setInputValue(String(value)); // Reset to previous valid value
      return;
    }
    setError(false);
    onChange(num);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input
        type="text"
        inputMode="numeric"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={(e) => e.target.select()}
        className={cn(error && "border-destructive focus-visible:ring-destructive")}
      />
      {error && (
        <span className="text-[10px] text-destructive">Min. {min} cm</span>
      )}
    </div>
  );
}
