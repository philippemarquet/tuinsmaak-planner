import { useEffect, useMemo, useState } from "react";

import { TopNav } from "./components/TopNav";

import { Dashboard } from "./components/Dashboard";
import { BedsPage } from "./components/BedsPage";
import { InventoryPage } from "./components/InventoryPage";
import { PlannerPage } from "./components/PlannerPage";
import { SettingsPage } from "./components/SettingsPage";
import { WishlistPage } from "./components/WishlistPage";
import { AuthGate } from "./components/AuthGate";

type TabKey = "dashboard" | "beds" | "inventory" | "planner" | "wishlist" | "settings";

// Gebruik een vaste garden ID - iedereen heeft toegang tot dezelfde tuin
const GARDEN_ID = "c2ebf1fb-5aa9-4eac-87a8-099e9cea8790";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "beds", label: "Bakken" },
  { key: "inventory", label: "Voorraad" },
  { key: "planner", label: "Planner" },
  { key: "wishlist", label: "Wishlist" },
  { key: "settings", label: "Instellingen" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem("activeTab") as TabKey | null;
    return saved ?? "dashboard";
  });

  const [conflictCount, setConflictCount] = useState(0);
  const [hasConflicts, setHasConflicts] = useState(false);

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  // Listen for conflict updates
  useEffect(() => {
    const checkConflicts = () => {
      try {
        const conflictCountStr = localStorage.getItem("plannerConflictCount");
        const hasConflictsStr = localStorage.getItem("plannerHasConflicts");
        const count = parseInt(conflictCountStr || "0", 10);
        const hasC = hasConflictsStr === "1";
        setConflictCount(count);
        setHasConflicts(hasC);
      } catch {}
    };

    checkConflicts();
    const interval = setInterval(checkConflicts, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for planner navigation events
  useEffect(() => {
    const handlePlannerNavigation = (event: CustomEvent) => {
      const { tab } = event.detail;
      setActiveTab("planner");
      // Let PlannerPage handle the specific tab via localStorage
    };

    window.addEventListener('navigateToPlanner', handlePlannerNavigation as EventListener);
    return () => window.removeEventListener('navigateToPlanner', handlePlannerNavigation as EventListener);
  }, []);

  // Gebruik een vaste garden object met de vaste ID
  const garden = { 
    id: GARDEN_ID, 
    name: "Onze Tuin",
    join_code: "FIXED",
    created_at: new Date().toISOString()
  };

  const Content = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard garden={garden} />;
      case "beds":
        return <BedsPage garden={garden} />;
      case "inventory":
        return <InventoryPage garden={garden} />;
      case "planner":
        return <PlannerPage garden={garden} />;
      case "wishlist":
        return <WishlistPage garden={garden} />;
      case "settings":
        return <SettingsPage garden={garden} />;
      default:
        return null;
    }
  }, [activeTab]);

  return (
    <AuthGate>
      <div className="min-h-screen bg-background text-foreground">
        <TopNav />

        {/* Tabs */}
        <div className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-4">
            <nav className="flex flex-wrap gap-2">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={[
                      "px-3 py-2 text-sm rounded-t-md border-b-2 transition",
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-2">
                      {t.label}
                      {t.key === "planner" && hasConflicts && (
                        <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] bg-red-500 text-white rounded-full">
                          ⚠️
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-6">{Content}</main>
      </div>
    </AuthGate>
  );
}