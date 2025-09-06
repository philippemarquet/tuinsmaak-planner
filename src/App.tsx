import { useEffect, useMemo, useState } from "react";
import type { Garden } from "./lib/types";
import { myGardens } from "./lib/api/gardens";

import { TopNav } from "./components/TopNav";
import { GardenSetup } from "./components/GardenSetup";

import { Dashboard } from "./components/Dashboard";
import { BedsPage } from "./components/BedsPage";
import { InventoryPage } from "./components/InventoryPage";
import { PlannerPage } from "./components/PlannerPage";
import { SettingsPage } from "./components/SettingsPage";
import { WishlistPage } from "./components/WishlistPage";

type TabKey = "dashboard" | "beds" | "inventory" | "planner" | "wishlist" | "settings";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "beds", label: "Bakken" },
  { key: "inventory", label: "Voorraad" },
  { key: "planner", label: "Planner" },
  { key: "wishlist", label: "Wishlist" }, // ⬅️ nieuw tabje
  { key: "settings", label: "Instellingen" },
];

export default function App() {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [loadingGarden, setLoadingGarden] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem("activeTab") as TabKey | null;
    return saved ?? "dashboard";
  });

  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  // Probeer automatisch de (eerste) tuin te kiezen
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const gs = await myGardens();
        if (!mounted) return;
        if (gs && gs.length > 0) {
          // Als je meerdere tuinen hebt, kies eventueel degene die eerder is gebruikt
          const lastId = localStorage.getItem("selectedGardenId");
          const found = gs.find((g) => g.id === lastId) ?? gs[0];
          setGarden(found);
          localStorage.setItem("selectedGardenId", found.id);
        } else {
          setGarden(null);
        }
      } catch (e) {
        console.error(e);
        setGarden(null);
      } finally {
        if (mounted) setLoadingGarden(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function handleGardenSelected(g: Garden) {
    setGarden(g);
    localStorage.setItem("selectedGardenId", g.id);
  }

  const Content = useMemo(() => {
    if (!garden) return null;
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
        return <WishlistPage garden={garden} />; // ⬅️ nieuw
      case "settings":
        return <SettingsPage garden={garden} />;
      default:
        return null;
    }
  }, [activeTab, garden]);

  if (loadingGarden) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Laden…
      </div>
    );
  }

  // Geen tuin gekozen → setup scherm
  if (!garden) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <TopNav />
        <main className="p-4">
          <GardenSetup onSelected={handleGardenSelected} />
        </main>
      </div>
    );
  }

  return (
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
  );
}
