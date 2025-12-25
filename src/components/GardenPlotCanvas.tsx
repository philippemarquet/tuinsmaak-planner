// src/components/GardenPlotCanvas.tsx — Smooth drag + betere numeric input (commit op blur/enter)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed } from "../lib/types";
import { cn } from "../lib/utils";
import {
  Ruler,
  Square,
  Trees,
  Factory,
  Mountain,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid as GridIcon,
  Pointer,
  Move3D,
} from "lucide-react";
import { updateBed } from "../lib/api/beds";

type UUID = string;
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel";
type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  label?: string;
};

type BedMeta = {
  z?: number;
  w?: number; // lokale override voor breedte (cm)
  h?: number; // lokale override voor lengte (cm)
};

const DEFAULT_BED_HEIGHT_CM = 25;
const SELECT_HALO = 8;

const STORAGE_OBJECTS = (p: string) => `${p}:objects`;
const STORAGE_BEDMETA = (p: string) => `${p}:bedMeta`;
const STORAGE_VIEW = (p: string) => `${p}:view`;
const STORAGE_GRID = (p: string) => `${p}:grid`;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const snapTo = (v: number, step: number) => Math.round(v / step) * step;

function safeLoadJSON(raw: string | null): any {
  if (!raw) return {};
  try { return JSON.parse(raw) ?? {}; } catch { return {}; }
}
function safeLoadView(prefix: string) {
  const v = safeLoadJSON(localStorage.getItem(STORAGE_VIEW(prefix)));
  const scale = Number.isFinite(+v?.scale) && +v.scale >= 0.2 && +v.scale <= 5 ? +v.scale : 1.2;
  const pan = v?.pan && Number.isFinite(+v.pan.x) && Number.isFinite(+v.pan.y) ? { x: +v.pan.x, y: +v.pan.y } : { x: 0, y: 0 };
  return { scale, pan };
}
function safeLoadGrid(prefix: string) {
  const g = safeLoadJSON(localStorage.getItem(STORAGE_GRID(prefix)));
  return { showGrid: g?.showGrid !== false, snapGrid: g?.snapGrid !== false };
}

/* ------------------------- NumericField (commit on blur/enter) ------------------------- */
function NumericField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  disabled,
  inputMode = "numeric",
  className,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
}) {
  const [buf, setBuf] = useState<string>(Number.isFinite(value) ? String(value) : "");
  const [editing, setEditing] = useState(false);

  // sync vanuit prop wanneer niet aan het editen
  useEffect(() => {
    if (!editing) setBuf(Number.isFinite(value) ? String(value) : "");
  }, [value, editing]);

  const commit = useCallback(() => {
    // lege -> revert
    if (buf.trim() === "" || buf === "-" || buf === "+") {
      setBuf(Number.isFinite(value) ? String(value) : "");
      setEditing(false);
      return;
    }
    const n = Number(buf.replace(",", ".")); // 12,5 -> 12.5
    if (!Number.isFinite(n)) {
      setBuf(Number.isFinite(value) ? String(value) : "");
      setEditing(false);
      return;
    }
    let out = n;
    if (typeof min === "number") out = Math.max(min, out);
    if (typeof max === "number") out = Math.min(max, out);
    // cm werken we integer; laat gerust decimalen staan voor hoogte indien gewenst
    onCommit(Math.round(out));
    setEditing(false);
  }, [buf, value, min, max, onCommit]);

  return (
    <label className={cn("text-[11px] text-muted-foreground block", className)}>
      {label}
      <input
        type="text"
        inputMode={inputMode}
        className="mt-1 w-full border rounded px-2 py-1 text-sm disabled:opacity-50"
        disabled={disabled}
        value={buf}
        onChange={(e) => { setBuf(e.target.value); setEditing(true); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setEditing(false); setBuf(Number.isFinite(value) ? String(value) : ""); (e.currentTarget as HTMLInputElement).blur(); }
          if (e.key === "ArrowUp" && !disabled) { e.preventDefault(); onCommit(clamp((Number(buf) || value) + step, min ?? -Infinity, max ?? Infinity)); }
          if (e.key === "ArrowDown" && !disabled) { e.preventDefault(); onCommit(clamp((Number(buf) || value) - step, min ?? -Infinity, max ?? Infinity)); }
        }}
      />
    </label>
  );
}

/* -------------------------------------------------------------------------------------- */

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
  // ===== Viewport
  const initView = useRef(safeLoadView(storagePrefix));
  const [scale, setScale] = useState(initView.current.scale);
  const [pan, setPan] = useState(initView.current.pan);
  useEffect(() => { localStorage.setItem(STORAGE_VIEW(storagePrefix), JSON.stringify({ scale, pan })); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_VIEW(storagePrefix), JSON.stringify({ scale, pan })); }, [scale, pan, storagePrefix]);

  // ===== Grid
  const initGrid = useRef(safeLoadGrid(storagePrefix));
  const [showGrid, setShowGrid] = useState(initGrid.current.showGrid);
  const [snapGrid, setSnapGrid] = useState(initGrid.current.snapGrid);
  const [fixedStep, setFixedStep] = useState<0 | 10 | 20 | 50>(0);
  useEffect(() => { localStorage.setItem(STORAGE_GRID(storagePrefix), JSON.stringify({ showGrid, snapGrid })); }, []);
  useEffect(() => { localStorage.setItem(STORAGE_GRID(storagePrefix), JSON.stringify({ showGrid, snapGrid })); }, [showGrid, snapGrid, storagePrefix]);

  const gridStep = useMemo<10 | 20 | 50>(() => (fixedStep ? fixedStep : scale < 0.8 ? 50 : scale < 1.5 ? 20 : 10), [scale, fixedStep]);

  // ===== Local objects & bed meta
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    const raw = localStorage.getItem(STORAGE_OBJECTS(storagePrefix));
    const arr = safeLoadJSON(raw);
    return Array.isArray(arr) ? (arr as PlotObject[]).map(o => ({ ...o, z: o.z ?? 0 })) : [];
  });
  const [bedMeta, setBedMeta] = useState<Record<UUID, BedMeta>>(() => {
    const raw = localStorage.getItem(STORAGE_BEDMETA(storagePrefix));
    const obj = safeLoadJSON(raw);
    return obj && typeof obj === "object" ? (obj as Record<UUID, BedMeta>) : {};
  });
  useEffect(() => { localStorage.setItem(STORAGE_OBJECTS(storagePrefix), JSON.stringify(objects)); }, [objects, storagePrefix]);
  useEffect(() => { localStorage.setItem(STORAGE_BEDMETA(storagePrefix), JSON.stringify(bedMeta)); }, [bedMeta, storagePrefix]);

  // ===== Selection
  type Sel = { kind: "bed"; id: UUID } | { kind: "obj"; id: string } | null;
  const [selection, setSelection] = useState<Sel[]>([]);
  const isSelected = useCallback((kind: Sel["kind"], id: string) => selection.some((s) => s?.kind === kind && s.id === id), [selection]);
  const toggleSelect = (sel: Sel, additive: boolean) => {
    if (!sel) return;
    setSelection((prev) => {
      if (!additive) return [sel];
      const exists = prev.some((s) => s?.kind === sel.kind && s.id === sel.id);
      return exists ? prev.filter((s) => !(s?.kind === sel.kind && s.id === sel.id)) : [...prev, sel];
    });
  };
  const clearSelection = () => setSelection([]);

  const [tool, setTool] = useState<"select" | "ruler">("select");
  const [ruler, setRuler] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);

  // ===== Refs & conversions
  const wrapRef = useRef<HTMLDivElement>(null);
  const cmToPx = (cm: number) => cm * scale;
  const worldToScreen = (x: number, y: number) => ({ x: x * scale + pan.x, y: y * scale + pan.y });
  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - pan.x) / scale, y: (sy - pan.y) / scale });
  const extrudeOffset = (heightCm: number) => {
    const k = 0.18;
    const off = cmToPx(heightCm) * k;
    return { dx: off, dy: off * 0.6 };
  };

  // ===== Zoom / Fit
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.pow(1.001, -e.deltaY);
      const ns = clamp(scale * factor, 0.2, 5);
      const rect = wrapRef.current?.getBoundingClientRect();
      const left = rect?.left ?? 0, top = rect?.top ?? 0;
      const before = screenToWorld(e.clientX - left, e.clientY - top);
      setScale(ns);
      const after = screenToWorld(e.clientX - left, e.clientY - top);
      setPan((p) => ({ x: p.x + (after.x - before.x) * ns, y: p.y + (after.y - before.y) * ns }));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };
  function sceneBounds() {
    const xs: number[] = [], ys: number[] = [];
    for (const b of beds) {
      const { w, h } = getBedSize(b);
      const hw = w / 2, hh = h / 2;
      const cx = b.location_x ?? 0, cy = b.location_y ?? 0;
      xs.push(cx - hw, cx + hw); ys.push(cy - hh, cy + hh);
    }
    for (const o of objects) {
      const hw = o.w / 2, hh = o.h / 2;
      xs.push(o.x - hw, o.x + hw); ys.push(o.y - hh, o.y + hh);
    }
    if (!xs.length) return { minX: -500, maxX: 500, minY: -300, maxY: 300 };
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  const fitAll = () => {
    const el = wrapRef.current; if (!el) return;
    const PAD = 120;
    const b = sceneBounds(); const r = el.getBoundingClientRect();
    const w = Math.max(1, b.maxX - b.minX), h = Math.max(1, b.maxY - b.minY);
    const s = clamp(Math.min((r.width - PAD) / w, (r.height - PAD) / h), 0.2, 5);
    setScale(s);
    setPan({ x: r.width / 2 - ((b.minX + b.maxX) / 2) * s, y: r.height / 2 - ((b.minY + b.maxY) / 2) * s });
  };

  // ===== Objects
  const addObject = (type: PlotObjectType) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? window.innerWidth) * 0.5;
    const cy = (rect?.height ?? window.innerHeight) * 0.4;
    const center = screenToWorld(cx, cy);
    const mk = (o: Partial<PlotObject>): PlotObject => ({ id: crypto.randomUUID(), type: "grass", x: center.x, y: center.y, w: 200, h: 200, z: 0, ...o }) as PlotObject;
    const obj =
      type === "greenhouse" ? mk({ type, w: 300, h: 200, z: 220, label: "Kas" }) :
      type === "shrub"      ? mk({ type, w: 120, h: 120, z: 80,  label: "Struik" }) :
      type === "gravel"     ? mk({ type, w: 300, h: 200, z: 0,   label: "Grind" }) :
                              mk({ type, w: 400, h: 400, z: 0,   label: "Gras" });
    setObjects((p) => [...p, obj]);
    setSelection([{ kind: "obj", id: obj.id }]);
  };

  // ===== Visuals
  const grassBG =
    "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.15) 0 12%, transparent 13%), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.05) 0 18%, transparent 19%), #cfe8cf";
  const gridBG = useMemo(() => {
    if (!showGrid) return "transparent";
    const stepPx = Math.max(8, cmToPx(gridStep));
    const minor = "#b4d9b4", major = "#7fbf7f", every = 5;
    const minorCSS = `${minor} 1px, transparent 1px`;
    const majorCSS = `${major} 1px, transparent 1px`;
    return `repeating-linear-gradient(90deg, ${minorCSS} ${stepPx}px), repeating-linear-gradient(90deg, ${majorCSS} ${stepPx * every}px), repeating-linear-gradient(0deg, ${minorCSS} ${stepPx}px), repeating-linear-gradient(0deg, ${majorCSS} ${stepPx * every}px)`;
  }, [showGrid, gridStep, scale]);

  const bedStyles = (isGreenhouse: boolean) => {
    const wood = isGreenhouse ? "linear-gradient(90deg, #9ccbee, #7db2db)" : "linear-gradient(90deg, #8a5a3a, #70452a)";
    const soil = "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06) 0 10%, transparent 11%), radial-gradient(circle at 70% 60%, rgba(0,0,0,0.18) 0 14%, transparent 15%), #6b5137";
    return { wood, soil };
  };
  function SegmentPath({ w, h, segments }: { w: number; h: number; segments: number }) {
    const d: string[] = [];
    if (segments > 1) {
      if (h >= w) { const step = h / segments; for (let i = 1; i < segments; i++) { const y = -h / 2 + i * step; d.push(`M ${-w / 2} ${y} L ${w / 2} ${y}`); } }
      else { const step = w / segments; for (let i = 1; i < segments; i++) { const x = -w / 2 + i * step; d.push(`M ${x} ${-h / 2} L ${x} ${h / 2}`); } }
    }
    return <path d={d.join(" ")} />;
  }

  // ===== Helpers
  function getBedSize(b: GardenBed) {
    return {
      w: bedMeta[b.id]?.w ?? (b.width_cm ?? 120),
      h: bedMeta[b.id]?.h ?? (b.length_cm ?? 300),
    };
  }

  // ===== Hit tests (axis-aligned)
  const hitBed = (wx: number, wy: number): GardenBed | null => {
    for (let i = beds.length - 1; i >= 0; i--) {
      const b = beds[i];
      const { w, h } = getBedSize(b);
      const cx = b.location_x ?? 0, cy = b.location_y ?? 0;
      const hw = w / 2, hh = h / 2;
      if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) return b;
    }
    return null;
  };
  const hitObj = (wx: number, wy: number): PlotObject | null => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      const hw = o.w / 2 + 6; // iets grotere hitbox
      const hh = o.h / 2 + 6;
      if (wx >= o.x - hw && wx <= o.x + hw && wy >= o.y - hh && wy <= o.y + hh) return o;
    }
    return null;
  };

  // ===== Drag state + live preview (RAF)
  const dragState = useRef<{
    mode: "none" | "pan" | "drag-beds" | "drag-objects" | "ruler";
    startSx: number;
    startSy: number;
    prevPan: { x: number; y: number };
    startWorld: { x: number; y: number };
    altClone?: boolean;
    lastShift?: boolean;
  }>({ mode: "none", startSx: 0, startSy: 0, prevPan: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 } });

  // temp preview
  const tempBedMove = useRef<null | { dx: number; dy: number }>(null);
  const tempBedIds = useRef<string[]>([]);
  const tempObjMove = useRef<null | { dx: number; dy: number }>(null);
  const tempObjIds = useRef<string[]>([]);

  // hover -> cursor
  const [hovering, setHovering] = useState<"bed" | "obj" | null>(null);

  // re-render throttle @ 60fps
  const [, setDragTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const scheduleFrame = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setDragTick((t) => t + 1);
    });
  };
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  function effectiveSnap(shift: boolean) {
    return shift ? !snapGrid : snapGrid;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const el = wrapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (tool === "ruler") {
      dragState.current = { mode: "ruler", startSx: sx, startSy: sy, startWorld: w, prevPan: pan };
      setRuler({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    const o = hitObj(w.x, w.y);
    const b = !o ? hitBed(w.x, w.y) : null;

    if (o) {
      toggleSelect({ kind: "obj", id: o.id }, e.shiftKey);
      dragState.current = { mode: "drag-objects", startSx: sx, startSy: sy, startWorld: w, prevPan: pan, altClone: e.altKey, lastShift: e.shiftKey };
      tempObjMove.current = { dx: 0, dy: 0 };
      // include huidige klik altijd in preview set
      const selIds = selection.filter((s) => s?.kind === "obj").map((s) => (s as any).id as string);
      tempObjIds.current = selIds.includes(o.id) ? selIds : [...selIds, o.id];
    } else if (b) {
      toggleSelect({ kind: "bed", id: b.id }, e.shiftKey);
      dragState.current = { mode: "drag-beds", startSx: sx, startSy: sy, startWorld: w, prevPan: pan, altClone: e.altKey, lastShift: e.shiftKey };
      tempBedMove.current = { dx: 0, dy: 0 };
      const selIds = selection.filter((s) => s?.kind === "bed").map((s) => (s as any).id as string);
      tempBedIds.current = selIds.includes(b.id) ? selIds : [...selIds, b.id];
    } else {
      if (!e.shiftKey) clearSelection();
      dragState.current = { mode: "pan", startSx: sx, startSy: sy, startWorld: w, prevPan: pan };
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scheduleFrame();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = wrapRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);
    const ds = dragState.current;

    // hover cursor als we niet aan het pannen/draggen zijn
    if (ds.mode === "none" || ds.mode === "pan") {
      const o = hitObj(w.x, w.y);
      const b = !o ? hitBed(w.x, w.y) : null;
      setHovering(o ? "obj" : b ? "bed" : null);
    }

    if (ds.mode === "pan") {
      const dx = sx - ds.startSx, dy = sy - ds.startSy;
      setPan({ x: ds.prevPan.x + dx, y: ds.prevPan.y + dy });
      return;
    }
    if (ds.mode === "ruler") {
      setRuler((r) => (r ? { ...r, x2: w.x, y2: w.y } : r));
      return;
    }

    // live preview
    const dxw = w.x - ds.startWorld.x;
    const dyw = w.y - ds.startWorld.y;

    if (ds.mode === "drag-beds") {
      tempBedMove.current = { dx: dxw, dy: dyw };
      scheduleFrame();
      return;
    }
    if (ds.mode === "drag-objects") {
      tempObjMove.current = { dx: dxw, dy: dyw };
      scheduleFrame();
      return;
    }
  };

  const commitMoves = async () => {
    const ds = dragState.current;
    const useSnap = effectiveSnap(!!ds.lastShift);

    // Beds
    if (tempBedMove.current && tempBedIds.current.length) {
      const { dx, dy } = tempBedMove.current;
      const sdx = useSnap ? snapTo(dx, gridStep) : dx;
      const sdy = useSnap ? snapTo(dy, gridStep) : dy;
      await Promise.all(
        beds
          .filter((b) => tempBedIds.current.includes(b.id))
          .map((b) => onBedMove(b.id, (b.location_x ?? 0) + sdx, (b.location_y ?? 0) + sdy))
      ).catch(() => {});
      if (ds.altClone && onBedDuplicate) {
        beds.filter((b) => tempBedIds.current.includes(b.id)).forEach((b) => onBedDuplicate(b));
      }
    }
    tempBedMove.current = null;
    tempBedIds.current = [];

    // Objects
    if (tempObjMove.current && tempObjIds.current.length) {
      const { dx, dy } = tempObjMove.current;
      const sdx = useSnap ? snapTo(dx, gridStep) : dx;
      const sdy = useSnap ? snapTo(dy, gridStep) : dy;

      setObjects((prev) =>
        prev.map((o) => (tempObjIds.current.includes(o.id) ? { ...o, x: o.x + sdx, y: o.y + sdy } : o))
      );

      if (ds.altClone) {
        setObjects((prev) => {
          const clones: PlotObject[] = [];
          for (const id of tempObjIds.current) {
            const src = prev.find((p) => p.id === id);
            if (src) clones.push({ ...src, id: crypto.randomUUID(), x: src.x + 30, y: src.y + 30 });
          }
          return [...prev, ...clones];
        });
      }
    }
    tempObjMove.current = null;
    tempObjIds.current = [];
    scheduleFrame();
  };

  const onPointerUp = async () => {
    await commitMoves();
    dragState.current = { ...dragState.current, mode: "none" };
  };
  const onPointerCancel = async () => {
    await commitMoves();
    dragState.current = { ...dragState.current, mode: "none" };
  };

  // ===== Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") setTool((t) => (t === "ruler" ? "select" : "ruler"));
      if (e.key === "Escape") { setTool("select"); clearSelection(); setRuler(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
        setObjects((prev) => prev.filter((o) => !isSelected("obj", o.id)));
        setSelection((prev) => prev.filter((s) => s?.kind !== "obj"));
      }
      if (e.key === "+") setScale((s) => clamp(s * 1.1, 0.2, 5));
      if (e.key === "-") setScale((s) => clamp(s / 1.1, 0.2, 5));
      if (e.key === "0") fitAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // ===== Inspector helpers (incl. server persist voor bed-afmetingen)
  const updateSelected = (patch: Partial<PlotObject> & Partial<BedMeta>) => {
    // Patch objects
    setObjects((prev) => prev.map((o) => (isSelected("obj", o.id) ? { ...o, ...patch } : o)));

    // Patch bed meta (z/w/h) + persist sizes
    const selectedBedIds = selection.filter((s): s is { kind: "bed"; id: string } => !!s && s.kind === "bed").map((s) => s.id);

    if (Object.prototype.hasOwnProperty.call(patch, "w") || Object.prototype.hasOwnProperty.call(patch, "h") || Object.prototype.hasOwnProperty.call(patch, "z")) {
      setBedMeta((prev) => {
        const next = { ...prev };
        for (const id of selectedBedIds) {
          next[id] = { ...(next[id] || {}), ...(patch as BedMeta) };
        }
        return next;
      });
    }

    // Persist nieuwe breedte/lengte (indien meegegeven)
    if (selectedBedIds.length && (Object.prototype.hasOwnProperty.call(patch, "w") || Object.prototype.hasOwnProperty.call(patch, "h"))) {
      for (const id of selectedBedIds) {
        const b = beds.find((x) => x.id === id);
        if (!b) continue;
        const current = getBedSize(b);
        const newW = (patch as any).w ?? current.w;
        const newH = (patch as any).h ?? current.h;
        const safeW = clamp(Math.round(newW), 20, 2000);
        const safeH = clamp(Math.round(newH), 20, 2000);
        updateBed(id, { width_cm: safeW, length_cm: safeH }).catch(() => {});
      }
    }
  };

  const removeSelectedObjects = () => {
    setObjects((p) => p.filter((o) => !isSelected("obj", o.id)));
    setSelection((sel) => sel.filter((s) => s?.kind !== "obj"));
  };

  const align = (mode: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter" | "hspace" | "vspace") => {
    const sels = selection.filter(Boolean) as Exclude<Sel, null>[];
    if (sels.length < 2) return;

    const get = (s: Exclude<Sel, null>) => {
      if (s.kind === "bed") {
        const b = beds.find((x) => x.id === s.id)!;
        const add = tempBedMove.current && tempBedIds.current.includes(b.id) ? tempBedMove.current : { dx: 0, dy: 0 };
        const { w, h } = getBedSize(b);
        return { x: (b.location_x ?? 0) + add.dx, y: (b.location_y ?? 0) + add.dy, w, h };
      }
      const o = objects.find((x) => x.id === s.id)!;
      const add = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current : { dx: 0, dy: 0 };
      return { x: o.x + add.dx, y: o.y + add.dy, w: o.w, h: o.h };
    };

    const patchObj: Record<string, PlotObject> = {};
    const patchBed: Record<UUID, { x?: number; y?: number }> = {};

    const elems = sels.map(get);
    const lefts = elems.map((e) => e.x - e.w / 2);
    const rights = elems.map((e) => e.x + e.w / 2);
    const tops = elems.map((e) => e.y - e.h / 2);
    const bottoms = elems.map((e) => e.y + e.h / 2);

    function moveTo(e: { x: number; y: number; w: number; h: number }, nx: number, ny: number) {
      for (const s of sels) {
        if (s.kind === "obj") {
          const o = objects.find((x) => x.id === s.id)!;
          if (Math.abs(o.x - e.x) < 0.001 && Math.abs(o.y - e.y) < 0.001) { patchObj[o.id] = { ...o, x: nx, y: ny }; break; }
        } else {
          const b = beds.find((x) => x.id === s.id)!;
          const bx = (b.location_x ?? 0), by = (b.location_y ?? 0);
          if (Math.abs(bx - e.x) < 0.001 && Math.abs(by - e.y) < 0.001) { patchBed[b.id] = { x: nx, y: ny }; break; }
        }
      }
    }

    if (mode === "left") { const L = Math.min(...lefts); elems.forEach((e) => moveTo(e, L + e.w / 2, e.y)); }
    if (mode === "right") { const R = Math.max(...rights); elems.forEach((e) => moveTo(e, R - e.w / 2, e.y)); }
    if (mode === "top") { const T = Math.min(...tops); elems.forEach((e) => moveTo(e, e.x, T + e.h / 2)); }
    if (mode === "bottom") { const B = Math.max(...bottoms); elems.forEach((e) => moveTo(e, e.x, B - e.h / 2)); }
    if (mode === "hcenter") { const cx = (Math.min(...lefts) + Math.max(...rights)) / 2; elems.forEach((e) => moveTo(e, cx, e.y)); }
    if (mode === "vcenter") { const cy = (Math.min(...tops) + Math.max(...bottoms)) / 2; elems.forEach((e) => moveTo(e, e.x, cy)); }
    if (mode === "hspace") {
      const sorted = elems.slice().sort((a, b) => a.x - b.x);
      const L = Math.min(...lefts), R = Math.max(...rights);
      const totalW = sorted.reduce((s, e) => s + e.w, 0), gaps = sorted.length - 1;
      const space = (R - L - totalW) / gaps; let cursor = L;
      for (const e of sorted) { const nx = cursor + e.w / 2; moveTo(e, nx, e.y); cursor += e.w + space; }
    }
    if (mode === "vspace") {
      const sorted = elems.slice().sort((a, b) => a.y - b.y);
      const T = Math.min(...tops), B = Math.max(...bottoms);
      const totalH = sorted.reduce((s, e) => s + e.h, 0), gaps = sorted.length - 1;
      const space = (B - T - totalH) / gaps; let cursor = T;
      for (const e of sorted) { const ny = cursor + e.h / 2; moveTo(e, e.x, ny); cursor += e.h + space; }
    }

    setObjects((prev) => prev.map((o) => patchObj[o.id] ?? o));
    Promise.all(Object.entries(patchBed).map(([id, v]) => onBedMove(id, v.x!, v.y!))).catch(() => {});
  };

  // ===== BBox helpers
  function getBBoxForSel() {
    const rects: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
    for (const s of selection) {
      if (!s) continue;
      if (s.kind === "bed") {
        const b = beds.find((x) => x.id === s.id); if (!b) continue;
        const { w, h } = getBedSize(b);
        const add = tempBedMove.current && tempBedIds.current.includes(b.id) ? tempBedMove.current : { dx: 0, dy: 0 };
        const cx = (b.location_x ?? 0) + add.dx, cy = (b.location_y ?? 0) + add.dy;
        rects.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2 });
      } else {
        const o = objects.find((x) => x.id === s.id); if (!o) continue;
        const add = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current : { dx: 0, dy: 0 };
        const cx = o.x + add.dx, cy = o.y + add.dy;
        rects.push({ minX: cx - o.w / 2, maxX: cx + o.w / 2, minY: cy - o.h / 2, maxY: cy + o.h / 2 });
      }
    }
    if (!rects.length) return null;
    return {
      minX: Math.min(...rects.map((r) => r.minX)),
      maxX: Math.max(...rects.map((r) => r.maxX)),
      minY: Math.min(...rects.map((r) => r.minY)),
      maxY: Math.max(...rects.map((r) => r.maxY)),
    };
  }

  // ===== Inspector UI
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
    selection: ({ kind: "bed"; id: string } | { kind: "obj"; id: string })[];
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
        const b = beds.find((x) => x.id === single.id); if (!b) return null;
        const size = getBedSize(b);
        return {
          id: b.id,
          title: b.name, type: b.is_greenhouse ? "Bak (Kas)" : "Bak",
          w: size.w, h: size.h,
          z: (bedMeta[b.id]?.z ?? DEFAULT_BED_HEIGHT_CM),
          editable: { z: true, label: false, size: true },
        };
      } else {
        const o = objects.find((x) => x.id === single.id); if (!o) return null;
        return { id: o.id, title: o.label || o.type, type: `Object (${o.type})`, w: o.w, h: o.h, z: o.z, editable: { z: true, label: true, size: true } };
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
                disabled={single.kind === "bed"}
                value={info.title}
                onChange={(e) => single.kind === "obj" && onPatch({ label: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumericField
                key={(info.id ?? "") + "-w"}
                label="Breedte (cm)"
                value={info.w}
                step={5}
                min={20}
                max={2000}
                disabled={!info.editable.size}
                onCommit={(v) => onPatch({ w: v })}
              />
              <NumericField
                key={(info.id ?? "") + "-h"}
                label="Lengte (cm)"
                value={info.h}
                step={5}
                min={20}
                max={2000}
                disabled={!info.editable.size}
                onCommit={(v) => onPatch({ h: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <NumericField
                key={(info.id ?? "") + "-z"}
                label="Hoogte (cm)"
                value={info.z}
                step={1}
                min={0}
                max={1000}
                onCommit={(v) => onPatch({ z: v })}
              />
              <div />
            </div>

            <div className="flex items-center gap-2">
              <button className="inline-flex items-center px-2.5 py-1.5 rounded-md border bg-white hover:bg-muted transition text-sm" onClick={onDuplicate}>
                <Copy className="w-4 h-4 mr-1" />Dupliceren
              </button>
              <button className="inline-flex items-center px-2.5 py-1.5 rounded-md border bg-red-50 hover:bg-red-100 border-red-200 text-red-700 transition text-sm" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-1" />Verwijderen
              </button>
            </div>

            {selection.length >= 2 && (
              <div className="border-t pt-3 space-y-2">
                <div className="text-[11px] text-muted-foreground">Uitlijnen / Verdelen</div>
                <div className="grid grid-cols-4 gap-1">
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("left")}>Links</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("hcenter")}>H-center</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("right")}>Rechts</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("hspace")}>H-spatie</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("top")}>Boven</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("vcenter")}>V-center</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("bottom")}>Onder</button>
                  <button className="px-2 py-1 text-xs rounded border bg-white hover:bg-muted transition" onClick={() => align("vspace")}>V-spatie</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function ScaleBar({ scale }: { scale: number }) {
    const candidates = [20, 50, 100, 200, 500, 1000];
    const targetPx = 140;
    let pick = candidates[0];
    for (const c of candidates) if (Math.abs(c * scale - targetPx) < Math.abs(pick * scale - targetPx)) pick = c;
    const px = Math.max(1, Math.round(pick * scale));
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 bg-foreground/70" />
        <div className="h-[6px] bg-foreground/70" style={{ width: `${px}px` }} />
        <div className="text-xs tabular-nums">{pick} cm</div>
      </div>
    );
  }

  const ObjectRect = ({ o, selected, dx = 0, dy = 0 }: { o: PlotObject; selected: boolean; dx?: number; dy?: number; }) => {
    const theme = useMemo(() => {
      switch (o.type) {
        case "greenhouse": return { fill: "rgba(173, 216, 230, 0.4)", stroke: "#6ca6d9" };
        case "grass":      return { fill: "rgba(104, 180, 104, 0.45)", stroke: "#4e9c4e" };
        case "shrub":      return { fill: "rgba(46, 125, 50, 0.7)", stroke: "#2e7d32" };
        case "gravel":
        default:           return { fill: "rgba(160, 160, 160, 0.45)", stroke: "#7a7a7a" };
      }
    }, [o.type]);
    const e = extrudeOffset(o.z);

    return (
      <g transform={`translate(${o.x + dx}, ${o.y + dy})`}>
        {/* grotere (onzichtbare) hitbox om slepen makkelijk te maken */}
        <rect x={-o.w / 2 - 8} y={-o.h / 2 - 8} width={o.w + 16} height={o.h + 16} fill="transparent" pointerEvents="all" />

        {o.z > 0 && (
          <g opacity={0.35} transform={`translate(${e.dx / scale}, ${e.dy / scale})`}>
            <rect x={-o.w / 2} y={-o.h / 2} width={o.w} height={o.h} rx={6} ry={6} fill="#000" />
          </g>
        )}
        <rect x={-o.w / 2} y={-o.h / 2} width={o.w} height={o.h} rx={6} ry={6} fill={theme.fill} stroke={theme.stroke} strokeWidth={2} />
        {o.type === "greenhouse" && (
          <rect x={-o.w / 2 + 8} y={-o.h / 2 + 8} width={o.w - 16} height={o.h - 16} rx={4} ry={4} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" />
        )}
        <title>{o.label || o.type}</title>
        {selected && (
          <rect x={-o.w / 2 - 6} y={-o.h / 2 - 6} width={o.w + 12} height={o.h + 12} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="8 6" />
        )}
      </g>
    );
  };

  // ===== UI
  return (
    <div className="relative rounded-xl border bg-muted/30" style={{ height: "70vh" }}>
      {/* Toolbar */}
      <div className="absolute z-50 left-3 top-3 flex flex-wrap gap-2 p-2 rounded-xl bg-white/90 shadow-lg border">
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Selecteren (S)" onClick={() => setTool("select")}>
          <Pointer className="w-4 h-4" />
        </button>
        <button className={cn("inline-flex items-center justify-center w-8 h-8 rounded-md border transition", tool === "ruler" ? "bg-primary text-primary-foreground" : "bg-white hover:bg-muted")} title="Meetlint (R)" onClick={() => setTool((t) => (t === "ruler" ? "select" : "ruler"))}>
          <Ruler className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Zoom in (+)" onClick={() => setScale((s) => clamp(s * 1.1, 0.2, 5))}>
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Zoom uit (-)" onClick={() => setScale((s) => clamp(s / 1.1, 0.2, 5))}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Alles in beeld (0)" onClick={fitAll}>
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-border mx-1" />
        <button className={cn("inline-flex items-center justify-center w-8 h-8 rounded-md border transition", showGrid ? "bg-primary/10" : "bg-white hover:bg-muted")} title="Raster weergeven" onClick={() => setShowGrid((v) => !v)}>
          <GridIcon className="w-4 h-4" />
        </button>
        <button className={cn("inline-flex items-center justify-center w-8 h-8 rounded-md border transition", snapGrid ? "bg-primary/10" : "bg-white hover:bg-muted")} title="Snappen aan raster (Shift draait tijdelijk om)" onClick={() => setSnapGrid((v) => !v)}>
          <Square className="w-4 h-4" />
        </button>
        {/* Vaste stap (Auto/10/20/50 cm) */}
        <div className="ml-1 inline-flex items-center gap-1">
          {[0, 10, 20, 50].map((s) => (
            <button key={s} title={s ? `Rasterstap ${s} cm` : "Auto stap"} className={cn("px-2 h-8 text-[11px] rounded border", fixedStep === (s as any) ? "bg-primary/10" : "bg-white hover:bg-muted")} onClick={() => setFixedStep(s as any)}>
              {s || "Auto"}
            </button>
          ))}
        </div>
        <div className="w-px h-6 bg-border mx-1" />
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Kas toevoegen" onClick={() => addObject("greenhouse")}>
          <Factory className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Grasvlak toevoegen" onClick={() => addObject("grass")}>
          <Trees className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Struik toevoegen" onClick={() => addObject("shrub")}>
          <Mountain className="w-4 h-4" />
        </button>
        <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border bg-white hover:bg-muted transition" title="Grindvlak toevoegen" onClick={() => addObject("gravel")}>
          <Move3D className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector */}
      <Inspector
        selection={selection as any}
        beds={beds}
        bedMeta={bedMeta}
        objects={objects}
        onPatch={updateSelected}
        onDelete={removeSelectedObjects}
        onDuplicate={() => {
          const clones: PlotObject[] = [];
          for (const s of selection) {
            if (!s || s.kind !== "obj") continue;
            const src = objects.find((o) => o.id === s.id);
            if (src) clones.push({ ...src, id: crypto.randomUUID(), x: src.x + 20, y: src.y + 20 });
          }
          if (clones.length) setObjects((p) => [...p, ...clones]);
          if (onBedDuplicate) {
            const bedIds = selection.filter((s) => s && s.kind === "bed").map((s) => (s as any).id as string);
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
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          background: grassBG,
          backgroundImage: `${gridBG}`,
          backgroundSize: `${cmToPx(gridStep)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep * 5)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep)}px ${cmToPx(gridStep)}px, ${cmToPx(gridStep)}px ${cmToPx(gridStep * 5)}px`,
          backgroundBlendMode: showGrid ? "overlay, normal, overlay, normal" : "normal",
          touchAction: "none",
          cursor:
            dragState.current.mode === "drag-beds" || dragState.current.mode === "drag-objects" || dragState.current.mode === "pan"
              ? "grabbing"
              : hovering ? "grab" : "default",
        }}
      >
        <svg className="absolute inset-0" width="100%" height="100%">
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Background objects */}
            {objects
              .filter((o) => o.type === "grass" || o.type === "gravel")
              .map((o) => {
                const dx = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current.dx : 0;
                const dy = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current.dy : 0;
                return (
                  <ObjectRect key={o.id} o={o} dx={dx} dy={dy} selected={isSelected("obj", o.id)} />
                );
              })}

            {/* Beds */}
            {beds.map((b) => {
              const { w, h } = getBedSize(b);
              const z = bedMeta[b.id]?.z ?? DEFAULT_BED_HEIGHT_CM;
              const segs = Math.max(1, b.segments ?? 1);
              const styles = bedStyles(!!b.is_greenhouse);
              const ext = extrudeOffset(z);
              const add = tempBedMove.current && tempBedIds.current.includes(b.id) ? tempBedMove.current : { dx: 0, dy: 0 };
              const cx = (b.location_x ?? 0) + add.dx, cy = (b.location_y ?? 0) + add.dy;

              return (
                <g key={b.id} transform={`translate(${cx}, ${cy})`}>
                  {/* grotere hitbox */}
                  <rect x={-w / 2 - 8} y={-h / 2 - 8} width={w + 16} height={h + 16} fill="transparent" pointerEvents="all" />

                  {/* pseudo 3D */}
                  <g opacity={0.45} transform={`translate(${ext.dx / scale}, ${ext.dy / scale})`}>
                    <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 / scale} ry={6 / scale} fill="#000" />
                  </g>
                  {/* wood border */}
                  <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6 / scale} ry={6 / scale} fill="url(#wood)" style={{ fill: styles.wood }} />
                  {/* inner soil */}
                  <rect x={-w / 2 + 4} y={-h / 2 + 4} width={w - 8} height={h - 8} rx={4 / scale} ry={4 / scale} fill="url(#soil)" style={{ fill: styles.soil }} />
                  {/* segments */}
                  <g stroke="rgba(255,255,255,0.35)" strokeWidth={0.8 / scale}>
                    <SegmentPath w={w - 8} h={h - 8} segments={segs} />
                  </g>
                  {/* hover name */}
                  <title>{b.name}</title>
                  {/* selection */}
                  {isSelected("bed", b.id) && (
                    <rect x={-w / 2 - SELECT_HALO / scale} y={-h / 2 - SELECT_HALO / scale} width={w + (SELECT_HALO * 2) / scale} height={h + (SELECT_HALO * 2) / scale} fill="none" stroke="#3b82f6" strokeWidth={2 / scale} strokeDasharray={`${8 / scale} ${6 / scale}`} />
                  )}
                </g>
              );
            })}

            {/* Foreground objects */}
            {objects
              .filter((o) => o.type === "greenhouse" || o.type === "shrub")
              .map((o) => {
                const dx = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current.dx : 0;
                const dy = tempObjMove.current && tempObjIds.current.includes(o.id) ? tempObjMove.current.dy : 0;
                return (
                  <ObjectRect key={o.id} o={o} dx={dx} dy={dy} selected={isSelected("obj", o.id)} />
                );
              })}

            {/* Ruler */}
            {tool === "ruler" && ruler && (
              <g stroke="#111" strokeWidth={2 / scale}>
                <line x1={ruler.x1} y1={ruler.y1} x2={ruler.x2} y2={ruler.y2} />
                <circle cx={ruler.x1} cy={ruler.y1} r={3 / scale} fill="#111" />
                <circle cx={ruler.x2} cy={ruler.y2} r={3 / scale} fill="#111" />
                <text x={(ruler.x1 + ruler.x2) / 2} y={(ruler.y1 + ruler.y2) / 2 - 8 / scale} fontSize={10 / scale} textAnchor="middle" fill="#111">
                  {Math.round(Math.hypot(ruler.x2 - ruler.x1, ruler.y2 - ruler.y1))} cm
                </text>
              </g>
            )}
          </g>

          {/* defs */}
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

        {/* Scale bar + snap hint */}
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          <div className="rounded-md bg-white/90 border shadow px-2 py-1 text-[11px]"><ScaleBar scale={scale} /></div>
          <div className="rounded-md bg-white/70 border shadow px-2 py-1 text-[11px]">
            {effectiveSnap(!!dragState.current.lastShift) ? "Snap: aan (Shift = uit)" : "Snap: uit (Shift = aan)"}
          </div>
        </div>
      </div>
    </div>
  );
}
