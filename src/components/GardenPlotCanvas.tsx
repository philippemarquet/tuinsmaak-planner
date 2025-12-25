import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed } from "../lib/types";
import { cn } from "../lib/utils";
import { Ruler, RotateCw, Square, Trees, Factory, Mountain, Copy, Trash2, ZoomIn, ZoomOut, Maximize2, Grid as GridIcon, Pointer, Move3D, Eye, EyeOff } from "lucide-react";

/** =========================
 *  Types & constants
 *  ========================= */
type UUID = string;
type WorldCM = number;

type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel";
type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: WorldCM; // center x in cm
  y: WorldCM; // center y in cm
  w: WorldCM; // width (cm)
  h: WorldCM; // height/length (cm)
  rot: number; // deg
  z: number;   // visual height (cm) -> pseudo 3D extrude
  label?: string;
};

type BedMeta = {
  rot?: number; // deg
  z?: number;   // bed height (cm) for pseudo 3D
};

const DEFAULT_BED_HEIGHT_CM = 25;
const DEFAULT_GRID_CM = 10; // base grid step in cm
const ROT_STEP = 15;
const ROT_FINE = 1;
const SELECT_HALO = 8;
const HANDLE_SIZE = 10;
const STORAGE_OBJECTS = (p: string) => `${p}:objects`;
const STORAGE_BEDMETA = (p: string) => `${p}:bedMeta`;
const STORAGE_VIEW = (p: string) => `${p}:view`;
const STORAGE_GRID = (p: string) => `${p}:grid`;

/** Utility */
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const rad = (deg: number) => (deg * Math.PI) / 180;
const snap = (v: number, step: number) => Math.round(v / step) * step;

/** =========================
 *  Props
 *  ========================= */
export function GardenPlotCanvas({
  beds,
  storagePrefix = "bedsLayout",
  onBedMove,
  onBedDuplicate,
}: {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove: (id: UUID, x: number, y: number) => void | Promise<void>;
  onBedDuplicate?: (bed: GardenBed) => void;
}) {
  /** =========================
   *  Viewport state (pan/zoom)
   *  ========================= */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(() => {
    // pixels per cm
    const stored = localStorage.getItem(STORAGE_VIEW(storagePrefix));
    return stored ? JSON.parse(stored).scale : 1.2; // start ~1.2 px per cm
  });
  const [pan, setPan] = useState<{ x: number; y: number }>(() => {
    const stored = localStorage.getItem(STORAGE_VIEW(storagePrefix));
    return stored ? JSON.parse(stored).pan : { x: 0, y: 0 };
  });
  const [showGrid, setShowGrid] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_GRID(storagePrefix));
    return stored ? JSON.parse(stored).showGrid : true;
  });
  const [snapGrid, setSnapGrid] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_GRID(storagePrefix));
    return stored ? JSON.parse(stored).snapGrid : true;
  });
  const [fixedStep, setFixedStep] = useState<0 | 10 | 20 | 50>(0); // 0=auto

  useEffect(() => {
    localStorage.setItem(STORAGE_VIEW(storagePrefix), JSON.stringify({ scale, pan }));
  }, [scale, pan, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(STORAGE_GRID(storagePrefix), JSON.stringify({ showGrid, snapGrid }));
  }, [showGrid, snapGrid, storagePrefix]);

  // auto step: coarser grid when zoomed out
  const gridStep = useMemo<10 | 20 | 50>(() => {
    if (fixedStep) return fixedStep;
    if (scale < 0.8) return 50;
    if (scale < 1.5) return 20;
    return 10;
  }, [scale, fixedStep]);

  /** =========================
   *  Local objects & bed meta
   *  ========================= */
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    const raw = localStorage.getItem(STORAGE_OBJECTS(storagePrefix));
    return raw ? (JSON.parse(raw) as PlotObject[]) : [];
  });
  const [bedMeta, setBedMeta] = useState<Record<UUID, BedMeta>>(() => {
    const raw = localStorage.getItem(STORAGE_BEDMETA(storagePrefix));
    return raw ? (JSON.parse(raw) as Record<UUID, BedMeta>) : {};
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_OBJECTS(storagePrefix), JSON.stringify(objects));
  }, [objects, storagePrefix]);

  useEffect(() => {
    localStorage.setItem(STORAGE_BEDMETA(storagePrefix), JSON.stringify(bedMeta));
  }, [bedMeta, storagePrefix]);

  /** =========================
   *  Selection & tools
   *  ========================= */
  type Sel =
    | { kind: "bed"; id: UUID }
    | { kind: "obj"; id: string }
    | null;

  const [selection, setSelection] = useState<Sel[]>([]);
  const isSelected = useCallback(
    (kind: Sel["kind"], id: string) => selection.some((s) => s?.kind === kind && s.id === id),
    [selection]
  );

  const toggleSelect = (sel: Sel, additive: boolean) => {
    if (!sel) return;
    if (additive) {
      setSelection((prev) => {
        const already = prev.some((s) => s?.kind === sel.kind && s.id === sel.id);
        if (already) return prev.filter((s) => !(s?.kind === sel.kind && s.id === sel.id));
        return [...prev, sel];
      });
    } else {
      setSelection([sel]);
    }
  };

  const clearSelection = () => setSelection([]);

  const [tool, setTool] = useState<"select" | "ruler">("select");
  const [ruler, setRuler] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);

  /** =========================
   *  Input helpers
   *  ========================= */
  const worldToScreen = (x: number, y: number) => ({
    x: x * scale + pan.x,
    y: y * scale + pan.y,
  });
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - pan.x) / scale,
    y: (sy - pan.y) / scale,
  });

  // Pointer state
  const dragState = useRef<{
    mode: "none" | "pan" | "drag-beds" | "drag-objects" | "rotate" | "ruler";
    startX: number;
    startY: number;
    prevPan: { x: number; y: number };
    startWorld: { x: number; y: number };
    altClone?: boolean;
  }>({ mode: "none", startX: 0, startY: 0, prevPan: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 } });

  /** =========================
   *  Zooming
   *  ========================= */
  const zoomAt = (deltaY: number, cx: number, cy: number) => {
    const factor = Math.pow(1.001, -deltaY);
    const newScale = clamp(scale * factor, 0.2, 5);
    // keep cursor steady
    const before = screenToWorld(cx, cy);
    setScale(newScale);
    const after = screenToWorld(cx, cy);
    setPan((p) => ({ x: p.x + (after.x - before.x) * newScale, y: p.y + (after.y - before.y) * newScale }));
  };

  const fitAll = () => {
    if (!wrapRef.current) return;
    const PAD = 120; // px
    const bounds = getSceneBounds();
    const rect = wrapRef.current.getBoundingClientRect();
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const sx = (rect.width - PAD) / w;
    const sy = (rect.height - PAD) / h;
    const s = clamp(Math.min(sx, sy), 0.2, 5);
    setScale(s);
    setPan({
      x: rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * s,
      y: rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * s,
    });
  };

  /** =========================
   *  Scene: all items bounds
   *  ========================= */
  const getSceneBounds = () => {
    let xs: number[] = [];
    let ys: number[] = [];
    // beds: use their center + half dims, with rotation -> bbox
    for (const b of beds) {
      const meta = bedMeta[b.id] || {};
      const rot = (meta.rot ?? 0) * Math.PI / 180;
      const hw = (b.width_cm ?? 100) / 2;
      const hh = (b.length_cm ?? 100) / 2;
      const cx = (b.location_x ?? 0);
      const cy = (b.location_y ?? 0);
      const dx = Math.abs(hw * Math.cos(rot)) + Math.abs(hh * Math.sin(rot));
      const dy = Math.abs(hw * Math.sin(rot)) + Math.abs(hh * Math.cos(rot));
      xs.push(cx - dx, cx + dx);
      ys.push(cy - dy, cy + dy);
    }
    for (const o of objects) {
      const rot = rad(o.rot);
      const hw = o.w / 2, hh = o.h / 2;
      const dx = Math.abs(hw * Math.cos(rot)) + Math.abs(hh * Math.sin(rot));
      const dy = Math.abs(hw * Math.sin(rot)) + Math.abs(hh * Math.cos(rot));
      xs.push(o.x - dx, o.x + dx);
      ys.push(o.y - dy, o.y + dy);
    }
    if (xs.length === 0) return { minX: -500, maxX: 500, minY: -300, maxY: 300 };
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  /** =========================
   *  Add objects
   *  ========================= */
  const addObject = (type: PlotObjectType) => {
    const center = screenToWorld(window.innerWidth * 0.5, window.innerHeight * 0.4);
    const base: Record<PlotObjectType, PlotObject> = {
      greenhouse: { id: crypto.randomUUID(), type, x: center.x, y: center.y, w: 300, h: 200, rot: 0, z: 220, label: "Kas" },
      grass:      { id: crypto.randomUUID(), type, x: center.x, y: center.y, w: 400, h: 400, rot: 0, z: 0,   label: "Gras" },
      shrub:      { id: crypto.randomUUID(), type, x: center.x, y: center.y, w: 120, h: 120, rot: 0, z: 80,  label: "Struik" },
      gravel:     { id: crypto.randomUUID(), type, x: center.x, y: center.y, w: 300, h: 200, rot: 0, z: 0,   label: "Grind" },
    };
    setObjects((prev) => [...prev, base[type]]);
    setSelection([{ kind: "obj", id: base[type].id }]);
  };

  /** =========================
   *  Render helpers
   *  ========================= */

  const cmToPx = (cm: number) => cm * scale;
  const pxToCm = (px: number) => px / scale;

  // Grid pattern as background
  const gridBG = useMemo(() => {
    if (!showGrid) return "transparent";
    const stepPx = Math.max(8, cmToPx(gridStep));
    const minor = "#b4d9b4";
    const major = "#7fbf7f";
    // CSS repeating gradients (minor+major every 10 steps)
    const majorEvery = 5; // bold line every 5 minor steps
    const minorCSS = `${minor} 1px, transparent 1px`;
    const majorCSS = `${major} 1px, transparent 1px`;
    const col = `repeating-linear-gradient(90deg, ${minorCSS} ${stepPx}px), repeating-linear-gradient(90deg, ${majorCSS} ${stepPx * majorEvery}px)`;
    const row = `, repeating-linear-gradient(0deg, ${minorCSS} ${stepPx}px), repeating-linear-gradient(0deg, ${majorCSS} ${stepPx * majorEvery}px)`;
    return col + row;
  }, [showGrid, gridStep, scale]);

  const grassBG =
    "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.15) 0 12%, transparent 13%) , radial-gradient(circle at 70% 60%, rgba(0,0,0,0.05) 0 18%, transparent 19%), #cfe8cf";

  // pseudo 3D extrude offset in screen px for given height (cm)
  const extrudeOffset = (heightCm: number) => {
    // small isometric: height shifts diagonally down-right
    const k = 0.18; // tuning
    const off = cmToPx(heightCm) * k;
    return { dx: off, dy: off * 0.6 };
  };

  // Wood + soil styles for beds
  const bedStyles = (isGreenhouse: boolean) => {
    const wood = isGreenhouse
      ? "linear-gradient(90deg, #9ccbee, #7db2db)"
      : "linear-gradient(90deg, #8a5a3a, #70452a)";
    const soil =
      "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06) 0 10%, transparent 11%), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.18) 0 14%, transparent 15%), #6b5137";
    return { wood, soil };
  };

  // draw segment lines perpendicular to longest side
  const renderSegments = (ctx: CanvasRenderingContext2D, w: number, h: number, segments: number) => {
    if (segments <= 1) return;
    const longIsH = h >= w;
    if (longIsH) {
      // long side vertical -> lines horizontal across width, spaced along height
      const step = h / segments;
      for (let i = 1; i < segments; i++) {
        const y = -h / 2 + i * step;
        ctx.moveTo(-w / 2, y);
        ctx.lineTo(w / 2, y);
      }
    } else {
      const step = w / segments;
      for (let i = 1; i < segments; i++) {
        const x = -w / 2 + i * step;
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x, h / 2);
      }
    }
  };

  /** =========================
   *  Hit tests (for selection/drag)
   *  ========================= */
  const hitBed = (wx: number, wy: number): GardenBed | null => {
    // fast AABB check using rotated bbox
    for (let i = beds.length - 1; i >= 0; i--) {
      const b = beds[i];
      const cx = b.location_x ?? 0;
      const cy = b.location_y ?? 0;
      const rot = rad(bedMeta[b.id]?.rot ?? 0);
      const dx = wx - cx;
      const dy = wy - cy;
      // rotate point into local space
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      const hw = (b.width_cm ?? 100) / 2;
      const hh = (b.length_cm ?? 100) / 2;
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return b;
    }
    return null;
  };

  const hitObj = (wx: number, wy: number): PlotObject | null => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      const rot = rad(o.rot);
      const dx = wx - o.x;
      const dy = wy - o.y;
      const lx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
      const ly = dx * Math.sin(-rot) + dy * Math.cos(-rot);
      if (Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2) return o;
    }
    return null;
  };

  /** =========================
   *  Pointer handlers
   *  ========================= */
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomAt(e.deltaY, e.clientX, e.clientY);
    } else {
      // pan
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (tool === "ruler") {
      dragState.current = {
        mode: "ruler",
        startX: sx,
        startY: sy,
        startWorld: w,
        prevPan: pan,
      };
      setRuler({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
      return;
    }

    // try rotate handle hit for single selection
    const single = selection.length === 1 ? selection[0] : null;
    if (single) {
      const handlePt = getRotateHandlePosition(single);
      if (handlePt) {
        const { x, y } = worldToScreen(handlePt.x, handlePt.y);
        const dist = Math.hypot(x - (sx + rect.left), y - (sy + rect.top)); // rect.left was used above
        if (dist < HANDLE_SIZE * 1.6) {
          dragState.current = {
            mode: "rotate",
            startX: sx,
            startY: sy,
            startWorld: w,
            prevPan: pan,
          };
          return;
        }
      }
    }

    // Try pick object/bed
    const o = hitObj(w.x, w.y);
    const b = !o ? hitBed(w.x, w.y) : null;

    const additive = e.shiftKey;
    if (o) {
      toggleSelect({ kind: "obj", id: o.id }, additive);
      dragState.current = {
        mode: "drag-objects",
        startX: sx,
        startY: sy,
        startWorld: w,
        prevPan: pan,
        altClone: e.altKey,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (b) {
      toggleSelect({ kind: "bed", id: b.id }, additive);
      dragState.current = {
        mode: "drag-beds",
        startX: sx,
        startY: sy,
        startWorld: w,
        prevPan: pan,
        altClone: e.altKey,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // empty space -> start panning
    if (!additive) clearSelection();
    dragState.current = {
      mode: "pan",
      startX: sx,
      startY: sy,
      startWorld: w,
      prevPan: pan,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const ds = dragState.current;

    if (ds.mode === "none") return;

    if (ds.mode === "pan") {
      const dx = sx - ds.startX;
      const dy = sy - ds.startY;
      setPan({ x: ds.prevPan.x + dx, y: ds.prevPan.y + dy });
      return;
    }

    if (ds.mode === "ruler") {
      setRuler((r) => (r ? { ...r, x2: w.x, y2: w.y } : r));
      return;
    }

    // drag move delta (world)
    const dxw = w.x - ds.startWorld.x;
    const dyw = w.y - ds.startWorld.y;

    const doSnap = (v: number) => (snapGrid ? snap(v, gridStep) : v);

    if (ds.mode === "drag-objects") {
      setObjects((prev) =>
        prev.map((o) =>
          isSelected("obj", o.id)
            ? { ...o, x: doSnap(o.x + dxw), y: doSnap(o.y + dyw) }
            : o
        )
      );
      dragState.current.startWorld = w;
      return;
    }

    if (ds.mode === "drag-beds") {
      // move beds visually; commit on pointerup
      setBedMeta((prev) => {
        // we don't store x/y here (server owns), but for instantaneous feedback we can temporarily render using delta via temp overlay (skip: keep simple)
        return { ...prev };
      });
      // apply move to on-screen only by using a temporary map (easier: we compute projected location during render with temp delta)
      tempMove.current = { dx: doSnap(dxw), dy: doSnap(dyw) };
      tempMoveIds.current = selection.filter((s) => s.kind === "bed").map((s) => s.id);
      return;
    }

    if (ds.mode === "rotate") {
      const center = getSelectionCenter();
      if (!center) return;
      const a1 = Math.atan2(ds.startWorld.y - center.y, ds.startWorld.x - center.x);
      const a2 = Math.atan2(w.y - center.y, w.x - center.x);
      const delta = (a2 - a1) * (180 / Math.PI);
      applyRotation(delta, e.shiftKey ? ROT_FINE : ROT_STEP);
      dragState.current.startWorld = w;
      return;
    }
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const ds = dragState.current;
    dragState.current = { ...dragState.current, mode: "none" };
    // commit moves
    if (ds.mode === "drag-beds") {
      const delta = tempMove.current;
      const ids = tempMoveIds.current;
      tempMove.current = null;
      tempMoveIds.current = [];
      if (delta && ids?.length) {
        await Promise.all(
          beds
            .filter((b) => ids.includes(b.id))
            .map((b) =>
              onBedMove(
                b.id,
                (b.location_x ?? 0) + delta.dx,
                (b.location_y ?? 0) + delta.dy
              )
            )
        ).catch(() => {});
      }
      return;
    }
    if (ds.mode === "drag-objects" && ds.altClone) {
      // simple alt-duplicate object selection
      const clones: PlotObject[] = [];
      setObjects((prev) => {
        for (const s of selection) {
          if (s.kind !== "obj") continue;
          const src = prev.find((o) => o.id === s.id);
          if (!src) continue;
          clones.push({ ...src, id: crypto.randomUUID(), x: src.x + 30, y: src.y + 30 });
        }
        return [...prev, ...clones];
      });
      return;
    }
    if (ds.mode === "drag-beds" && ds.altClone && onBedDuplicate) {
      // duplicate via server (new element will enter via parent refresh)
      const sels = selection.filter((s) => s.kind === "bed").map((s) => s.id);
      beds.filter((b) => sels.includes(b.id)).forEach((b) => onBedDuplicate?.(b));
    }
  };

  /** temp visual move for beds while dragging */
  const tempMove = useRef<null | { dx: number; dy: number }>(null);
  const tempMoveIds = useRef<string[]>([]);

  /** =========================
   *  Rotation helpers
   *  ========================= */
  const getSelectionCenter = () => {
    const pts: { x: number; y: number }[] = [];
    for (const s of selection) {
      if (s.kind === "bed") {
        const b = beds.find((x) => x.id === s.id);
        if (!b) continue;
        const { dx, dy } =
          tempMove.current && tempMoveIds.current.includes(b.id) ? tempMove.current : { dx: 0, dy: 0 };
        pts.push({ x: (b.location_x ?? 0) + dx, y: (b.location_y ?? 0) + dy });
      } else {
        const o = objects.find((x) => x.id === s.id);
        if (!o) continue;
        pts.push({ x: o.x, y: o.y });
      }
    }
    if (!pts.length) return null;
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    return { x, y };
  };

  const applyRotation = (delta: number, step: number) => {
    setBedMeta((prev) => {
      const next = { ...prev };
      for (const s of selection) {
        if (s.kind !== "bed") continue;
        const current = next[s.id]?.rot ?? 0;
        next[s.id] = { ...(next[s.id] || {}), rot: Math.round((current + delta) / step) * step };
      }
      return next;
    });
    setObjects((prev) =>
      prev.map((o) =>
        isSelected("obj", o.id)
          ? { ...o, rot: Math.round((o.rot + delta) / step) * step }
          : o
      )
    );
  };

  /** Keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") {
        if (e.shiftKey) {
          setTool((t) => (t === "ruler" ? "select" : "ruler"));
        } else {
          // rotate CW quick
          applyRotation(ROT_STEP, e.shiftKey ? ROT_FINE : ROT_STEP);
        }
      }
      if (e.key.toLowerCase() === "q") applyRotation(-(e.shiftKey ? ROT_FINE : ROT_STEP), e.shiftKey ? ROT_FINE : ROT_STEP);
      if (e.key.toLowerCase() === "e") applyRotation((e.shiftKey ? ROT_FINE : ROT_STEP), e.shiftKey ? ROT_FINE : ROT_STEP);
      if (e.key === "Escape") { setTool("select"); clearSelection(); setRuler(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
        setObjects((prev) => prev.filter((o) => !isSelected("obj", o.id)));
        setSelection((prev) => prev.filter((s) => s.kind !== "obj")); // beds cannot be deleted here
      }
      if (e.key === "+") setScale((s) => clamp(s * 1.1, 0.2, 5));
      if (e.key === "-") setScale((s) => clamp(s / 1.1, 0.2, 5));
      if (e.key === "0") fitAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, objects, beds, bedMeta, scale]);

  /** =========================
   *  Selection frame & handles
   *  ========================= */
  const getBBoxForSel = () => {
    const rects: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
    for (const s of selection) {
      if (s.kind === "bed") {
        const b = beds.find((x) => x.id === s.id);
        if (!b) continue;
        const rot = rad(bedMeta[b.id]?.rot ?? 0);
        const hw = (b.width_cm ?? 100) / 2;
        const hh = (b.length_cm ?? 100) / 2;
        const { dx, dy } =
          tempMove.current && tempMoveIds.current.includes(b.id) ? tempMove.current : { dx: 0, dy: 0 };
        const cx = (b.location_x ?? 0) + dx;
        const cy = (b.location_y ?? 0) + dy;
        const dxr = Math.abs(hw * Math.cos(rot)) + Math.abs(hh * Math.sin(rot));
        const dyr = Math.abs(hw * Math.sin(rot)) + Math.abs(hh * Math.cos(rot));
        rects.push({ minX: cx - dxr, maxX: cx + dxr, minY: cy - dyr, maxY: cy + dyr });
      } else {
        const o = objects.find((x) => x.id === s.id);
        if (!o) continue;
        const rot = rad(o.rot);
        const hw = o.w / 2, hh = o.h / 2;
        const dxr = Math.abs(hw * Math.cos(rot)) + Math.abs(hh * Math.sin(rot));
        const dyr = Math.abs(hw * Math.sin(rot)) + Math.abs(hh * Math.cos(rot));
        rects.push({ minX: o.x - dxr, maxX: o.x + dxr, minY: o.y - dyr, maxY: o.y + dyr });
      }
    }
    if (!rects.length) return null;
    return {
      minX: Math.min(...rects.map((r) => r.minX)),
      maxX: Math.max(...rects.map((r) => r.maxX)),
      minY: Math.min(...rects.map((r) => r.minY)),
      maxY: Math.max(...rects.map((r) => r.maxY)),
    };
  };

  const getRotateHandlePosition = (single: Sel | null) => {
    if (!single) return null;
    const box = getBBoxForSel();
    if (!box) return null;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    return { x: cx, y: box.minY - 30 / scale }; // 30px above bbox center
  };

  /** =========================
   *  Inspector (sidebar)
   *  ========================= */
  const updateSelected = (patch: Partial<PlotObject> & Partial<BedMeta>) => {
    setObjects((prev) =>
      prev.map((o) =>
        isSelected("obj", o.id) ? { ...o, ...patch } : o
      )
    );
    setBedMeta((prev) => {
      let changed = { ...prev };
      for (const s of selection) {
        if (s.kind !== "bed") continue;
        changed[s.id] = { ...(changed[s.id] || {}), ...(patch as BedMeta) };
      }
      return changed;
    });
  };

  const removeSelectedObjects = () => {
    setObjects((p) => p.filter((o) => !isSelected("obj", o.id)));
    setSelection((sel) => sel.filter((s) => s.kind !== "obj"));
  };

  /** =========================
   *  Alignment (for multi-select)
   *  ========================= */
  const align = (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "hspace" | "vspace") => {
    const sels = selection;
    if (sels.length < 2) return;
    const box = getBBoxForSel();
    if (!box) return;

    const getCenter = (s: Sel) => {
      if (s.kind === "bed") {
        const b = beds.find((x) => x.id === s.id)!;
        const { dx, dy } =
          tempMove.current && tempMoveIds.current.includes(b.id) ? tempMove.current : { dx: 0, dy: 0 };
        return { x: (b.location_x ?? 0) + dx, y: (b.location_y ?? 0) + dy, w: b.width_cm ?? 100, h: b.length_cm ?? 100, rot: bedMeta[b.id]?.rot ?? 0 };
      } else {
        const o = objects.find((x) => x.id === s.id)!;
        return { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot };
      }
    };

    const patchObj: Record<string, PlotObject> = {};
    const patchBed: Record<UUID, { x?: number; y?: number }> = {};

    const elems = sels.map(getCenter);
    const lefts = elems.map((e) => e.x - e.w / 2);
    const rights = elems.map((e) => e.x + e.w / 2);
    const tops = elems.map((e) => e.y - e.h / 2);
    const bottoms = elems.map((e) => e.y + e.h / 2);

    if (mode === "left") {
      const L = Math.min(...lefts);
      applyAlign((e) => ({ x: L + e.w / 2, y: e.y }));
    } else if (mode === "right") {
      const R = Math.max(...rights);
      applyAlign((e) => ({ x: R - e.w / 2, y: e.y }));
    } else if (mode === "top") {
      const T = Math.min(...tops);
      applyAlign((e) => ({ x: e.x, y: T + e.h / 2 }));
    } else if (mode === "bottom") {
      const B = Math.max(...bottoms);
      applyAlign((e) => ({ x: e.x, y: B - e.h / 2 }));
    } else if (mode === "hcenter") {
      const cx = (box.minX + box.maxX) / 2;
      applyAlign((e) => ({ x: cx, y: e.y }));
    } else if (mode === "vcenter") {
      const cy = (box.minY + box.maxY) / 2;
      applyAlign((e) => ({ x: e.x, y: cy }));
    } else if (mode === "hspace") {
      const sorted = elems.slice().sort((a, b) => a.x - b.x);
      const L = Math.min(...lefts);
      const R = Math.max(...rights);
      const totalW = sorted.reduce((s, e) => s + e.w, 0);
      const gaps = sorted.length - 1;
      const space = (R - L - totalW) / gaps;
      let cursor = L;
      for (const e of sorted) {
        const nx = cursor + e.w / 2;
        moveCenter(e, nx, e.y);
        cursor += e.w + space;
      }
    } else if (mode === "vspace") {
      const sorted = elems.slice().sort((a, b) => a.y - b.y);
      const T = Math.min(...tops);
      const B = Math.max(...bottoms);
      const totalH = sorted.reduce((s, e) => s + e.h, 0);
      const gaps = sorted.length - 1;
      const space = (B - T - totalH) / gaps;
      let cursor = T;
      for (const e of sorted) {
        const ny = cursor + e.h / 2;
        moveCenter(e, e.x, ny);
        cursor += e.h + space;
      }
    }

    function applyAlign(f: (e: { x: number; y: number; w: number; h: number }) => { x: number; y: number }) {
      elems.forEach((e) => {
        const { x, y } = f(e);
        moveCenter(e, x, y);
      });
    }
    function moveCenter(e: { x: number; y: number; w: number; h: number; rot: number }, nx: number, ny: number) {
      // apply to selected sets
      for (const s of selection) {
        if (s.kind === "obj") {
          const o = objects.find((x) => x.id === s.id)!;
          if (Math.abs(o.x - e.x) < 0.001 && Math.abs(o.y - e.y) < 0.001) {
            patchObj[o.id] = { ...o, x: snapGrid ? snap(nx, gridStep) : nx, y: snapGrid ? snap(ny, gridStep) : ny };
            break;
          }
        } else {
          const b = beds.find((x) => x.id === s.id)!;
          const bx = (b.location_x ?? 0);
          const by = (b.location_y ?? 0);
          if (Math.abs(bx - e.x) < 0.001 && Math.abs(by - e.y) < 0.001) {
            patchBed[b.id] = { x: snapGrid ? snap(nx, gridStep) : nx, y: snapGrid ? snap(ny, gridStep) : ny };
            break;
          }
        }
      }
    }

    // commit patches
    setObjects((prev) => prev.map((o) => patchObj[o.id] ?? o));
    // for beds, call onBedMove
    Promise.all(Object.entries(patchBed).map(([id, v]) => onBedMove(id, v.x!, v.y!))).catch(() => {});
  };

  /** =========================
   *  Render
   *  ========================= */
  return (
    <div className="relative rounded-xl border bg-muted/30" style={{ height: "70vh" }}>
      {/* Toolbar */}
      <div className="absolute z-50 left-3 top-3 flex flex-wrap gap-2 p-2 rounded-xl bg-white/90 shadow-lg border">
        <button className="icon-btn" title="Selecteren (S)" onClick={() => setTool("select")}>
          <Pointer className="w-4 h-4" />
        </button>
        <button className={cn("icon-btn", tool === "ruler" && "bg-primary text-primary-foreground")} title="Meetlint (R)" onClick={() => setTool((t) => (t === "ruler" ? "select" : "ruler"))}>
          <Ruler className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button className="icon-btn" title="Zoom in (+)" onClick={() => setScale((s) => clamp(s * 1.1, 0.2, 5))}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Zoom uit (-)" onClick={() => setScale((s) => clamp(s / 1.1, 0.2, 5))}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Alles in beeld (0)" onClick={fitAll}>
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button className={cn("icon-btn", showGrid && "bg-primary/10")} title="Raster weergeven" onClick={() => setShowGrid((v) => !v)}>
          <GridIcon className="w-4 h-4" />
        </button>
        <button className={cn("icon-btn", snapGrid && "bg-primary/10")} title="Snappen aan raster" onClick={() => setSnapGrid((v) => !v)}>
          <Square className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button className="icon-btn" title="Kas toevoegen" onClick={() => addObject("greenhouse")}>
          <Factory className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Grasvlak toevoegen" onClick={() => addObject("grass")}>
          <Trees className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Struik toevoegen" onClick={() => addObject("shrub")}>
          <Mountain className="w-4 h-4" />
        </button>
        <button className="icon-btn" title="Grindvlak toevoegen" onClick={() => addObject("gravel")}>
          <Move3D className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector */}
      <Inspector
        selection={selection}
        beds={beds}
        bedMeta={bedMeta}
        objects={objects}
        onPatch={updateSelected}
        onDelete={removeSelectedObjects}
        onDuplicate={() => {
          // duplicate selected objects
          const clones: PlotObject[] = [];
          for (const s of selection) {
            if (s.kind !== "obj") continue;
            const src = objects.find((o) => o.id === s.id);
            if (src) clones.push({ ...src, id: crypto.randomUUID(), x: src.x + 20, y: src.y + 20 });
          }
          if (clones.length) setObjects((p) => [...p, ...clones]);
          // duplicate beds via callback
          if (onBedDuplicate) {
            const bedIds = selection.filter((s) => s.kind === "bed").map((s) => s.id);
            beds.filter((b) => bedIds.includes(b.id)).forEach((b) => onBedDuplicate(b));
          }
        }}
        align={align}
      />

      {/* Canvas */}
      <div
        ref={wrapRef}
        className="absolute inset-0 overflow-hidden rounded-xl"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          background: grassBG,
          // grid overlay
          backgroundImage: `${gridBG}`,
          backgroundSize: `${cmToPx(gridStep)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep * 5)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep)}px ${cmToPx(gridStep * 5)}px`,
          backgroundBlendMode: showGrid ? "overlay, normal, overlay, normal" : "normal",
        }}
      >
        <svg
          className="absolute inset-0"
          width="100%"
          height="100%"
          style={{ touchAction: "none" }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Objects under beds (grass, gravel) */}
            {objects
              .filter((o) => o.type === "grass" || o.type === "gravel")
              .map((o) => (
                <ObjectRect key={o.id} o={o} selected={isSelected("obj", o.id)} onSelect={(add) => toggleSelect({ kind: "obj", id: o.id }, add)} />
              ))}

            {/* Beds */}
            {beds.map((b) => {
              const rot = bedMeta[b.id]?.rot ?? 0;
              const z = bedMeta[b.id]?.z ?? DEFAULT_BED_HEIGHT_CM;

              const cx = (b.location_x ?? 0) + (tempMove.current && tempMoveIds.current.includes(b.id) ? tempMove.current.dx : 0);
              const cy = (b.location_y ?? 0) + (tempMove.current && tempMoveIds.current.includes(b.id) ? tempMove.current.dy : 0);

              const w = b.width_cm ?? 120;
              const h = b.length_cm ?? 300;
              const segs = Math.max(1, b.segments ?? 1);
              const styles = bedStyles(!!b.is_greenhouse);

              const ext = extrudeOffset(z);

              return (
                <g key={b.id} transform={`translate(${cx}, ${cy}) rotate(${rot})`} onPointerDown={(e) => { e.stopPropagation(); toggleSelect({ kind: "bed", id: b.id }, e.shiftKey); }}>
                  {/* pseudo 3D extrude */}
                  <g opacity={0.45} transform={`translate(${ext.dx / scale}, ${ext.dy / scale})`}>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 / scale} ry={6 / scale} fill="#000" />
                  </g>
                  {/* wood border */}
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 / scale} ry={6 / scale} fill="url(#wood)" style={{ fill: styles.wood }} />
                  {/* inner soil */}
                  <rect x={-w / 2 + 4} y={-h / 2 + 4} width={w - 8} height={h - 8} rx={4 / scale} ry={4 / scale} fill="url(#soil)" style={{ fill: styles.soil }} />
                  {/* segments */}
                  <g stroke="rgba(255,255,255,0.35)" strokeWidth={0.8 / scale}>
                    <path d={() => ""} />
                    <SegmentPath w={w - 8} h={h - 8} segments={segs} />
                  </g>
                  {/* hover name */}
                  <title>{b.name}</title>
                  {/* selection halo */}
                  {isSelected("bed", b.id) && (
                    <rect x={-w / 2 - SELECT_HALO / scale} y={-h / 2 - SELECT_HALO / scale} width={w + (SELECT_HALO * 2) / scale} height={h + (SELECT_HALO * 2) / scale} fill="none" stroke="#3b82f6" strokeWidth={2 / scale} strokeDasharray={`${8 / scale} ${6 / scale}`} />
                  )}
                </g>
              );
            })}

            {/* Objects above beds (greenhouse, shrubs) */}
            {objects
              .filter((o) => o.type === "greenhouse" || o.type === "shrub")
              .map((o) => (
                <ObjectRect key={o.id} o={o} selected={isSelected("obj", o.id)} onSelect={(add) => toggleSelect({ kind: "obj", id: o.id }, add)} />
              ))}

            {/* Selection rotate handle */}
            {selection.length === 1 && (() => {
              const pt = getRotateHandlePosition(selection[0]);
              if (!pt) return null;
              const spt = { x: pt.x, y: pt.y };
              return (
                <g transform={`translate(${spt.x}, ${spt.y})`}>
                  <circle r={HANDLE_SIZE / scale} fill="#3b82f6" />
                  <RotateCw stroke="white" strokeWidth={1.5 / scale} className="w-4 h-4" />
                </g>
              );
            })()}

            {/* Ruler */}
            {tool === "ruler" && ruler && (
              <g stroke="#111" strokeWidth={2 / scale}>
                <line x1={ruler.x1} y1={ruler.y1} x2={ruler.x2} y2={ruler.y2} />
                <circle cx={ruler.x1} cy={ruler.y1} r={3 / scale} fill="#111" />
                <circle cx={ruler.x2} cy={ruler.y2} r={3 / scale} fill="#111" />
                <text
                  x={(ruler.x1 + ruler.x2) / 2}
                  y={(ruler.y1 + ruler.y2) / 2 - 8 / scale}
                  fontSize={10 / scale}
                  textAnchor="middle"
                  fill="#111"
                >
                  {Math.round(Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1))} cm
                </text>
              </g>
            )}
          </g>

          {/* defs for gradients (wood/soil) */}
          <defs>
            <linearGradient id="wood" x1="0" x2="1">
              <stop offset="0" stopColor="#8a5a3a" />
              <stop offset="1" stopColor="#70452a" />
            </linearGradient>
            <linearGradient id="soil" x1="0" x2="1">
              <stop offset="0" stopColor="#6b5137" />
              <stop offset="1" stopColor="#5a432c" />
            </linearGradient>
          </defs>
        </svg>

        {/* Scale bar */}
        <div className="absolute right-3 bottom-3 rounded-md bg-white/90 border shadow px-2 py-1 text-[11px]">
          <ScaleBar scale={scale} />
        </div>
      </div>
    </div>
  );
}

/** =========================
 *  Segment path as component
 *  ========================= */
function SegmentPath({ w, h, segments }: { w: number; h: number; segments: number }) {
  const d: string[] = [];
  if (segments > 1) {
    if (h >= w) {
      const step = h / segments;
      for (let i = 1; i < segments; i++) {
        const y = -h / 2 + i * step;
        d.push(`M ${-w / 2} ${y} L ${w / 2} ${y}`);
      }
    } else {
      const step = w / segments;
      for (let i = 1; i < segments; i++) {
        const x = -w / 2 + i * step;
        d.push(`M ${x} ${-h / 2} L ${x} ${h / 2}`);
      }
    }
  }
  return <path d={d.join(" ")} />;
}

/** =========================
 *  Object renderer
 *  ========================= */
function ObjectRect({
  o,
  selected,
  onSelect,
}: {
  o: PlotObject;
  selected: boolean;
  onSelect: (add: boolean) => void;
}) {
  const theme = useMemo(() => {
    switch (o.type) {
      case "greenhouse":
        return { fill: "rgba(173, 216, 230, 0.4)", stroke: "#6ca6d9", roof: "rgba(255,255,255,0.8)" };
      case "grass":
        return { fill: "rgba(104, 180, 104, 0.45)", stroke: "#4e9c4e" };
      case "shrub":
        return { fill: "rgba(46, 125, 50, 0.7)", stroke: "#2e7d32" };
      case "gravel":
      default:
        return { fill: "rgba(160, 160, 160, 0.45)", stroke: "#7a7a7a" };
    }
  }, [o.type]);

  const ext = (heightCm: number, scale = 1) => {
    const k = 0.18;
    const off = heightCm * k;
    return { dx: off, dy: off * 0.6 };
  };

  const e = ext(o.z);

  return (
    <g transform={`translate(${o.x}, ${o.y}) rotate(${o.rot})`} onPointerDown={(e) => { e.stopPropagation(); onSelect(e.shiftKey); }}>
      {/* pseudo 3D */}
      {o.z > 0 && (
        <g opacity={0.35} transform={`translate(${e.dx}, ${e.dy})`}>
          <rect x={-o.w / 2} y={-o.h / 2} width={o.w} height={o.h} rx={6} ry={6} fill="#000" />
        </g>
      )}
      <rect x={-o.w / 2} y={-o.h / 2} width={o.w} height={o.h} rx={6} ry={6} fill={theme.fill} stroke={theme.stroke} strokeWidth={2} />
      {/* greenhouse roof hint */}
      {o.type === "greenhouse" && (
        <rect x={-o.w / 2 + 8} y={-o.h / 2 + 8} width={o.w - 16} height={o.h - 16} rx={4} ry={4} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" />
      )}
      <title>{o.label || o.type}</title>
      {selected && (
        <rect x={-o.w / 2 - 6} y={-o.h / 2 - 6} width={o.w + 12} height={o.h + 12} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="8 6" />
      )}
    </g>
  );
}

/** =========================
 *  Inspector sidebar
 *  ========================= */
function Inspector({
  selection,
  beds,
  bedMeta,
  objects,
  onPatch,
  onDelete,
  onDuplicate,
  align,
}: {
  selection: ( { kind: "bed"; id: string } | { kind: "obj"; id: string } )[];
  beds: GardenBed[];
  bedMeta: Record<string, BedMeta>;
  objects: PlotObject[];
  onPatch: (patch: Partial<PlotObject> & Partial<BedMeta>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  align: (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "hspace" | "vspace") => void;
}) {
  const single = selection.length === 1 ? selection[0] : null;

  const info = useMemo(() => {
    if (!single) return null;
    if (single.kind === "bed") {
      const b = beds.find((x) => x.id === single.id);
      if (!b) return null;
      return {
        title: b.name,
        type: b.is_greenhouse ? "Bak (Kas)" : "Bak",
        w: b.width_cm ?? 120,
        h: b.length_cm ?? 300,
        rot: (bedMeta[b.id]?.rot ?? 0),
        z: (bedMeta[b.id]?.z ?? DEFAULT_BED_HEIGHT_CM),
        editable: { rot: true, z: true, label: false, size: false },
      };
    } else {
      const o = objects.find((x) => x.id === single.id);
      if (!o) return null;
      return {
        title: o.label || o.type,
        type: `Object (${o.type})`,
        w: o.w,
        h: o.h,
        rot: o.rot,
        z: o.z,
        editable: { rot: true, z: true, label: true, size: true },
      };
    }
  }, [single, beds, bedMeta, objects]);

  if (!selection.length) return null;

  return (
    <div className="absolute right-3 top-3 z-50 w-72 rounded-xl bg-white/90 border shadow-lg">
      <div className="px-3 py-2 border-b">
        <div className="text-sm font-semibold">Eigenschappen</div>
        <div className="text-[11px] text-muted-foreground">{selection.length > 1 ? `${selection.length} items geselecteerd` : info?.type}</div>
      </div>

      {single && info && (
        <div className="p-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Titel/label</div>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              disabled={!info.editable.label}
              value={info.title}
              onChange={(e) => info.editable.label && onPatch({ label: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Num label="Breedte (cm)" value={info.w} disabled={!info.editable.size} onChange={(v) => info.editable.size && onPatch({ w: v })} />
            <Num label="Lengte (cm)" value={info.h} disabled={!info.editable.size} onChange={(v) => info.editable.size && onPatch({ h: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Num label="Rotatie (°)" value={info.rot} onChange={(v) => onPatch({ rot: v })} />
            <Num label="Hoogte (cm)" value={info.z} onChange={(v) => onPatch({ z: v })} />
          </div>

          <div className="flex items-center gap-2">
            <button className="btn" onClick={onDuplicate}><Copy className="w-4 h-4 mr-1" />Dupliceren</button>
            <button className="btn danger" onClick={onDelete}><Trash2 className="w-4 h-4 mr-1" />Verwijderen</button>
          </div>
        </div>
      )}

      {/* Align tools */}
      {selection.length >= 2 && (
        <div className="p-3 border-t space-y-2">
          <div className="text-[11px] text-muted-foreground">Uitlijnen / Verdelen</div>
          <div className="grid grid-cols-4 gap-1">
            <button className="btn tiny" onClick={() => align("left")}>Links</button>
            <button className="btn tiny" onClick={() => align("hcenter")}>H-center</button>
            <button className="btn tiny" onClick={() => align("right")}>Rechts</button>
            <button className="btn tiny" onClick={() => align("hspace")}>H-spatie</button>
            <button className="btn tiny" onClick={() => align("top")}>Boven</button>
            <button className="btn tiny" onClick={() => align("vcenter")}>V-center</button>
            <button className="btn tiny" onClick={() => align("bottom")}>Onder</button>
            <button className="btn tiny" onClick={() => align("vspace")}>V-spatie</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Number input helper */
function Num({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="text-[11px] text-muted-foreground block">
      {label}
      <input
        type="number"
        className="mt-1 w-full border rounded px-2 py-1 text-sm disabled:opacity-50"
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || "0"))}
      />
    </label>
  );
}

/** =========================
 *  Scale bar in pixels
 *  ========================= */
function ScaleBar({ scale }: { scale: number }) {
  // choose a nice unit in cm (50, 100, 200…) to show ~120-180px
  const candidates = [20, 50, 100, 200, 500, 1000];
  const targetPx = 140;
  let pick = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c * scale - targetPx) < Math.abs(pick * scale - targetPx)) pick = c;
  }
  const px = Math.max(1, Math.round(pick * scale));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-2 bg-foreground/70" />
      <div className="h-[6px] bg-foreground/70" style={{ width: `${px}px` }} />
      <div className="text-xs tabular-nums">{pick} cm</div>
    </div>
  );
}

/** =========================
 *  Small Tailwind helpers
 *  ========================= */
declare module "react" { interface HTMLAttributes<T> { } }
const style = `
.icon-btn{ @apply inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition; }
.btn{ @apply inline-flex items-center px-2.5 py-1.5 rounded-md border bg-white hover:bg-muted transition text-sm;}
.btn.tiny{ @apply px-2 py-1 text-xs}
.btn.danger{ @apply bg-red-50 border-red-200 text-red-700 hover:bg-red-100}
`;
