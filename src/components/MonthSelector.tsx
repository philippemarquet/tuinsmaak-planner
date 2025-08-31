interface MonthSelectorProps {
  label: string;
  value: number[]; // array met maanden (1–12)
  onChange: (months: number[]) => void;
}

const MONTHS = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
];

export function MonthSelector({ label, value, onChange }: MonthSelectorProps) {
  function toggle(month: number) {
    if (value.includes(month)) {
      onChange(value.filter((m) => m !== month));
    } else {
      onChange([...value, month].sort((a, b) => a - b));
    }
  }

  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <div className="grid grid-cols-6 gap-2">
        {MONTHS.map((m, idx) => {
          const monthNum = idx + 1;
          const active = value.includes(monthNum);
          return (
            <button
              key={monthNum}
              type="button"
              onClick={() => toggle(monthNum)}
              className={`px-2 py-1 rounded text-sm border ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-secondary-foreground border-border"
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
