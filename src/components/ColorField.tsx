import { useEffect, useMemo, useState } from "react";

function toHexSafe(v: string): string {
  if (!v) return "#22c55e";
  const s = v.trim();
  if (s.startsWith("#")) return s;
  if (s.startsWith("rgb")) {
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
    if (!m) return "#22c55e";
    const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    const h = "#" + [r, g, b].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
    return h;
  }
  return "#22c55e";
}

export function ColorField({
  label,
  value,
  onChange,
  helperText,
}: {
  label?: string;
  value: string;
  onChange: (hexOrRgb: string) => void;
  helperText?: string;
}) {
  const [text, setText] = useState(value || "#22c55e");
  const hex = useMemo(() => toHexSafe(text), [text]);

  useEffect(() => {
    setText(value || "#22c55e");
  }, [value]);

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={hex}
          onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
          className="w-12 h-8 p-0 border-none cursor-pointer bg-transparent"
          title="Kies een kleur"
        />
        <input
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2"
          placeholder="#22c55e of rgb(34,197,94)"
        />
      </div>
      {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
    </div>
  );
}
