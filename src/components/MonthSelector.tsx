interface MonthSelectorProps {
  label: string;
  value: number[]; // array met maanden (1–12)
  onChange: (months: number[]) => void;
  disabled?: boolean;
}

const MONTHS = [
  "J", "F", "M", "A", "M", "J",
  "J", "A", "S", "O", "N", "D"
];

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
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium w-20 flex-shrink-0 ${disabled ? "opacity-50" : ""}`}>{label}</span>
      <div className="flex gap-1 flex-wrap">
        {MONTHS.map((m, idx) => {
          const monthNum = idx + 1;
          const active = value.includes(monthNum);
          return (
            <button
              key={monthNum}
              type="button"
              onClick={() => toggle(monthNum)}
              disabled={disabled}
              className={`w-6 h-6 rounded text-xs font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              } ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-primary/80 hover:text-primary-foreground"}`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
