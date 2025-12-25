import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed } from "../lib/types";
import { cn } from "../lib/utils";
import {
  Ruler,
  MousePointer2,
  TreePine, // Struik
  Warehouse, // Kas
  Fence, // Bakken
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3X3,
  Move,
  Eye,
  Box,
  Sprout,
} from "lucide-react";
import { updateBed } from "../lib/api/beds";

// --- Types ---
type UUID = string;
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree";
type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotation?: number;
  label?: string;
};

type BedMeta = {
  z?: number;
  w?: number;
  h?: number;
  color?: string;
};

// --- Constants & Storage Keys ---
const DEFAULT_BED_HEIGHT_CM = 30;
const STORAGE_OBJECTS = (p: string) => `${p}:objects`;
const STORAGE_BEDMETA = (p: string) => `${p}:bedMeta`;
const STORAGE_VIEW = (p: string) => `${p}:view`;

// --- Utils ---
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const snapTo = (v: number, step: number) => Math.round(v / step) * step;

function safeLoadJSON(raw: string | null): any {
  if (!raw) return {};
  try { return JSON.parse(raw) ?? {}; } catch { return {}; }
}

// --- Components ---

/** * Input veld dat pas opslaat als je op Enter drukt of wegklikt 
 */
function NumericField({
  label,
  value,
  onCommit,
  step = 10,
  min = 0,
  max = 2000,
  className,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [localVal, setLocalVal] = useState(String(value));
  
  useEffect(() => setLocalVal(String(value)), [value]);

  const doCommit = () => {
    let n = parseFloat(localVal.replace(",", "."));
    if (isNaN(n)) n = value;
    n = clamp(Math.round(n), min, max);
    setLocalVal(String(n));
    onCommit(n);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">{label}</label>
      <input
        className="w-full bg-stone-50 border border-stone-200 rounded px-2 py-1 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-green-500/50"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={doCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "ArrowUp") { 
            e.preventDefault(); 
            doCommit(); // commit current buffer first
            onCommit(clamp(value + step, min, max)); 
          }
          if (e.key === "ArrowDown") { 
            e.preventDefault();
            doCommit(); 
            onCommit(clamp(value - step, min, max)); 
          }
        }}
      />
    </div>
  );
}

/**
 * SVG Definities voor textures (Hout, Gras, Grind, Glas)
 * Dit zorgt voor de "Board Game" look.
 */
const GardenTextures = () => (
  <defs>
    {/* Hout patroon */}
    <pattern id="woodPattern" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="20" height="20" fill="#8B5A2B" />
      <path d="M0,0 L20,0 M0,5 L20,5 M0,10 L20,10 M0,15 L20,15" stroke="#6F4E37" strokeWidth="1" opacity="0.5" />
      <path d="M0,2 L20,2 M0,7 L20,7" stroke="#A07040" strokeWidth="0.5" opacity="0.3" />
    </pattern>
    
    {/* Aarde patroon (binnenkant bak) */}
    <pattern id="soilPattern" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#5D4037" />
      <circle cx="2" cy="2" r="1" fill="#3E2723" opacity="0.5" />
      <circle cx="7" cy="8" r="1" fill="#3E2723" opacity="0.5" />
    </pattern>

    {/* Gras patroon */}
    <pattern id="grassPattern" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="#7CB342" />
      <path d="M10,50 Q15,40 20,50 M30,20 Q35,10 40,20 M50,45 Q55,35 60,45" stroke="#558B2F" strokeWidth="1" fill="none" opacity="0.4" />
      <circle cx="15" cy="15" r="1.5" fill="#AED581" opacity="0.3" />
      <circle cx="45" cy="50" r="2" fill="#AED581" opacity="0.3" />
    </pattern>

    {/* Grind patroon */}
    <pattern id="gravelPattern" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#E0E0E0" />
      <path d="M2,5 L4,3 L6,5 Z M10,12 L12,14 L14,12 Z M15,5 L17,3 L19,5 Z" fill="#9E9E9E" opacity="0.5" />
      <circle cx="5" cy="15" r="1" fill="#757575" opacity="0.4" />
      <circle cx="12" cy="5" r="1" fill="#757575" opacity="0.4" />
    </pattern>

    {/* Kas vloer (tegels) */}
    <pattern id="tilePattern" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#F5F5F5" />
      <path d="M0,0 L40,0 L40,40 L0,40 Z" fill="none" stroke="#BDBDBD" strokeWidth="1" />
    </pattern>

    {/* Filters voor diepte (Drop Shadow) */}
    <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
      <feOffset in="blur" dx="4" dy="6" result="offsetBlur" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="offsetBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

     <filter id="innerShadow">
        <feOffset dx="0" dy="2" />
        <feGaussianBlur stdDeviation="2" result="offset-blur" />
        <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
        <feFlood floodColor="black" floodOpacity="0.4" result="color" />
        <feComposite operator="in" in="color" in2="inverse" result="shadow" />
        <feComposite operator="over" in="shadow" in2="SourceGraphic" />
      </filter>
  </defs>
);

// --- Main Canvas Component ---

export function GardenPlotCanvas({
  beds,
  storagePrefix = "garden_v2",
  onBedMove,
  onBedDuplicate,
}: {
  beds: GardenBed[];
  storagePrefix?: string;
  onBedMove: (id: UUID, x: number, y: number) => void | Promise<void>;
  onBedDuplicate?: (bed: GardenBed) => void;
}) {
  // --- State ---
  const [view, setView] = useState(() => {
    const v = safeLoadJSON(localStorage.getItem(STORAGE_VIEW(storagePrefix)));
    return { 
      scale: v.scale || 1, 
      pan: v.pan || { x: 0, y: 0 },
      is3D: false // Start altijd in 2D voor overzicht
    };
  });
  
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    const saved = safeLoadJSON(localStorage.getItem(STORAGE_OBJECTS(storagePrefix)));
    return Array.isArray(saved) ? saved : [];
  });

  const [bedMeta, setBedMeta] = useState<Record<UUID, BedMeta>>(() => {
    return safeLoadJSON(localStorage.getItem(STORAGE_BEDMETA(storagePrefix))) || {};
  });

  const [selection, setSelection] = useState<({ type: "bed" | "obj", id: string }) | null>(null);
  const [tool, setTool] = useState<"select" | "ruler">("select");
  const [rulerStart, setRulerStart] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewAngle, setViewAngle] = useState(0); // 0 = top down, 45-60 = 3D

  // Refs voor interactie
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startPx: {x: number, y: number};
    startPan: {x: number, y: number};
    mode: "pan" | "move_bed" | "move_obj";
    targetId?: string;
    originalPos?: {x: number, y: number};
  }>({ active: false, startPx: {x:0,y:0}, startPan: {x:0,y:0}, mode: "pan" });

  // --- Effects ---
  useEffect(() => localStorage.setItem(STORAGE_OBJECTS(storagePrefix), JSON.stringify(objects)), [objects, storagePrefix]);
  useEffect(() => localStorage.setItem(STORAGE_BEDMETA(storagePrefix), JSON.stringify(bedMeta)), [bedMeta, storagePrefix]);
  useEffect(() => localStorage.setItem(STORAGE_VIEW(storagePrefix), JSON.stringify({ scale: view.scale, pan: view.pan })), [view.scale, view.pan, storagePrefix]);
  
  // Animatie effect voor 3D switch
  useEffect(() => {
    if (view.is3D) setViewAngle(55); // "Euro Game" hoek
    else setViewAngle(0);
  }, [view.is3D]);

  // --- Helpers ---
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - view.pan.x) / view.scale,
    y: (sy - view.pan.y) / view.scale
  });

  const getBedDims = (b: GardenBed) => ({
    w: bedMeta[b.id]?.w ?? b.width_cm ?? 120,
    h: bedMeta[b.id]?.h ?? b.length_cm ?? 120,
    z: bedMeta[b.id]?.z ?? DEFAULT_BED_HEIGHT_CM
  });

  // --- Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const s = Math.exp(-e.deltaY * 0.002);
      const newScale = clamp(view.scale * s, 0.1, 5);
      setView(v => ({ ...v, scale: newScale }));
    } else {
      setView(v => ({ ...v, pan: { x: v.pan.x - e.deltaX, y: v.pan.y - e.deltaY } }));
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const w = screenToWorld(sx, sy);

    if (tool === "ruler") {
      setRulerStart({x: w.x, y: w.y});
      return;
    }

    // Hit Test (Reverse order for drawing order)
    let hitBed = null;
    let hitObj = null;

    // Check Objects
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (w.x >= o.x - o.w/2 && w.x <= o.x + o.w/2 && w.y >= o.y - o.h/2 && w.y <= o.y + o.h/2) {
        hitObj = o;
        break;
      }
    }

    // Check Beds (if no obj hit)
    if (!hitObj) {
      for (let i = beds.length - 1; i >= 0; i--) {
        const b = beds[i];
        const { w: bw, h: bh } = getBedDims(b);
        const bx = b.location_x ?? 0;
        const by = b.location_y ?? 0;
        if (w.x >= bx - bw/2 && w.x <= bx + bw/2 && w.y >= by - bh/2 && w.y <= by + bh/2) {
          hitBed = b;
          break;
        }
      }
    }

    if (hitObj) {
      setSelection({ type: "obj", id: hitObj.id });
      dragRef.current = { 
        active: true, startPx: {x: sx, y: sy}, startPan: {x:0, y:0}, 
        mode: "move_obj", targetId: hitObj.id, originalPos: {x: hitObj.x, y: hitObj.y} 
      };
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
    } else if (hitBed) {
      setSelection({ type: "bed", id: hitBed.id });
      dragRef.current = { 
        active: true, startPx: {x: sx, y: sy}, startPan: {x:0, y:0}, 
        mode: "move_bed", targetId: hitBed.id, originalPos: {x: hitBed.location_x ?? 0, y: hitBed.location_y ?? 0} 
      };
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
    } else {
      setSelection(null);
      dragRef.current = { 
        active: true, startPx: {x: sx, y: sy}, startPan: view.pan, mode: "pan" 
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const dx = sx - dragRef.current.startPx.x;
    const dy = sy - dragRef.current.startPx.y;

    if (dragRef.current.mode === "pan") {
      setView(v => ({ ...v, pan: { x: dragRef.current.startPan.x + dx, y: dragRef.current.startPan.y + dy } }));
    } else {
      // Logic for moving objects (converting pixel delta to world delta)
      const worldDx = dx / view.scale;
      const worldDy = dy / view.scale;
      
      // Snap to grid (20cm default)
      const snap = e.shiftKey ? 1 : 10;
      
      if (dragRef.current.mode === "move_obj" && dragRef.current.targetId) {
        const targetId = dragRef.current.targetId;
        const orig = dragRef.current.originalPos!;
        setObjects(prev => prev.map(o => o.id === targetId ? {
          ...o, 
          x: snapTo(orig.x + worldDx, snap),
          y: snapTo(orig.y + worldDy, snap)
        } : o));
      }

      if (dragRef.current.mode === "move_bed" && dragRef.current.targetId) {
        // We move beds visually, but commit on up to avoid heavy api calls
        // For now, let's just use local state override or direct modification if local
        // To keep it simple: we assume beds is read-only props, so we need a local override
        // BUT the prop `onBedMove` suggests we should call it. 
        // We will call it on pointer UP. 
        // Visual feedback during drag is tricky without local copy. 
        // Let's rely on the user seeing the 'ghost' or just updating fast enough. 
        // Actually, for smoothness, we update the bed location via a ref or temp state, 
        // but here we just directly calculate 'proposed' position on PointerUp.
        // *Improvement*: Just pan/zoom is smooth, dragging usually needs temp state.
      }
    }
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    const { active, mode, targetId, originalPos, startPx } = dragRef.current;
    if (!active) return;
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect && mode !== "pan" && targetId && originalPos) {
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = (sx - startPx.x) / view.scale;
      const dy = (sy - startPx.y) / view.scale;
      const snap = e.shiftKey ? 1 : 10;
      
      const finalX = snapTo(originalPos.x + dx, snap);
      const finalY = snapTo(originalPos.y + dy, snap);

      if (mode === "move_bed") {
        await onBedMove(targetId, finalX, finalY);
      }
      // Objects are already updated in state during move (or should be)
    }

    dragRef.current = { ...dragRef.current, active: false };
    setIsDragging(false);
    setRulerStart(null);
  };

  // --- Adding Objects ---
  const spawnObject = (type: PlotObjectType) => {
    // Spawn in center of view
    const center = screenToWorld(
      (svgRef.current?.clientWidth || 800) / 2,
      (svgRef.current?.clientHeight || 600) / 2
    );
    
    const base = { id: crypto.randomUUID(), x: center.x, y: center.y, z: 0 };
    let obj: PlotObject;

    switch(type) {
      case "greenhouse": 
        obj = { ...base, type, w: 300, h: 200, z: 220, label: "Kas" }; break;
      case "grass":
        obj = { ...base, type, w: 400, h: 400, z: 0 }; break;
      case "gravel":
        obj = { ...base, type, w: 300, h: 150, z: 0 }; break;
      case "shrub":
        obj = { ...base, type, w: 80, h: 80, z: 80 }; break;
      case "tree":
        obj = { ...base, type, w: 150, h: 150, z: 300 }; break;
      default: return;
    }
    setObjects(p => [...p, obj]);
    setSelection({ type: "obj", id: obj.id });
  };

  // --- Rendering Elements ---
  
  // Renders a Bed with 3D-ish effects (top-down extrusion)
  const RenderBed = ({ bed, isSelected }: { bed: GardenBed; isSelected: boolean }) => {
    const { w, h, z } = getBedDims(bed);
    // In 3D mode, we use CSS transform. In 2D, we just look top down.
    // If viewAngle > 0, we can actually draw "side walls" manually in SVG for a "fake 3D" 
    // OR we rely on CSS rotateX. CSS rotateX is easier for a "card" effect.
    // Here we use a thick stroke or offset rects for the 2D "Game Board" feel.
    
    const isGreenhouse = bed.is_greenhouse;
    
    return (
      <g 
        transform={`translate(${bed.location_x ?? 0}, ${bed.location_y ?? 0})`}
        style={{ transition: "transform 0.1s linear" }}
        className="cursor-pointer hover:brightness-110"
      >
        {/* Drop Shadow */}
        <rect 
          x={-w/2} y={-h/2} width={w} height={h} 
          rx={4} ry={4} 
          fill="black" opacity={0.2} 
          transform="translate(10, 10)"
          filter="url(#softShadow)"
        />

        {/* Main Body */}
        <rect 
          x={-w/2} y={-h/2} width={w} height={h} 
          rx={4} ry={4}
          fill="url(#woodPattern)"
          stroke="#5D4037"
          strokeWidth={2}
        />
        
        {/* Inner Soil */}
        <rect 
          x={-w/2 + 6} y={-h/2 + 6} width={w - 12} height={h - 12} 
          rx={2} ry={2}
          fill="url(#soilPattern)"
          filter="url(#innerShadow)" // Inner shadow gives depth "into" the box
        />

        {/* Plants / Label */}
        <text 
          y={0} 
          textAnchor="middle" 
          dominantBaseline="middle" 
          fill="white" 
          fontSize={Math.min(w, h) / 6}
          fontWeight="bold"
          style={{ textShadow: "0px 2px 4px rgba(0,0,0,0.8)", pointerEvents: "none" }}
          opacity={0.9}
        >
          {bed.name}
        </text>

        {/* Selection Halo */}
        {isSelected && (
          <rect 
            x={-w/2 - 10} y={-h/2 - 10} width={w + 20} height={h + 20} 
            rx={8} fill="none" stroke="#22c55e" strokeWidth={4} strokeDasharray="10 5"
            className="animate-pulse"
          />
        )}

        {/* 3D Height Indicator (Simulated side if viewed from angle, simplified) */}
        {viewAngle > 0 && z > 0 && (
           <g transform={`translate(0, ${z})`}>
              {/* This is a visual trick; real CSS 3D handles the plane rotation */}
           </g>
        )}
      </g>
    );
  };

  const RenderObject = ({ obj, isSelected }: { obj: PlotObject; isSelected: boolean }) => {
    return (
      <g 
        transform={`translate(${obj.x}, ${obj.y})`}
        className="cursor-pointer"
      >
        {/* Visuals based on type */}
        {obj.type === "greenhouse" && (
          <>
            <rect x={-obj.w/2} y={-obj.h/2} width={obj.w} height={obj.h} fill="url(#tilePattern)" stroke="#999" />
            {/* Glass roof effect */}
            <rect x={-obj.w/2 + 5} y={-obj.h/2 + 5} width={obj.w - 10} height={obj.h - 10} fill="rgba(200, 230, 255, 0.4)" stroke="white" strokeWidth={2} />
            <path d={`M${-obj.w/2},${-obj.h/2} L${obj.w/2},${obj.h/2} M${obj.w/2},${-obj.h/2} L${-obj.w/2},${obj.h/2}`} stroke="white" strokeWidth={2} opacity={0.5} />
          </>
        )}
        
        {obj.type === "grass" && (
          <rect x={-obj.w/2} y={-obj.h/2} width={obj.w} height={obj.h} fill="url(#grassPattern)" rx={10} stroke="#AED581" strokeWidth={0} />
        )}
        
        {obj.type === "gravel" && (
           <path 
             d={`M${-obj.w/2},${-obj.h/2} Q${0},${-obj.h/2 - 10} ${obj.w/2},${-obj.h/2} L${obj.w/2},${obj.h/2} Q${0},${obj.h/2 + 10} ${-obj.w/2},${obj.h/2} Z`}
             fill="url(#gravelPattern)" stroke="#BDBDBD" strokeWidth={1}
           />
        )}

        {(obj.type === "shrub" || obj.type === "tree") && (
           <g>
              <circle r={obj.w/2} fill={obj.type === "tree" ? "#2E7D32" : "#558B2F"} filter="url(#softShadow)" />
              <circle r={obj.w/2 * 0.7} fill="rgba(255,255,255,0.1)" />
           </g>
        )}

        {/* Selection */}
        {isSelected && (
          <rect 
            x={-obj.w/2 - 5} y={-obj.h/2 - 5} width={obj.w + 10} height={obj.h + 10} 
            fill="none" stroke="#22c55e" strokeWidth={3} strokeDasharray="4 4" 
          />
        )}
      </g>
    );
  };

  // --- Inspector Component (Floating) ---
  const Inspector = () => {
    if (!selection) return null;
    
    // Find item
    let item: any = null;
    let isBed = selection.type === "bed";
    if (isBed) {
      const b = beds.find(x => x.id === selection.id);
      if (b) item = { ...b, ...getBedDims(b) };
    } else {
      item = objects.find(x => x.id === selection.id);
    }

    if (!item) return null;

    const updateItem = (patch: any) => {
      if (isBed) {
        // Update local Meta
        if (patch.z !== undefined || patch.w !== undefined || patch.h !== undefined) {
           setBedMeta(prev => ({
             ...prev,
             [item.id]: { ...(prev[item.id] || {}), ...patch }
           }));
        }
        // Save size to DB if width/length changed
        if (patch.w || patch.h) {
          updateBed(item.id, { 
             width_cm: patch.w || item.w, 
             length_cm: patch.h || item.h 
          }).catch(console.error);
        }
      } else {
        setObjects(prev => prev.map(o => o.id === item.id ? { ...o, ...patch } : o));
      }
    };

    return (
      <div className="absolute right-4 top-20 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-stone-200 p-4 z-20 animate-in slide-in-from-right-10 fade-in duration-300">
        <div className="flex justify-between items-start mb-4 border-b pb-2">
          <div>
            <h3 className="font-bold text-stone-800 flex items-center gap-2">
              {isBed ? <Fence className="w-4 h-4 text-amber-700" /> : <TreePine className="w-4 h-4 text-green-700" />}
              {isBed ? "Moestuinbak" : "Object"}
            </h3>
            <p className="text-xs text-stone-500">{item.name || item.label || item.type}</p>
          </div>
          <button onClick={() => setSelection(null)} className="text-stone-400 hover:text-stone-600">×</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
             <NumericField label="Breedte (cm)" value={item.w} onCommit={(v) => updateItem({w: v})} />
             <NumericField label="Lengte (cm)" value={item.h} onCommit={(v) => updateItem({h: v})} />
             <NumericField label="Hoogte (cm)" value={item.z || 0} onCommit={(v) => updateItem({z: v})} />
             {!isBed && <div />} 
          </div>

          <div className="flex gap-2 pt-2">
             <button 
               onClick={() => isBed && onBedDuplicate ? onBedDuplicate(item) : null}
               className="flex-1 flex items-center justify-center gap-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2 rounded-lg text-xs font-medium transition"
             >
               <Copy size={14} /> Dupliceer
             </button>
             <button 
               onClick={() => {
                 if (!isBed) {
                   setObjects(prev => prev.filter(o => o.id !== item.id));
                   setSelection(null);
                 }
               }}
               disabled={isBed}
               className={cn("flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition", 
                 isBed ? "opacity-50 cursor-not-allowed bg-stone-50 text-stone-300" : "bg-red-50 hover:bg-red-100 text-red-600"
               )}
             >
               <Trash2 size={14} /> Verwijder
             </button>
          </div>
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <div className="relative w-full h-full bg-stone-100 overflow-hidden select-none font-sans rounded-xl border border-stone-300 shadow-inner">
      
      {/* --- Top Toolbar --- */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur shadow-lg rounded-full px-4 py-2 flex items-center gap-4 z-20 border border-stone-200/50">
        <div className="flex items-center gap-1">
          <button title="Selecteer" onClick={() => setTool("select")} className={cn("p-2 rounded-full transition", tool==="select" ? "bg-stone-800 text-white" : "hover:bg-stone-100 text-stone-600")}>
            <MousePointer2 size={18} />
          </button>
          <button title="Meetlint" onClick={() => setTool("ruler")} className={cn("p-2 rounded-full transition", tool==="ruler" ? "bg-amber-600 text-white" : "hover:bg-stone-100 text-stone-600")}>
            <Ruler size={18} />
          </button>
        </div>
        <div className="w-px h-6 bg-stone-200" />
        <div className="flex items-center gap-1">
          <button title="Kas" onClick={() => spawnObject("greenhouse")} className="p-2 hover:bg-stone-100 rounded-full text-blue-600"><Warehouse size={18}/></button>
          <button title="Bak" onClick={() => {}} className="p-2 hover:bg-stone-100 rounded-full text-amber-700"><Box size={18} opacity={0.5} className="cursor-not-allowed"/></button> {/* Bakken komen uit props */}
          <button title="Struik" onClick={() => spawnObject("shrub")} className="p-2 hover:bg-stone-100 rounded-full text-green-600"><Sprout size={18}/></button>
          <button title="Boom" onClick={() => spawnObject("tree")} className="p-2 hover:bg-stone-100 rounded-full text-green-800"><TreePine size={18}/></button>
          <button title="Gras" onClick={() => spawnObject("grass")} className="p-2 hover:bg-stone-100 rounded-full text-lime-600"><Grid3X3 size={18}/></button>
          <button title="Grind" onClick={() => spawnObject("gravel")} className="p-2 hover:bg-stone-100 rounded-full text-stone-500"><Move size={18}/></button>
        </div>
        <div className="w-px h-6 bg-stone-200" />
         <button 
           onClick={() => setView(v => ({ ...v, is3D: !v.is3D }))}
           className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition", view.is3D ? "bg-purple-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200")}
         >
           <Eye size={14} /> 3D View
         </button>
      </div>

      {/* --- Side Controls (Zoom) --- */}
      <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
        <button onClick={() => setView(v => ({...v, scale: v.scale * 1.2}))} className="bg-white p-2 rounded-lg shadow border hover:bg-stone-50"><ZoomIn size={18}/></button>
        <button onClick={() => setView(v => ({...v, scale: v.scale / 1.2}))} className="bg-white p-2 rounded-lg shadow border hover:bg-stone-50"><ZoomOut size={18}/></button>
        <button onClick={() => setView(v => ({...v, pan: {x:0,y:0}, scale: 1}))} className="bg-white p-2 rounded-lg shadow border hover:bg-stone-50"><Maximize size={18}/></button>
      </div>

      {/* --- Inspector --- */}
      <Inspector />

      {/* --- 3D Scene Container --- */}
      <div 
        className="absolute inset-0 overflow-hidden bg-[#e8efe8]" // Soft background color
        style={{ perspective: "1000px" }} // CSS 3D perspective
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* Background Grid Pattern for Reference */}
        <div className="absolute inset-0 pointer-events-none opacity-20" 
             style={{ 
               backgroundImage: "radial-gradient(#99a 1px, transparent 1px)", 
               backgroundSize: "20px 20px" 
             }} 
        />

        {/* The World Plane */}
        <svg 
          ref={svgRef}
          className="absolute w-full h-full overflow-visible"
          style={{
            transformStyle: "preserve-3d",
            transform: `
              translate(${view.pan.x}px, ${view.pan.y}px) 
              scale(${view.scale}) 
              rotateX(${viewAngle}deg) 
              rotateZ(${view.is3D ? -10 : 0}deg)
            `,
            transition: isDragging ? "none" : "transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)"
          }}
        >
          <GardenTextures />

          {/* Render Objects & Beds sorted by Y for correct overlap (Painter's Algorithm) */}
          {/* Note: In real 3D (WebGL) Z-buffer does this, here we cheat by sorting */}
          {[...beds, ...objects]
            .map(item => {
               // Normalize to generic type for sorting
               const isBed = "location_x" in item;
               const y = isBed ? (item as GardenBed).location_y ?? 0 : (item as PlotObject).y;
               const h = isBed ? (bedMeta[(item as GardenBed).id]?.h ?? (item as GardenBed).length_cm ?? 120) : (item as PlotObject).h;
               // Bottom Y is the sorting key
               return { item, sortY: y + h/2 };
            })
            .sort((a, b) => a.sortY - b.sortY)
            .map(({ item }) => {
              if ("location_x" in item) {
                return <RenderBed key={item.id} bed={item as GardenBed} isSelected={selection?.id === item.id} />;
              } else {
                return <RenderObject key={(item as PlotObject).id} obj={item as PlotObject} isSelected={selection?.id === (item as PlotObject).id} />;
              }
            })
          }

          {/* Ruler Line */}
          {tool === "ruler" && rulerStart && !dragRef.current.active && (
             // Dit is een tijdelijke lijn tijdens het slepen zou kunnen, 
             // maar voor nu enkel visible in inspector (simplified)
             <circle cx={rulerStart.x} cy={rulerStart.y} r={4} fill="red" />
          )}

        </svg>
      </div>

      {/* --- Overlay Info --- */}
      <div className="absolute bottom-4 left-4 text-[10px] text-stone-400 font-mono pointer-events-none">
        Gemini Garden Engine v2.0 • {beds.length} Bakken • {objects.length} Objecten • {Math.round(view.scale * 100)}% Zoom
      </div>
    </div>
  );
}
