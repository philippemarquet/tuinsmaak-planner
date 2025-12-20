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
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const daysInMonth = (year: number, monthIdx0: number) => new Date(year, monthIdx0 + 1, 0).getDate();
const startOfMonth = (y: number, m0: number) => new Date(y, m0, 1, 0, 0, 0, 0);
const endOfMonth = (y: number, m0: number) => new Date(y, m0, daysInMonth(y, m0), 23, 59, 59, 999);
const fmtDay = (d: Date) => d.getDate();
const monthName = (m0: number) =>
  new Date(2000, m0, 1).toLocaleString("nl-NL", { month: "long" }).replace(/^\w/, (c) => c.toUpperCase());

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
const overlaps = (a: Interval, b: Interval) => a.start <= b.end && b.start <= a.start ? true : a.start <= b.end && b.start <= a.end;

/* ---------- Compact chip ---------- */
function CropChip({ iconUrl, label }: { iconUrl: string | null; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1 text-xs">
      <div className="relative w-4 h-4 rounded-sm overflow-hidden bg-emerald-500/70">
        {iconUrl ? (
          <img src={iconUrl} alt="" className="absolute inset-0 w-full h-full object-contain opacity-95" />
        ) : (
          <div className="absolute inset-0" />
        )}
      </div>
      <span className="font-medium truncate">{label}</span>
    </div>
  );
}

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

  /* Verrijkte plantings met harvest-interval + icon */
  const enriched = useMemo(() => {
    return plantings
      .map((p) => {
        const iv = harvestIntervalOf(p);
        if (!iv) return null;
        const seed = seedsById[p.seed_id];
        const iconUrl = resolveSeedIconUrl(seed, cropTypesById);
        return { p, seed, iconUrl, iv };
      })
      .filter(Boolean) as Array<{ p: Planting; seed?: Seed; iconUrl: string | null; iv: Interval }>;
  }, [plantings, seedsById, cropTypesById]);

  /* Kalenderweergave: items per dag */
  const calendarDays = useMemo(() => {
    const total = daysInMonth(year, month0);
    const byDay: Array<{ date: Date; items: Array<{ seed?: Seed; iconUrl: string | null }> }> = [];
    for (let d = 1; d <= total; d++) {
      const date = new Date(year, month0, d);
      const ivDay: Interval = { start: startOfDay(date), end: endOfDay(date) };
      const items = enriched
        .filter((x) => overlaps(x.iv, ivDay))
        .map((x) => ({ seed: x.seed, iconUrl: x.iconUrl }));
      byDay.push({ date, items });
    }
    return byDay;
  }, [enriched, year, month0]);

  /* Lijstweergave: per maand unieke gewassen */
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

          <div className="grid grid-cols-7 gap-2">
            {["ma", "di", "wo", "do", "vr", "za", "zo"].map((w) => (
              <div key={w} className="text-[11px] text-muted-foreground text-center uppercase tracking-wide">
                {w}
              </div>
            ))}

            {/* Lege cellen tot maandag */}
            {(() => {
              const first = new Date(year, month0, 1);
              const weekDay = first.getDay() || 7; // zondag=0 -> 7
              const blanks = weekDay === 1 ? 0 : weekDay - 1;
              return Array.from({ length: blanks }).map((_, i) => <div key={`blank-${i}`} />);
            })()}

            {calendarDays.map(({ date, items }) => (
              <div key={date.toISOString()} className="border rounded-lg p-1.5 min-h-[70px]">
                <div className="text-[11px] font-medium mb-1">{fmtDay(date)}</div>
                <div className="flex flex-wrap gap-1">
                  {items.slice(0, 6).map((it, idx) => (
                    <CropChip key={idx} iconUrl={it.iconUrl} label={it.seed?.name ?? "—"} />
                  ))}
                  {items.length > 6 && (
                    <span className="text-[10px] text-muted-foreground">+{items.length - 6}</span>
                  )}
                </div>
              </div>
            ))}
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
                    <CropChip key={seed.id} iconUrl={iconUrl} label={seed.name} />
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
