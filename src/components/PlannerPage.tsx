// src/components/PlannerPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType } from "../lib/types";
import { supabase } from "../lib/supabaseClient";
import { cn } from "../lib/utils";

/* ===========================
   Helpers voor icon URL
=========================== */

/** Geeft public URL terug voor een object key in bucket 'crop-icons' */
function getPublicIconUrl(iconKey?: string | null): string | null {
  if (!iconKey) return null;
  const { data } = supabase.storage.from("crop-icons").getPublicUrl(iconKey);
  return data?.publicUrl ?? null;
}

/** Kies effectief icon:
 * 1) seed.icon_key
 * 2) cropType.icon_key
 * 3) anders null (geen overlay)
 */
function getEffectiveIconUrl(
  seed: Partial<Seed>,
  cropTypesById?: Map<string, CropType>
): string | null {
  const seedUrl = getPublicIconUrl((seed as any).icon_key);
  if (seedUrl) return seedUrl;

  const ctId = seed.crop_type_id as string | undefined;
  if (!ctId || !cropTypesById) return null;

  const ct = cropTypesById.get(ctId);
  return getPublicIconUrl((ct as any)?.icon_key);
}

/* ===========================
   Icon overlay (diamond grid)
=========================== */

function IconTilingOverlay({
  iconUrl,
  segmentsUsed = 1,
  densityPerSegment = 10, // ~aantal iconen per segment
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
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

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

    // Verdeel in rijen/kolommen o.b.v. aspect ratio zodat het "even" oogt
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
      const xOffset = (r % 2 === 0 ? 0.5 : 0) * xStep; // diamond-verschuiving
      for (let c = 0; c < cols; c++) {
        const x = c * xStep + xStep / 2 + xOffset;
        const y = r * yStep + yStep / 2;
        if (x < iconSize / 2 || x > w - iconSize / 2) continue; // clip aan randen door offset
        out.push({ x, y, size: iconSize });
      }
    }

    if (out.length > maxIcons) {
      const stride = Math.ceil(out.length / maxIcons);
      return out.filter((_, i) => i % stride === 0);
    }
    return out;
  }, [size, segmentsUsed, densityPerSegment, maxIcons, minIcons]);

  if (!iconUrl) return null;

  return (
    <div ref={ref} className="absolute inset-0 pointer-events-none select-none overflow-hidden">
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
            filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.15))",
          }}
        />
      ))}
    </div>
  );
}

/* ===========================
   Planting tegel
=========================== */

function PlantingTile({
  planting,
  seed,
  cropTypesById,
  bed,
}: {
  planting: Planting;
  seed: Seed;
  cropTypesById: Map<string, CropType>;
  bed: GardenBed;
}) {
  const segCount = Math.max(1, bed.segments || 1);

  // start_segment in jouw data kan 0- of 1-based zijn; we normaliseren
  const startIndexRaw = (planting.start_segment ?? 1);
  const startIndex = startIndexRaw <= 0 ? 0 : startIndexRaw - 1;

  const used = Math.max(1, planting.segments_used ?? 1);
  const span = Math.min(used, segCount - startIndex);

  const leftPct = (startIndex / segCount) * 100;
  const widthPct = (span / segCount) * 100;

  const bg = planting.color || seed.default_color || "#22c55e";
  const iconUrl = getEffectiveIconUrl(seed, cropTypesById);

  return (
    <div
      className="absolute rounded-md border border-black/10 shadow-sm overflow-hidden"
      style={{
        left: `${leftPct}%`,
        top: 0,
        width: `${widthPct}%`,
        height: "100%",
        backgroundColor: bg,
      }}
      title={seed.name}
    >
      {iconUrl && (
        <IconTilingOverlay
          iconUrl={iconUrl}
          segmentsUsed={span}
          densityPerSegment={10}
          opacity={0.88}
        />
      )}

      {/* label */}
      <div className="absolute left-1.5 top-1.5 text-[11px] font-medium text-black/80 mix-blend-multiply">
        {seed.name}
      </div>
    </div>
  );
}

/* ===========================
   Bed-tegel met segmentlijnen
=========================== */

function BedTile({
  bed,
  children,
}: {
  bed: GardenBed;
  children?: React.ReactNode;
}) {
  // Aspect-ratio = lengte / breedte (CSS: width/height)
  const ar = Math.max(1, (bed.length_cm || 100) / (bed.width_cm || 100));
  const segCount = Math.max(1, bed.segments || 1);

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <div className="text-sm font-medium">
          {bed.name} {bed.is_greenhouse ? <span className="ml-1 text-xs text-emerald-600">(kas)</span> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {bed.width_cm}×{bed.length_cm} cm • {segCount} segmenten
        </div>
      </div>

      <div className="relative mx-3 mb-3 rounded-lg bg-muted/30 border border-border/50 overflow-hidden"
           style={{ aspectRatio: `${ar}` }}>
        {/* Segmentlijnen */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(segCount - 1)].map((_, i) => {
            const leftPct = ((i + 1) / segCount) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${leftPct}%`,
                  width: 1,
                  background: "rgba(0,0,0,0.08)",
                }}
              />
            );
          })}
          {/* Buitenrand highlight */}
          <div className="absolute inset-0 ring-1 ring-black/10 rounded-lg pointer-events-none" />
        </div>

        {/* Plantings container */}
        <div className="absolute inset-0">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Hoofdpagina
=========================== */

export function PlannerPage({
  garden,
  beds,
  plantings,
  seeds,
  cropTypes,
}: {
  garden: Garden;
  beds: GardenBed[];
  plantings: Planting[];
  seeds: Seed[];
  cropTypes: CropType[];
}) {
  const seedsById = useMemo(() => new Map(seeds.map(s => [s.id, s])), [seeds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map(ct => [ct.id, ct])), [cropTypes]);

  // Koppel plantings per bed
  const plantingsByBed = useMemo(() => {
    const map = new Map<string, Planting[]>();
    for (const p of plantings) {
      const arr = map.get(p.garden_bed_id) ?? [];
      arr.push(p);
      map.set(p.garden_bed_id, arr);
    }
    return map;
  }, [plantings]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold">Planner</h2>
        <div className="text-sm text-muted-foreground">
          {garden.name}
        </div>
      </div>

      {beds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen bedden gevonden.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {beds.map((bed) => {
            const plist = plantingsByBed.get(bed.id) ?? [];
            return (
              <BedTile key={bed.id} bed={bed}>
                {plist.map((p) => {
                  const seed = seedsById.get(p.seed_id);
                  if (!seed) return null;
                  return (
                    <PlantingTile
                      key={p.id}
                      planting={p}
                      seed={seed}
                      bed={bed}
                      cropTypesById={cropTypesById}
                    />
                  );
                })}
              </BedTile>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PlannerPage;
