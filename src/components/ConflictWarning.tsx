// src/components/ConflictWarning.tsx
import { useState } from "react";
import { AlertTriangle, X, ChevronDown, ChevronRight } from "lucide-react";

interface ConflictWarningProps {
  conflictCount: number;
  onResolveAll?: () => void;
  onDismiss?: () => void;
}

export function ConflictWarning({ conflictCount, onResolveAll, onDismiss }: ConflictWarningProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (conflictCount === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg shadow-sm">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-red-800">
                Planningsconflicten gedetecteerd
              </h3>
              <p className="text-sm text-red-700 mt-1">
                Er zijn {conflictCount} conflict{conflictCount !== 1 ? 'en' : ''} in je planner die aandacht vereisen.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 hover:text-red-800 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Details
            </button>
            
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-red-200">
            <div className="space-y-3">
              <div className="text-sm text-red-700">
                <p className="font-medium mb-2">Automatische oplossingsopties:</p>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span><strong>Andere segmenten:</strong> Verplaats naar vrij segment in dezelfde bak</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    <span><strong>Andere bak:</strong> Verplaats naar vergelijkbare bak op zelfde datum</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                    <span><strong>Verschuiven:</strong> Zoek eerstmogelijke slot (minimaal verschuiven)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span><strong>Flexibel:</strong> Verplaats naar beste beschikbare locatie/datum</span>
                  </li>
                </ul>
              </div>

              {onResolveAll && (
                <div className="pt-2">
                  <button
                    onClick={onResolveAll}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                  >
                    Probeer alle conflicten automatisch op te lossen
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}