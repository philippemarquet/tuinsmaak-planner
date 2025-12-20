import { useEffect, useMemo, useState } from "react";
import type { Garden, GardenBed, Planting, Seed, CropType } from "../lib/types";
import { buildConflictsMap, countUniqueConflicts } from "../lib/conflicts";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

// Bestaande views/components die je al hebt
import { TimelineView } from "./TimelineView";

// Nieuwe, afgeslankte oogstagenda component (voorheen ‘oogstagenda’)
import HarvestAgendaView from "./HarvestAgendaView";

type ViewKey = "timeline" | "harvest" | "conflicts";

export default function PlannerPage({
  garden,
  beds: initialBeds,
  seeds: initialSeeds,
  plantings: initialPlantings,
  cropTypes: initialCropTypes,
  onDataChange,
}: {
  garden: Garden;
  beds: GardenBed[];
  seeds: Seed[];
  plantings: Planting[];
  cropTypes: CropType[];
  onDataChange: () => Promise<void>;
}) {
  // Data sync
  const [beds, setBeds] = useState<GardenBed[]>(initialBeds);
  const [seeds, setSeeds] = useState<Seed[]>(initialSeeds);
  const [plantings, setPlantings] = useState<Planting[]>(initialPlantings);
  const [cropTypes, setCropTypes] = useState<CropType[]>(initialCropTypes);

  useEffect(() => {
    setBeds(initialBeds);
    setSeeds(initialSeeds);
    setPlantings(initialPlantings);
    setCropTypes(initialCropTypes);
  }, [initialBeds, initialSeeds, initialPlantings, initialCropTypes]);

  // Tab state
  const [view, setView] = useState<ViewKey>(() => {
    const saved = (localStorage.getItem("plannerOpenTab") as ViewKey) || "timeline";
    return saved;
  });
  useEffect(() => {
    localStorage.setItem("plannerOpenTab", view);
  }, [view]);

  // Conflicts (alleen voor badge)
  const conflictsMap = useMemo(() => buildConflictsMap(plantings || [], seeds || []), [plantings, seeds]);
  const conflictCount = useMemo(() => countUniqueConflicts(conflictsMap), [conflictsMap]);
  const hasConflicts = conflictCount > 0;

  // Week-blokje voor Timeline header (optioneel compact)
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => {
    const n = new Date();
    const d = new Date(n);
    d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // UI
  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col overflow-hidden -mx-6 -mb-6">
      {/* Header */}
      <header className="flex-shrink-0 bg-background border-b z-30 px-6">
        <div className="py-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Planner</h2>
          {view === "timeline" && (
            <div className="flex items-center gap-2">
              <div className="flex items-center p-0.5 bg-muted/40 rounded-lg">
                <button
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors"
                  onClick={() => setCurrentWeekMonday(addDays(currentWeekMonday, -7))}
                >
                  ←
                </button>
                <span className="px-4 py-2 font-semibold text-sm min-w-[180px] text-center">
                  {format(currentWeekMonday, "d MMM", { locale: nl })} – {format(addDays(currentWeekMonday, 6), "d MMM", { locale: nl })}
                </span>
                <button
                  className="px-3 py-2 text-sm font-medium rounded-md hover:bg-background transition-colors"
                  onClick={() => setCurrentWeekMonday(addDays(currentWeekMonday, 7))}
                >
                  →
                </button>
              </div>
              <button
                className="px-3 py-2 text-sm font-medium rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                onClick={() => {
                  const n = new Date();
                  const d = new Date(n);
                  d.setDate(n.getDate() - ((n.getDay() || 7) - 1));
                  d.setHours(0, 0, 0, 0);
                  setCurrentWeekMonday(d);
                }}
              >
                Vandaag
              </button>
            </div>
          )}
        </div>

        {/* Tabs: Timeline — Oogstagenda — Conflicten */}
        <div className="pb-3 flex items-center gap-2">
          {(["timeline", "harvest", "conflicts"] as ViewKey[]).map((k) => {
            const active = view === k;
            const danger = k === "conflicts" && hasConflicts;
            return (
              <button
                key={k}
                onClick={() => setView(k)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                  active
                    ? danger
                      ? "bg-red-600 text-white shadow-sm"
                      : "bg-primary text-primary-foreground shadow-sm"
                    : danger
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {k === "timeline" ? "Timeline" : k === "harvest" ? "Oogstagenda" : "Conflicten"}
                {k === "conflicts" && hasConflicts && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/20">{conflictCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {view === "timeline" && (
          <TimelineView
            beds={beds || []}
            plantings={plantings || []}
            seeds={seeds || []}
            conflictsMap={conflictsMap}
            currentWeek={currentWeekMonday}
            onReload={onDataChange}
          />
        )}

        {view === "harvest" && (
          <HarvestAgendaView
            seeds={seeds || []}
            plantings={plantings || []}
            cropTypes={cropTypes || []}
          />
        )}

        {view === "conflicts" && (
          <div className="space-y-3">
            {hasConflicts ? (
              Array.from(conflictsMap.entries()).map(([plantingId, list]) => {
                const p = plantings.find((x) => x.id === plantingId);
                const s = seeds.find((x) => x.id === p?.seed_id);
                if (!p || !s) return null;
                return (
                  <div key={plantingId} className="border rounded-lg p-3 bg-card">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {list.length} conflict{list.length !== 1 ? "en" : ""}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground">Geen conflicten 🎉</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
