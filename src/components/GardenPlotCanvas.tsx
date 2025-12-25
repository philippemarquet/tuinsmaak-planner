import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { GardenBed, Planting, Seed, CropType, UUID } from "../lib/types";
import { ZoomIn, ZoomOut, Maximize2, Edit3, Trash2, Grid3X3, LayoutGrid, Move } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getContrastTextColor } from "../lib/utils";

/* =========================================
   Icon helpers
========================================= */
const ICON_BUCKET = "crop-icons";
const iconUrlCache = new Map<string, string>();

function getPublicIconUrl(iconKey?: string | null): string | null {
  if (!iconKey) return null;
  const cached = iconUrlCache.get(iconKey);
  if (cached) return cached;
  const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(iconKey);
  const url = data?.publicUrl ?? null;
  if (url) iconUrlCache.set(iconKey, url);
  return url;
}

function getEffectiveIconUrl(seed: Seed | undefined, cropTypesById: Map<string, CropType>): string | null {
  if (!seed) return null;
  const own = getPublicIconUrl((seed as any).icon_key);
  if (own) return own;
  const ct = seed.crop_type_id ? cropTypesById.get(seed.crop_type_id) : undefined;
  return getPublicIconUrl((ct as any)?.icon_key);
}

/* =========================================
   IconTilingOverlay
========================================= */
function IconTilingOverlay({
  iconUrl,
  segmentsUsed = 1,
  densityPerSegment = 10,
  maxIcons = 100,
  minIcons = 6,
  opacity = 0.9,
}: {
  iconUrl: string;
  segmentsUsed?: number;
  densityPerSegment?: number;
  maxIcons?: number;
  minIcons?: number;
  opacity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo(() => {
    const { w, h } = size;
    if (!w || !h) return [];

    const target = Math.min(
      maxIcons,
      Math.max(minIcons, Math.round((segmentsUsed || 1) * densityPerSegment))
    );

    const aspect = w / h;
    let cols = Math.max(2, Math.round(Math.sqrt(target) * Math.sqrt(aspect)));
    let rows = Math.max(2, Math.ceil(target / cols));

    const total = rows * cols;
    const scale = Math.sqrt(target / total);

    const xStep = w / cols;
    const yStep = h / rows;
    const base = Math.min(xStep, yStep);
    const iconSize = Math.max(12, Math.min(48, base * 0.7 * scale));

    const out: Array<{ x: number; y: number; size: number }> = [];
    for (let r = 0; r < rows; r++) {
      const xOffset = (r % 2 === 0 ? 0.5 : 0) * xStep;
      for (let c = 0; c < cols; c++) {
        const x = c * xStep + xStep / 2 + xOffset;
        const y = r * yStep + yStep / 2;
        if (x < iconSize / 2 || x > w - iconSize / 2) continue;
        out.push({ x, y, size: iconSize });
      }
    }
    if (out.length > maxIcons) {
      const stride = Math.ceil(out.length / maxIcons);
      return out.filter((_, i) => i % stride === 0);
    }
    return out;
  }, [size, segmentsUsed, densityPerSegment, maxIcons, minIcons]);

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none select-none overflow-hidden z-10">
      {items.map((pt, idx) => (
        <img
          key={idx}
          src={iconUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: pt.x - pt.size / 2,
            top: pt.y - pt.size / 2,
            width: pt.size,
            height: pt.size,
            opacity,
            objectFit: "contain",
            filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.15))",
          }}
        />
      ))}
    </div>
  );
}

/* =========================================
   Seasonal backgrounds
========================================= */
type Season = "winter" | "spring" | "summer" | "autumn";

function getSeason(date: Date = new Date()): Season {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function getSeasonalBackground(season: Season): { base: string; overlay: string } {
  switch (season) {
    case "winter":
      return {
        base: "linear-gradient(135deg, #4a5c3a 0%, #3d4f30 25%, #4a5c3a 50%, #556b45 75%, #4a5c3a 100%)",
        overlay: `
          radial-gradient(ellipse 4px 4px at 10% 15%, rgba(255,255,255,0.7) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 25% 30%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 40% 10%, rgba(255,255,255,0.6) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 55% 25%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(ellipse 4px 4px at 70% 8%, rgba(255,255,255,0.7) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 85% 20%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(ellipse 4px 4px at 15% 70%, rgba(255,255,255,0.6) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 30% 85%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 50% 75%, rgba(255,255,255,0.6) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 65% 90%, rgba(255,255,255,0.5) 0%, transparent 100%),
          radial-gradient(ellipse 4px 4px at 80% 80%, rgba(255,255,255,0.7) 0%, transparent 100%),
          radial-gradient(ellipse 3px 3px at 95% 70%, rgba(255,255,255,0.5) 0%, transparent 100%),
          linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 30%)
        `,
      };
    case "spring":
      return {
        base: "linear-gradient(135deg, #4a7c23 0%, #5a9030 25%, #4a7c23 50%, #5a9030 75%, #4a7c23 100%)",
        overlay: `
          radial-gradient(ellipse 6px 6px at 15% 20%, rgba(255,182,193,0.4) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 35% 15%, rgba(255,255,150,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 4px 4px at 55% 25%, rgba(255,182,193,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 6px 6px at 75% 10%, rgba(200,200,255,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 90% 20%, rgba(255,255,150,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 4px 4px at 20% 80%, rgba(255,182,193,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 45% 85%, rgba(200,200,255,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 6px 6px at 70% 75%, rgba(255,255,150,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 80% 60% at 30% 20%, rgba(255,255,200,0.1) 0%, transparent 60%)
        `,
      };
    case "summer":
      return {
        base: "linear-gradient(135deg, #2d5016 0%, #3a6b1e 25%, #2d5016 50%, #3a6b1e 75%, #2d5016 100%)",
        overlay: `
          radial-gradient(ellipse 80% 60% at 25% 15%, rgba(255,255,180,0.15) 0%, transparent 60%),
          radial-gradient(ellipse 3px 5px at 20% 30%, rgba(255,255,255,0.03) 0%, transparent 100%),
          radial-gradient(ellipse 2px 4px at 60% 70%, rgba(255,255,255,0.02) 0%, transparent 100%),
          radial-gradient(ellipse 4px 6px at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 100%),
          radial-gradient(ellipse 3px 5px at 40% 80%, rgba(255,255,255,0.02) 0%, transparent 100%),
          repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 9px),
          repeating-linear-gradient(0deg, transparent 0px, transparent 12px, rgba(0,0,0,0.015) 12px, rgba(0,0,0,0.015) 13px)
        `,
      };
    case "autumn":
      return {
        base: "linear-gradient(135deg, #5a4a20 0%, #6b5928 25%, #5a4a20 50%, #6b5928 75%, #5a4a20 100%)",
        overlay: `
          radial-gradient(ellipse 8px 8px at 10% 15%, rgba(180,100,30,0.4) 0%, transparent 100%),
          radial-gradient(ellipse 6px 6px at 25% 25%, rgba(200,150,50,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 7px 7px at 45% 10%, rgba(160,80,20,0.4) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 60% 30%, rgba(200,150,50,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 8px 8px at 80% 15%, rgba(180,100,30,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 6px 6px at 20% 75%, rgba(160,80,20,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 7px 7px at 50% 80%, rgba(200,150,50,0.4) 0%, transparent 100%),
          radial-gradient(ellipse 5px 5px at 75% 85%, rgba(180,100,30,0.3) 0%, transparent 100%),
          radial-gradient(ellipse 8px 8px at 90% 70%, rgba(160,80,20,0.35) 0%, transparent 100%),
          radial-gradient(ellipse 70% 50% at 80% 30%, rgba(255,200,100,0.08) 0%, transparent 60%)
        `,
      };
  }
}

/* =========================================
   Types
========================================= */
type LayoutMode = "auto" | "freeform";

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  onBedMove?: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  plantings?: Planting[];
  seeds?: Seed[];
  cropTypes?: CropType[];
  activePlantingFilter?: (p: Planting) => boolean;
  ghostPlantingFilter?: (p: Planting) => boolean;
  onPlantingEdit?: (planting: Planting) => void;
  onPlantingDelete?: (plantingId: string) => void;
  conflictsMap?: Map<string, any[]>;
  onBedConflictClick?: (bedId: string) => void;
  renderDropTargets?: (bed: GardenBed, segmentCount: number) => React.ReactNode;
  storagePrefix?: string;
}

/* =========================================
   Main Component - Completely Redesigned
========================================= */
export function GardenPlotCanvas({
  beds,
  onBedMove,
  onBedDuplicate,
  plantings = [],
  seeds = [],
  cropTypes = [],
  activePlantingFilter,
  ghostPlantingFilter,
  onPlantingEdit,
  onPlantingDelete,
  conflictsMap,
  onBedConflictClick,
  renderDropTargets,
  storagePrefix = "gardenPlot",
}: GardenPlotCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  
  // Layout mode: auto (grid) or freeform (drag)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    const saved = localStorage.getItem(`${storagePrefix}LayoutMode`);
    return (saved as LayoutMode) || "auto";
  });

  // Scale for beds - how big each bed appears
  const [bedScale, setBedScale] = useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}BedScale`);
    return saved ? parseFloat(saved) : 1.0;
  });

  const minScale = 0.5;
  const maxScale = 2.0;

  const season = getSeason();
  const seasonalBg = getSeasonalBackground(season);

  const seedsById = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map((c) => [c.id, c])), [cropTypes]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setScaleClamped = useCallback((v: number) => {
    const clamped = Math.max(minScale, Math.min(maxScale, v));
    setBedScale(clamped);
    localStorage.setItem(`${storagePrefix}BedScale`, clamped.toString());
  }, [storagePrefix]);

  const toggleLayoutMode = useCallback(() => {
    const next = layoutMode === "auto" ? "freeform" : "auto";
    setLayoutMode(next);
    localStorage.setItem(`${storagePrefix}LayoutMode`, next);
  }, [layoutMode, storagePrefix]);

  const bedHasConflict = (bedId: UUID) => {
    if (!conflictsMap) return false;
    return plantings.some((p) => p.garden_bed_id === bedId && (conflictsMap.get(p.id)?.length ?? 0) > 0);
  };

  // Sort beds: greenhouses first, then by sort_order
  const sortedBeds = useMemo(() => {
    return [...beds].sort((a, b) => {
      if (a.is_greenhouse !== b.is_greenhouse) {
        return a.is_greenhouse ? -1 : 1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [beds]);

  // Calculate auto-layout grid positions
  const autoLayoutPositions = useMemo(() => {
    const gap = 16;
    const padding = 24;
    const availableW = containerSize.w - padding * 2;
    const availableH = containerSize.h - padding * 2;
    
    if (sortedBeds.length === 0) return [];

    // Calculate base bed size from actual dimensions, scaled
    const bedSizes = sortedBeds.map(bed => ({
      w: Math.max(80, (bed.length_cm || 200) * 0.5 * bedScale),
      h: Math.max(60, (bed.width_cm || 100) * 0.5 * bedScale),
    }));

    // Find optimal columns that maximize space usage
    const avgW = bedSizes.reduce((sum, s) => sum + s.w, 0) / bedSizes.length;
    let cols = Math.max(1, Math.floor((availableW + gap) / (avgW + gap)));
    
    // Try to fit all beds with current columns
    const positions: { x: number; y: number; w: number; h: number }[] = [];
    let currentX = padding;
    let currentY = padding;
    let rowHeight = 0;
    let col = 0;

    for (let i = 0; i < sortedBeds.length; i++) {
      const size = bedSizes[i];
      
      // Check if we need a new row
      if (col >= cols || currentX + size.w > availableW + padding) {
        currentX = padding;
        currentY += rowHeight + gap;
        rowHeight = 0;
        col = 0;
      }

      positions.push({
        x: currentX,
        y: currentY,
        w: size.w,
        h: size.h,
      });

      currentX += size.w + gap;
      rowHeight = Math.max(rowHeight, size.h);
      col++;
    }

    return positions;
  }, [sortedBeds, containerSize, bedScale]);

  // Freeform positions from bed data
  const freeformPositions = useMemo(() => {
    return sortedBeds.map(bed => ({
      x: bed.location_x ?? 50,
      y: bed.location_y ?? 50,
      w: Math.max(80, (bed.length_cm || 200) * 0.5 * bedScale),
      h: Math.max(60, (bed.width_cm || 100) * 0.5 * bedScale),
    }));
  }, [sortedBeds, bedScale]);

  const positions = layoutMode === "auto" ? autoLayoutPositions : freeformPositions;

  // Calculate total content size for freeform mode
  const contentBounds = useMemo(() => {
    if (positions.length === 0) return { w: containerSize.w, h: containerSize.h };
    
    const maxX = Math.max(...positions.map((p, i) => (p.x || 0) + (positions[i]?.w || 100)));
    const maxY = Math.max(...positions.map((p, i) => (p.y || 0) + (positions[i]?.h || 80)));
    
    return {
      w: Math.max(containerSize.w, maxX + 40),
      h: Math.max(containerSize.h, maxY + 40),
    };
  }, [positions, containerSize]);

  return (
    <section className="space-y-3 h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <h3 className="text-xl font-semibold">Plattegrond</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Layout mode toggle */}
          <button
            className={`inline-flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              layoutMode === "auto" 
                ? "bg-primary text-primary-foreground" 
                : "bg-secondary hover:bg-secondary/80"
            }`}
            onClick={toggleLayoutMode}
            title={layoutMode === "auto" ? "Automatische indeling" : "Vrije positionering"}
          >
            {layoutMode === "auto" ? (
              <>
                <Grid3X3 className="h-4 w-4" />
                Auto
              </>
            ) : (
              <>
                <Move className="h-4 w-4" />
                Vrij
              </>
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* Scale controls */}
          <button
            className="inline-flex items-center gap-1 border rounded-md px-2 py-1.5 bg-secondary hover:bg-secondary/80"
            onClick={() => setScaleClamped(bedScale - 0.15)}
            title="Bakken kleiner"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={0.05}
            value={bedScale}
            onChange={(e) => setScaleClamped(parseFloat(e.target.value))}
            className="w-20"
          />
          <button
            className="inline-flex items-center gap-1 border rounded-md px-2 py-1.5 bg-secondary hover:bg-secondary/80"
            onClick={() => setScaleClamped(bedScale + 0.15)}
            title="Bakken groter"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground min-w-[3rem] text-right">
            {Math.round(bedScale * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-[400px] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl"
        style={{ background: seasonalBg.base }}
      >
        {/* Seasonal overlay */}
        <div
          className="absolute inset-0 pointer-events-none rounded-xl"
          style={{ backgroundImage: seasonalBg.overlay }}
        />
        
        {/* Frost effect for winter */}
        {season === "winter" && (
          <div
            className="absolute inset-0 pointer-events-none rounded-xl"
            style={{
              boxShadow: "inset 0 0 60px 20px rgba(255,255,255,0.15)",
            }}
          />
        )}

        {/* Content wrapper with scroll for freeform */}
        <div
          className="relative"
          style={{
            minWidth: layoutMode === "freeform" ? contentBounds.w : "100%",
            minHeight: layoutMode === "freeform" ? contentBounds.h : "100%",
          }}
        >
          {/* Render beds */}
          {sortedBeds.map((bed, index) => {
            const pos = positions[index];
            if (!pos) return null;

            return (
              <BedBlock
                key={bed.id}
                bed={bed}
                x={pos.x}
                y={pos.y}
                w={pos.w}
                h={pos.h}
                borderWidth={6}
                containerSize={containerSize}
                bedScale={bedScale}
                canDrag={layoutMode === "freeform" && !!onBedMove}
                onMove={onBedMove}
                onDuplicate={onBedDuplicate}
                plantings={plantings}
                seedsById={seedsById}
                cropTypesById={cropTypesById}
                activePlantingFilter={activePlantingFilter}
                ghostPlantingFilter={ghostPlantingFilter}
                onPlantingEdit={onPlantingEdit}
                onPlantingDelete={onPlantingDelete}
                hasConflict={bedHasConflict(bed.id)}
                conflictsMap={conflictsMap}
                onConflictClick={onBedConflictClick}
                renderDropTargets={renderDropTargets}
              />
            );
          })}

          {/* Empty state */}
          {sortedBeds.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <div className="text-center">
                <LayoutGrid className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nog geen bakken</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-3 rounded border-2 border-amber-700"
            style={{ background: "linear-gradient(180deg, #8B6914 0%, #5c4210 100%)" }}
          />
          <span>Bak</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-3 rounded border-2 border-gray-400"
            style={{ background: "linear-gradient(135deg, rgba(135,206,235,0.3) 0%, rgba(255,255,255,0.4) 50%, rgba(135,206,235,0.3) 100%)" }}
          />
          <span>Kas</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="capitalize font-medium text-sm">
            {season === "winter" && "❄️ Winter"}
            {season === "spring" && "🌸 Lente"}
            {season === "summer" && "☀️ Zomer"}
            {season === "autumn" && "🍂 Herfst"}
          </span>
        </div>
      </div>
    </section>
  );
}

/* =========================================
   BedBlock Component
========================================= */
interface BedBlockProps {
  bed: GardenBed;
  x: number;
  y: number;
  w: number;
  h: number;
  borderWidth: number;
  containerSize: { w: number; h: number };
  bedScale: number;
  canDrag: boolean;
  onMove?: (id: UUID, x: number, y: number) => void;
  onDuplicate?: (bed: GardenBed) => void;
  plantings: Planting[];
  seedsById: Map<string, Seed>;
  cropTypesById: Map<string, CropType>;
  activePlantingFilter?: (p: Planting) => boolean;
  ghostPlantingFilter?: (p: Planting) => boolean;
  onPlantingEdit?: (planting: Planting) => void;
  onPlantingDelete?: (plantingId: string) => void;
  hasConflict: boolean;
  conflictsMap?: Map<string, any[]>;
  onConflictClick?: (bedId: string) => void;
  renderDropTargets?: (bed: GardenBed, segmentCount: number) => React.ReactNode;
}

function BedBlock({
  bed,
  x: initialX,
  y: initialY,
  w,
  h,
  borderWidth,
  containerSize,
  bedScale,
  canDrag,
  onMove,
  onDuplicate,
  plantings,
  seedsById,
  cropTypesById,
  activePlantingFilter,
  ghostPlantingFilter,
  onPlantingEdit,
  onPlantingDelete,
  hasConflict,
  conflictsMap,
  onConflictClick,
  renderDropTargets,
}: BedBlockProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isHovered, setIsHovered] = useState(false);
  const dragging = useRef(false);
  const start = useRef({ mx: 0, my: 0, x: 0, y: 0 });

  useEffect(() => {
    setPos({ x: initialX, y: initialY });
  }, [initialX, initialY]);

  const innerW = Math.max(1, w - borderWidth * 2);
  const innerH = Math.max(1, h - borderWidth * 2);
  const segCount = Math.max(1, bed.segments);
  const vertical = innerW >= innerH;

  const bedPlantings = plantings.filter((p) => p.garden_bed_id === bed.id);
  const activePlantings = activePlantingFilter
    ? bedPlantings.filter(activePlantingFilter)
    : bedPlantings;
  const ghostPlantings = ghostPlantingFilter
    ? bedPlantings.filter(ghostPlantingFilter)
    : [];

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canDrag || !onMove) return;
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    start.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !canDrag || !onMove) return;
    const dx = e.clientX - start.current.mx;
    const dy = e.clientY - start.current.my;
    const nx = Math.max(0, start.current.x + dx);
    const ny = Math.max(0, start.current.y + dy);
    setPos({ x: nx, y: ny });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !canDrag || !onMove) return;
    dragging.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onMove(bed.id, pos.x, pos.y);
  }

  const frameStyle = bed.is_greenhouse
    ? {
        background: "linear-gradient(135deg, #e8e8e8 0%, #c0c0c0 50%, #e8e8e8 100%)",
        boxShadow: "0 4px 8px rgba(0,0,0,0.25), inset 1px 1px 0 rgba(255,255,255,0.4)",
      }
    : {
        background: `linear-gradient(180deg, 
          #8B6914 0%, #7a5a12 15%, #6d4f0f 30%,
          #5c4210 50%, #6d4f0f 70%, #7a5a12 85%, #8B6914 100%)`,
        boxShadow: "inset 2px 2px 4px rgba(255,255,255,0.15), inset -2px -2px 4px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.3)",
      };

  return (
    <div
      className={`absolute select-none transition-all duration-200 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        transform: isHovered ? "scale(1.02)" : "scale(1)",
        zIndex: isHovered ? 10 : 1,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Shadow */}
      <div
        className="absolute -bottom-3 left-1 right-1 h-4 rounded-full"
        style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, transparent 70%)" }}
      />

      {/* Frame */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{ ...frameStyle, padding: borderWidth }}
      >
        {/* Wood texture overlay */}
        {!bed.is_greenhouse && (
          <div
            className="absolute inset-0 rounded-lg pointer-events-none opacity-30"
            style={{
              backgroundImage: `
                repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(0,0,0,0.1) 20px, rgba(0,0,0,0.1) 21px),
                repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)
              `,
            }}
          />
        )}

        {/* Inner soil area */}
        <div
          className="relative w-full h-full rounded-md overflow-hidden"
          style={{
            background: `
              radial-gradient(ellipse at 30% 40%, rgba(101,67,33,1) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 60%, rgba(89,60,31,1) 0%, transparent 50%),
              radial-gradient(ellipse at 50% 30%, rgba(110,75,38,1) 0%, transparent 40%),
              linear-gradient(180deg, #5c4033 0%, #4a3328 50%, #3e2723 100%)
            `,
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {/* Glass reflection for greenhouse */}
          {bed.is_greenhouse && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.15) 100%)",
              }}
            />
          )}

          {/* Segment lines */}
          {segCount > 1 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: vertical
                  ? `repeating-linear-gradient(90deg, transparent 0px, transparent calc(${100 / segCount}% - 1px), rgba(255,255,255,0.12) calc(${100 / segCount}% - 1px), rgba(255,255,255,0.12) calc(${100 / segCount}%))`
                  : `repeating-linear-gradient(0deg, transparent 0px, transparent calc(${100 / segCount}% - 1px), rgba(255,255,255,0.12) calc(${100 / segCount}% - 1px), rgba(255,255,255,0.12) calc(${100 / segCount}%))`,
              }}
            />
          )}

          {/* Drop targets */}
          {renderDropTargets && (
            <div
              className="absolute inset-0 grid"
              style={{
                gridTemplateColumns: vertical ? `repeat(${segCount}, 1fr)` : "1fr",
                gridTemplateRows: vertical ? "1fr" : `repeat(${segCount}, 1fr)`,
              }}
            >
              {renderDropTargets(bed, segCount)}
            </div>
          )}

          {/* Active plantings */}
          {activePlantings.map((p) => {
            const seed = seedsById.get(p.seed_id);
            const startSeg = p.start_segment ?? 0;
            const used = Math.max(1, p.segments_used ?? 1);
            const inset = 1;
            const segW = vertical ? innerW / segCount : innerW;
            const segH = vertical ? innerH : innerH / segCount;

            const rect = vertical
              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + startSeg * segW, width: Math.max(1, used * segW - inset * 2) }
              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + startSeg * segH, height: Math.max(1, used * segH - inset * 2) };

            const color = p.color?.startsWith("#") ? p.color : "#22c55e";
            const pHasConflict = (conflictsMap?.get(p.id)?.length ?? 0) > 0;
            const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
            const textColor = getContrastTextColor(color);

            return (
              <div
                key={p.id}
                className={`absolute rounded text-[10px] px-1 flex items-center overflow-hidden ${pHasConflict ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                style={{ ...rect, backgroundColor: color, color: textColor }}
                title={seed?.name ?? "—"}
              >
                {iconUrl && (
                  <IconTilingOverlay
                    iconUrl={iconUrl}
                    segmentsUsed={used}
                    densityPerSegment={10}
                    opacity={0.88}
                  />
                )}
                <div className="relative z-20 truncate flex-1">
                  <span className="truncate font-medium">{seed?.name ?? "—"}</span>
                </div>

                {(onPlantingEdit || onPlantingDelete) && (
                  <div className="absolute top-0.5 right-0.5 flex gap-0.5 z-20">
                    {onPlantingEdit && (
                      <button
                        className="p-0.5 rounded hover:bg-white/20"
                        title="Bewerken"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlantingEdit(p);
                        }}
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                    {onPlantingDelete && (
                      <button
                        className="p-0.5 rounded hover:bg-white/20"
                        title="Verwijderen"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Verwijderen?")) onPlantingDelete(p.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ghost plantings */}
          {ghostPlantings.map((p) => {
            const seed = seedsById.get(p.seed_id);
            if (!seed) return null;
            const startSeg = p.start_segment ?? 0;
            const used = Math.max(1, p.segments_used ?? 1);
            const inset = 1;
            const segW = vertical ? innerW / segCount : innerW;
            const segH = vertical ? innerH : innerH / segCount;
            const bg = p.color?.startsWith("#") ? p.color : "rgba(34,197,94,.35)";
            const ghostTextColor = getContrastTextColor(p.color);

            const rect = vertical
              ? { top: inset, height: Math.max(1, innerH - inset * 2), left: inset + startSeg * segW, width: Math.max(1, used * segW - inset * 2) }
              : { left: inset, width: Math.max(1, innerW - inset * 2), top: inset + startSeg * segH, height: Math.max(1, used * segH - inset * 2) };

            return (
              <div
                key={`ghost-${p.id}`}
                className="absolute rounded text-[10px] px-1 flex items-center pointer-events-none"
                style={{ ...rect, backgroundColor: bg, opacity: 0.35, border: "1px dashed rgba(0,0,0,.45)", color: ghostTextColor }}
              >
                <span className="truncate">{seed.name}</span>
              </div>
            );
          })}

          {/* Name label */}
          <div className="absolute inset-0 flex items-start justify-between p-1 pointer-events-none">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-auto shadow-sm"
              style={{
                background: "rgba(255,255,255,0.92)",
                color: bed.is_greenhouse ? "#1a5c1a" : "#3e2723",
                maxWidth: "80%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={bed.name}
            >
              {bed.name}
            </span>

            <div className="flex items-center gap-1 pointer-events-auto">
              {hasConflict && onConflictClick && (
                <button
                  className="text-[10px] px-1 py-0.5 rounded bg-red-600/90 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConflictClick(bed.id);
                  }}
                  title="Conflicten bekijken"
                >
                  ⚠️
                </button>
              )}
              {bed.is_greenhouse && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-600 text-white font-medium">Kas</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GardenPlotCanvas;
