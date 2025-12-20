// src/components/HarvestAgendaView.tsx
import { useEffect, useMemo, useState } from "react";
import type { GardenBed, Planting, Seed, CropType } from "../lib/types";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isAfter, isBefore, isSameMonth, format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "../lib/supabaseClient";
import { cn } from "../lib/utils";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Leaf } from "lucide-react";

type Props = {
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  cropTypes: CropType[];
  greenhouseOnly: boolean;
  cropTypeFilters: string[];
};

// ------- icon helpers (zelfde gedrag als in PlannerPage) -------
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
  const ct = seed?.crop_type_id ? cropTypesById.get(seed.crop_type_id) : undefined;
  return getPublicIconUrl((ct as any)?.icon_key);
}

// ------- kleine helpers -------
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export default function HarvestAgendaView({
  beds,
  seeds,
  plantings,
  cropTypes,
  greenhouseOnly,
  cropTypeFilters,
}: Props) {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const saved = localStorage.getItem("harvestAgendaMonthISO");
    return saved ? new Date(saved) : new Date();
  });
  const [mode, setMode] = useState<"calendar" | "list">(
    () => ((localStorage.getItem("harvestAgendaMode") as any) === "list" ? "list" : "calendar")
  );

  useEffect(() => { localStorage.setItem("harvestAgendaMonthISO", toISO(visibleMonth)); }, [visibleMonth]);
  useEffect(() => { localStorage.setItem("harvestAgendaMode", mode); }, [mode]);

  const seedsById = useMemo(() => new Map(seeds.map(s => [s.id, s])), [seeds]);
  const bedsById  = useMemo(() => new Map(beds.map(b => [b.id, b])), [beds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map(ct => [ct.id, ct])), [cropTypes]);

  const monthStart = startOfMonth(visibleMonth);
  const monthEnd   = endOfMonth(visibleMonth);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 }); // ma
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // dagen → weken (elk week-rijtje is 7 dagen)
  const weeks: Date[][] = useMemo(() => {
    const out: Date[][] = [];
    for (let d = gridStart; !isAfter(d, gridEnd); ) {
      const wk: Date[] = [];
      for (let i = 0; i < 7; i++) { wk.push(d); d = addDays(d, 1); }
      out.push(wk);
    }
    return out;
  }, [gridStart, gridEnd]);

  // filters
  const matchFilters = (seed?: Seed, bed?: GardenBed) => {
    if (!seed) return false;
    if (greenhouseOnly && !bed?.is_greenhouse) return false;
    if (cropTypeFilters.length > 0) {
      const ok = seed.crop_type_id
        ? cropTypeFilters.includes(seed.crop_type_id)
        : cropTypeFilters.includes("__none__");
      if (!ok) return false;
    }
    return true;
  };

  // ===== CALENDAR: bouw week-spans (lange balk per gewas) =====
  type Span = {
    id: string;
    seed: Seed;
    bed?: GardenBed;
    iconUrl: string | null;
    color: string;
    // in deze week:
    startCol: number; // 0..6
    endCol: number;   // 0..6
  };

  // per week: lanes met spans (greedy packing om overlappen onder elkaar te zetten)
  const weekLanes: { lanes: Span[][]; days: Date[] }[] = useMemo(() => {
    const result: { lanes: Span[][]; days: Date[] }[] = [];

    const effectiveStart = (p: Planting) => new Date(p.actual_harvest_start ?? p.planned_harvest_start ?? "");
    const effectiveEnd   = (p: Planting) => new Date(p.actual_harvest_end   ?? p.planned_harvest_end   ?? "");

    for (const week of weeks) {
      const weekStart = week[0];
      const weekEnd   = week[6];

      const spans: Span[] = [];
      for (const p of plantings) {
        const sISO = p.actual_harvest_start ?? p.planned_harvest_start;
        const eISO = p.actual_harvest_end   ?? p.planned_harvest_end;
        if (!sISO || !eISO) continue;

        const s = effectiveStart(p);
        const e = effectiveEnd(p);
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
        if (isAfter(s, e)) continue;

        // snij met weekrange
        if (isAfter(s, weekEnd) || isBefore(e, weekStart)) continue;

        const segStart = isBefore(s, weekStart) ? weekStart : s;
        const segEnd   = isAfter(e, weekEnd)    ? weekEnd   : e;

        const startCol = week.findIndex(d => toISO(d) === toISO(segStart)) ?? 0;
        const endCol   = week.findIndex(d => toISO(d) === toISO(segEnd))   ?? 6;

        const seed = seedsById.get(p.seed_id);
        const bed  = bedsById.get(p.garden_bed_id);
        if (!matchFilters(seed, bed)) continue;

        const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
        const color = p.color?.startsWith("#") || p.color?.startsWith("rgb")
          ? (p.color as string)
          : (seed?.default_color?.startsWith("#") ? seed!.default_color! : "#22c55e");

        if (!seed) continue;

        spans.push({
          id: p.id,
          seed,
          bed,
          iconUrl,
          color,
          startCol: Math.max(0, startCol),
          endCol: Math.min(6, endCol),
        });
      }

      // sorteer voor stabiele packing
      spans.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        if (a.endCol !== b.endCol)     return a.endCol - b.endCol;
        return a.seed.name.localeCompare(b.seed.name, "nl");
      });

      // lanes opbouwen (greedy): plaats span in eerste lane waar hij niet overlapt
      const lanes: Span[][] = [];
      for (const sp of spans) {
        let placed = false;
        for (const lane of lanes) {
          const last = lane[lane.length - 1];
          if (last.endCol < sp.startCol) {
            lane.push(sp);
            placed = true;
            break;
          }
        }
        if (!placed) lanes.push([sp]);
      }

      result.push({ lanes, days: week });
    }

    return result;
  }, [weeks, plantings, seedsById, bedsById, cropTypesById, greenhouseOnly, cropTypeFilters]);

  // ===== LIST: per maand unieke oogstbare zaden =====
  const listByMonth = useMemo(() => {
    const buckets = new Map<number, Map<string, { seed: Seed; iconUrl: string | null; color: string }>>();
    for (let m = 1; m <= 12; m++) buckets.set(m, new Map());

    for (const p of plantings) {
      const sISO = p.actual_harvest_start ?? p.planned_harvest_start;
      const eISO = p.actual_harvest_end   ?? p.planned_harvest_end;
      if (!sISO || !eISO) continue;

      const s = new Date(sISO);
      const e = new Date(eISO);
      if (isAfter(s, e)) continue;

      const seed = seedsById.get(p.seed_id);
      const bed  = bedsById.get(p.garden_bed_id);
      if (!matchFilters(seed, bed)) continue;

      const iconUrl = getEffectiveIconUrl(seed, cropTypesById);
      const color = p.color?.startsWith("#") || p.color?.startsWith("rgb")
        ? (p.color as string)
        : (seed?.default_color?.startsWith("#") ? seed!.default_color! : "#22c55e");

      const d = new Date(s.getFullYear(), s.getMonth(), 1);
      const end = new Date(e.getFullYear(), e.getMonth(), 1);
      while (d <= end) {
        const month = d.getMonth() + 1;
        const bucket = buckets.get(month)!;
        if (seed && !bucket.has(seed.id)) bucket.set(seed.id, { seed, iconUrl, color });
        d.setMonth(d.getMonth() + 1);
      }
    }

    const out: Record<number, { seed: Seed; iconUrl: string | null; color: string }[]> = {} as any;
    for (let m = 1; m <= 12; m++) {
      out[m] = Array.from(buckets.get(m)!.values()).sort((a, b) => a.seed.name.localeCompare(b.seed.name, "nl"));
    }
    return out;
  }, [plantings, seedsById, bedsById, cropTypesById, greenhouseOnly, cropTypeFilters]);

  const gotoPrevMonth = () => setVisibleMonth(addDays(startOfMonth(visibleMonth), -1));
  const gotoNextMonth = () => setVisibleMonth(addDays(endOfMonth(visibleMonth), 1));
  const gotoToday     = () => setVisibleMonth(new Date());

  const monthNames = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const dayNames   = ["Ma","Di","Wo","Do","Vr","Za","Zo"];

  return (
    <section className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <CalendarIcon className="w-5 h-5" /> Oogstagenda
        </h3>

        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded-md border bg-secondary hover:bg-secondary/80" onClick={gotoPrevMonth} title="Vorige maand">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-[160px] text-center font-medium">
            {format(visibleMonth, "MMMM yyyy", { locale: nl })}
          </div>
          <button className="px-2 py-1 rounded-md border bg-secondary hover:bg-secondary/80" onClick={gotoNextMonth} title="Volgende maand">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="ml-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm" onClick={gotoToday}>
            Vandaag
          </button>

          <div className="ml-3 p-0.5 bg-muted/40 rounded-lg inline-flex">
            <button
              onClick={() => setMode("calendar")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                mode === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Kalender
            </button>
            <button
              onClick={() => setMode("list")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                mode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lijst
            </button>
          </div>
        </div>
      </div>

      {/* ===== CALENDAR MODE ===== */}
      {mode === "calendar" && (
        <div className="space-y-1">
          {/* day header */}
          <div className="grid grid-cols-7 text-[11px] text-muted-foreground">
            {dayNames.map((n) => (
              <div key={n} className="px-2 py-1 uppercase tracking-wide">{n}</div>
            ))}
          </div>

          {/* weeks */}
          <div className="space-y-[2px]">
            {weekLanes.map(({ lanes, days }, wi) => {
              const rows = Math.max(1, lanes.length);
              return (
                <div key={wi} className="relative border rounded-lg overflow-hidden">
                  {/* cell grid (achtergrond + dag-badges) */}
                  <div className="grid grid-cols-7 gap-[1px] bg-border">
                    {days.map((day, di) => {
                      const outOfMonth = !isSameMonth(day, visibleMonth);
                      return (
                        <div key={di} className={cn("bg-card p-1 min-h-[70px] relative", outOfMonth && "bg-muted/40")}>
                          <span className={cn(
                            "absolute left-1 top-1 text-xs font-medium px-1.5 py-0.5 rounded",
                            isSameMonth(day, visibleMonth) ? "bg-muted/70" : "bg-muted"
                          )}>
                            {format(day, "d", { locale: nl })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* bars overlay (zelfde grid, maar rijen = lanes) */}
                  <div
                    className="absolute inset-0 grid pointer-events-none"
                    style={{
                      gridTemplateColumns: "repeat(7, 1fr)",
                      gridTemplateRows: `repeat(${rows}, 22px)`,
                      alignContent: "start",
                      gap: 2,
                      padding: 6
                    }}
                  >
                    {lanes.map((lane, li) =>
                      lane.map((sp) => (
                        <div
                          key={sp.id + "-" + li}
                          className="h-[22px] rounded-sm flex items-center gap-1 px-1 text-[11px] text-white overflow-hidden shadow-sm"
                          style={{
                            gridColumn: `${sp.startCol + 1} / ${sp.endCol + 2}`,
                            gridRow: `${li + 1} / ${li + 2}`,
                            background: sp.color,
                          }}
                          title={`${sp.seed.name}${sp.bed ? " • " + sp.bed.name : ""}`}
                        >
                          <div className="relative w-3.5 h-3.5 rounded-sm overflow-hidden flex-shrink-0">
                            {sp.iconUrl ? (
                              <img src={sp.iconUrl} alt="" className="absolute inset-0 m-auto w-3 h-3 object-contain opacity-95" />
                            ) : (
                              <Leaf className="absolute inset-0 m-auto w-3 h-3 text-white/90" />
                            )}
                          </div>
                          <span className="truncate">{sp.seed.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== LIST MODE ===== */}
      {mode === "list" && (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const items = listByMonth[m] || [];
            return (
              <div key={m} className="p-3 border rounded-lg bg-card">
                <div className="mb-2 text-sm font-semibold capitalize">{monthNames[m - 1]}</div>
                {items.length === 0 ? (
                  <div className="text-xs text-muted-foreground">—</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map(({ seed, iconUrl, color }) => (
                      <div
                        key={seed.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] bg-white/60"
                        style={{ borderColor: `${color}55` }}
                        title={seed.name}
                      >
                        <div className="relative w-3.5 h-3.5 rounded-sm overflow-hidden flex-shrink-0" style={{ background: color }}>
                          {iconUrl ? (
                            <img src={iconUrl} alt="" className="absolute inset-0 m-auto w-3 h-3 object-contain opacity-95" />
                          ) : (
                            <Leaf className="absolute inset-0 m-auto w-3 h-3 text-white/90" />
                          )}
                        </div>
                        <span className="truncate max-w-[150px]">{seed.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// named export ook beschikbaar, zodat beide importvormen werken
export { HarvestAgendaView };
