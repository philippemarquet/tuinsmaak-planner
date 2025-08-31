import { useEffect, useState } from "react";
import type { Planting, Seed } from "../lib/types";

interface TimelineProps {
  plantings: Planting[];
  seeds: Seed[];
}

export function Timeline({ plantings, seeds }: TimelineProps) {
  const [weeks, setWeeks] = useState<Date[]>([]);

  useEffect(() => {
    const start = new Date();
    const arr: Date[] = [];
    for (let i = 0; i < 52; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      arr.push(d);
    }
    setWeeks(arr);
  }, []);

  function weekLabel(d: Date) {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  function barStyle(p: Planting) {
    const start = new Date(p.planned_plant_date ?? p.planned_sow_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (!start || !end) return { left: 0, width: 0 };
    const startIdx = weeks.findIndex((w) => w >= start);
    const endIdx = weeks.findIndex((w) => w >= end);
    const left = startIdx * 60;
    const width = (endIdx - startIdx + 1) * 60;
    return { left, width };
  }

  return (
    <div className="overflow-x-auto border rounded-md bg-white shadow">
      <div className="flex">
        {/* Week labels */}
        <div className="flex">
          {weeks.map((w, idx) => (
            <div key={idx} className="w-[60px] text-[10px] text-center border-r">
              {weekLabel(w)}
            </div>
          ))}
        </div>
      </div>
      {/* Bars */}
      <div className="relative h-32 border-t">
        {plantings.map((p) => {
          const seed = seeds.find((s) => s.id === p.seed_id);
          const { left, width } = barStyle(p);
          return (
            <div
              key={p.id}
              className={`${p.color ?? "bg-primary"} text-white text-xs px-1 rounded absolute h-6`}
              style={{ left, top: 10 + Math.random() * 80, width }}
              title={`${seed?.name ?? "Onbekend"}`}
            >
              {seed?.name}
            </div>
          );
        })}
      </div>
    </div>
  );
}
