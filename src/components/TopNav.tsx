import { signOut } from "../lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useIsMobile } from "../hooks/use-mobile";
import { getMyProfile } from "../lib/api/profile";

export function TopNav() {
  const isMobile = useIsMobile();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  useEffect(() => {
    const sync = async () => {
      const profile = await getMyProfile();
      setDisplayName(profile?.display_name ?? null);
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      const profile = await getMyProfile();
      setDisplayName(profile?.display_name ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Check for planner conflicts
  useEffect(() => {
    const checkConflicts = () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const conflicts = localStorage.getItem("plannerHasConflicts") === "1";
          const count = parseInt(localStorage.getItem("plannerConflictCount") || "0", 10) || 0;
          setHasConflicts(conflicts);
          setConflictCount(count);
        }
      } catch (error) {
        console.error("Error checking conflicts:", error);
        setHasConflicts(false);
        setConflictCount(0);
      }
    };
    
    checkConflicts();
    const interval = setInterval(checkConflicts, 2000); // Check every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const handlePlannerClick = () => {
    if (hasConflicts) {
      localStorage.setItem("plannerOpenTab", "conflicts");
    }
    // Dispatch custom event to navigate
    window.dispatchEvent(new CustomEvent('navigateToPlanner', { 
      detail: { tab: hasConflicts ? "conflicts" : "list" } 
    }));
  };

  return (
    <header className={`flex items-center justify-between border-b border-border bg-background ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} shadow-sm`}>
      {/* Left side: logo + title */}
      <div className="flex items-center gap-2">
        <div className={`${isMobile ? 'h-7 w-7' : 'h-8 w-8'} rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold`}>
          B
        </div>
        {!isMobile && <span className="font-semibold text-lg">Bosgoedt Planner</span>}
      </div>

      {/* Center: Conflict warning only when there are conflicts */}
      <div className="flex items-center gap-2 md:gap-4 flex-1 justify-center">
        {hasConflicts && (
          <button
            onClick={handlePlannerClick}
            className={`inline-flex items-center gap-2 ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-md border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition-colors`}
          >
            <span>{isMobile ? `⚠️ ${conflictCount}` : `⚠️ ${conflictCount} conflict${conflictCount !== 1 ? 'en' : ''} - Ga naar planner`}</span>
          </button>
        )}
      </div>

      {/* Right side: user info + logout */}
      <div className="flex items-center gap-2 md:gap-3">
        {displayName && !isMobile && (
          <span className="text-sm text-muted-foreground hidden sm:block">
            Hallo {displayName}
          </span>
        )}
        <button
          onClick={() => signOut()}
          className={`inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
        >
          {isMobile ? 'Uit' : 'Uitloggen'}
        </button>
      </div>
    </header>
  );
}
