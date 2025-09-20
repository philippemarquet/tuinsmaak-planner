import { useEffect } from "react";

/**
 * Custom hook to consistently update conflict flags in localStorage
 * Used by both Dashboard and PlannerPage to ensure synchronized conflict status
 */
export function useConflictFlags(conflictCount: number) {
  const hasConflicts = conflictCount > 0;

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem("plannerHasConflicts", hasConflicts ? "1" : "0");
        localStorage.setItem("plannerConflictCount", String(conflictCount || 0));
      }
    } catch (error) {
      console.error("Error updating conflict flags:", error);
    }
  }, [hasConflicts, conflictCount]);

  return { hasConflicts, conflictCount };
}