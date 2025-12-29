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
  Hand,
  MousePointer2,
  Edit3,
} from "lucide-react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { toast } from "sonner";

// --- Types ---
type PlotObjectType = "greenhouse" | "grass" | "shrub" | "gravel" | "tree" | "path" | "pond";

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
  onBedEdit?: (bed: GardenBed) => void;
  storagePrefix?: string;
}

// --- Constants ---
const SCALE_FACTOR = 0.5;
const BED_HEIGHT_CM = 25; // Default bed frame height in cm

// --- Helpers ---
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const snap = (n: number, step: number = 10) => Math.round(n / step) * step;
const cmToPx = (cm: number) => cm * SCALE_FACTOR;
const pxToCm = (px: number) => px / SCALE_FACTOR;

// --- Main Component ---
export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  onBedEdit,
  storagePrefix = "gardenPlot",
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  
  // View state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotationY, setRotationY] = useState(0);
  const [rotationX, setRotationX] = useState(55);
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
  const [draggedItem, setDraggedItem] = useState<{
    id: string;
    type: "bed" | "object";
    startX: number;
    startY: number;
    itemStartX: number;
    itemStartY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isRotating, setIsRotating] = useState(false);
  const [rotateStart, setRotateStart] = useState({ x: 0, y: 0, rotX: 0, rotY: 0 });

  // Persist objects
  useEffect(() => {
    localStorage.setItem(`${storagePrefix}:objects`, JSON.stringify(objects));
  }, [objects, storagePrefix]);

  // Auto-fit on mount and when beds change
  useEffect(() => {
    const timer = setTimeout(() => fitToView(), 100);
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
      setPan({ x: 0, y: 0 });
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
    
    const padding = 150;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    
    const scale = Math.min(
      (screenW * 0.8) / contentW,
      (screenH * 0.6) / contentH,
      1.5
    );
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    setZoom(clamp(scale, 0.3, 2));
    setPan({
      x: -centerX * scale,
      y: -centerY * scale * 0.5,
    });
  }, [beds, objects]);

  // Handle item drag start
  const handleItemDragStart = useCallback((
    e: React.PointerEvent,
    id: string,
    type: "bed" | "object",
    itemX: number,
    itemY: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setSelectedId(id);
    setDraggedItem({
      id,
      type,
      startX: e.clientX,
      startY: e.clientY,
      itemStartX: itemX,
      itemStartY: itemY,
    });
  }, []);

  // Handle canvas pointer down (pan or rotate)
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    // Right-click for rotation
    if (e.button === 2) {
      e.preventDefault();
      setIsRotating(true);
      setRotateStart({ x: e.clientX, y: e.clientY, rotX: rotationX, rotY: rotationY });
      return;
    }
    
    // Left-click for panning (when in pan mode or clicking on empty space)
    if (e.button === 0 && (tool === "pan" || e.target === containerRef.current || e.target === worldRef.current)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y });
      setSelectedId(null);
    }
  }, [tool, pan, rotationX, rotationY]);

  // Handle pointer move
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Handle rotation
    if (isRotating) {
      const dx = e.clientX - rotateStart.x;
      const dy = e.clientY - rotateStart.y;
      setRotationY(rotateStart.rotY + dx * 0.3);
      setRotationX(clamp(rotateStart.rotX - dy * 0.3, 20, 80));
      return;
    }
    
    // Handle panning
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan({ x: panStart.panX + dx, y: panStart.panY + dy });
      return;
    }
    
    // Handle item dragging
    if (draggedItem) {
      const dx = e.clientX - draggedItem.startX;
      const dy = e.clientY - draggedItem.startY;
      
      // Simple screen-to-world conversion (ignoring rotation for simplicity)
      const worldDx = pxToCm(dx / zoom);
      const worldDy = pxToCm(dy / zoom);
      
      const newX = snap(draggedItem.itemStartX + worldDx, 10);
      const newY = snap(draggedItem.itemStartY + worldDy, 10);
      
      if (draggedItem.type === "bed") {
        onBedMove(draggedItem.id, newX, newY);
      } else {
        setObjects(prev => prev.map(o => 
          o.id === draggedItem.id ? { ...o, x: newX, y: newY } : o
        ));
      }
    }
  }, [isRotating, isPanning, draggedItem, rotateStart, panStart, zoom, onBedMove]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    setDraggedItem(null);
    setIsPanning(false);
    setIsRotating(false);
  }, []);

  // Handle wheel for zoom/pan
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

  // Handle bed double-click for editing
  const handleBedDoubleClick = useCallback((bed: GardenBed) => {
    if (onBedEdit) {
      onBedEdit(bed);
    }
  }, [onBedEdit]);

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
      pond: { w: 150, h: 100 },
    };
    
    const avgX = beds.length > 0 
      ? beds.reduce((sum, b) => sum + (b.location_x ?? 0), 0) / beds.length 
      : 0;
    const avgY = beds.length > 0 
      ? beds.reduce((sum, b) => sum + (b.location_y ?? 0), 0) / beds.length 
      : 0;
    
    const size = sizes[type];
    const offset = objects.filter(o => o.type === type).length * 50;
    
    const newObj: PlotObject = {
      id: crypto.randomUUID(),
      type,
      x: snap(avgX + offset - 300, 10),
      y: snap(avgY + offset - 300, 10),
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
      const newObj = { ...obj, id: crypto.randomUUID(), x: obj.x + 50, y: obj.y + 50 };
      setObjects(prev => [...prev, newObj]);
      setSelectedId(newObj.id);
      toast.success("Object gedupliceerd");
    }
  }, [selectedId, beds, objects, onBedDuplicate]);

  // Reset view
  const resetView = useCallback(() => {
    setRotationX(55);
    setRotationY(0);
    setTimeout(() => fitToView(), 50);
  }, [fitToView]);

  // Colors based on time
  const colors = useMemo(() => ({
    sky: isDayMode 
      ? "linear-gradient(180deg, #87CEEB 0%, #B0E0E6 50%, #98FB98 100%)"
      : "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #1f4037 100%)",
    grass: isDayMode ? "#4a7c3f" : "#2d4a28",
    grassLight: isDayMode ? "#5d9e4e" : "#3a5d35",
    soil: isDayMode ? "#5d4037" : "#3d2a27",
    wood: isDayMode ? "#8B4513" : "#5d3a22",
    woodLight: isDayMode ? "#A0522D" : "#7a4d33",
    woodDark: isDayMode ? "#5D3A1A" : "#3d2a17",
  }), [isDayMode]);

  // Sorted items for rendering
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

  const selectedBed = beds.find(b => b.id === selectedId);

  return (
    <div className="relative w-full h-[700px] rounded-xl overflow-hidden shadow-2xl border border-border/50">
      {/* Sky gradient */}
      <div 
        className="absolute inset-0 transition-all duration-700"
        style={{ background: colors.sky }}
      />
      
      {/* Sun/Moon */}
      <div className={cn("absolute top-8 transition-all duration-700 z-10", isDayMode ? "right-12" : "right-20")}>
        {isDayMode ? (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-200 via-yellow-300 to-orange-400 shadow-[0_0_60px_20px_rgba(255,200,100,0.4)]" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 shadow-[0_0_30px_10px_rgba(200,200,255,0.2)]" />
        )}
      </div>

      {/* 3D Canvas */}
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 overflow-hidden",
          isPanning && "cursor-grabbing",
          tool === "pan" && !isPanning && "cursor-grab",
          isRotating && "cursor-move"
        )}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerDown={handleCanvasPointerDown}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ perspective: "1200px", perspectiveOrigin: "50% 40%" }}
      >
        {/* 3D World Container */}
        <div
          ref={worldRef}
          className="absolute w-full h-full transition-transform duration-75"
          style={{
            transformStyle: "preserve-3d",
            transform: `
              translateZ(-300px)
              rotateX(${rotationX}deg)
              rotateZ(${rotationY}deg)
              scale(${zoom})
              translate(${pan.x / zoom}px, ${pan.y / zoom}px)
            `,
          }}
        >
          {/* Ground plane */}
          <div
            className="absolute transition-colors duration-700"
            style={{
              width: "5000px",
              height: "5000px",
              left: "-2500px",
              top: "-2500px",
              background: `radial-gradient(circle at 50% 50%, ${colors.grassLight} 0%, ${colors.grass} 100%)`,
              transform: "translateZ(0px)",
            }}
          >
            {/* Grass texture */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 20% 30%, rgba(0,50,0,0.3) 1px, transparent 1px),
                  radial-gradient(circle at 60% 70%, rgba(0,50,0,0.2) 1px, transparent 1px),
                  radial-gradient(circle at 80% 20%, rgba(0,50,0,0.25) 1px, transparent 1px)
                `,
                backgroundSize: "30px 30px",
              }}
            />
            
            {/* Grid */}
            <div 
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
                `,
                backgroundSize: `${cmToPx(100)}px ${cmToPx(100)}px`,
              }}
            />
          </div>

          {/* Render items */}
          {sortedItems.map(item => {
            const isSelected = selectedId === item.id;
            const px = cmToPx(item.x);
            const py = cmToPx(item.y);
            const pw = cmToPx(item.w);
            const ph = cmToPx(item.h);
            const bedHeight = cmToPx(BED_HEIGHT_CM);
            
            if (item.type === "bed") {
              const bed = item.data as GardenBed;
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "absolute cursor-grab active:cursor-grabbing select-none",
                    draggedItem?.id === item.id && "z-50 opacity-90"
                  )}
                  style={{
                    left: px - pw / 2,
                    top: py - ph / 2,
                    width: pw,
                    height: ph,
                    transformStyle: "preserve-3d",
                  }}
                  onPointerDown={(e) => {
                    if (e.button === 0 && tool === "select") {
                      handleItemDragStart(e, item.id, "bed", item.x, item.y);
                    }
                  }}
                  onDoubleClick={() => handleBedDoubleClick(bed)}
                >
                  {/* Bottom face - sits on ground */}
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: colors.woodDark,
                      transform: "translateZ(0px)",
                    }}
                  />
                  
                  {/* Front side of bed */}
                  <div
                    className="absolute left-0 right-0 transition-colors duration-500"
                    style={{
                      height: bedHeight,
                      bottom: 0,
                      background: `linear-gradient(180deg, ${colors.woodLight} 0%, ${colors.wood} 100%)`,
                      transform: `rotateX(-90deg) translateZ(0px)`,
                      transformOrigin: "bottom",
                      borderRadius: "0 0 4px 4px",
                    }}
                  />
                  
                  {/* Top surface (wood frame + soil) */}
                  <div
                    className={cn(
                      "absolute inset-0 rounded-lg transition-all duration-200",
                      isSelected && "ring-4 ring-yellow-400 ring-offset-2 ring-offset-transparent"
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${colors.woodLight} 0%, ${colors.wood} 100%)`,
                      transform: `translateZ(${bedHeight}px)`,
                      boxShadow: `
                        inset 2px 2px 4px rgba(255,255,255,0.2),
                        inset -2px -2px 4px rgba(0,0,0,0.2),
                        0 4px 12px rgba(0,0,0,0.3)
                      `,
                    }}
                  >
                    {/* Soil inside */}
                    <div
                      className="absolute rounded transition-colors duration-500"
                      style={{
                        left: 5,
                        top: 5,
                        right: 5,
                        bottom: 5,
                        background: `radial-gradient(circle at 30% 30%, #6d4c41 0%, ${colors.soil} 100%)`,
                        boxShadow: "inset 0 2px 8px rgba(0,0,0,0.5)",
                      }}
                    >
                      {/* Soil texture dots */}
                      <div 
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: `
                            radial-gradient(circle, rgba(0,0,0,0.3) 1px, transparent 1px)
                          `,
                          backgroundSize: "8px 8px",
                        }}
                      />
                    </div>
                    
                    {/* Greenhouse glass overlay */}
                    {bed.is_greenhouse && (
                      <div
                        className="absolute inset-0 rounded-lg pointer-events-none"
                        style={{
                          background: "linear-gradient(135deg, rgba(200,230,255,0.5) 0%, rgba(180,220,255,0.2) 50%, rgba(200,230,255,0.5) 100%)",
                          border: "2px solid rgba(255,255,255,0.6)",
                        }}
                      >
                        <div className="absolute top-1 left-1 w-1/3 h-1/3 bg-gradient-to-br from-white/40 to-transparent rounded" />
                      </div>
                    )}
                    
                    {/* Label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span
                        className="font-bold text-white text-center px-2 leading-tight"
                        style={{ 
                          fontSize: clamp(Math.min(pw, ph) / 5, 10, 18),
                          textShadow: "0 2px 4px rgba(0,0,0,0.6), 0 0 8px rgba(0,0,0,0.4)",
                        }}
                      >
                        {bed.name}
                      </span>
                    </div>
                    
                    {/* Edit hint on hover */}
                    <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity">
                      <div className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Edit3 className="w-3 h-3" />
                        Dubbelklik
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            
            // Render object types
            const obj = item.data as PlotObject;
            const isThisSelected = selectedId === item.id;
            
            return (
              <div
                key={item.id}
                className={cn(
                  "absolute cursor-grab active:cursor-grabbing select-none",
                  draggedItem?.id === item.id && "z-50 opacity-90"
                )}
                style={{
                  left: px - pw / 2,
                  top: py - ph / 2,
                  width: pw,
                  height: ph,
                  transformStyle: "preserve-3d",
                }}
                onPointerDown={(e) => {
                  if (e.button === 0 && tool === "select") {
                    handleItemDragStart(e, item.id, "object", item.x, item.y);
                  }
                }}
              >
                {/* Object rendering based on type */}
                {item.type === "tree" && (
                  <>
                    {/* Trunk */}
                    <div
                      className="absolute left-1/2 bottom-0 -translate-x-1/2 rounded"
                      style={{
                        width: pw * 0.2,
                        height: cmToPx(120),
                        background: "linear-gradient(90deg, #5d4037 0%, #8B4513 50%, #5d4037 100%)",
                        transform: `translateX(-50%) rotateX(-90deg)`,
                        transformOrigin: "bottom center",
                      }}
                    />
                    {/* Foliage */}
                    <div
                      className={cn(
                        "absolute rounded-full transition-all duration-200",
                        isThisSelected && "ring-4 ring-yellow-400"
                      )}
                      style={{
                        width: pw * 1.5,
                        height: pw * 1.5,
                        left: -pw * 0.25,
                        top: -pw * 0.25,
                        background: "radial-gradient(circle at 30% 30%, #4caf50 0%, #2e7d32 60%, #1b5e20 100%)",
                        transform: `translateZ(${cmToPx(150)}px)`,
                        boxShadow: "inset -8px -8px 20px rgba(0,0,0,0.3), 0 8px 16px rgba(0,0,0,0.3)",
                      }}
                    />
                  </>
                )}
                
                {item.type === "shrub" && (
                  <div
                    className={cn(
                      "absolute rounded-full transition-all duration-200",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "radial-gradient(ellipse at 30% 30%, #81c784 0%, #4caf50 50%, #388e3c 100%)",
                      transform: `translateZ(${cmToPx(30)}px)`,
                      boxShadow: "inset -4px -4px 10px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)",
                    }}
                  />
                )}
                
                {item.type === "grass" && (
                  <div
                    className={cn(
                      "absolute rounded-lg transition-all duration-200",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "radial-gradient(circle at 50% 50%, #7cb342 0%, #558b2f 100%)",
                      transform: "translateZ(2px)",
                    }}
                  />
                )}
                
                {item.type === "gravel" && (
                  <div
                    className={cn(
                      "absolute rounded transition-all duration-200",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "linear-gradient(135deg, #bdbdbd 0%, #9e9e9e 100%)",
                      transform: "translateZ(1px)",
                    }}
                  />
                )}
                
                {item.type === "path" && (
                  <div
                    className={cn(
                      "absolute rounded transition-all duration-200",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "linear-gradient(135deg, #a1887f 0%, #8d6e63 100%)",
                      transform: "translateZ(1px)",
                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
                    }}
                  />
                )}
                
                {item.type === "greenhouse" && (
                  <div
                    className={cn(
                      "absolute rounded transition-all duration-200",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "linear-gradient(135deg, rgba(220,240,255,0.85) 0%, rgba(200,230,255,0.7) 100%)",
                      border: "4px solid #e0e0e0",
                      transform: `translateZ(${cmToPx(180)}px)`,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/50 to-transparent rounded-t" />
                  </div>
                )}
                
                {item.type === "pond" && (
                  <div
                    className={cn(
                      "absolute rounded-[40%] transition-all duration-200 overflow-hidden",
                      isThisSelected && "ring-4 ring-yellow-400"
                    )}
                    style={{
                      width: pw,
                      height: ph,
                      background: "linear-gradient(180deg, #4fc3f7 0%, #0288d1 50%, #01579b 100%)",
                      transform: "translateZ(-3px)",
                      boxShadow: "inset 0 0 20px rgba(255,255,255,0.3), 0 2px 8px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="absolute top-2 left-2 w-1/3 h-1/3 bg-gradient-to-br from-white/50 to-transparent rounded-full" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-20">
        <div className="flex items-center gap-1 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => clamp(z * 1.25, 0.2, 3))} className="h-9 w-9 p-0 rounded-full">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => clamp(z * 0.8, 0.2, 3))} className="h-9 w-9 p-0 rounded-full">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="sm" onClick={resetView} className="h-9 w-9 p-0 rounded-full" title="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={fitToView} className="h-9 w-9 p-0 rounded-full" title="Fit">
            <Maximize className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant={isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(true)} className="h-9 w-9 p-0 rounded-full">
            <Sun className="h-4 w-4" />
          </Button>
          <Button variant={!isDayMode ? "default" : "ghost"} size="sm" onClick={() => setIsDayMode(false)} className="h-9 w-9 p-0 rounded-full">
            <Moon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-xl border border-border/50">
          <span className="text-xs font-medium text-muted-foreground">Hoek</span>
          <Slider value={[rotationX]} onValueChange={([v]) => setRotationX(v)} min={20} max={80} step={1} className="w-24" />
          <span className="text-xs text-muted-foreground w-8">{Math.round(rotationX)}°</span>
        </div>
      </div>

      {/* Tool buttons */}
      <div className="absolute top-4 left-4 flex flex-col gap-1 bg-background/90 backdrop-blur-md p-2 rounded-xl shadow-xl border border-border/50 z-20">
        <Button variant={tool === "select" ? "default" : "ghost"} size="sm" onClick={() => setTool("select")} className="h-10 w-10 p-0 rounded-lg" title="Selecteren">
          <MousePointer2 className="h-5 w-5" />
        </Button>
        <Button variant={tool === "pan" ? "default" : "ghost"} size="sm" onClick={() => setTool("pan")} className="h-10 w-10 p-0 rounded-lg" title="Pannen">
          <Hand className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-3 z-20">
        <div className="flex items-center gap-2 bg-background/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-border/50">
          <span className="text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider">Toevoegen</span>
          <ObjectButton icon={Warehouse} label="Kas" onClick={() => spawnObject("greenhouse")} color="text-blue-500" />
          <ObjectButton icon={TreePine} label="Boom" onClick={() => spawnObject("tree")} color="text-emerald-600" />
          <ObjectButton icon={Flower2} label="Struik" onClick={() => spawnObject("shrub")} color="text-green-500" />
          <ObjectButton icon={TreeDeciduous} label="Gras" onClick={() => spawnObject("grass")} color="text-lime-500" />
          <ObjectButton icon={Rows3} label="Pad" onClick={() => spawnObject("path")} color="text-amber-600" />
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

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 text-xs text-white/80 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-lg z-10">
        <div className="flex flex-col gap-0.5">
          <span>Sleep = verplaatsen</span>
          <span>Scroll = zoomen</span>
          <span>Rechtermuisknop = draaien</span>
          <span>Dubbelklik bak = bewerken</span>
        </div>
      </div>

      {/* Beds counter */}
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-border/50 z-20">
        <span className="text-sm font-semibold">{beds.length} {beds.length === 1 ? "bak" : "bakken"}</span>
      </div>
    </div>
  );
}

// --- Object Button ---
function ObjectButton({ icon: Icon, label, onClick, color }: { icon: React.ElementType; label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1 px-2 py-1 transition-transform duration-200 hover:-translate-y-1">
      <div className={cn("p-2.5 rounded-xl bg-muted/50 border border-border/50 transition-all duration-200 group-hover:bg-accent group-hover:border-accent group-hover:shadow-lg", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </button>
  );
}
