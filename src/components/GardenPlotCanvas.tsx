import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import {
  TreePine,
  Warehouse,
  Move3D,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  Trash2,
  Copy,
  TreeDeciduous,
  Rows3,
  Flower2,
} from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

// --- Types ---
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path";

interface PlotObject {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  onBedMove: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  storagePrefix?: string;
}

// --- Constants ---
const GRID_SIZE = 50; // cm per grid cell
const SCALE_FACTOR = 0.5; // cm to pixels

// --- Helpers ---
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const snap = (n: number, step: number = 10) => Math.round(n / step) * step;
const cmToPx = (cm: number) => cm * SCALE_FACTOR;
const pxToCm = (px: number) => px / SCALE_FACTOR;

// --- SVG Pattern Definitions ---
function PatternDefs() {
  return (
    <defs>
      {/* Grass pattern */}
      <pattern id="pattern-grass" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="hsl(100, 40%, 55%)" />
        <circle cx="5" cy="5" r="1.5" fill="hsl(100, 50%, 40%)" opacity="0.4" />
        <circle cx="15" cy="12" r="1" fill="hsl(100, 50%, 40%)" opacity="0.3" />
        <circle cx="10" cy="18" r="1.2" fill="hsl(100, 50%, 40%)" opacity="0.35" />
      </pattern>
      
      {/* Soil pattern */}
      <pattern id="pattern-soil" width="15" height="15" patternUnits="userSpaceOnUse">
        <rect width="15" height="15" fill="hsl(25, 35%, 28%)" />
        <circle cx="4" cy="4" r="1" fill="hsl(25, 25%, 20%)" opacity="0.5" />
        <circle cx="11" cy="9" r="0.8" fill="hsl(25, 25%, 20%)" opacity="0.4" />
      </pattern>
      
      {/* Gravel pattern */}
      <pattern id="pattern-gravel" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="hsl(0, 0%, 80%)" />
        <circle cx="3" cy="3" r="2" fill="hsl(0, 0%, 70%)" />
        <circle cx="10" cy="5" r="1.5" fill="hsl(0, 0%, 65%)" />
        <circle cx="6" cy="11" r="1.8" fill="hsl(0, 0%, 68%)" />
        <circle cx="13" cy="13" r="2" fill="hsl(0, 0%, 72%)" />
      </pattern>
      
      {/* Path pattern */}
      <pattern id="pattern-path" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="hsl(35, 20%, 60%)" />
        <rect x="1" y="1" width="10" height="10" fill="hsl(35, 25%, 55%)" rx="1" />
        <rect x="13" y="13" width="10" height="10" fill="hsl(35, 25%, 55%)" rx="1" />
      </pattern>
      
      {/* Wood gradient for beds */}
      <linearGradient id="gradient-wood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(25, 50%, 45%)" />
        <stop offset="100%" stopColor="hsl(25, 50%, 35%)" />
      </linearGradient>
      
      {/* Glass gradient for greenhouse */}
      <linearGradient id="gradient-glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="hsla(200, 60%, 85%, 0.7)" />
        <stop offset="50%" stopColor="hsla(200, 60%, 90%, 0.4)" />
        <stop offset="100%" stopColor="hsla(200, 60%, 85%, 0.7)" />
      </linearGradient>
      
      {/* Drop shadow filter */}
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.2" />
      </filter>
    </defs>
  );
}

// --- Main Component ---
export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  storagePrefix = "gardenPlot",
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // View state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [is3D, setIs3D] = useState(false);
  
  // Objects state (persisted to localStorage)
  const [objects, setObjects] = useState<PlotObject[]>(() => {
    try {
      const stored = localStorage.getItem(`${storagePrefix}:objects`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // Selection & drag state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    type: "pan" | "bed" | "object" | null;
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startItemPos: { x: number; y: number };
    itemId: string | null;
  }>({
    isDragging: false,
    type: null,
    startX: 0,
    startY: 0,
    startPan: { x: 0, y: 0 },
    startItemPos: { x: 0, y: 0 },
    itemId: null,
  });

  // Persist objects
  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:objects`, JSON.stringify(objects));
  }, [objects, storagePrefix]);

  // Auto-fit on mount
  useEffect(() => {
    const timer = setTimeout(fitToView, 150);
    return () => clearTimeout(timer);
  }, [beds.length]);

  // Fit all items into view
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    
    const allItems = [
      ...beds.map(b => ({
        x: b.location_x ?? 0,
        y: b.location_y ?? 0,
        w: b.width_cm,
        h: b.length_cm,
      })),
      ...objects.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
    ];
    
    if (allItems.length === 0) {
      setPan({ x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 });
      setZoom(1);
      return;
    }
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allItems.forEach(item => {
      const px = cmToPx(item.x);
      const py = cmToPx(item.y);
      const pw = cmToPx(item.w);
      const ph = cmToPx(item.h);
      minX = Math.min(minX, px - pw / 2);
      maxX = Math.max(maxX, px + pw / 2);
      minY = Math.min(minY, py - ph / 2);
      maxY = Math.max(maxY, py + ph / 2);
    });
    
    const padding = 80;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const screenW = containerRef.current.clientWidth;
    const screenH = containerRef.current.clientHeight;
    
    const scale = Math.min(screenW / contentW, screenH / contentH, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setZoom(clamp(scale, 0.2, 2));
    setPan({
      x: screenW / 2 - centerX * scale,
      y: screenH / 2 - centerY * scale,
    });
  }, [beds, objects]);

  // Mouse handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, itemId?: string, itemType?: "bed" | "object") => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    
    if (itemId && itemType) {
      setSelectedId(itemId);
      
      let startPos = { x: 0, y: 0 };
      if (itemType === "bed") {
        const bed = beds.find(b => b.id === itemId);
        if (bed) startPos = { x: bed.location_x ?? 0, y: bed.location_y ?? 0 };
      } else {
        const obj = objects.find(o => o.id === itemId);
        if (obj) startPos = { x: obj.x, y: obj.y };
      }
      
      setDragState({
        isDragging: true,
        type: itemType,
        startX: e.clientX,
        startY: e.clientY,
        startPan: pan,
        startItemPos: startPos,
        itemId,
      });
    } else {
      setSelectedId(null);
      setDragState({
        isDragging: true,
        type: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startPan: pan,
        startItemPos: { x: 0, y: 0 },
        itemId: null,
      });
    }
  }, [beds, objects, pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.isDragging) return;
    
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    
    if (dragState.type === "pan") {
      setPan({
        x: dragState.startPan.x + dx,
        y: dragState.startPan.y + dy,
      });
    } else if (dragState.itemId) {
      const worldDx = pxToCm(dx / zoom);
      const worldDy = pxToCm(dy / zoom);
      const newX = snap(dragState.startItemPos.x + worldDx, 10);
      const newY = snap(dragState.startItemPos.y + worldDy, 10);
      
      if (dragState.type === "bed") {
        onBedMove(dragState.itemId, newX, newY);
      } else if (dragState.type === "object") {
        setObjects(prev => prev.map(o => 
          o.id === dragState.itemId ? { ...o, x: newX, y: newY } : o
        ));
      }
    }
  }, [dragState, zoom, onBedMove]);

  const handlePointerUp = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false, type: null }));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => clamp(z * delta, 0.2, 3));
    } else {
      setPan(p => ({
        x: p.x - e.deltaX * 0.5,
        y: p.y - e.deltaY * 0.5,
      }));
    }
  }, []);

  // Spawn object in center of view
  const spawnObject = useCallback((type: PlotObjectType) => {
    if (!containerRef.current) return;
    
    const screenCenterX = containerRef.current.clientWidth / 2;
    const screenCenterY = containerRef.current.clientHeight / 2;
    const worldX = pxToCm((screenCenterX - pan.x) / zoom);
    const worldY = pxToCm((screenCenterY - pan.y) / zoom);
    
    const sizes: Record<PlotObjectType, { w: number; h: number }> = {
      greenhouse: { w: 300, h: 200 },
      grass: { w: 150, h: 150 },
      shrub: { w: 80, h: 80 },
      gravel: { w: 120, h: 80 },
      tree: { w: 100, h: 100 },
      path: { w: 200, h: 60 },
    };
    
    const size = sizes[type];
    const newObj: PlotObject = {
      id: crypto.randomUUID(),
      type,
      x: snap(worldX, 10),
      y: snap(worldY, 10),
      w: size.w,
      h: size.h,
    };
    
    setObjects(prev => [...prev, newObj]);
    setSelectedId(newObj.id);
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} toegevoegd`);
  }, [pan, zoom]);

  // Delete selected
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    
    const isObject = objects.some(o => o.id === selectedId);
    if (isObject) {
      setObjects(prev => prev.filter(o => o.id !== selectedId));
      setSelectedId(null);
      toast.success("Object verwijderd");
    }
  }, [selectedId, objects]);

  // Duplicate selected
  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    
    const bed = beds.find(b => b.id === selectedId);
    if (bed && onBedDuplicate) {
      onBedDuplicate(bed);
      return;
    }
    
    const obj = objects.find(o => o.id === selectedId);
    if (obj) {
      const newObj = {
        ...obj,
        id: crypto.randomUUID(),
        x: obj.x + 30,
        y: obj.y + 30,
      };
      setObjects(prev => [...prev, newObj]);
      setSelectedId(newObj.id);
      toast.success("Object gedupliceerd");
    }
  }, [selectedId, beds, objects, onBedDuplicate]);

  // Render items sorted by Y for proper overlap
  const sortedItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "bed" | PlotObjectType;
      x: number;
      y: number;
      w: number;
      h: number;
      data: GardenBed | PlotObject;
    }> = [
      ...beds.map(b => ({
        id: b.id,
        type: "bed" as const,
        x: b.location_x ?? 0,
        y: b.location_y ?? 0,
        w: b.width_cm,
        h: b.length_cm,
        data: b,
      })),
      ...objects.map(o => ({
        id: o.id,
        type: o.type,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        data: o,
      })),
    ];
    
    return items.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  }, [beds, objects]);

  // Render a single item
  const renderItem = (item: typeof sortedItems[0]) => {
    const isSelected = selectedId === item.id;
    const px = cmToPx(item.x);
    const py = cmToPx(item.y);
    const pw = cmToPx(item.w);
    const ph = cmToPx(item.h);
    
    const transform3D = is3D ? `translate(0, ${-10})` : "";
    
    if (item.type === "bed") {
      const bed = item.data as GardenBed;
      return (
        <g
          key={item.id}
          transform={`translate(${px}, ${py}) ${transform3D}`}
          className="cursor-move"
          onPointerDown={(e) => handlePointerDown(e, item.id, "bed")}
        >
          {/* Shadow */}
          {is3D && (
            <rect
              x={-pw / 2 + 3}
              y={-ph / 2 + 6}
              width={pw}
              height={ph}
              rx={4}
              fill="black"
              opacity={0.15}
            />
          )}
          
          {/* Side (3D effect) */}
          {is3D && (
            <path
              d={`M ${-pw / 2} ${ph / 2} L ${pw / 2} ${ph / 2} L ${pw / 2} ${ph / 2 - 12} L ${-pw / 2} ${ph / 2 - 12} Z`}
              fill="hsl(25, 50%, 30%)"
            />
          )}
          
          {/* Wood frame */}
          <rect
            x={-pw / 2}
            y={-ph / 2}
            width={pw}
            height={ph}
            rx={4}
            fill="url(#gradient-wood)"
            stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(25, 40%, 25%)"}
            strokeWidth={isSelected ? 3 : 1}
          />
          
          {/* Soil */}
          <rect
            x={-pw / 2 + 4}
            y={-ph / 2 + 4}
            width={pw - 8}
            height={ph - 8}
            rx={2}
            fill="url(#pattern-soil)"
          />
          
          {/* Greenhouse indicator */}
          {bed.is_greenhouse && (
            <rect
              x={-pw / 2}
              y={-ph / 2}
              width={pw}
              height={ph}
              rx={4}
              fill="url(#gradient-glass)"
              stroke="hsl(200, 50%, 70%)"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}
          
          {/* Label */}
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white font-semibold pointer-events-none select-none"
            style={{ fontSize: Math.min(pw, ph) / 4, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            {bed.name}
          </text>
        </g>
      );
    }
    
    // Render plot object
    const obj = item.data as PlotObject;
    
    return (
      <g
        key={item.id}
        transform={`translate(${px}, ${py}) ${transform3D}`}
        className="cursor-move"
        onPointerDown={(e) => handlePointerDown(e, item.id, "object")}
      >
        {item.type === "greenhouse" && (
          <>
            {/* Frame */}
            <rect
              x={-pw / 2}
              y={-ph / 2}
              width={pw}
              height={ph}
              fill="white"
              stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(0, 0%, 70%)"}
              strokeWidth={isSelected ? 3 : 2}
            />
            {/* Glass */}
            <rect
              x={-pw / 2 + 4}
              y={-ph / 2 + 4}
              width={pw - 8}
              height={ph - 8}
              fill="url(#gradient-glass)"
            />
            {/* Cross beams */}
            <line x1={-pw / 2} y1={0} x2={pw / 2} y2={0} stroke="white" strokeWidth={2} opacity={0.5} />
            <line x1={0} y1={-ph / 2} x2={0} y2={ph / 2} stroke="white" strokeWidth={2} opacity={0.5} />
          </>
        )}
        
        {item.type === "grass" && (
          <rect
            x={-pw / 2}
            y={-ph / 2}
            width={pw}
            height={ph}
            rx={8}
            fill="url(#pattern-grass)"
            stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(100, 40%, 40%)"}
            strokeWidth={isSelected ? 3 : 2}
          />
        )}
        
        {item.type === "gravel" && (
          <rect
            x={-pw / 2}
            y={-ph / 2}
            width={pw}
            height={ph}
            rx={4}
            fill="url(#pattern-gravel)"
            stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(0, 0%, 60%)"}
            strokeWidth={isSelected ? 3 : 1}
          />
        )}
        
        {item.type === "path" && (
          <rect
            x={-pw / 2}
            y={-ph / 2}
            width={pw}
            height={ph}
            rx={2}
            fill="url(#pattern-path)"
            stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(35, 20%, 45%)"}
            strokeWidth={isSelected ? 3 : 1}
          />
        )}
        
        {item.type === "tree" && (
          <>
            {is3D && (
              <ellipse cx={3} cy={5} rx={pw / 2.5} ry={pw / 4} fill="black" opacity={0.15} />
            )}
            <circle
              cx={0}
              cy={0}
              r={pw / 2}
              fill="hsl(120, 35%, 30%)"
              stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(120, 30%, 20%)"}
              strokeWidth={isSelected ? 3 : 1}
            />
            <circle cx={-pw / 6} cy={-pw / 6} r={pw / 3} fill="hsl(120, 40%, 38%)" />
          </>
        )}
        
        {item.type === "shrub" && (
          <>
            <circle
              cx={0}
              cy={0}
              r={pw / 2}
              fill="hsl(110, 45%, 45%)"
              stroke={isSelected ? "hsl(50, 100%, 50%)" : "hsl(110, 40%, 35%)"}
              strokeWidth={isSelected ? 3 : 1}
            />
            <circle cx={-pw / 5} cy={-pw / 5} r={pw / 3} fill="hsl(110, 50%, 55%)" />
          </>
        )}
      </g>
    );
  };

  return (
    <div className="relative w-full h-[600px] bg-muted/30 rounded-lg border overflow-hidden">
      {/* Main canvas area */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onPointerDown={(e) => {
          if (e.target === containerRef.current || e.target === svgRef.current) {
            handlePointerDown(e);
          }
        }}
      >
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <PatternDefs />
          
          {/* Background grid */}
          <defs>
            <pattern id="grid" width={cmToPx(GRID_SIZE)} height={cmToPx(GRID_SIZE)} patternUnits="userSpaceOnUse">
              <path
                d={`M ${cmToPx(GRID_SIZE)} 0 L 0 0 0 ${cmToPx(GRID_SIZE)}`}
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth={0.5}
                opacity={0.5}
              />
            </pattern>
          </defs>
          
          {/* Large background area */}
          <rect
            x={-2000}
            y={-2000}
            width={4000}
            height={4000}
            fill="url(#pattern-grass)"
          />
          <rect
            x={-2000}
            y={-2000}
            width={4000}
            height={4000}
            fill="url(#grid)"
          />
          
          {/* Render all items */}
          {sortedItems.map(renderItem)}
        </svg>
      </div>
      
      {/* Top controls */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-3 py-2 rounded-full shadow-lg border z-10">
        <Button
          variant={!is3D ? "default" : "ghost"}
          size="sm"
          onClick={() => setIs3D(false)}
          className="rounded-full text-xs h-8"
        >
          2D
        </Button>
        <Button
          variant={is3D ? "default" : "ghost"}
          size="sm"
          onClick={() => setIs3D(true)}
          className="rounded-full text-xs h-8 gap-1"
        >
          <Move3D className="h-3 w-3" />
          3D
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button variant="ghost" size="sm" onClick={() => setZoom(z => clamp(z * 1.2, 0.2, 3))} className="rounded-full h-8 w-8 p-0">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setZoom(z => clamp(z * 0.8, 0.2, 3))} className="rounded-full h-8 w-8 p-0">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={fitToView} className="rounded-full h-8 w-8 p-0" title="Fit in beeld">
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Bottom toolbar - Add objects */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-2 z-10">
        <div className="flex items-center gap-1 bg-background/95 backdrop-blur-sm px-3 py-2 rounded-2xl shadow-lg border">
          <ToolButton icon={Warehouse} label="Kas" onClick={() => spawnObject("greenhouse")} />
          <ToolButton icon={Flower2} label="Struik" onClick={() => spawnObject("shrub")} />
          <ToolButton icon={TreePine} label="Boom" onClick={() => spawnObject("tree")} />
          <ToolButton icon={LayoutGrid} label="Grind" onClick={() => spawnObject("gravel")} />
          <ToolButton icon={TreeDeciduous} label="Gras" onClick={() => spawnObject("grass")} />
          <ToolButton icon={Rows3} label="Pad" onClick={() => spawnObject("path")} />
        </div>
        
        {/* Selection actions */}
        {selectedId && (
          <div className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-2 rounded-2xl shadow-lg animate-in slide-in-from-bottom-2">
            <span className="text-xs font-medium px-2 border-r border-primary-foreground/20 mr-1">
              {beds.some(b => b.id === selectedId) ? "Bak" : "Object"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={duplicateSelected}
              className="h-8 w-8 p-0 hover:bg-primary-foreground/20"
              title="Dupliceren"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {!beds.some(b => b.id === selectedId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteSelected}
                className="h-8 w-8 p-0 hover:bg-destructive/80"
                title="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="absolute top-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        Sleep om te verplaatsen • Scroll om te zoomen
      </div>
    </div>
  );
}

// Tool button component
function ToolButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-2 py-1 group transition-transform hover:-translate-y-0.5"
    >
      <div className="p-2 rounded-xl bg-muted border border-border group-hover:bg-accent group-hover:border-accent transition-colors">
        <Icon className="h-5 w-5 text-foreground" />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </button>
  );
}
