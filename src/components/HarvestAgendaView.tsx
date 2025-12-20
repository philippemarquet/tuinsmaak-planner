import { useEffect, useMemo, useState } from "react";
import type { Planting, Seed, CropType } from "../lib/types";
import { supabase } from "../lib/supabaseClient";
import { cn } from "../lib/utils";
import { Calendar as CalendarIcon, List as ListIcon } from "lucide-react";

/* ---------- Icon helpers (zelfde fallback als dashboard/planner) ---------- */
const ICON_BUCKET = "crop-icons";
const iconUrlCache = new Map<string, string>();
function iconUrlForKey(key?: string | null): string | null {
  if (!key) return null;
  const cached = iconUrlCache.get(key);
  if (cached) return cached;
  const { data } = supabase.storage.from(ICON_BUCKET).getPublicUrl(key);
  const url = data?.publicUrl ?? null;
  if (url) iconUrlCache.set(key, url);
  return url;
}
function resolveSeedIconUrl(seed: Seed | undefined, cropTypesById: Map<string, CropType>): string | null {
  if (!seed) return null;
  const seedKey = (seed as any).icon_key || null;
  if (seedKey) return iconUrlForKey(seedKey);
  const ct = seed.crop_type_id ? cropTypesById.get(seed.crop_type_id) : undefined;
  return iconUrlForKey((ct as any)?.icon_key || null);
}

/* ---------- Date helpers ---------- */
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const startOfMonth = (y: number, m0: number) => new Date(y, m0, 1, 0, 0, 0, 0);
const endOfMonth = (y: number, m0: number) => new Date(y, m0, daysInMonth(y, m0), 23, 59, 59, 999);
const monthName = (m0: number) =>
  new Date(2000, m0, 1).toLocaleString("nl-NL", { month: "long" }).replace(/^\w/, (c) => c.toUpperCase());
/** Maandag=1..Zondag=7 */
const dow1 = (d: Date) => { const w = d.getDay(); return w === 0 ? 7 : w; };
/** Maandag van de week waarin d valt */
const weekStart = (d: Date) => addDays(startOfDay(d), -((dow1(d) - 1) % 7));
/** Bouw weekstarten die de hele maand afdekken */
function weeksCoveringMonth(year: number, month0: number): Date[] {
  const first = startOfMonth(year, month0);
  const last = endOfMonth(year, month0);
  const firstWeek = weekStart(first);
  const weeks: Date[] = [];
  let w = new Date(firstWeek);
  while (w <= last) {
    weeks.push(new Date(w));
    w = addDays(w, 7);
    // Voeg een extra week toe als de laatste dag nog niet in de grid zit
    if (weeks.length > 6) break; // max 6 rijen safeguard
  }
  // Zorg dat de laatste week de einddag dekt
  const lastWeekStart = weeks[weeks.length - 1];
  const lastWeekEnd = addDays(lastWeekStart, 6);
  if (lastWeekEnd < last) weeks.push(addDays(lastWeekStart, 7));
  return weeks;
}

/* ---------- Harvest interval per planting ---------- */
type Interval = { start: Date; end: Date };
function harvestIntervalOf(p: Planting): Interval | null {
  const sISO = p.actual_harvest_start || p.planned_harvest_start || null;
  const eISO = p.actual_harvest_end || p.planned_harvest_end || null;
  if (!sISO || !eISO) return null;
  const s = startOfDay(new Date(sISO));
  const e = endOfDay(new Date(eISO));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e < s) return null;
  return { start: s, end: e };
}
const overlaps = (a: Interval, b: Interval) => a.start <= b.end && b.start <= a.end;

/* ---------- Hoofdcomponent ---------- */
export default function HarvestAgendaView({
  seeds,
  plantings,
  cropTypes,
}: {
  seeds: Seed[];
  plantings: Planting[];
  cropTypes: CropType[];
}) {
  const cropTypesById = useMemo(() => new Map<string, CropType>(cropTypes.map((c) => [c.id, c])), [cropTypes]);
  const seedsById = useMemo(() => Object.fromEntries(seeds.map((s) => [s.id, s])), [seeds]);

  const [mode, setMode] = useState<"calendar" | "list">(
    () => (localStorage.getItem("harvestView") as any) || "calendar"
  );
  useEffect(() => { localStorage.setItem("harvestView", mode); }, [mode]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth()); // 0..11

  /* Verrijkte plantings met harvest-interval + icon + kleur */
  const enriched = useMemo(() => {
    return plantings
      .map((p) => {
        const iv = harvestIntervalOf(p);
        if (!iv) return null;
        const seed = seedsById[p.seed_id];
        const iconUrl = resolveSeedIconUrl(seed, cropTypesById);
        const color = p.color && (p.color.startsWith("#") || p.color.startsWith("rgb")) ? p.color : "#22c55e";
        return { p, seed, iconUrl, iv, color };
      })
      .filter(Boolean) as Array<{ p: Planting; seed?: Seed; iconUrl: string | null; iv: Interval; color: string }>;
  }, [plantings, seedsById, cropTypesById]);

  /* ---------- KALENDERWEERGAVE: week-rijen met doorlopende balken ---------- */

  type Bar = {
    key: string;
    label: string;
    iconUrl: string | null;
    color: string;
    startCol: number; // 1..7
    endCol: number;   // 1..7
    span: number;     // endCol - startCol + 1
    lane: number;     // verticale laag binnen de week
  };

  function buildWeekBars(weekStartDate: Date): Bar[] {
    const weekIv: Interval = { start: startOfDay(weekStartDate), end: endOfDay(addDays(weekStartDate, 6)) };
    // 1) maak ruwe bars (clamp binnen de week)
    const raw = enriched
      .filter((x) => overlaps(x.iv, weekIv))
      .map((x) => {
        const s = x.iv.start < weekIv.start ? weekIv.start : x.iv.start;
        const e = x.iv.end > weekIv.end ? weekIv.end : x.iv.end;
        const startCol = dow1(s);
        const endCol = dow1(e);
        const span = Math.max(1, endCol - startCol + 1);
        return {
          key: x.p.id,
          label: x.seed?.name ?? "—",
          iconUrl: x.iconUrl,
          color: x.color,
          startCol,
          endCol,
          span,
        };
      });

    // 2) lane-toewijzing (greedy): per lane tracken we de laatst gebruikte endCol
    raw.sort((a, b) => (a.startCol - b.startCol) || (a.endCol - b.endCol) || a.label.localeCompare(b.label, "nl", { sensitivity: "base" }));
    const lanesEnd: number[] = []; // per lane: laatst eindkolom
    const bars: Bar[] = [];
    for (const r of raw) {
      let lane = 0;
      for (; lane < lanesEnd.length; lane++) {
        if (r.startCol > lanesEnd[lane]) break; // past zonder overlap in deze lane
      }
      if (lane === lanesEnd.length) lanesEnd.push(0);
      lanesEnd[lane] = r.endCol;
      bars.push({ ...r, lane });
    }
    return bars;
  }

  const weekStarts = useMemo(() => weeksCoveringMonth(year, month0), [year, month0]);

  /* ---------- LIJSTWEERGAVE: per maand unieke gewassen ---------- */
  const byMonth = useMemo(() => {
    const sets = Array.from({ length: 12 }, () => new Set<string>());
    for (const x of enriched) {
      for (let m = 0; m < 12; m++) {
        const ivM: Interval = { start: startOfMonth(year, m), end: endOfMonth(year, m) };
        if (overlaps(x.iv, ivM) && x.seed) sets[m].add(x.seed.id);
      }
    }
    return sets.map((set, m) => {
      const items = Array.from(set)
        .map((id) => {
          const seed = seedsById[id];
          if (!seed) return null;
          const iconUrl = resolveSeedIconUrl(seed, cropTypesById);
          return { seed, iconUrl };
        })
        .filter(Boolean) as Array<{ seed: Seed; iconUrl: string | null }>;
      items.sort((a, b) => a.seed.name.localeCompare(b.seed.name, "nl", { sensitivity: "base" }));
      return { month0: m, items };
    });
  }, [enriched, seedsById, cropTypesById, year]);

  return (
    <section className="space-y-4">
      {/* Header + view switch */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Oogstagenda</h3>
        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg">
          <button
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md",
              mode === "calendar" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("calendar")}
            title="Kalenderweergave"
          >
            <CalendarIcon className="w-4 h-4" />
            Kalender
          </button>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md",
              mode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMode("list")}
            title="Lijstweergave per maand"
          >
            <ListIcon className="w-4 h-4" />
            Lijst
          </button>
        </div>
      </div>

      {/* Kalender */}
      {mode === "calendar" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border hover:bg-muted"
              onClick={() => {
                const m = month0 - 1;
                if (m < 0) { setMonth0(11); setYear((y) => y - 1); } else setMonth0(m);
              }}
            >
              ←
            </button>
            <div className="px-3 py-1.5 rounded-md bg-muted/40 text-sm font-medium">
              {monthName(month0)} {year}
            </div>
            <button
              className="px-2 py-1 rounded-md border hover:bg-muted"
              onClick={() => {
                const m = month0 + 1;
                if (m > 11) { setMonth0(0); setYear((y) => y + 1); } else setMonth0(m);
              }}
            >
              →
            </button>
          </div>

          {/* Week-rijen */}
          <div className="space-y-3">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-2">
              {["ma", "di", "wo", "do", "vr", "za", "zo"].map((w) => (
                <div key={w} className="text-[11px] text-muted-foreground text-center uppercase tracking-wide">
                  {w}
                </div>
              ))}
            </div>

            {weekStarts.map((ws) => {
              const we = addDays(ws, 6);
              const bars = buildWeekBars(ws);
              const lanes = Math.max(0, ...bars.map((b) => b.lane)) + (bars.length ? 1 : 0);

              // Dagcellen (bovenste rij met datums)
              const dayCells = Array.from({ length: 7 }, (_, i) => {
                const d = addDays(ws, i);
                const inMonth = d.getMonth() === month0;
                return (
                  <div
                    key={i}
                    className={cn(
                      "border rounded-lg p-1.5 min-h-[60px]",
                      inMonth ? "bg-card" : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    <div className="text-[11px] font-medium">{d.getDate()}</div>
                  </div>
                );
              });

              return (
                <div key={ws.toISOString()} className="space-y-1">
                  {/* dagrij */}
                  <div className="grid grid-cols-7 gap-2">{dayCells}</div>

                  {/* lanes met bars */}
                  {Array.from({ length: lanes }).map((_, lane) => (
                    <div key={lane} className="grid grid-cols-7 gap-2">
                      {bars
                        .filter((b) => b.lane === lane)
                        .map((b) => (
                          <div
                            key={`${b.key}-${lane}`}
                            className="h-7 rounded-md px-2 flex items-center gap-2 text-[11px] text-white overflow-hidden shadow-sm"
                            style={{
                              gridColumn: `${b.startCol} / span ${b.span}`,
                              background: b.color,
                            }}
                            title={b.label}
                          >
                            {b.iconUrl ? (
                              <img src={b.iconUrl} alt="" className="w-4 h-4 object-contain opacity-95" />
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                            <span className="truncate">{b.label}</span>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lijst per maand */}
      {mode === "list" && (
        <div className="space-y-4">
          {byMonth.map(({ month0: m, items }) => (
            <div key={m} className="border rounded-lg p-3 bg-card">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {monthName(m)}
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground">—</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {items.map(({ seed, iconUrl }) => (
                    <div key={seed.id} className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-xs">
                      <div className="relative w-4 h-4 rounded-sm overflow-hidden bg-emerald-500/70">
                        {iconUrl ? (
                          <img src={iconUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-95" />
                        ) : (
                          <div className="absolute inset-0" />
                        )}
                      </div>
                      <span className="font-medium truncate">{seed.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
