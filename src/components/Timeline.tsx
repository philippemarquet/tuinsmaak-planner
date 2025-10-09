import { useEffect, useMemo, useState } from "react";
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
    const start = new Date(p.planned_date ?? p.planned_presow_date ?? "");
    const end = new Date(p.planned_harvest_end ?? "");
    if (!start || !end) return { left: 0, width: 0 };
    const startIdx = weeks.findIndex((w) => w >= start);
    const endIdx = weeks.findIndex((w) => w >= end);
    const left = startIdx * 60;
    const width = (endIdx - startIdx + 1) * 60;
    return { left, width };
  }

  // Organize plantings into rows to avoid overlap
  const plantingRows = useMemo(() => {
    const rows: Planting[][] = [];
    const sortedPlantings = [...plantings].sort((a, b) => {
      const aDate = new Date(a.planned_date ?? a.planned_presow_date ?? "").getTime();
      const bDate = new Date(b.planned_date ?? b.planned_presow_date ?? "").getTime();
      return aDate - bDate;
    });

    for (const planting of sortedPlantings) {
      const { left, width } = barStyle(planting);
      if (width === 0) continue;

      let placed = false;
      for (const row of rows) {
        const overlaps = row.some(p => {
          const pStyle = barStyle(p);
          return !(left + width < pStyle.left || left > pStyle.left + pStyle.width);
        });
        if (!overlaps) {
          row.push(planting);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([planting]);
      }
    }
    return rows;
  }, [plantings, weeks]);

  return (
    <div className="overflow-x-auto border rounded-md bg-card shadow">
      <div className="flex">
        {/* Week labels */}
        <div className="flex">
          {weeks.map((w, idx) => (
            <div key={idx} className="w-[60px] text-[10px] text-center border-r py-1">
              {weekLabel(w)}
            </div>
          ))}
        </div>
      </div>
      {/* Bars */}
      <div className="relative border-t" style={{ height: Math.max(120, plantingRows.length * 32 + 20) }}>
        {plantingRows.map((row, rowIdx) => (
          row.map((p) => {
            const seed = seeds.find((s) => s.id === p.seed_id);
            const { left, width } = barStyle(p);
            return (
              <div
                key={p.id}
                className={`${p.color ?? "bg-primary"} text-white text-xs px-1 rounded absolute h-6`}
                style={{ left, top: 10 + rowIdx * 32, width }}
                title={`${seed?.name ?? "Onbekend"}`}
              >
                <span className="truncate">{seed?.name}</span>
              </div>
            );
          })
        ))}
      </div>
    </div>
  );
}
