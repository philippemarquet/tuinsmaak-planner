// src/components/ConflictWarning.tsx
import { AlertTriangle, X } from "lucide-react";

interface ConflictWarningProps {
  conflictCount: number;
  onResolveAll?: () => void;
  onDismiss?: () => void;
}

export function ConflictWarning({ conflictCount, onDismiss }: ConflictWarningProps) {
  if (conflictCount === 0) return null;

  return (
    <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 border border-red-200 dark:border-red-800 rounded-lg shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300">
            <span className="font-medium">{conflictCount} conflict{conflictCount !== 1 ? 'en' : ''}</span>
            {' '}— bekijk het Conflicten-tabblad voor details.
          </p>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}