import { useEffect, useMemo, useRef, useState } from "react";
import type { GardenBed, Planting, Seed, CropType, UUID } from "../lib/types";
import { ZoomIn, ZoomOut, Maximize2, Copy, Edit3, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getContrastTextColor } from "../lib/utils";

/* =========================================
   Icon helpers (shared with PlannerPage)
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
  const month = date.getMonth(); // 0-11
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
interface PlantingBlockData {
  id: string;
  color: string;
  startSegment: number;
  segmentsUsed: number;
  seedName: string;
  seedId: string;
  iconUrl: string | null;
  hasConflict?: boolean;
  tooltip?: string;
}

interface GardenPlotCanvasProps {
  beds: GardenBed[];
  // For layout editing mode (BedsPage)
  onBedMove?: (id: UUID, x: number, y: number) => void;
  onBedDuplicate?: (bed: GardenBed) => void;
  // For planner mode (PlannerPage)
  plantings?: Planting[];
  seeds?: Seed[];
  cropTypes?: CropType[];
  activePlantingFilter?: (p: Planting) => boolean;
  ghostPlantingFilter?: (p: Planting) => boolean;
  onPlantingEdit?: (planting: Planting) => void;
  onPlantingDelete?: (plantingId: string) => void;
  conflictsMap?: Map<string, any[]>;
  onBedConflictClick?: (bedId: string) => void;
  // Drop handlers for DnD
  renderDropTargets?: (bed: GardenBed, segmentCount: number) => React.ReactNode;
  // Storage key for persisting settings
  storagePrefix?: string;
}

/* =========================================
   Main Component
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
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Canvas dimensions - landscape oriented
  const BASE_CANVAS_W = 3000;
  const BASE_CANVAS_H = 1200;
  const WOOD_BORDER = 8;

  // State
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem(`${storagePrefix}Zoom`);
    return saved ? parseFloat(saved) : 1.0;
  });

  const minZoom = 0.2;
  const maxZoom = 2;

  // Canvas dimensions (no rotation)
  const CANVAS_W = BASE_CANVAS_W;
  const CANVAS_H = BASE_CANVAS_H;

  // Season
  const season = getSeason();
  const seasonalBg = getSeasonalBackground(season);

  // Helpers
  const seedsById = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map((c) => [c.id, c])), [cropTypes]);

  const setZoomClamped = (v: number) => {
    const clamped = Math.max(minZoom, Math.min(maxZoom, v));
    setZoom(clamped);
    localStorage.setItem(`${storagePrefix}Zoom`, clamped.toString());
  };

  const fitToViewport = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth - 32;
    const vh = vp.clientHeight - 32;
    const zx = vw / CANVAS_W;
    const zy = vh / CANVAS_H;
    // Use the larger zoom that still fits, ensuring max visibility
    setZoomClamped(Math.min(zx, zy));
  };

  // Auto-fit on first render to maximize visible size
  useEffect(() => {
    if (!localStorage.getItem(`${storagePrefix}Zoom`)) {
      const t = setTimeout(fitToViewport, 100);
      return () => clearTimeout(t);
    }
  }, []);

  const bedHasConflict = (bedId: UUID) => {
    if (!conflictsMap) return false;
    return plantings.some((p) => p.garden_bed_id === bedId && (conflictsMap.get(p.id)?.length ?? 0) > 0);
  };

  // Calculate bed position
  const getBedTransform = (bed: GardenBed) => {
    const origX = bed.location_x ?? 50;
    const origY = bed.location_y ?? 50;
    const origW = Math.max(60, bed.length_cm || 200);
    const origH = Math.max(40, bed.width_cm || 100);
    return { x: origX, y: origY, w: origW, h: origH };
  };

  return (
    <section className="space-y-3 h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-xl font-semibold">Plattegrond</h3>
        <div className="flex items-center gap-2">
          
          {/* Zoom controls */}
          <button
            className="inline-flex items-center gap-1 border rounded-md px-2 py-1.5 bg-secondary hover:bg-secondary/80"
            onClick={() => setZoomClamped(zoom - 0.1)}
            title="Uitzoomen"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomClamped(parseFloat(e.target.value))}
            className="w-24"
          />
          <button
            className="inline-flex items-center gap-1 border rounded-md px-2 py-1.5 bg-secondary hover:bg-secondary/80"
            onClick={() => setZoomClamped(zoom + 0.1)}
            title="Inzoomen"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            className="inline-flex items-center gap-1 border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors"
            onClick={fitToViewport}
            title="Passend maken"
          >
            <Maximize2 className="h-4 w-4" />
            Fit
          </button>
          <span className="text-xs text-muted-foreground ml-1 min-w-[3rem] text-right">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas viewport */}
      <div
        ref={viewportRef}
        className="relative flex-1 min-h-[60vh] rounded-xl border-2 border-amber-800/30 overflow-auto shadow-xl"
        style={{ background: seasonalBg.base }}
      >
        <div
          className="relative"
          style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
              borderRadius: 12,
            }}
          >
            {/* Seasonal overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: seasonalBg.overlay }}
            />

            {/* Frost/snow edge effect for winter */}
            {season === "winter" && (
              <div
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  boxShadow: "inset 0 0 60px 20px rgba(255,255,255,0.15)",
                }}
              />
            )}

            {/* Render beds */}
            {beds.map((bed) => {
              const { x, y, w, h } = getBedTransform(bed);

              return (
                <BedBlock
                  key={bed.id}
                  bed={bed}
                  x={x}
                  y={y}
                  w={w}
                  h={h}
                  borderWidth={WOOD_BORDER}
                  canvasSize={{ w: CANVAS_W, h: CANVAS_H }}
                  zoom={zoom}
                  
                  onMove={onBedMove}
                  onDuplicate={onBedDuplicate}
                  // Planting data
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
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-4 rounded border-2 border-amber-700"
            style={{ background: "linear-gradient(180deg, #8B6914 0%, #5c4210 100%)" }}
          />
          <span>Moestuinbak (douglas)</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-4 rounded border-2 border-gray-400"
            style={{ background: "linear-gradient(135deg, rgba(135,206,235,0.3) 0%, rgba(255,255,255,0.4) 50%, rgba(135,206,235,0.3) 100%)" }}
          />
          <span>Kas (glas)</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="capitalize font-medium">
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
  canvasSize: { w: number; h: number };
  zoom: number;
  
  onMove?: (id: UUID, x: number, y: number) => void;
  onDuplicate?: (bed: GardenBed) => void;
  // Planting
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
  canvasSize,
  zoom,
  
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

  // Filter plantings for this bed
  const bedPlantings = plantings.filter((p) => p.garden_bed_id === bed.id);
  const activePlantings = activePlantingFilter
    ? bedPlantings.filter(activePlantingFilter)
    : bedPlantings;
  const ghostPlantings = ghostPlantingFilter
    ? bedPlantings.filter(ghostPlantingFilter)
    : [];

  // Drag handlers
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!onMove) return;
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    start.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !onMove) return;
    const dx = (e.clientX - start.current.mx) / zoom;
    const dy = (e.clientY - start.current.my) / zoom;
    const nx = Math.max(0, Math.min(canvasSize.w - w, start.current.x + dx));
    const ny = Math.max(0, Math.min(canvasSize.h - h, start.current.y + dy));
    setPos({ x: nx, y: ny });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !onMove) return;
    dragging.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);

    // Convert back if rotated
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
      className={`absolute select-none transition-transform duration-150 ${onMove ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        transform: isHovered ? "scale(1.01)" : "scale(1)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Shadow */}
      <div
        className="absolute -bottom-4 left-1 right-1 h-5 rounded-full"
        style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)" }}
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
                  ? `repeating-linear-gradient(90deg, transparent 0px, transparent calc(${100 / segCount}% - 1px), rgba(255,255,255,0.08) calc(${100 / segCount}% - 1px), rgba(255,255,255,0.08) calc(${100 / segCount}%))`
                  : `repeating-linear-gradient(0deg, transparent 0px, transparent calc(${100 / segCount}% - 1px), rgba(255,255,255,0.08) calc(${100 / segCount}% - 1px), rgba(255,255,255,0.08) calc(${100 / segCount}%))`,
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
                  <span className="truncate">{seed?.name ?? "—"}</span>
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
              className="text-[10px] font-semibold px-2 py-0.5 rounded-md pointer-events-auto"
              style={{
                background: "rgba(255,255,255,0.85)",
                color: bed.is_greenhouse ? "#2d5016" : "#3e2723",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                maxWidth: "70%",
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
                  className="text-[11px] px-1.5 py-0.5 rounded bg-red-600/90 text-white"
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white">Kas</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hover actions for layout mode */}
      {isHovered && onDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(bed);
          }}
          title="Dupliceren"
          className="absolute -top-2 -right-2 p-1.5 rounded-full bg-white shadow-md hover:bg-gray-100 z-10"
        >
          <Copy className="h-3.5 w-3.5 text-gray-600" />
        </button>
      )}
    </div>
  );
}

export default GardenPlotCanvas;
