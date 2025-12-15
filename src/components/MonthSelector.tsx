import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  label: string;
  value: number[];
  onChange: (months: number[]) => void;
  disabled?: boolean;
}

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

export function MonthSelector({ label, value, onChange, disabled = false }: MonthSelectorProps) {
  function toggle(month: number) {
    if (disabled) return;
    if (value.includes(month)) {
      onChange(value.filter((m) => m !== month));
    } else {
      onChange([...value, month].sort((a, b) => a - b));
    }
  }

  return (
    <div className={cn("flex items-center gap-3", disabled && "opacity-40")}>
      <span className="text-xs font-medium text-muted-foreground w-20 flex-shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {MONTHS.map((m, idx) => {
          const monthNum = idx + 1;
          const active = value.includes(monthNum);
          return (
            <button
              key={monthNum}
              type="button"
              onClick={() => toggle(monthNum)}
              disabled={disabled}
              title={MONTH_NAMES[idx]}
              className={cn(
                "w-6 h-6 rounded-md text-[11px] font-semibold transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                disabled && "cursor-not-allowed hover:bg-muted/40 hover:text-muted-foreground"
              )}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
