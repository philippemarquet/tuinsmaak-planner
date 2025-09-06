import { useEffect, useMemo, useState } from "react";

function clamp(n: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, n));
}

function toFullHex(shortHex: string) {
  // #abc -> #aabbcc
  const r = shortHex[1], g = shortHex[2], b = shortHex[3];
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

function rgbToHex(r: number, g: number, b: number) {
  const rs = clamp(r).toString(16).padStart(2, "0");
  const gs = clamp(g).toString(16).padStart(2, "0");
  const bs = clamp(b).toString(16).padStart(2, "0");
  return `#${rs}${gs}${bs}`.toLowerCase();
}

function parseColorToHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const val = input.trim().toLowerCase();

  // already #hex
  if (/^#([0-9a-f]{6})$/.test(val)) return val;
  if (/^#([0-9a-f]{3})$/.test(val)) return toFullHex(val);

  // rgb() / rgba()
  const rgbMatch = val.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return rgbToHex(r, g, b);
    }
  }

  // fallback: if this is a Tailwind class like bg-green-500, map a few common ones
  const map: Record<string, string> = {
    "bg-green-500": "#22c55e",
    "bg-blue-500": "#3b82f6",
    "bg-yellow-500": "#eab308",
    "bg-red-500": "#ef4444",
    "bg-purple-500": "#a855f7",
    "bg-primary": "#111827",
  };
  if (map[val]) return map[val];

  return null;
}

export function ColorField({
  label = "Kleur",
  value,
  onChange,
  helperText,
}: {
  label?: string;
  value: string | null | undefined;       // accepteert #hex, rgb(), of tailwind class; we geven #hex terug
  onChange: (hex: string) => void;        // altijd #RRGGBB bij updates
  helperText?: string;
}) {
  const initialHex = useMemo(() => parseColorToHex(value) ?? "#22c55e", [value]);
  const [hex, setHex] = useState<string>(initialHex);
  const [text, setText] = useState<string>(value ?? initialHex);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromProp = parseColorToHex(value);
    if (fromProp) {
      setHex(fromProp);
      setText(value!);
    }
  }, [value]);

  function commitFromText(raw: string) {
    const parsed = parseColorToHex(raw);
    if (!parsed) {
      setError("Gebruik #RRGGBB of rgb(r,g,b)");
      return;
    }
    setError(null);
    setHex(parsed);
    onChange(parsed);
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        {/* kleurwheel werkt met HEX */}
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            setText(e.target.value);
            setError(null);
            onChange(e.target.value);
          }}
          className="h-9 w-12 p-0 border rounded"
          title="Kleur kiezen"
        />
        {/* vrije invoer: HEX of RGB */}
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onBlur={() => commitFromText(text)}
          placeholder="#22c55e of rgb(34,197,94)"
          className="flex-1 border rounded-md px-2 py-1"
        />
        <div
          className="h-9 w-9 rounded border"
          style={{ backgroundColor: hex }}
          title={hex}
        />
      </div>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
