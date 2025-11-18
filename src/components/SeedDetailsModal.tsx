import type { Seed, CropType } from "../lib/types";
import { X } from "lucide-react";

interface SeedDetailsModalProps {
  seed: Seed;
  cropTypes: CropType[];
  onClose: () => void;
}

const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function sowingTypeLabel(v?: string) {
  switch ((v || "").toLowerCase()) {
    case "direct": return "Direct";
    case "presow": return "Voorzaai";
    case "both":  return "Beide";
    default:      return "—";
  }
}

function monthsToString(arr?: number[] | null) {
  if (!arr || arr.length === 0) return "—";
  return arr.map((m) => MONTH_NAMES[m - 1] ?? m).join(", ");
}

export function SeedDetailsModal({ seed, cropTypes, onClose }: SeedDetailsModalProps) {
  const inStock = (seed as any).in_stock !== false;
  const stockBadgeText = inStock ? "In voorraad" : "Niet op voorraad";
  const stockBadgeClass = inStock ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";

  const cropType = seed.crop_type_id ? cropTypes.find((ct) => ct.id === seed.crop_type_id) : null;

  const colorDot =
    seed.default_color && seed.default_color.startsWith("#") ? (
      <span
        className="inline-block w-4 h-4 rounded"
        style={{ backgroundColor: seed.default_color }}
        title="Standaardkleur"
      />
    ) : (
      <span
        className={`inline-block w-4 h-4 rounded ${seed.default_color ?? "bg-green-500"}`}
        title="Standaardkleur"
      />
    );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-card rounded-lg shadow-lg p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {colorDot}
            <div>
              <h3 className="text-xl font-semibold">{seed.name}</h3>
              {cropType && <p className="text-sm text-muted-foreground">{cropType.name}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition"
            title="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${stockBadgeClass}`}>{stockBadgeText}</span>
          {seed.sowing_type && (
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
              Zaaitype: {sowingTypeLabel(seed.sowing_type)}
            </span>
          )}
          {seed.greenhouse_compatible && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-600 text-white">
              Geschikt voor kas
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">Aankoopdatum:</span>
            <div>{seed.purchase_date ? new Date(seed.purchase_date).toLocaleDateString("nl-NL") : "—"}</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Rijafstand:</span>
            <div>{seed.row_spacing_cm ?? "—"} cm</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Plantafstand:</span>
            <div>{seed.plant_spacing_cm ?? "—"} cm</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Voorzaai duur:</span>
            <div>{seed.presow_duration_weeks ?? "—"} weken</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Groei duur:</span>
            <div>{seed.grow_duration_weeks ?? "—"} weken</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Oogst duur:</span>
            <div>{seed.harvest_duration_weeks ?? "—"} weken</div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">Voorzaai maanden:</span>
            <div>{monthsToString(seed.presow_months)}</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Direct plant maanden:</span>
            <div>{monthsToString(seed.direct_plant_months)}</div>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Oogst maanden:</span>
            <div>{monthsToString(seed.harvest_months)}</div>
          </div>
        </div>

        {seed.notes && (
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">Notities:</span>
            <div className="mt-1 whitespace-pre-wrap">{seed.notes}</div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
