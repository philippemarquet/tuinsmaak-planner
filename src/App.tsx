import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { TopNav } from "./components/TopNav";
import { useIsMobile } from "./hooks/use-mobile";

import { Dashboard } from "./components/Dashboard";
import { BedsPage } from "./components/BedsPage";
import { InventoryPage } from "./components/InventoryPage";
import { PlannerPage } from "./components/PlannerPage";
import { SettingsPage } from "./components/SettingsPage";
import { WishlistPage } from "./components/WishlistPage";
import { AuditPage } from "./components/AuditPage";
import { AuthGate } from "./components/AuthGate";

import { listBeds } from "./lib/api/beds";
import { listSeeds } from "./lib/api/seeds";
import { listPlantings } from "./lib/api/plantings";
import { listTasks } from "./lib/api/tasks";
import { listCropTypes } from "./lib/api/cropTypes";
import { listWishlist, type WishlistItem } from "./lib/api/wishlist";
import { getMyProfile } from "./lib/api/profile";
import { listGardenTasks } from "./lib/api/gardenTasks";
import type { GardenBed, Seed, Planting, Task, CropType, Profile, GardenTask } from "./lib/types";

type TabKey = "dashboard" | "beds" | "inventory" | "planner" | "wishlist" | "audit" | "settings";

// Gebruik een vaste garden ID - iedereen heeft toegang tot dezelfde tuin
const GARDEN_ID = "c2ebf1fb-5aa9-4eac-87a8-099e9cea8790";

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "beds", label: "Bakken" },
  { key: "inventory", label: "Voorraad" },
  { key: "planner", label: "Planner" },
  { key: "wishlist", label: "Wishlist" },
  { key: "audit", label: "Audit" },
  { key: "settings", label: "Instellingen" },
];

export default function App() {
  const isMobile = useIsMobile();
  
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem("activeTab") as TabKey | null;
    return saved ?? "dashboard";
  });

  const [conflictCount, setConflictCount] = useState(0);
  const [hasConflicts, setHasConflicts] = useState(false);

  // Centrale data state
  const [beds, setBeds] = useState<GardenBed[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cropTypes, setCropTypes] = useState<CropType[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gardenTasks, setGardenTasks] = useState<GardenTask[]>([]);

  // Laad alle data bij opstarten
  useEffect(() => {
    Promise.all([
      listBeds(GARDEN_ID),
      listSeeds(GARDEN_ID),
      listPlantings(GARDEN_ID),
      listTasks(GARDEN_ID),
      listCropTypes(),
      listWishlist(GARDEN_ID),
      getMyProfile(),
      listGardenTasks(GARDEN_ID),
    ])
      .then(([b, s, p, t, ct, w, prof, gt]) => {
        setBeds(b);
        setSeeds(s);
        setPlantings(p);
        setTasks(t);
        setCropTypes(ct);
        setWishlistItems(w);
        setProfile(prof);
        setGardenTasks(gt);
      })
      .catch((err) => console.error('App data load error:', err));
  }, []);

  // Centrale reload functie
  const reloadAll = async () => {
    try {
      const [b, s, p, t, ct, w, prof, gt] = await Promise.all([
        listBeds(GARDEN_ID),
        listSeeds(GARDEN_ID),
        listPlantings(GARDEN_ID),
        listTasks(GARDEN_ID),
        listCropTypes(),
        listWishlist(GARDEN_ID),
        getMyProfile(),
        listGardenTasks(GARDEN_ID),
      ]);
      setBeds(b);
      setSeeds(s);
      setPlantings(p);
      setTasks(t);
      setCropTypes(ct);
      setWishlistItems(w);
      setProfile(prof);
      setGardenTasks(gt);
    } catch (err) {
      console.error('Reload error:', err);
    }
  };

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
        return <Dashboard garden={garden} beds={beds} seeds={seeds} plantings={plantings} tasks={tasks} gardenTasks={gardenTasks} onDataChange={reloadAll} />;
      case "beds":
        return <BedsPage garden={garden} beds={beds} onDataChange={reloadAll} />;
      case "inventory":
        return <InventoryPage garden={garden} seeds={seeds} cropTypes={cropTypes} onDataChange={reloadAll} />;
      case "planner":
        return <PlannerPage garden={garden} beds={beds} seeds={seeds} plantings={plantings} cropTypes={cropTypes} onDataChange={reloadAll} />;
      case "wishlist":
        return <WishlistPage garden={garden} wishlistItems={wishlistItems} onDataChange={reloadAll} />;
      case "audit":
        return <AuditPage garden={garden} beds={beds} seeds={seeds} plantings={plantings} tasks={tasks} gardenTasks={gardenTasks} onDataChange={reloadAll} />;
      case "settings":
        return <SettingsPage garden={garden} profile={profile} onDataChange={reloadAll} />;
      default:
        return null;
    }
  }, [activeTab, beds, seeds, plantings, tasks, cropTypes, gardenTasks, wishlistItems, profile]);

  return (
    <AuthGate>
      <div className="min-h-screen bg-background text-foreground">
        <TopNav />

        {/* Tabs */}
        <div className="border-b border-border bg-card">
          <div className="max-w-6xl mx-auto px-4">
            <nav className="flex flex-wrap gap-2">
              {TABS.filter(t => !isMobile || t.key === 'dashboard').map((t) => {
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
                    <span className="flex items-center gap-2 relative">
                      {t.label}
                      {t.key === "planner" && hasConflicts && (
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-yellow-500 rounded-full">
                          <AlertTriangle className="w-3 h-3 text-white" />
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