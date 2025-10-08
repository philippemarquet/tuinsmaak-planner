// src/components/ConflictDetailsModal.tsx
import { X, AlertTriangle, CheckCircle, XCircle, Calendar, Box, Clock } from "lucide-react";
import type { ConflictDetail } from "../lib/conflictResolution";

interface ConflictDetailsModalProps {
  conflicts: ConflictDetail[];
  onClose: () => void;
  onApplyRecommendation?: (conflictId: string, recommendation: any) => void;
}

export function ConflictDetailsModal({ conflicts, onClose, onApplyRecommendation }: ConflictDetailsModalProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            <div>
              <h2 className="text-xl font-semibold">Conflictdetails</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {conflicts.length} conflict{conflicts.length !== 1 ? 'en' : ''} gevonden
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {conflicts.map((conflict, idx) => (
            <div key={idx} className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-5">
              {/* Conflict Overview */}
              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      Geactualiseerde planting
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{conflict.actualizedSeed.name}</span>
                      {' '}heeft een werkelijke datum gekregen, waardoor deze overlapt met:
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 ml-5 pl-3 border-l-2 border-yellow-300 dark:border-yellow-700">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground mb-1">
                      Te herplannen
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{conflict.conflictingSeed.name}</span>
                      {' '}moet worden verplaatst of verzet
                    </p>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-800">
                <h4 className="font-semibold text-sm text-foreground mb-3">Aanbevolen oplossingen</h4>
                <div className="space-y-2">
                  {conflict.recommendations.map((rec, recIdx) => (
                    <div
                      key={recIdx}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        rec.feasible
                          ? 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800'
                          : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 opacity-60'
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {rec.feasible ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {rec.type === "same_bed_different_segment" && (
                            <Box className="w-4 h-4 text-blue-500" />
                          )}
                          {rec.type === "different_bed_same_time" && (
                            <Calendar className="w-4 h-4 text-purple-500" />
                          )}
                          {rec.type === "different_time" && (
                            <Clock className="w-4 h-4 text-amber-500" />
                          )}
                          <span className="font-medium text-sm text-foreground">
                            {rec.type === "same_bed_different_segment" && "Optie 1: Ander segment, zelfde bak"}
                            {rec.type === "different_bed_same_time" && "Optie 2: Andere bak, zelfde timing"}
                            {rec.type === "different_time" && "Optie 3: Andere timing"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.description}</p>
                      </div>
                      {rec.feasible && onApplyRecommendation && (
                        <button
                          onClick={() => onApplyRecommendation(conflict.conflictingPlanting.id, rec)}
                          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors whitespace-nowrap"
                        >
                          Toepassen
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
