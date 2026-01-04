// src/components/SeedsSidebar.tsx
import { useState, useCallback } from "react";
import type { Seed, CropType } from "../lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Checkbox } from "./ui/checkbox";
import { cn } from "../lib/utils";
import { ChevronDown, Search, Info } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";

type InPlanner = "all" | "planned" | "unplanned";

interface SeedsSidebarProps {
  seeds: Seed[];
  cropTypes: CropType[];
  plantings: { seed_id?: string | null; planned_date?: string | null }[];
  activeDragId: string | null;
  onSeedInfoClick: (seed: Seed) => void;
}

function DraggableSeedItem({ 
  seed, 
  isDragging = false, 
  onInfoClick 
}: { 
  seed: Seed; 
  isDragging?: boolean; 
  onInfoClick?: () => void 
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `seed-${seed.id}` });
  const color = seed.default_color?.startsWith("#") ? seed.default_color : "#22c55e";
  
  return (
    <div
      ref={setNodeRef}
      className={`group relative px-2 py-1 rounded border bg-card hover:shadow-sm transition-all duration-150 ${
        isDragging ? "opacity-40 scale-95" : "hover:border-primary/30"
      }`}
    >
      <div 
        {...listeners} 
        {...attributes} 
        className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
      >
        <div 
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <span className="text-[11px] font-medium truncate flex-1">{seed.name}</span>
      </div>
      {onInfoClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick();
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
          title="Bekijk zaadgegevens"
        >
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

export function SeedsSidebar({ 
  seeds, 
  cropTypes, 
  plantings, 
  activeDragId,
  onSeedInfoClick 
}: SeedsSidebarProps) {
  const [q, setQ] = useState(() => localStorage.getItem("plannerQ") ?? "");
  const [inStockOnly, setInStockOnly] = useState(() => {
    const migrated = localStorage.getItem("plannerInStockV2");
    if (!migrated) {
      localStorage.setItem("plannerInStockV2", "1");
      localStorage.setItem("plannerInStock", "1");
      return true;
    }
    return localStorage.getItem("plannerInStock") === "1";
  });
  const [inPlanner, setInPlanner] = useState<InPlanner>(
    () => (localStorage.getItem("plannerInPlanner") as InPlanner) ?? "all"
  );
  const [greenhouseOnly, setGreenhouseOnly] = useState(
    () => localStorage.getItem("plannerGHOnly") === "1"
  );
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => {
    const saved = localStorage.getItem("plannerMonths");
    return saved ? JSON.parse(saved) : [];
  });
  const [cropTypeFilters, setCropTypeFilters] = useState<string[]>(() => {
    const saved = localStorage.getItem("plannerCropTypes");
    return saved ? JSON.parse(saved) : [];
  });

  // Popover open state - controlled
  const [monthsOpen, setMonthsOpen] = useState(false);
  const [cropTypesOpen, setCropTypesOpen] = useState(false);

  // Persist to localStorage
  const handleQChange = useCallback((val: string) => {
    setQ(val);
    localStorage.setItem("plannerQ", val);
  }, []);

  const handleInStockToggle = useCallback(() => {
    setInStockOnly(v => {
      const newVal = !v;
      localStorage.setItem("plannerInStock", newVal ? "1" : "0");
      return newVal;
    });
  }, []);

  const handleGreenhouseToggle = useCallback(() => {
    setGreenhouseOnly(v => {
      const newVal = !v;
      localStorage.setItem("plannerGHOnly", newVal ? "1" : "0");
      return newVal;
    });
  }, []);

  const handleInPlannerChange = useCallback((val: InPlanner) => {
    setInPlanner(val);
    localStorage.setItem("plannerInPlanner", val);
  }, []);

  const handleMonthsChange = useCallback((months: number[]) => {
    setSelectedMonths(months);
    localStorage.setItem("plannerMonths", JSON.stringify(months));
  }, []);

  const handleCropTypesChange = useCallback((types: string[]) => {
    setCropTypeFilters(types);
    localStorage.setItem("plannerCropTypes", JSON.stringify(types));
  }, []);

  const seedHasPlanned = (seedId: string) => 
    plantings.some((p) => p.seed_id === seedId && p.planned_date);

  // Filter seeds
  const filteredSeeds = (() => {
    let arr = seeds.slice();

    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(t));
    }

    if (inStockOnly) arr = arr.filter((s: any) => s.in_stock !== false);
    if (greenhouseOnly) arr = arr.filter((s) => !!s.greenhouse_compatible);

    if (inPlanner !== "all") {
      arr = arr.filter((s) => 
        inPlanner === "planned" ? seedHasPlanned(s.id) : !seedHasPlanned(s.id)
      );
    }

    if (cropTypeFilters.length > 0) {
      arr = arr.filter((s) => {
        if (cropTypeFilters.includes("__none__") && !s.crop_type_id) return true;
        return cropTypeFilters.includes(s.crop_type_id ?? "");
      });
    }

    if (selectedMonths.length > 0) {
      arr = arr.filter((s: any) => {
        const directPlantMonths: number[] = s.direct_plant_months ?? s.direct_sow_months ?? [];
        const greenhouseMonths: number[] = s.greenhouse_months ?? [];
        const hasDirectPlantMatch = Array.isArray(directPlantMonths) && 
          directPlantMonths.some((m) => selectedMonths.includes(m));
        const hasGreenhouseMatch = Array.isArray(greenhouseMonths) && 
          greenhouseMonths.some((m) => selectedMonths.includes(m));
        return hasDirectPlantMatch || hasGreenhouseMatch;
      });
    }

    return arr;
  })();

  return (
    <aside className="w-60 flex-shrink-0 bg-card/50 backdrop-blur-sm border-r border-border/50 ml-3 rounded-l-xl overflow-hidden">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
          <h3 className="text-sm font-semibold text-foreground tracking-tight">Zaden</h3>
        </div>
        
        {/* Filters */}
        <div className="px-3 py-3 border-b border-border/30 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input 
              className="w-full pl-8 pr-3 py-2 text-xs bg-muted/30 border-0 rounded-lg focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all placeholder:text-muted-foreground/50" 
              value={q} 
              onChange={(e) => handleQChange(e.target.value)} 
              placeholder="Zoek op naam…" 
            />
          </div>
          
          {/* Toggle Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={handleInStockToggle}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded-full transition-all",
                inStockOnly 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Voorraad
            </button>
            <button
              onClick={handleGreenhouseToggle}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium rounded-full transition-all",
                greenhouseOnly 
                  ? "bg-emerald-500 text-white shadow-sm" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              Kas
            </button>
          </div>
          
          {/* Segmented Control - In Planner */}
          <div className="flex p-0.5 bg-muted/40 rounded-lg">
            {(["all", "planned", "unplanned"] as InPlanner[]).map((k) => (
              <button
                key={k}
                className={cn(
                  "flex-1 px-2 py-1.5 text-[10px] font-medium rounded-md transition-all",
                  inPlanner === k 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleInPlannerChange(k)}
              >
                {k === "all" ? "Alle" : k === "planned" ? "Gepland" : "Ongepland"}
              </button>
            ))}
          </div>

          {/* Categorie filter - controlled popover */}
          <Popover open={cropTypesOpen} onOpenChange={setCropTypesOpen}>
            <PopoverTrigger asChild>
              <button className="w-full px-3 py-2 text-xs text-left rounded-lg flex justify-between items-center bg-muted/30 hover:bg-muted/50 transition-all group">
                <span className={cn(
                  "truncate",
                  cropTypeFilters.length === 0 ? "text-muted-foreground" : "text-foreground font-medium"
                )}>
                  {cropTypeFilters.length === 0
                    ? "Alle gewastypen"
                    : cropTypeFilters.length === 1
                    ? cropTypes.find((ct) => ct.id === cropTypeFilters[0])?.name || "Overig"
                    : `${cropTypeFilters.length} geselecteerd`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-52 p-2 max-h-56 overflow-y-auto bg-popover border-border z-50"
              onPointerDownOutside={(e) => {
                // Alleen sluiten als er buiten de popover wordt geklikt
                // niet bij interactie met checkboxen
              }}
              onInteractOutside={(e) => {
                e.preventDefault();
              }}
            >
              <div className="space-y-0.5">
                {cropTypeFilters.length > 0 && (
                  <button 
                    onClick={() => handleCropTypesChange([])} 
                    className="w-full text-left text-[11px] text-primary hover:underline px-2 py-1 mb-1"
                  >
                    Wis selectie
                  </button>
                )}
                {cropTypes.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={cropTypeFilters.includes(ct.id)}
                      onCheckedChange={(checked) => {
                        if (checked) handleCropTypesChange([...cropTypeFilters, ct.id]);
                        else handleCropTypesChange(cropTypeFilters.filter((id) => id !== ct.id));
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-xs">{ct.name}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={cropTypeFilters.includes("__none__")}
                    onCheckedChange={(checked) => {
                      if (checked) handleCropTypesChange([...cropTypeFilters, "__none__"]);
                      else handleCropTypesChange(cropTypeFilters.filter((id) => id !== "__none__"));
                    }}
                    className="h-3.5 w-3.5 rounded"
                  />
                  <span className="text-xs text-muted-foreground">Overig</span>
                </label>
              </div>
            </PopoverContent>
          </Popover>

          {/* Maand filter - controlled popover */}
          <Popover open={monthsOpen} onOpenChange={setMonthsOpen}>
            <PopoverTrigger asChild>
              <button className="w-full px-3 py-2 text-xs text-left rounded-lg flex justify-between items-center bg-muted/30 hover:bg-muted/50 transition-all group">
                <span className={cn(
                  "truncate",
                  selectedMonths.length === 0 ? "text-muted-foreground" : "text-foreground font-medium"
                )}>
                  {selectedMonths.length === 0
                    ? "Alle maanden"
                    : selectedMonths.length === 1
                    ? new Date(2000, selectedMonths[0] - 1, 1).toLocaleString("nl-NL", { month: "long" })
                    : `${selectedMonths.length} maanden`}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-52 p-2 max-h-56 overflow-y-auto bg-popover border-border z-50"
              onInteractOutside={(e) => {
                e.preventDefault();
              }}
            >
              <div className="space-y-0.5">
                {selectedMonths.length > 0 && (
                  <button 
                    onClick={() => handleMonthsChange([])} 
                    className="w-full text-left text-[11px] text-primary hover:underline px-2 py-1 mb-1"
                  >
                    Wis selectie
                  </button>
                )}
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={selectedMonths.includes(m)}
                      onCheckedChange={(checked) => {
                        if (checked) handleMonthsChange([...selectedMonths, m].sort((a, b) => a - b));
                        else handleMonthsChange(selectedMonths.filter((month) => month !== m));
                      }}
                      className="h-3.5 w-3.5 rounded"
                    />
                    <span className="text-xs capitalize">
                      {new Date(2000, m - 1, 1).toLocaleString("nl-NL", { month: "long" })}
                    </span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Scrollable seed list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {filteredSeeds.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">Geen zaden gevonden</p>
            </div>
          ) : (
            filteredSeeds.map((seed) => (
              <DraggableSeedItem 
                key={seed.id} 
                seed={seed} 
                isDragging={activeDragId === `seed-${seed.id}`}
                onInfoClick={() => onSeedInfoClick(seed)}
              />
            ))
          )}
        </div>
        
        {/* Footer count */}
        <div className="px-3 py-2 border-t border-border/30 bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            <span className="font-medium text-foreground">{filteredSeeds.length}</span> / {seeds.length} zaden
          </p>
        </div>
      </div>
    </aside>
  );
}
