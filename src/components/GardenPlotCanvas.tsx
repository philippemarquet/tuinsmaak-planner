import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, UUID } from "../lib/types";
import { cn } from "../lib/utils";
import {
  TreePine,
  Warehouse,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Copy,
  TreeDeciduous,
  Rows3,
  Flower2,
  Sun,
  Moon,
  Move,
  Hand,
  MousePointer2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

// --- Types ---
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path" | "fence" | "pond";

interface PlotObject {
  id: string;
  type: PlotObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  label?: string;
}

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  onBedMove: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  storagePrefix?: string;
}

// --- Constants ---
const SCALE_FACTOR = 0.5;

// --- Helpers ---
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const snap = (n: number, step: number = 10) => Math.round(n / step) * step;
const cmToPx = (cm: number) => cm * SCALE_FACTOR;
const pxToCm = (px: number) => px / SCALE_FACTOR;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Main Component ---
export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  storagePrefix = "gardenPlot",
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // View state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotationY, setRotationY] = useState(0); // Horizontal rotation
  const [rotationX, setRotationX] = useState(55); // Tilt angle (0 = top-down, 90 = side view)
  const [isDayMode, setIsDayMode] = useState(true);
  const [tool, setTool] = useState<"select" | "pan">("select");
  
  // Objects state
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
  const [isRotating, setIsRotating] = useState(false);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    type: "pan" | "bed" | "object" | "rotate" | null;
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startRotation: { x: number; y: number };
    startItemPos: { x: number; y: number };
    itemId: string | null;
  }>({
    isDragging: false,
    type: null,
    startX: 0,
    startY: 0,
    startPan: { x: 0, y: 0 },
    startRotation: { x: 0, y: 0 },
    startItemPos: { x: 0, y: 0 },
    itemId: null,
  });

  // Persist objects
  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:objects`, JSON.stringify(objects));
  }, [objects, storagePrefix]);

  // Auto-fit on mount
  useEffect(() => {
    const timer = setTimeout(() => fitToView(), 200);
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
    
    const screenW = containerRef.current.clientWidth;
    const screenH = containerRef.current.clientHeight;
    
    if (allItems.length === 0) {
      setPan({ x: screenW / 2, y: screenH / 2 });
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
    
    const padding = 120;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    
    // Account for 3D perspective compression
    const perspectiveScale = 0.7;
    const scale = Math.min(
      (screenW * perspectiveScale) / contentW,
      (screenH * perspectiveScale) / contentH,
      1.5
    );
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setZoom(clamp(scale, 0.3, 2));
    setPan({
      x: screenW / 2 - centerX * scale,
      y: screenH / 2 - centerY * scale * 0.6, // Offset for 3D tilt
    });
  }, [beds, objects]);

  // Mouse handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, itemId?: string, itemType?: "bed" | "object") => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    
    // Right-click or middle-click for rotation
    if (e.button === 2 || e.button === 1) {
      setIsRotating(true);
      setDragState({
        isDragging: true,
        type: "rotate",
        startX: e.clientX,
        startY: e.clientY,
        startPan: pan,
        startRotation: { x: rotationX, y: rotationY },
        startItemPos: { x: 0, y: 0 },
        itemId: null,
      });
      return;
    }
    
    if (itemId && itemType && tool === "select") {
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
        startRotation: { x: rotationX, y: rotationY },
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
        startRotation: { x: rotationX, y: rotationY },
        startItemPos: { x: 0, y: 0 },
        itemId: null,
      });
    }
  }, [beds, objects, pan, rotationX, rotationY, tool]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.isDragging) return;
    
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    
    if (dragState.type === "rotate") {
      setRotationY(dragState.startRotation.y + dx * 0.3);
      setRotationX(clamp(dragState.startRotation.x - dy * 0.3, 20, 80));
    } else if (dragState.type === "pan") {
      setPan({
        x: dragState.startPan.x + dx,
        y: dragState.startPan.y + dy,
      });
    } else if (dragState.itemId) {
      // Convert screen movement to world movement accounting for rotation
      const angleRad = (rotationY * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      
      const worldDx = pxToCm((dx * cos + dy * sin) / zoom);
      const worldDy = pxToCm((-dx * sin + dy * cos) / zoom);
      
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
  }, [dragState, zoom, rotationY, onBedMove]);

  const handlePointerUp = useCallback(() => {
    setDragState(prev => ({ ...prev, isDragging: false, type: null }));
    setIsRotating(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => clamp(z * delta, 0.2, 3));
    } else if (e.shiftKey) {
      setRotationY(r => r + e.deltaY * 0.2);
    } else {
      setPan(p => ({
        x: p.x - e.deltaX * 0.5,
        y: p.y - e.deltaY * 0.5,
      }));
    }
  }, []);

  // Prevent context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Spawn object
  const spawnObject = useCallback((type: PlotObjectType) => {
    const sizes: Record<PlotObjectType, { w: number; h: number }> = {
      greenhouse: { w: 400, h: 300 },
      grass: { w: 200, h: 200 },
      shrub: { w: 60, h: 60 },
      gravel: { w: 150, h: 100 },
      tree: { w: 80, h: 80 },
      path: { w: 300, h: 60 },
      fence: { w: 200, h: 10 },
      pond: { w: 150, h: 100 },
    };
    
    // Find center of existing beds
    const avgX = beds.length > 0 
      ? beds.reduce((sum, b) => sum + (b.location_x ?? 0), 0) / beds.length 
      : 0;
    const avgY = beds.length > 0 
      ? beds.reduce((sum, b) => sum + (b.location_y ?? 0), 0) / beds.length 
      : 0;
    
    const size = sizes[type];
    const offset = objects.filter(o => o.type === type).length * 30;
    
    const newObj: PlotObject = {
      id: crypto.randomUUID(),
      type,
      x: snap(avgX + offset - 200, 10),
      y: snap(avgY + offset - 200, 10),
      w: size.w,
      h: size.h,
    };
    
    setObjects(prev => [...prev, newObj]);
    setSelectedId(newObj.id);
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} toegevoegd`);
  }, [beds, objects]);

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
      const newObj = { ...obj, id: crypto.randomUUID(), x: obj.x + 40, y: obj.y + 40 };
      setObjects(prev => [...prev, newObj]);
      setSelectedId(newObj.id);
      toast.success("Object gedupliceerd");
    }
  }, [selectedId, beds, objects, onBedDuplicate]);

  // Reset view
  const resetView = useCallback(() => {
    setRotationX(55);
    setRotationY(0);
    fitToView();
  }, [fitToView]);

  // Calculate lighting based on time of day and rotation
  const lightAngle = useMemo(() => {
    const baseAngle = isDayMode ? -45 : -30;
    return baseAngle - rotationY;
  }, [isDayMode, rotationY]);

  // Sorted items for rendering (painter's algorithm)
  const sortedItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "bed" | PlotObjectType;
      x: number;
      y: number;
      w: number;
      h: number;
      z: number;
      data: GardenBed | PlotObject;
    }> = [
      ...beds.map(b => ({
        id: b.id,
        type: "bed" as const,
        x: b.location_x ?? 0,
        y: b.location_y ?? 0,
        w: b.width_cm,
        h: b.length_cm,
        z: b.is_greenhouse ? 180 : 25,
        data: b,
      })),
      ...objects.map(o => ({
        id: o.id,
        type: o.type,
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
        z: o.type === "tree" ? 200 : o.type === "greenhouse" ? 180 : o.type === "shrub" ? 40 : 5,
        data: o,
      })),
    ];
    
    // Sort by depth (y position adjusted for rotation)
    return items.sort((a, b) => {
      const aDepth = a.y + a.h / 2;
      const bDepth = b.y + b.h / 2;
      return aDepth - bDepth;
    });
  }, [beds, objects]);

  // Colors and gradients based on time
  const colors = useMemo(() => ({
    sky: isDayMode 
      ? "linear-gradient(180deg, #87CEEB 0%, #B0E0E6 50%, #98FB98 100%)"
      : "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #1f4037 100%)",
    grass: isDayMode ? "#4a7c3f" : "#2d4a28",
    grassLight: isDayMode ? "#5d9e4e" : "#3a5d35",
    soil: isDayMode ? "#5d4037" : "#3d2a27",
    wood: isDayMode ? "#8B4513" : "#5d3a22",
    woodLight: isDayMode ? "#A0522D" : "#7a4d33",
    shadow: isDayMode ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.5)",
    ambient: isDayMode ? 1 : 0.6,
  }), [isDayMode]);

  return (
    <div className="relative w-full h-[700px] rounded-xl overflow-hidden shadow-2xl border border-border/50">
      {/* Sky gradient background */}
      <div 
        className="absolute inset-0 transition-all duration-700"
        style={{ background: colors.sky }}
      />
      
      {/* Sun/Moon indicator */}
      <div 
        className={cn(
          "absolute top-8 transition-all duration-700 z-10",
          isDayMode ? "right-12" : "right-20"
        )}
        style={{
          transform: `rotate(${lightAngle}deg)`,
        }}
      >
        {isDayMode ? (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-200 via-yellow-300 to-orange-400 shadow-[0_0_60px_20px_rgba(255,200,100,0.4)]" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 shadow-[0_0_30px_10px_rgba(200,200,255,0.2)]" />
        )}
      </div>

      {/* 3D Canvas Container */}
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 transition-cursor duration-200",
          tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          isRotating && "cursor-move"
        )}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onPointerDown={(e) => {
          if (e.target === containerRef.current) {
            handlePointerDown(e);
          }
        }}
        style={{ perspective: "1500px", perspectiveOrigin: "50% 50%" }}
      >
        {/* 3D World */}
        <div
          className="absolute left-1/2 top-1/2 transition-transform duration-100"
          style={{
            transform: `
              translate(-50%, -50%)
              translate(${pan.x - (containerRef.current?.clientWidth ?? 0) / 2}px, ${pan.y - (containerRef.current?.clientHeight ?? 0) / 2}px)
              rotateX(${rotationX}deg)
              rotateZ(${rotationY}deg)
              scale(${zoom})
            `,
            transformStyle: "preserve-3d",
            width: 0,
            height: 0,
          }}
        >
          {/* Ground plane */}
          <div
            className="absolute transition-colors duration-700"
            style={{
              width: "4000px",
              height: "4000px",
              left: "-2000px",
              top: "-2000px",
              background: `
                radial-gradient(circle at 50% 50%, ${colors.grassLight} 0%, ${colors.grass} 100%)
              `,
              boxShadow: `inset 0 0 200px 50px rgba(0,0,0,0.15)`,
              transform: "translateZ(-1px)",
            }}
          >
            {/* Grass texture overlay */}
            <svg className="absolute inset-0 w-full h-full opacity-30">
              <defs>
                <pattern id="grassPattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1.5" fill="rgba(0,50,0,0.3)" />
                  <circle cx="30" cy="25" r="1" fill="rgba(0,50,0,0.2)" />
                  <circle cx="20" cy="35" r="1.2" fill="rgba(0,50,0,0.25)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grassPattern)" />
            </svg>
            
            {/* Grid overlay */}
            <svg className="absolute inset-0 w-full h-full opacity-10">
              <defs>
                <pattern id="gridPattern" width={cmToPx(100)} height={cmToPx(100)} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${cmToPx(100)} 0 L 0 0 0 ${cmToPx(100)}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.5)"
                    strokeWidth={1}
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#gridPattern)" />
            </svg>
          </div>

          {/* Render all items */}
          {sortedItems.map(item => (
            <GardenItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              colors={colors}
              lightAngle={lightAngle}
              onPointerDown={(e) => handlePointerDown(e, item.id, item.type === "bed" ? "bed" : "object")}
            />
          ))}
        </div>
      </div>

      {/* Top Control Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
        {/* View controls */}
        <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(z => clamp(z * 1.25, 0.2, 3))}
            className="h-9 w-9 p-0 rounded-full hover:bg-accent"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setZoom(z => clamp(z * 0.8, 0.2, 3))}
            className="h-9 w-9 p-0 rounded-full hover:bg-accent"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={resetView}
            className="h-9 w-9 p-0 rounded-full hover:bg-accent"
            title="Reset weergave"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fitToView}
            className="h-9 w-9 p-0 rounded-full hover:bg-accent"
            title="Alles in beeld"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant={isDayMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setIsDayMode(true)}
            className="h-9 w-9 p-0 rounded-full"
          >
            <Sun className="h-4 w-4" />
          </Button>
          <Button
            variant={!isDayMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setIsDayMode(false)}
            className="h-9 w-9 p-0 rounded-full"
          >
            <Moon className="h-4 w-4" />
          </Button>
        </div>

        {/* Rotation slider */}
        <div className="flex items-center gap-3 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <span className="text-xs font-medium text-muted-foreground">Hoek</span>
          <Slider
            value={[rotationX]}
            onValueChange={([v]) => setRotationX(v)}
            min={20}
            max={80}
            step={1}
            className="w-24"
          />
          <span className="text-xs text-muted-foreground w-8">{Math.round(rotationX)}°</span>
        </div>
      </div>

      {/* Tool selection */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 bg-background/90 backdrop-blur-md p-2 rounded-xl shadow-xl border border-border/50 z-20">
        <Button
          variant={tool === "select" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTool("select")}
          className="h-10 w-10 p-0 rounded-lg"
          title="Selecteren"
        >
          <MousePointer2 className="h-5 w-5" />
        </Button>
        <Button
          variant={tool === "pan" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTool("pan")}
          className="h-10 w-10 p-0 rounded-lg"
          title="Verplaatsen"
        >
          <Hand className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-3 z-20">
        {/* Add objects */}
        <div className="flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-border/50">
          <span className="text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider">Toevoegen</span>
          <ObjectButton icon={Warehouse} label="Kas" onClick={() => spawnObject("greenhouse")} color="text-blue-500" />
          <ObjectButton icon={TreePine} label="Boom" onClick={() => spawnObject("tree")} color="text-emerald-600" />
          <ObjectButton icon={Flower2} label="Struik" onClick={() => spawnObject("shrub")} color="text-green-500" />
          <ObjectButton icon={TreeDeciduous} label="Gras" onClick={() => spawnObject("grass")} color="text-lime-500" />
          <ObjectButton icon={Rows3} label="Pad" onClick={() => spawnObject("path")} color="text-amber-600" />
          <div className="w-px h-8 bg-border mx-1" />
          <ObjectButton 
            icon={() => (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="12" rx="10" ry="6" className="text-blue-400" />
              </svg>
            )} 
            label="Vijver" 
            onClick={() => spawnObject("pond")} 
            color="text-blue-400" 
          />
        </div>

        {/* Selection actions */}
        {selectedId && (
          <div className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-2xl shadow-xl animate-in slide-in-from-bottom-3 duration-300">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70 mr-2">
              {beds.some(b => b.id === selectedId) ? "Bak" : "Object"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={duplicateSelected}
              className="h-9 w-9 p-0 rounded-lg hover:bg-primary-foreground/20"
              title="Dupliceren"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {!beds.some(b => b.id === selectedId) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteSelected}
                className="h-9 w-9 p-0 rounded-lg hover:bg-destructive text-destructive-foreground hover:text-white"
                title="Verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 text-xs text-white/80 bg-black/30 backdrop-blur-sm px-3 py-2 rounded-lg z-10">
        <div className="flex flex-col gap-1">
          <span>🖱️ Sleep = verplaatsen</span>
          <span>⚙️ Scroll = zoomen</span>
          <span>🔄 Rechtermuisknop = draaien</span>
        </div>
      </div>

      {/* Beds counter */}
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-border/50 z-20">
        <span className="text-sm font-semibold">
          {beds.length} {beds.length === 1 ? "bak" : "bakken"}
        </span>
      </div>
    </div>
  );
}

// --- Garden Item Component ---
function GardenItem({
  item,
  isSelected,
  colors,
  lightAngle,
  onPointerDown,
}: {
  item: {
    id: string;
    type: "bed" | PlotObjectType;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
    data: GardenBed | PlotObject;
  };
  isSelected: boolean;
  colors: Record<string, string | number>;
  lightAngle: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const px = cmToPx(item.x);
  const py = cmToPx(item.y);
  const pw = cmToPx(item.w);
  const ph = cmToPx(item.h);
  const pz = cmToPx(item.z);

  // Calculate shadow offset based on light angle
  const shadowOffsetX = Math.cos((lightAngle * Math.PI) / 180) * 8;
  const shadowOffsetY = Math.sin((lightAngle * Math.PI) / 180) * 8 + 10;

  if (item.type === "bed") {
    const bed = item.data as GardenBed;
    return (
      <div
        className={cn(
          "absolute cursor-move transition-all duration-150",
          isSelected && "z-50"
        )}
        style={{
          left: px,
          top: py,
          width: 0,
          height: 0,
          transform: "translate(-50%, -50%)",
          transformStyle: "preserve-3d",
        }}
        onPointerDown={onPointerDown}
      >
        {/* Shadow */}
        <div
          className="absolute rounded-lg transition-opacity duration-300"
          style={{
            width: pw,
            height: ph,
            left: -pw / 2 + shadowOffsetX,
            top: -ph / 2 + shadowOffsetY,
            background: "rgba(0,0,0,0.2)",
            filter: "blur(8px)",
            transform: "translateZ(0px)",
          }}
        />
        
        {/* Wood sides */}
        <div
          className="absolute transition-colors duration-500"
          style={{
            width: pw,
            height: pz,
            left: -pw / 2,
            top: ph / 2 - pz,
            background: `linear-gradient(180deg, ${colors.woodLight} 0%, ${colors.wood} 100%)`,
            transform: `rotateX(-90deg) translateZ(${ph / 2}px)`,
            transformOrigin: "top center",
            borderRadius: "0 0 4px 4px",
          }}
        />
        
        {/* Wood frame top */}
        <div
          className={cn(
            "absolute rounded-lg transition-all duration-200",
            isSelected && "ring-4 ring-yellow-400 ring-offset-2 ring-offset-transparent"
          )}
          style={{
            width: pw,
            height: ph,
            left: -pw / 2,
            top: -ph / 2,
            background: `linear-gradient(135deg, ${colors.woodLight} 0%, ${colors.wood} 100%)`,
            transform: `translateZ(${pz}px)`,
            boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.2), inset -2px -2px 4px rgba(0,0,0,0.2)`,
          }}
        >
          {/* Soil inside */}
          <div
            className="absolute rounded transition-colors duration-500"
            style={{
              left: 6,
              top: 6,
              right: 6,
              bottom: 6,
              background: `
                radial-gradient(circle at 30% 30%, #6d4c41 0%, ${colors.soil} 100%)
              `,
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {/* Soil texture */}
            <svg className="absolute inset-0 w-full h-full opacity-30">
              <defs>
                <pattern id={`soil-${item.id}`} width="12" height="12" patternUnits="userSpaceOnUse">
                  <circle cx="3" cy="3" r="1" fill="rgba(0,0,0,0.3)" />
                  <circle cx="9" cy="8" r="0.8" fill="rgba(0,0,0,0.2)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#soil-${item.id})`} />
            </svg>
          </div>
          
          {/* Greenhouse overlay */}
          {bed.is_greenhouse && (
            <div
              className="absolute inset-0 rounded-lg"
              style={{
                background: "linear-gradient(135deg, rgba(200,230,255,0.5) 0%, rgba(180,220,255,0.2) 50%, rgba(200,230,255,0.5) 100%)",
                border: "2px solid rgba(255,255,255,0.5)",
              }}
            >
              {/* Glass reflections */}
              <div className="absolute top-1 left-1 right-1/2 bottom-1/2 bg-gradient-to-br from-white/30 to-transparent rounded" />
            </div>
          )}
          
          {/* Label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="font-bold text-white drop-shadow-lg text-center px-2 leading-tight"
              style={{ 
                fontSize: Math.min(pw, ph) / 5,
                textShadow: "0 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(0,0,0,0.3)",
              }}
            >
              {bed.name}
            </span>
          </div>
        </div>
        
        {/* Selection glow */}
        {isSelected && (
          <div
            className="absolute rounded-lg animate-pulse pointer-events-none"
            style={{
              width: pw + 16,
              height: ph + 16,
              left: -pw / 2 - 8,
              top: -ph / 2 - 8,
              border: "3px solid #facc15",
              transform: `translateZ(${pz + 1}px)`,
              boxShadow: "0 0 20px rgba(250, 204, 21, 0.5)",
            }}
          />
        )}
      </div>
    );
  }

  // Render objects
  const obj = item.data as PlotObject;
  
  return (
    <div
      className={cn(
        "absolute cursor-move transition-all duration-150",
        isSelected && "z-50"
      )}
      style={{
        left: px,
        top: py,
        width: 0,
        height: 0,
        transform: "translate(-50%, -50%)",
        transformStyle: "preserve-3d",
      }}
      onPointerDown={onPointerDown}
    >
      {/* Object-specific rendering */}
      {item.type === "greenhouse" && (
        <>
          {/* Shadow */}
          <div
            className="absolute"
            style={{
              width: pw,
              height: ph,
              left: -pw / 2 + shadowOffsetX,
              top: -ph / 2 + shadowOffsetY,
              background: "rgba(0,0,0,0.15)",
              filter: "blur(12px)",
            }}
          />
          
          {/* Greenhouse structure */}
          <div
            className={cn(
              "absolute rounded transition-all duration-200",
              isSelected && "ring-4 ring-yellow-400"
            )}
            style={{
              width: pw,
              height: ph,
              left: -pw / 2,
              top: -ph / 2,
              background: "linear-gradient(135deg, rgba(220,240,255,0.8) 0%, rgba(200,230,255,0.6) 100%)",
              border: "4px solid #e0e0e0",
              transform: `translateZ(${pz}px)`,
              boxShadow: "inset 0 0 30px rgba(255,255,255,0.5)",
            }}
          >
            {/* Glass panels */}
            <div className="absolute inset-2 grid grid-cols-3 gap-1 opacity-40">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="border border-white/50 rounded-sm" />
              ))}
            </div>
            {/* Roof highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/40 to-transparent rounded-t" />
          </div>
        </>
      )}

      {item.type === "tree" && (
        <>
          {/* Shadow */}
          <div
            className="absolute rounded-full"
            style={{
              width: pw * 1.2,
              height: pw * 0.8,
              left: -pw * 0.6 + shadowOffsetX * 2,
              top: -pw * 0.4 + shadowOffsetY * 2,
              background: "rgba(0,0,0,0.2)",
              filter: "blur(8px)",
            }}
          />
          
          {/* Trunk */}
          <div
            className="absolute rounded"
            style={{
              width: pw * 0.2,
              height: pz,
              left: -pw * 0.1,
              bottom: 0,
              background: "linear-gradient(90deg, #5d4037 0%, #8B4513 50%, #5d4037 100%)",
              transform: `translateZ(0px)`,
            }}
          />
          
          {/* Foliage layers */}
          <div
            className={cn(
              "absolute rounded-full transition-all duration-200",
              isSelected && "ring-4 ring-yellow-400"
            )}
            style={{
              width: pw * 1.4,
              height: pw * 1.4,
              left: -pw * 0.7,
              top: -pw * 0.7 - pz * 0.3,
              background: "radial-gradient(circle at 30% 30%, #4caf50 0%, #2e7d32 60%, #1b5e20 100%)",
              transform: `translateZ(${pz}px)`,
              boxShadow: "inset -10px -10px 20px rgba(0,0,0,0.3), inset 5px 5px 15px rgba(255,255,255,0.2)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: pw,
              height: pw,
              left: -pw / 2 - pw * 0.2,
              top: -pw / 2 - pz * 0.5,
              background: "radial-gradient(circle at 40% 40%, #66bb6a 0%, #43a047 100%)",
              transform: `translateZ(${pz * 1.2}px)`,
            }}
          />
        </>
      )}

      {item.type === "shrub" && (
        <>
          <div
            className="absolute rounded-full"
            style={{
              width: pw * 0.8,
              height: pw * 0.5,
              left: -pw * 0.4 + shadowOffsetX,
              top: -pw * 0.25 + shadowOffsetY,
              background: "rgba(0,0,0,0.15)",
              filter: "blur(4px)",
            }}
          />
          <div
            className={cn(
              "absolute rounded-full transition-all duration-200",
              isSelected && "ring-4 ring-yellow-400"
            )}
            style={{
              width: pw,
              height: pw * 0.8,
              left: -pw / 2,
              top: -pw * 0.4,
              background: "radial-gradient(ellipse at 30% 30%, #81c784 0%, #4caf50 50%, #388e3c 100%)",
              transform: `translateZ(${pz}px)`,
              boxShadow: "inset -4px -4px 10px rgba(0,0,0,0.3)",
            }}
          />
        </>
      )}

      {item.type === "grass" && (
        <div
          className={cn(
            "absolute rounded-lg transition-all duration-200",
            isSelected && "ring-4 ring-yellow-400"
          )}
          style={{
            width: pw,
            height: ph,
            left: -pw / 2,
            top: -ph / 2,
            background: "radial-gradient(circle at 50% 50%, #7cb342 0%, #558b2f 100%)",
            transform: "translateZ(2px)",
          }}
        />
      )}

      {item.type === "gravel" && (
        <div
          className={cn(
            "absolute rounded transition-all duration-200",
            isSelected && "ring-4 ring-yellow-400"
          )}
          style={{
            width: pw,
            height: ph,
            left: -pw / 2,
            top: -ph / 2,
            background: "linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%)",
            transform: "translateZ(1px)",
          }}
        >
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id={`gravel-${item.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="3" cy="3" r="2" fill="rgba(100,100,100,0.3)" />
                <circle cx="8" cy="7" r="1.5" fill="rgba(120,120,120,0.3)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#gravel-${item.id})`} />
          </svg>
        </div>
      )}

      {item.type === "path" && (
        <div
          className={cn(
            "absolute rounded transition-all duration-200",
            isSelected && "ring-4 ring-yellow-400"
          )}
          style={{
            width: pw,
            height: ph,
            left: -pw / 2,
            top: -ph / 2,
            background: "linear-gradient(135deg, #a1887f 0%, #8d6e63 100%)",
            transform: "translateZ(1px)",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
          }}
        >
          {/* Stone pattern */}
          <div className="absolute inset-1 flex flex-wrap gap-1 opacity-50">
            {[...Array(Math.floor((pw * ph) / 400))].map((_, i) => (
              <div
                key={i}
                className="bg-white/20 rounded"
                style={{
                  width: 12 + Math.random() * 8,
                  height: 10 + Math.random() * 6,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {item.type === "pond" && (
        <>
          <div
            className="absolute rounded-full"
            style={{
              width: pw,
              height: ph * 0.6,
              left: -pw / 2 + shadowOffsetX * 0.5,
              top: -ph * 0.3 + shadowOffsetY * 0.5,
              background: "rgba(0,0,0,0.1)",
              filter: "blur(6px)",
            }}
          />
          <div
            className={cn(
              "absolute rounded-[40%] transition-all duration-200 overflow-hidden",
              isSelected && "ring-4 ring-yellow-400"
            )}
            style={{
              width: pw,
              height: ph,
              left: -pw / 2,
              top: -ph / 2,
              background: "linear-gradient(180deg, #4fc3f7 0%, #0288d1 50%, #01579b 100%)",
              transform: "translateZ(-2px)",
              boxShadow: "inset 0 0 20px rgba(255,255,255,0.3)",
            }}
          >
            {/* Water reflections */}
            <div className="absolute top-2 left-2 right-1/2 bottom-1/2 bg-gradient-to-br from-white/40 to-transparent rounded-full" />
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        </>
      )}
    </div>
  );
}

// --- Object Button Component ---
function ObjectButton({
  icon: Icon,
  label,
  onClick,
  color,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1 px-2 py-1 transition-transform duration-200 hover:-translate-y-1"
    >
      <div className={cn(
        "p-2.5 rounded-xl bg-muted/50 border border-border/50 transition-all duration-200",
        "group-hover:bg-accent group-hover:border-accent group-hover:shadow-lg",
        color
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </button>
  );
}
