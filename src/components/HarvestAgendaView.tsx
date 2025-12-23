import React, { useMemo, useState } from "react";
import type { GardenBed, Planting, Seed, CropType } from "../lib/types";
import { format, startOfYear, endOfYear, eachMonthOfInterval } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarDays, List as ListIcon, BarChart3, TrendingUp, Leaf, Calendar } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getContrastTextColor } from "../lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from "recharts";

/*
  HarvestAgendaView
  - Calendar <-> List toggle
  - Calendar renders multi-day harvest as ONE continuous bar spanning the days
  - List shows per-month compact list of crops that can be harvested (icon + name, no dates)
*/

const ICON_BUCKET = "crop-icons";
const iconUrlCache = new Map<string, string>();

function getPublicIconUrl(iconKey?: string | null): string | null {
  if (!iconKey) return null;
  const cached = iconUrlCache.get(iconKey);
  if (cached) return cached;
  const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(iconKey as string);
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

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

// Monday as start of week
const startOfWeekMon = (d: Date) => {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  return addDays(d, diff);
};
const endOfWeekSun = (d: Date) => addDays(startOfWeekMon(d), 6);

function clampRangeToWeek(rangeStart: Date, rangeEnd: Date, weekStart: Date, weekEnd: Date) {
  const s = rangeStart > weekStart ? rangeStart : weekStart;
  const e = rangeEnd < weekEnd ? rangeEnd : weekEnd;
  if (s > e) return null;
  return { s, e };
}

function getWeeksMatrix(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const last = endOfMonth(monthDate);
  const gridStart = startOfWeekMon(first);
  const gridEnd = endOfWeekSun(last);

  const weeks: Date[][] = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(addDays(cursor, i));
    }
    weeks.push(row);
    cursor = addDays(cursor, 7);
  }
  return { weeks, first, last, gridStart, gridEnd };
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayIndexMonSun(d: Date) {
  // Monday=0 .. Sunday=6
  const js = d.getDay(); // 0..6 where 0 is Sunday
  return (js + 6) % 7;
}

function hexWithOpacity(hex: string, alpha: number) {
  // Accepts #RGB, #RRGGBB; returns rgba()
  let r = 34, g = 197, b = 94; // emerald fallback
  const s = hex?.trim() || "";
  const m3 = /^#([0-9a-f]{3})$/i.exec(s);
  const m6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (m6) {
    r = parseInt(m6[1].slice(0, 2), 16);
    g = parseInt(m6[1].slice(2, 4), 16);
    b = parseInt(m6[1].slice(4, 6), 16);
  } else if (m3) {
    r = parseInt(m3[1][0] + m3[1][0], 16);
    g = parseInt(m3[1][1] + m3[1][1], 16);
    b = parseInt(m3[1][2] + m3[1][2], 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function HarvestAgendaView({
  beds,
  seeds,
  plantings,
  cropTypes,
  greenhouseOnly,
  cropTypeFilters,
}: {
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  cropTypes: CropType[];
  greenhouseOnly?: boolean;
  cropTypeFilters?: string[];
}) {
  const [mode, setMode] = useState<"calendar" | "list" | "dashboard">("calendar");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));

  const seedsById = useMemo(() => new Map(seeds.map((s) => [s.id, s])), [seeds]);
  const bedsById = useMemo(() => new Map(beds.map((b) => [b.id, b])), [beds]);
  const cropTypesById = useMemo(() => new Map(cropTypes.map((c) => [c.id, c])), [cropTypes]);

  // Filters (kas, crop types)
  const filteredPlantings = useMemo(() => {
    return (plantings || []).filter((p) => {
      const bed = bedsById.get(p.garden_bed_id);
      if (!bed) return false;
      if (greenhouseOnly && !bed.is_greenhouse) return false;

      const seed = seedsById.get(p.seed_id);
      if (!seed) return false;
      if (cropTypeFilters && cropTypeFilters.length > 0) {
        const id = seed.crop_type_id ?? "";
        if (!(cropTypeFilters.includes("__none__") && !id) && !cropTypeFilters.includes(id)) return false;
      }

      return !!p.planned_harvest_start && !!p.planned_harvest_end;
    });
  }, [plantings, bedsById, seedsById, greenhouseOnly, cropTypeFilters]);

  // Data for list view: unique seeds that have any harvest overlap with current month
  const monthRange = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const last = endOfMonth(currentMonth);
    return { first, last };
  }, [currentMonth]);

  const listSeedsForMonth = useMemo(() => {
    const set = new Map<string, Seed>();
    for (const p of filteredPlantings) {
      const hs = new Date(p.planned_harvest_start as string);
      const he = new Date(p.planned_harvest_end as string);
      const overlaps = !(he < monthRange.first || hs > monthRange.last);
      if (overlaps) {
        const seed = seedsById.get(p.seed_id);
        if (seed) set.set(seed.id, seed);
      }
    }
    return Array.from(set.values()).sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [filteredPlantings, monthRange, seedsById]);

  const goPrev = () => setCurrentMonth(startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)));
  const goNext = () => setCurrentMonth(startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)));
  const goToday = () => setCurrentMonth(startOfMonth(new Date()));

  return (
    <section className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted"
          >
            ←
          </button>
          <div className="px-4 py-2 text-sm font-semibold">
            {format(currentMonth, "MMMM yyyy", { locale: nl })}
          </div>
          <button
            onClick={goNext}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted"
          >
            →
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            Vandaag
          </button>
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-lg">
          <button
            onClick={() => setMode("calendar")}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              mode === "calendar" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Kalenderweergave"
          >
            <CalendarDays className="h-4 w-4" /> Kalender
          </button>
          <button
            onClick={() => setMode("list")}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              mode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Lijstweergave"
          >
            <ListIcon className="h-4 w-4" /> Lijst
          </button>
          <button
            onClick={() => setMode("dashboard")}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md ${
              mode === "dashboard" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            title="Dashboard"
          >
            <BarChart3 className="h-4 w-4" /> Dashboard
          </button>
        </div>
      </div>

      {mode === "calendar" ? (
        <MonthCalendar
          monthDate={currentMonth}
          bedsById={bedsById}
          seedsById={seedsById}
          cropTypesById={cropTypesById}
          plantings={filteredPlantings}
        />
      ) : mode === "list" ? (
        <MonthList
          monthDate={currentMonth}
          seeds={listSeedsForMonth}
          cropTypesById={cropTypesById}
        />
      ) : (
        <HarvestDashboard
          plantings={filteredPlantings}
          seedsById={seedsById}
          cropTypesById={cropTypesById}
          currentYear={currentMonth.getFullYear()}
        />
      )}
    </section>
  );
}

function MonthList({
  monthDate,
  seeds,
  cropTypesById,
}: {
  monthDate: Date;
  seeds: Seed[];
  cropTypesById: Map<string, CropType>;
}) {
  return (
    <div className="p-4 border rounded-xl bg-card">
      <h4 className="text-sm font-semibold mb-3 text-muted-foreground capitalize">
        Oogstbaar in {format(monthDate, "MMMM", { locale: nl })}
      </h4>
      {seeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen gewassen voor deze maand.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {seeds.map((s) => {
            const icon = getEffectiveIconUrl(s, cropTypesById);
            return (
              <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg border bg-muted/20">
                {icon ? (
                  <img src={icon} alt="" className="h-6 w-6 object-contain" />
                ) : (
                  <div className="h-6 w-6 rounded bg-emerald-500/20" />
                )}
                <span className="text-sm font-medium truncate">{s.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonthCalendar({
  monthDate,
  bedsById,
  seedsById,
  cropTypesById,
  plantings,
}: {
  monthDate: Date;
  bedsById: Map<string, GardenBed>;
  seedsById: Map<string, Seed>;
  cropTypesById: Map<string, CropType>;
  plantings: Planting[];
}) {
  const { weeks, first, last } = useMemo(() => getWeeksMatrix(monthDate), [monthDate]);

  // Build bar segments per week (continuous, not per-day blocks)
  type BarSeg = {
    plantingId: string;
    seedId: string;
    bedId: string;
    color: string;
    weekIdx: number;
    colStart: number; // 0..6 (Mon..Sun)
    colEnd: number; // 0..6 inclusive
  };

  const segments: BarSeg[] = useMemo(() => {
    const out: BarSeg[] = [];
    plantings.forEach((p) => {
      const hs = new Date(p.planned_harvest_start as string);
      const he = new Date(p.planned_harvest_end as string);
      if (he < first || hs > last) return; // no overlap with this month grid

      // For each week row, slice the bar portion
      weeks.forEach((row, wIdx) => {
        const weekStart = row[0];
        const weekEnd = row[6];
        const part = clampRangeToWeek(hs, he, weekStart, weekEnd);
        if (!part) return;
        const startCol = dayIndexMonSun(part.s);
        const endCol = dayIndexMonSun(part.e);
        out.push({
          plantingId: p.id,
          seedId: p.seed_id,
          bedId: p.garden_bed_id,
          color: p.color?.startsWith("#") ? (p.color as string) : (seedsById.get(p.seed_id)?.default_color as string) || "#22c55e",
          weekIdx: wIdx,
          colStart: startCol,
          colEnd: endCol,
        });
      });
    });
    return out;
  }, [plantings, weeks, first, last, seedsById]);

  // Lane assignment per week to prevent overlap collisions
  const segmentsByWeek = useMemo(() => {
    const map = new Map<number, BarSeg[]>();
    segments.forEach((s) => {
      const arr = map.get(s.weekIdx) || [];
      arr.push(s);
      map.set(s.weekIdx, arr);
    });
    // For each week, sort and assign lanes
    const placed = new Map<number, Array<BarSeg & { lane: number }>>();

    map.forEach((arr, wIdx) => {
      arr.sort((a, b) => a.colStart - b.colStart || a.colEnd - b.colEnd);
      const lanesEnd: number[] = [];
      const out: Array<BarSeg & { lane: number }> = [];
      for (const seg of arr) {
        let lane = 0;
        while (lane < lanesEnd.length && lanesEnd[lane] >= seg.colStart) lane++;
        if (lane === lanesEnd.length) lanesEnd.push(seg.colEnd);
        else lanesEnd[lane] = seg.colEnd;
        out.push({ ...seg, lane });
      }
      placed.set(wIdx, out);
    });

    return placed;
  }, [segments]);

  const weekdayLabels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 bg-muted/40 border-b text-xs font-medium">
        {weekdayLabels.map((d) => (
          <div key={d} className="px-3 py-2 text-muted-foreground uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="divide-y">
        {weeks.map((row, wIdx) => (
          <div key={wIdx} className="relative">
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {row.map((d, i) => {
                const outside = d.getMonth() !== monthDate.getMonth();
                return (
                  <div
                    key={i}
                    className={`h-20 border-r last:border-r-0 p-2 ${outside ? "bg-muted/20 text-muted-foreground" : "bg-background"}`}
                  >
                    <div className="text-[11px] font-medium">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Bars overlay */}
            <WeekBarsOverlay
              weekIdx={wIdx}
              segments={segmentsByWeek.get(wIdx) || []}
              seedsById={seedsById}
              cropTypesById={cropTypesById}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekBarsOverlay({
  weekIdx,
  segments,
  seedsById,
  cropTypesById,
}: {
  weekIdx: number;
  segments: Array<{
    plantingId: string;
    seedId: string;
    bedId: string;
    color: string;
    colStart: number;
    colEnd: number;
    lane: number;
  }>;
  seedsById: Map<string, Seed>;
  cropTypesById: Map<string, CropType>;
}) {
  const laneHeight = 22; // px
  const topOffset = 20; // leave room under day numbers
  const totalHeight = topOffset + (Math.max(0, Math.max(-1, ...segments.map((s) => s.lane))) + 1) * (laneHeight + 4) + 8;

  return (
    <div className="absolute left-0 right-0" style={{ top: 0, height: totalHeight }}>
      {segments.map((s) => {
        const span = s.colEnd - s.colStart + 1;
        const leftPct = (s.colStart / 7) * 100;
        const widthPct = (span / 7) * 100;
        const seed = seedsById.get(s.seedId);
        const icon = getEffectiveIconUrl(seed, cropTypesById);
        const bg = s.color?.startsWith("#") ? s.color : "#22c55e";
        const textColor = getContrastTextColor(bg);
        return (
          <div
            key={`${weekIdx}-${s.plantingId}-${s.colStart}`}
            className="absolute rounded-md text-[11px] flex items-center gap-2 px-2 shadow"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              top: topOffset + s.lane * (laneHeight + 4),
              height: laneHeight,
              background: bg,
              color: textColor,
            }}
            title={seed?.name ?? "Gewas"}
          >
            <div
              className="absolute inset-0 rounded-md"
              style={{ background: hexWithOpacity(bg, 0.15) }}
            />
            {icon ? (
              <img src={icon} alt="" className="relative h-4 w-4 object-contain" />
            ) : (
              <span className="relative inline-block h-3 w-3 rounded-full bg-white/80" />
            )}
            <span className="relative truncate font-medium leading-none">
              {seed?.name ?? "Gewas"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ========== HARVEST DASHBOARD ==========

function HarvestDashboard({
  plantings,
  seedsById,
  cropTypesById,
  currentYear,
}: {
  plantings: Planting[];
  seedsById: Map<string, Seed>;
  cropTypesById: Map<string, CropType>;
  currentYear: number;
}) {
  // Generate all months of the year
  const months = useMemo(() => {
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(yearStart);
    return eachMonthOfInterval({ start: yearStart, end: yearEnd });
  }, [currentYear]);

  // Get unique seeds with their colors
  const uniqueSeeds = useMemo(() => {
    const seedIds = new Set(plantings.map((p) => p.seed_id));
    return Array.from(seedIds)
      .map((id) => seedsById.get(id))
      .filter(Boolean) as Seed[];
  }, [plantings, seedsById]);

  // Calculate harvest data per month per seed
  const monthlyData = useMemo(() => {
    return months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthLabel = format(month, "MMM", { locale: nl });

      const seedCounts: Record<string, number> = {};
      
      plantings.forEach((p) => {
        if (!p.planned_harvest_start || !p.planned_harvest_end) return;
        const hs = new Date(p.planned_harvest_start);
        const he = new Date(p.planned_harvest_end);
        
        // Check if harvest overlaps with this month
        const overlaps = !(he < monthStart || hs > monthEnd);
        if (overlaps) {
          const seed = seedsById.get(p.seed_id);
          if (seed) {
            seedCounts[seed.id] = (seedCounts[seed.id] || 0) + 1;
          }
        }
      });

      return {
        month: monthLabel,
        ...seedCounts,
        total: Object.values(seedCounts).reduce((a, b) => a + b, 0),
      };
    });
  }, [months, plantings, seedsById]);

  // Pie chart data: total harvests per seed
  const pieData = useMemo(() => {
    const counts: Record<string, { name: string; value: number; color: string }> = {};
    
    plantings.forEach((p) => {
      if (!p.planned_harvest_start || !p.planned_harvest_end) return;
      const seed = seedsById.get(p.seed_id);
      if (!seed) return;
      
      const color = p.color?.startsWith("#") ? p.color : seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
      
      if (!counts[seed.id]) {
        counts[seed.id] = { name: seed.name, value: 0, color };
      }
      counts[seed.id].value += 1;
    });

    return Object.values(counts).sort((a, b) => b.value - a.value);
  }, [plantings, seedsById]);

  // Stats
  const stats = useMemo(() => {
    const totalPlantings = plantings.length;
    const uniqueCrops = uniqueSeeds.length;
    
    // Peak month
    const peakMonth = monthlyData.reduce((max, m) => (m.total > max.total ? m : max), { month: "-", total: 0 });
    
    // Months with harvests
    const activeMonths = monthlyData.filter((m) => m.total > 0).length;

    return { totalPlantings, uniqueCrops, peakMonth: peakMonth.month, peakCount: peakMonth.total, activeMonths };
  }, [plantings, uniqueSeeds, monthlyData]);

  // Color map for seeds
  const seedColors = useMemo(() => {
    const map = new Map<string, string>();
    plantings.forEach((p) => {
      if (!map.has(p.seed_id)) {
        const seed = seedsById.get(p.seed_id);
        const color = p.color?.startsWith("#") ? p.color : seed?.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
        map.set(p.seed_id, color);
      }
    });
    return map;
  }, [plantings, seedsById]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold mb-2 capitalize">{label}</p>
        {payload.map((entry: any, idx: number) => {
          const seed = seedsById.get(entry.dataKey);
          return (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.fill }} />
              <span>{seed?.name ?? entry.dataKey}: {entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Leaf className="h-4 w-4" />
            <span className="text-xs font-medium">Totaal oogsten</span>
          </div>
          <p className="text-2xl font-bold">{stats.totalPlantings}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs font-medium">Unieke gewassen</span>
          </div>
          <p className="text-2xl font-bold">{stats.uniqueCrops}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-medium">Piekmaand</span>
          </div>
          <p className="text-2xl font-bold capitalize">{stats.peakMonth}</p>
          <p className="text-xs text-muted-foreground">{stats.peakCount} oogsten</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-medium">Actieve maanden</span>
          </div>
          <p className="text-2xl font-bold">{stats.activeMonths}/12</p>
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="p-4 rounded-xl border bg-card">
        <h3 className="text-sm font-semibold mb-4">Oogsten per maand ({currentYear})</h3>
        {plantings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Geen oogstdata beschikbaar.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }} 
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {uniqueSeeds.map((seed) => (
                <Bar 
                  key={seed.id} 
                  dataKey={seed.id} 
                  stackId="a" 
                  fill={seedColors.get(seed.id) || "#22c55e"}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two column layout for pie + legend */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="p-4 rounded-xl border bg-card">
          <h3 className="text-sm font-semibold mb-4">Verdeling per gewas</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Geen data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string) => [`${value} oogsten`, name]}
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--popover))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Legend / breakdown */}
        <div className="p-4 rounded-xl border bg-card">
          <h3 className="text-sm font-semibold mb-4">Gewassen overzicht</h3>
          <div className="space-y-2 max-h-[220px] overflow-y-auto">
            {pieData.map((item) => {
              const textColor = getContrastTextColor(item.color);
              return (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      className="w-4 h-4 rounded-md flex-shrink-0 flex items-center justify-center text-[8px] font-bold"
                      style={{ backgroundColor: item.color, color: textColor }}
                    >
                      {item.value}
                    </div>
                    <span className="text-sm truncate">{item.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground flex-shrink-0">
                    {((item.value / stats.totalPlantings) * 100).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
