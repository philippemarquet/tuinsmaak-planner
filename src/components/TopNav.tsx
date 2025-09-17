import { signOut } from "../lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";

export function TopNav() {
  const [email, setEmail] = useState<string | null>(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Check for planner conflicts
  useEffect(() => {
    const checkConflicts = () => {
      try {
        const conflicts = localStorage.getItem("plannerHasConflicts") === "1";
        const count = parseInt(localStorage.getItem("plannerConflictCount") || "0");
        setHasConflicts(conflicts);
        setConflictCount(count);
      } catch {}
    };
    
    checkConflicts();
    const interval = setInterval(checkConflicts, 1000); // Check every second
    return () => clearInterval(interval);
  }, []);

  const handlePlannerClick = () => {
    if (hasConflicts) {
      localStorage.setItem("plannerOpenTab", "conflicts");
    }
    navigate("/planner");
  };

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 shadow-sm">
      {/* Left side: logo + title */}
      <div className="flex items-center gap-2">
        {/* Je kunt dit later vervangen door een echt logo-image */}
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
          B
        </div>
        <span className="font-semibold text-lg">Bosgoedt Planner</span>
      </div>

      {/* Center: Navigation with conflict warnings */}
      <div className="flex items-center gap-4">
        <button
          onClick={handlePlannerClick}
          className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            hasConflicts 
              ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" 
              : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <span>Planner</span>
          {hasConflicts && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-red-100 text-red-800 border border-red-200">
              ⚠️ {conflictCount}
            </span>
          )}
        </button>
      </div>

      {/* Right side: user info + logout */}
      <div className="flex items-center gap-3">
        {email && (
          <span className="text-sm text-muted-foreground hidden sm:block">
            {email}
          </span>
        )}
        <button
          onClick={() => signOut()}
          className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 text-sm"
        >
          Uitloggen
        </button>
      </div>
    </header>
  );
}
