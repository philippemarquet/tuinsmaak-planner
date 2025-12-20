// src/components/HarvestAgendaView.tsx
import { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed, CropType } from "../lib/types";
import { format, addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isToday, differenceInCalendarDays, isAfter, isBefore } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Sprout, Leaf } from "lucide-react";
import { cn } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";

/* =========== helpers: icons via storage, zoals Dashboard =========== */
const ICON_BUCKET = "crop-icons";
function iconUrlForKey(key?: string | null): string | null {
  if (!key) return null;
  const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(key);
  return data?.publicUrl ?? null;
}
function resolveSeedIconKey(seed?: Seed | null, cropTypesById?: Map<string, CropType>): string | null {
  if (!seed) return null;
  const seedKey = (seed as any).icon_key || null;
  if (seedKey) return seedKey;
  const ctId = seed.crop_type_id;
  const ct = ctId ? cropTypesById?.get(ctId) : undefined;
  return (ct as any)?.icon_key ?? null;
}

/* =========== types =========== */
type Mode = "mix" | "planned" | "actual";

type Span = {
  plantingId: string;
  seedId: string;
  bedId: string;
  color: string;
  start: Date;
  end: Date;
  seedName: string;
  bedName: string;
  iconUrl: string | null;
};

/* =========== component =========== */
export function HarvestAgendaView({
  plantings,
  seeds,
  beds,
  cropTypes,
}: {
  plantings: Planting[];
  seeds: Seed[];
  beds: GardenBed[];
  cropTypes: CropType[];
}) {
  const [mode, setMode] = useState<Mode>("mix"); // mix | planned | actual
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [showGreenhouseOnly, setShowGreenhouseOnly] = useState(false);

  const seedsById = useMemo(() => new Map(seeds.map(s => [s.id, s])), [seeds]);
  const bedsById  = useMemo(() => new Map(beds.map(b => [b.id, b])), [beds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map(ct => [ct.id, ct])), [cropTypes]);

  /* ---- make spans for harvest windows ---- */
  const spans: Span[] = useMemo(() => {
    const out: Span[] = [];
    for (const p of plantings) {
      const s = seedsById.get(p.seed_id);
      const b = bedsById.get(p.garden_bed_id);
      if (!s || !b) continue;

      // kies datums volgens mode
      const plannedStart = p.planned_harvest_start ? new Date(p.planned_harvest_start) : null;
      const plannedEnd   = p.planned_harvest_end   ? new Date(p.planned_harvest_end)   : null;
      const actualStart  = p.actual_harvest_start  ? new Date(p.actual_harvest_start)  : null;
      const actualEnd    = p.actual_harvest_end    ? new Date(p.actual_harvest_end)    : null;

      let start: Date | null = null;
      let end: Date | null = null;

      if (mode === "planned") {
        start = plannedStart; end = plannedEnd;
      } else if (mode === "actual") {
        start = actualStart; end = actualEnd;
      } else { // "mix" → actual waar kan, anders gepland
        start = actualStart ?? plannedStart;
        end   = actualEnd   ?? plannedEnd;
      }

      if (!start || !end) continue;
      // normaliseer (zekerheid)
      if (isAfter(start, end)) {
        const tmp = start; start = end; end = tmp;
      }

      // filter kas/buiten
      if (showGreenhouseOnly && !b.is_greenhouse) continue;

      const color = p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e";
      const iconKey = resolveSeedIconKey(s, cropTypesById);
      const iconUrl = iconUrlForKey(iconKey);

      out.push({
        plantingId: p.id,
        seedId: p.seed_id,
        bedId: p.garden_bed_id,
        color,
        start, end,
        seedName: s.name,
        bedName: b.name,
        iconUrl
      });
    }
    // optioneel: sorteer op start
    out.sort((a, b) => a.start.getTime() - b.start.getTime() || a.seedName.localeCompare(b.seedName));
    return out;
  }, [plantings, seedsById, bedsById, cropTypesById, mode, showGreenhouseOnly]);

  /* ---- kalender raster ---- */
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // maandag
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = new Date(gridStart); !isAfter(d, gridEnd); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(new Date(d));
  }

  // groepeer per week (7 dagen)
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // bereken layout per week (multi-day bars met lanes)
  type WeekBar = {
    span: Span;
    lane: number; // 0..N
    colStart: number; // 0..6
    colSpan: number;  // 1..7
    clippedLeft: boolean;
    clippedRight: boolean;
  };
  function layoutWeek(weekDays: Date[]): { bars: WeekBar[]; maxLane: number; overflow: number } {
    const weekStart = weekDays[0];
    const weekEnd   = weekDays[6];
    // spans die de week kruisen
    const active = spans.filter(sp => sp.start <= weekEnd && sp.end >= weekStart);

    // normaliseerde window in week-coords
    const items = active.map(sp => {
      const a = isBefore(sp.start, weekStart) ? weekStart : sp.start;
      const b = isAfter(sp.end, weekEnd) ? weekEnd : sp.end;
      const colStart = differenceInCalendarDays(a, weekStart); // 0..6
      const colEnd   = differenceInCalendarDays(b, weekStart); // 0..6
      return {
        span: sp,
        colStart,
        colEnd,
        clippedLeft: isBefore(sp.start, weekStart),
        clippedRight: isAfter(sp.end, weekEnd),
      };
    }).sort((x, y) => x.colStart - y.colStart || x.colEnd - y.colEnd);

    const lanesEnd: number[] = []; // voor elke lane: laatst bezette kolom
    const bars: WeekBar[] = [];
    let overflow = 0;
    const MAX_LANES = 4; // compact houden; rest -> "+N meer"

    for (const it of items) {
      let placed = false;
      for (let lane = 0; lane < Math.min(lanesEnd.length, MAX_LANES); lane++) {
        if (lanesEnd[lane] < it.colStart) { // vrij
          lanesEnd[lane] = it.colEnd;
          bars.push({
            span: it.span,
            lane,
            colStart: it.colStart,
            colSpan: (it.colEnd - it.colStart + 1),
            clippedLeft: it.clippedLeft,
            clippedRight: it.clippedRight,
          });
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (lanesEnd.length < MAX_LANES) {
          const lane = lanesEnd.length;
          lanesEnd.push(it.colEnd);
          bars.push({
            span: it.span,
            lane,
            colStart: it.colStart,
            colSpan: (it.colEnd - it.colStart + 1),
            clippedLeft: it.clippedLeft,
            clippedRight: it.clippedRight,
          });
        } else {
          overflow++;
        }
      }
    }

    return { bars, maxLane: lanesEnd.length - 1, overflow };
  }

  function openPlantingInPlannerTimeline(plantingId: string) {
    try {
      localStorage.setItem("plannerOpenTab", "timeline");
      localStorage.setItem("plannerConflictFocusId", plantingId);
      localStorage.setItem("plannerFlashAt", String(Date.now()));
      // optioneel: nav hint via hash
      window.location.hash = "#planner";
    } catch {}
  }

  return (
    <section className="space-y-4">
      {/* Header / bediening */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md border hover:bg-muted"
            onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}
            title="Vorige maand"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-4 py-2 rounded-md bg-muted/40 font-semibold">
            {format(monthAnchor, "MMMM yyyy", { locale: nl })}
          </div>
          <button
            className="px-3 py-2 rounded-md border hover:bg-muted"
            onClick={() => setMonthAnchor(addMonths(monthAnchor, +1))}
            title="Volgende maand"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="px-3 py-2 rounded-md bg-muted/50 hover:bg-muted"
            onClick={() => setMonthAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Vandaag
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center p-1 bg-muted/40 rounded-lg ml-auto">
          {(["mix", "planned", "actual"] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "mix" ? "Mix" : m === "planned" ? "Verwacht" : "Werkelijk"}
            </button>
          ))}
        </div>

        {/* Filter Kas */}
        <button
          onClick={() => setShowGreenhouseOnly(v => !v)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-lg transition-all",
            showGreenhouseOnly ? "bg-emerald-500 text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
          title="Alleen kas"
        >
          Kas
        </button>
      </div>

      {/* Weekdagen kop */}
      <div className="grid grid-cols-7 gap-px text-[11px] text-muted-foreground">
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      {/* Kalender raster */}
      <div className="grid grid-rows-6 gap-2">
        {weeks.map((weekDays, wIdx) => {
          const { bars, maxLane, overflow } = layoutWeek(weekDays);
          const laneHeight = 22;
          const topPad = 24;
          const rowExtra = Math.max(0, (maxLane + 1)) * laneHeight + (overflow > 0 ? 22 : 0);
          const rowHeight = topPad + rowExtra + 56; // ruimte voor inhoud / optische balans

          return (
            <div
              key={wIdx}
              className="relative rounded-lg border bg-card overflow-hidden"
              style={{ minHeight: rowHeight }}
            >
              {/* Dagcellen raster */}
              <div className="grid grid-cols-7 h-full">
                {weekDays.map((d, i) => {
                  const inMonth = isSameMonth(d, monthAnchor);
                  const today = isToday(d);
                  return (
                    <div key={i} className="relative border-l first:border-l-0 border-border/50">
                      <div className={cn(
                        "absolute left-2 top-1 text-xs font-medium px-1.5 py-0.5 rounded",
                        today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                        !inMonth && "!text-muted-foreground/50"
                      )}>
                        {format(d, "d", { locale: nl })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bars overlay */}
              <div className="absolute left-0 right-0" style={{ top: topPad }}>
                {bars.map((b, idx) => {
                  const leftPct = (b.colStart / 7) * 100;
                  const widthPct = (b.colSpan / 7) * 100;
                  return (
                    <div
                      key={idx}
                      className="absolute px-1"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: b.lane * laneHeight,
                      }}
                    >
                      <button
                        title={`${b.span.seedName} • ${b.span.bedName}`}
                        onClick={() => openPlantingInPlannerTimeline(b.span.plantingId)}
                        className="w-full text-left rounded-md overflow-hidden shadow-sm ring-1 ring-black/5"
                        style={{ background: b.span.color }}
                      >
                        <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-white/95">
                          {/* clip indicators */}
                          {b.clippedLeft && <span className="mr-1">⟵</span>}
                          {/* icon/leaf */}
                          <span className="relative inline-flex w-4 h-4 items-center justify-center overflow-hidden rounded-sm">
                            {b.span.iconUrl ? (
                              <img src={b.span.iconUrl} alt="" className="object-contain w-full h-full opacity-95" draggable={false} />
                            ) : (
                              <Leaf className="w-3.5 h-3.5 text-white/90" />
                            )}
                          </span>
                          <span className="truncate">{b.span.seedName}</span>
                          <span className="opacity-75 truncate">• {b.span.bedName}</span>
                          {b.clippedRight && <span className="ml-1">⟶</span>}
                        </div>
                      </button>
                    </div>
                  );
                })}

                {/* Week overflow hint */}
                {overflow > 0 && (
                  <div
                    className="absolute left-0 right-0 px-2"
                    style={{ top: (Math.max(0, maxLane) + 1) * laneHeight }}
                  >
                    <div className="text-[11px] text-muted-foreground px-2 py-1 bg-muted/40 rounded-md inline-flex items-center gap-1">
                      <Sprout className="w-3 h-3" />
                      +{overflow} meer in deze week
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini legenda */}
      <div className="text-xs text-muted-foreground flex items-center gap-3 pt-1">
        <div className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-primary/80 rounded-sm" />
          <span>Balk = oogstperiode</span>
        </div>
        <div className="inline-flex items-center gap-1">
          <span>⟵ / ⟶</span>
          <span>loopt door buiten de week</span>
        </div>
      </div>
    </section>
  );
}

export default HarvestAgendaView;HarvestAgendaView.tsx
