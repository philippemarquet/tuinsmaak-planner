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

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

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
                    {t.label}
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
