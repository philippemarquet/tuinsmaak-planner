import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed } from "../lib/types";
import { cn } from "../lib/utils";
import {
  Ruler,
  MousePointer2,
  TreePine,
  Warehouse,
  Box,
  Move3D,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  Eye,
  Settings2,
  Sprout,
  Trash2,
  Copy
} from "lucide-react";
import { updateBed } from "../lib/api/beds";

// --- Types ---
type UUID = string;
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path";
type PlotObject = {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number; // Hoogte in cm
  rotation?: number;
  label?: string;
};

// --- Constants ---
const CELL_SIZE = 20; // Grid visualisatie elke 20cm
const STORAGE_PREFIX = "garden_ultra_v1";

// --- Helper Math ---
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const snap = (n: number, step: number = 10) => Math.round(n / step) * step;

// --- Components ---

/** * Een slimme "Texture Generator" die SVG patronen maakt.
 * Dit zorgt voor de "Board Game" look zonder externe plaatjes.
 */
const WorldTextures = () => (
  <defs>
    {/* Ruis filter voor organische look */}
    <filter id="noiseFilter">
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer><feFuncA type="linear" slope="0.2" /></feComponentTransfer>
    </filter>

    {/* Gras Patroon */}
    <pattern id="p-grass" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="#86bc68" />
      <rect width="100" height="100" filter="url(#noiseFilter)" opacity="0.4" />
      <circle cx="20" cy="20" r="2" fill="#5c8a42" opacity="0.3" />
      <circle cx="70" cy="60" r="3" fill="#5c8a42" opacity="0.2" />
    </pattern>

    {/* Hout (Bakken) */}
    <linearGradient id="g-wood-side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#7c5335" />
      <stop offset="100%" stopColor="#5d3a22" />
    </linearGradient>
    <linearGradient id="g-wood-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#a67c52" />
      <stop offset="100%" stopColor="#8f633b" />
    </linearGradient>

    {/* Aarde */}
    <pattern id="p-soil" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#4a3728" />
      <circle cx="5" cy="5" r="1" fill="#2e2118" opacity="0.5" />
    </pattern>

    {/* Grind */}
    <pattern id="p-gravel" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#e5e5e5" />
      <rect width="40" height="40" filter="url(#noiseFilter)" opacity="0.6" />
    </pattern>

    {/* Glas (Kas) */}
    <linearGradient id="g-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="rgba(220, 240, 255, 0.6)" />
      <stop offset="50%" stopColor="rgba(200, 230, 255, 0.3)" />
      <stop offset="100%" stopColor="rgba(220, 240, 255, 0.6)" />
    </linearGradient>

    {/* Schaduw Drop */}
    <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
      <feOffset dx="4" dy="8" result="offsetblur" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.3" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

// --- Main Engine ---

export function GardenPlotCanvas({
  beds,
  onBedMove,
}: {
  beds: GardenBed[];
  onBedMove: (id: UUID, x: number, y: number) => void;
}) {
  // --- State ---
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + ":objects") || "[]"); } catch { return []; }
  });
  
  // Camera State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pitch, setPitch] = useState(0); // 0 = 2D, 60 = 3D
  const [rotation, setRotation] = useState(0); // Rotatie van de hele tuin

  // Interaction State
  const [selection, setSelection] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    itemStart?: { x: number; y: number };
    id?: string;
    type?: "bed" | "obj" | "pan";
  }>({ active: false, startX: 0, startY: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Persist ---
  useEffect(() => {
    localStorage.setItem(STORAGE_PREFIX + ":objects", JSON.stringify(objects));
  }, [objects]);

  // --- Auto Fit on Mount ---
  useEffect(() => {
    // Wacht even tot de DOM er is, fit dan de tuin
    const timeout = setTimeout(fitToScreen, 100);
    return () => clearTimeout(timeout);
  }, [beds.length]); // Re-fit als er beds bijkomen

  const fitToScreen = () => {
    if (!containerRef.current) return;
    
    // Verzamel bounds van alles (beds + objects)
    const allItems = [
      ...beds.map(b => ({ x: b.location_x ?? 0, y: b.location_y ?? 0, w: b.width_cm ?? 120, h: b.length_cm ?? 120 })),
      ...objects.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h }))
    ];

    if (allItems.length === 0) {
      setPan({ x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 });
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allItems.forEach(i => {
      minX = Math.min(minX, i.x - i.w/2);
      maxX = Math.max(maxX, i.x + i.w/2);
      minY = Math.min(minY, i.y - i.h/2);
      maxY = Math.max(maxY, i.y + i.h/2);
    });

    // Voeg wat padding toe
    const padding = 200;
    const contentW = maxX - minX + padding;
    const contentH = maxY - minY + padding;
    const screenW = containerRef.current.clientWidth;
    const screenH = containerRef.current.clientHeight;

    const scale = Math.min(screenW / contentW, screenH / contentH);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Zet de view
    setZoom(clamp(scale, 0.2, 2.5));
    // Center pan is scherm center minus (world center * scale)
    setPan({
      x: (screenW / 2) - (centerX * scale),
      y: (screenH / 2) - (centerY * scale)
    });
  };

  // --- Coordinate Systems ---
  const screenToWorld = (sx: number, sy: number) => {
    // Simpele reverse transform (zonder rotatie support in drag voor nu, houd het stabiel)
    return {
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom
    };
  };

  // --- Event Handlers ---
  const handlePointerDown = (e: React.PointerEvent, id?: string, type?: "bed" | "obj") => {
    e.preventDefault();
    e.stopPropagation();
    
    if (id && type) {
      setSelection(id);
      const item = type === "bed" 
        ? beds.find(b => b.id === id) 
        : objects.find(o => o.id === id);
      
      const startPos = type === "bed" 
        ? { x: (item as GardenBed)?.location_x ?? 0, y: (item as GardenBed)?.location_y ?? 0 }
        : { x: (item as PlotObject)?.x ?? 0, y: (item as PlotObject)?.y ?? 0 };

      setDragState({
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        itemStart: startPos,
        id,
        type
      });
    } else {
      // Pan mode
      setDragState({
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        itemStart: { x: pan.x, y: pan.y },
        type: "pan"
      });
      setSelection(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.active) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    if (dragState.type === "pan" && dragState.itemStart) {
      setPan({
        x: dragState.itemStart.x + dx,
        y: dragState.itemStart.y + dy
      });
    } else if (dragState.id && dragState.itemStart) {
      // Move Item
      const worldDx = dx / zoom;
      const worldDy = dy / zoom;
      const newX = snap(dragState.itemStart.x + worldDx);
      const newY = snap(dragState.itemStart.y + worldDy);

      if (dragState.type === "bed") {
        // Optimistische update (lokale override zou beter zijn, maar voor nu direct call)
        // Let op: dit kan schokkerig zijn als de parent traag is.
        // Beter is om een lokale "preview" state te hebben, maar dit is de simpele fix.
        onBedMove(dragState.id, newX, newY); 
      } else {
        setObjects(prev => prev.map(o => o.id === dragState.id ? { ...o, x: newX, y: newY } : o));
      }
    }
  };

  const handlePointerUp = () => {
    setDragState({ active: false, startX: 0, startY: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const s = Math.exp(-e.deltaY * 0.001);
      setZoom(z => clamp(z * s, 0.1, 4));
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // --- Add Objects ---
  const spawn = (type: PlotObjectType) => {
    const center = screenToWorld(containerRef.current!.clientWidth / 2, containerRef.current!.clientHeight / 2);
    const newObj: PlotObject = {
      id: crypto.randomUUID(),
      type,
      x: center.x,
      y: center.y,
      w: type === "greenhouse" ? 300 : type === "tree" ? 150 : 100,
      h: type === "greenhouse" ? 200 : type === "tree" ? 150 : 100,
      z: type === "tree" ? 300 : 0
    };
    setObjects(p => [...p, newObj]);
    setSelection(newObj.id);
  };

  // --- Render Helpers (The Secret Sauce) ---
  
  // 3D Box Renderer: Tekent zijkanten als we in 3D modus zijn
  const Box3D = ({ 
    x, y, w, h, z, 
    fillTop, fillSide, 
    selected, label, 
    onClick, type
  }: any) => {
    // Als pitch > 0, tekenen we de zijkant ("extrusie")
    const is3D = pitch > 45;
    const depth = is3D ? z : 0; // Hoeveel pixels omhoog "extruderen"
    
    // De 'onderkant' van de bak (op de grond)
    // De 'bovenkant' zweeft op Y - depth
    
    return (
      <g 
        transform={`translate(${x}, ${y})`} 
        onClick={onClick}
        className={cn("transition-transform duration-75 cursor-pointer", selected ? "z-50" : "z-auto")}
        onPointerDown={(e) => handlePointerDown(e, type === "bed" ? undefined : undefined, undefined)} // Propagate up
      >
        {/* Schaduw op de grond */}
        <rect 
          x={-w/2} y={-h/2} width={w} height={h} rx={4}
          fill="black" opacity={0.2} 
          filter="url(#dropShadow)"
        />

        {/* De 'Extrusie' (Zijkant) - Alleen zichtbaar in 3D */}
        {depth > 0 && (
          <path 
            d={`
              M ${-w/2} ${h/2} 
              L ${w/2} ${h/2} 
              L ${w/2} ${h/2 - depth} 
              L ${-w/2} ${h/2 - depth} 
              Z
            `} 
            fill={fillSide || "#5d3a22"}
          />
        )}
        
        {/* De Bovenkant (Het deksel) - Verschuift omhoog in 3D */}
        <g transform={`translate(0, ${-depth})`}>
          <rect 
            x={-w/2} y={-h/2} width={w} height={h} rx={4}
            fill={fillTop} stroke="rgba(0,0,0,0.1)" strokeWidth={1}
          />
          
          {/* Aarde vulling voor bakken */}
          {type === "bed" && (
            <rect 
              x={-w/2 + 6} y={-h/2 + 6} width={w - 12} height={h - 12} rx={2}
              fill="url(#p-soil)" style={{filter: "inset 0 2px 4px rgba(0,0,0,0.5)"}}
            />
          )}

          {/* Label */}
          {label && (
             <text 
               y={0} textAnchor="middle" dominantBaseline="middle" 
               className="font-bold text-white drop-shadow-md select-none pointer-events-none"
               style={{ fontSize: Math.min(w, h)/5 }}
             >
               {label}
             </text>
          )}

          {/* Selectie Halo */}
          {selected && (
            <rect 
              x={-w/2 - 4} y={-h/2 - 4} width={w + 8} height={h + 8} 
              fill="none" stroke="#ffff00" strokeWidth={3} strokeDasharray="6 4"
              className="animate-pulse"
            />
          )}
        </g>
      </g>
    );
  };

  // Sorteren voor 3D overlap (Painter's Algorithm)
  // Alles wat "lager" op het scherm staat (hogere Y) moet later getekend worden
  const renderList = useMemo(() => {
    const list = [
      ...beds.map(b => ({ kind: "bed", id: b.id, x: b.location_x ?? 0, y: b.location_y ?? 0, w: b.width_cm ?? 120, h: b.length_cm ?? 120, z: 30, data: b })),
      ...objects.map(o => ({ kind: "obj", id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, z: o.z, data: o }))
    ];
    // Sorteer op Y-positie
    return list.sort((a, b) => (a.y + a.h/2) - (b.y + b.h/2));
  }, [beds, objects]);

  // --- UI Render ---
  return (
    <div className="flex flex-col h-screen w-full bg-stone-900 overflow-hidden relative font-sans text-stone-800">
      
      {/* --- CANVAS --- */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#bedcb0]" // Zachte groene achtergrond
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onPointerDown={(e) => handlePointerDown(e)}
      >
        <svg className="absolute w-full h-full pointer-events-none">
          <WorldTextures />
        </svg>

        {/* World Container - Handles Pan/Zoom/Pitch */}
        <div 
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) perspective(2000px) rotateX(${pitch}deg) rotateZ(${rotation}deg)`,
            transformOrigin: "center center", // Roteer vanuit het midden van de view
            transition: dragState.active ? "none" : "transform 0.4s cubic-bezier(0.2, 0.9, 0.2, 1)",
            width: 0, height: 0, // Zero size, everything overflows visible
            position: "absolute", top: 0, left: 0
          }}
          className="preserve-3d"
        >
          {/* Infinite Grass Plane (Visueel) */}
          <div 
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" 
            style={{ width: "4000px", height: "4000px", background: "url(#p-grass) repeat" }} // Gebruik pattern via CSS? Nee, SVG is beter hier.
          >
             {/* We gebruiken een grote SVG rect voor het gras zodat patterns werken */}
             <svg width="4000" height="4000" viewBox="0 0 4000 4000" className="absolute -left-[2000px] -top-[2000px]">
               <rect width="4000" height="4000" fill="url(#p-grass)" />
               {/* Grid Lijnen */}
               <defs>
                 <pattern id="grid" width={100} height={100} patternUnits="userSpaceOnUse">
                   <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="2"/>
                 </pattern>
               </defs>
               <rect width="4000" height="4000" fill="url(#grid)" />
             </svg>
          </div>

          {/* Render Items */}
          <svg className="overflow-visible" style={{ position: "absolute" }}>
            {renderList.map(item => {
              const isSelected = selection === item.id;
              
              if (item.kind === "bed") {
                const b = item.data as GardenBed;
                return (
                  <Box3D 
                    key={item.id} 
                    {...item} 
                    type="bed"
                    fillTop="url(#g-wood-top)" 
                    fillSide="url(#g-wood-side)"
                    label={b.name}
                    selected={isSelected}
                    onClick={(e: any) => handlePointerDown(e, item.id, "bed")}
                  />
                );
              } else {
                const o = item.data as PlotObject;
                // Custom shapes based on type
                return (
                  <g 
                    key={item.id} 
                    transform={`translate(${o.x}, ${o.y})`}
                    onPointerDown={(e) => handlePointerDown(e, item.id, "obj")}
                    className={cn("cursor-pointer hover:brightness-110", isSelected ? "opacity-100" : "opacity-90")}
                  >
                    {o.type === "greenhouse" && (
                      <g transform={`translate(0, ${pitch > 45 ? -20 : 0})`}> {/* Lift up slightly in 3D */}
                        <rect x={-o.w/2} y={-o.h/2} width={o.w} height={o.h} fill="white" stroke="#999" strokeWidth={4} />
                        <rect x={-o.w/2 + 4} y={-o.h/2 + 4} width={o.w - 8} height={o.h - 8} fill="url(#g-glass)" />
                        <path d={`M${-o.w/2},0 L${o.w/2},0 M0,${-o.h/2} L0,${o.h/2}`} stroke="white" strokeWidth={2} opacity={0.5} />
                        {/* Dak simulatie */}
                        <path d={`M${-o.w/2},${-o.h/2} L0,${-o.h/2 - 40} L${o.w/2},${-o.h/2}`} fill="rgba(255,255,255,0.4)" stroke="white" />
                        {isSelected && <rect x={-o.w/2-5} y={-o.h/2-5} width={o.w+10} height={o.h+10} fill="none" stroke="yellow" strokeWidth={3} strokeDasharray="5" />}
                      </g>
                    )}
                    
                    {o.type === "tree" && (
                      <g transform={`translate(0, ${pitch > 45 ? -o.h/2 : 0})`}> 
                        <circle r={o.w/2} fill="#2d4f1e" filter="url(#dropShadow)" />
                        <circle r={o.w/3} fill="#406b29" cx={-10} cy={-10} />
                        {isSelected && <circle r={o.w/2 + 5} fill="none" stroke="yellow" strokeWidth={3} strokeDasharray="5" />}
                      </g>
                    )}

                    {o.type === "shrub" && (
                      <g>
                        <circle r={o.w/2} fill="#5c8a42" filter="url(#dropShadow)" />
                        <circle r={o.w/2.5} fill="#7cb35a" cx={-5} cy={-5} />
                        {isSelected && <circle r={o.w/2 + 5} fill="none" stroke="yellow" strokeWidth={3} strokeDasharray="5" />}
                      </g>
                    )}

                    {o.type === "gravel" && (
                      <rect x={-o.w/2} y={-o.h/2} width={o.w} height={o.h} fill="url(#p-gravel)" stroke="#bbb" rx={10} 
                        style={isSelected ? {stroke: "yellow", strokeWidth: 3} : {}}
                      />
                    )}
                     {o.type === "grass" && (
                      <rect x={-o.w/2} y={-o.h/2} width={o.w} height={o.h} fill="url(#p-grass)" stroke="#6ba848" rx={10} 
                         style={isSelected ? {stroke: "yellow", strokeWidth: 3} : {}}
                      />
                    )}
                  </g>
                );
              }
            })}
          </svg>
        </div>
      </div>

      {/* --- HUD / UI --- */}
      
      {/* Top Bar: View Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-stone-200/50 z-50">
        <button onClick={() => setPitch(0)} className={cn("px-3 py-1 rounded-full text-xs font-bold transition", pitch === 0 ? "bg-stone-800 text-white" : "hover:bg-stone-200")}>
          2D Plan
        </button>
        <button onClick={() => setPitch(60)} className={cn("px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1", pitch === 60 ? "bg-blue-600 text-white" : "hover:bg-stone-200")}>
          <Move3D size={14} /> 3D View
        </button>
        <div className="w-px h-4 bg-stone-300 mx-1" />
        <button onClick={fitToScreen} title="Fit" className="p-2 hover:bg-stone-200 rounded-full"><Maximize size={16}/></button>
      </div>

      {/* Bottom Bar: Action Dock (Game Style) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end gap-3 z-50">
        
        {/* Tools */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-2xl border border-stone-200">
           <ToolButton icon={Warehouse} label="Kas" onClick={() => spawn("greenhouse")} color="text-blue-600" />
           <ToolButton icon={Sprout} label="Struik" onClick={() => spawn("shrub")} color="text-green-600" />
           <ToolButton icon={TreePine} label="Boom" onClick={() => spawn("tree")} color="text-green-800" />
           <ToolButton icon={LayoutGrid} label="Grind" onClick={() => spawn("gravel")} color="text-stone-500" />
           <ToolButton icon={Box} label="Vlak" onClick={() => spawn("grass")} color="text-lime-600" />
        </div>

        {/* Edit Context Menu (Visible if selected) */}
        {selection && (
           <div className="flex items-center gap-1 bg-stone-800 text-white px-3 py-2 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in">
              <span className="text-xs font-bold px-2 border-r border-stone-600 mr-1">
                 {selection.length > 10 ? "Object" : "Bak"}
              </span>
              <button onClick={() => {
                 const obj = objects.find(o => o.id === selection);
                 if (obj) {
                    const clone = {...obj, id: crypto.randomUUID(), x: obj.x + 20, y: obj.y + 20};
                    setObjects(p => [...p, clone]);
                 }
              }} className="p-2 hover:bg-stone-700 rounded-lg" title="Dupliceer"><Copy size={16}/></button>
              
              <button onClick={() => {
                 setObjects(p => p.filter(o => o.id !== selection));
                 setSelection(null);
              }} className="p-2 hover:bg-red-600 rounded-lg text-red-200" title="Verwijder"><Trash2 size={16}/></button>
           </div>
        )}
      </div>

    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, color }: any) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 px-3 py-1 group">
      <div className={cn("p-2 rounded-xl bg-stone-50 border border-stone-200 group-hover:-translate-y-1 transition-transform shadow-sm group-hover:shadow-md", color)}>
        <Icon size={24} />
      </div>
      <span className="text-[10px] font-bold text-stone-500 group-hover:text-stone-800">{label}</span>
    </button>
  )
}
