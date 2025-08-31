import { useState, useEffect } from 'react';
import { AuthGate } from './components/AuthGate';
import { Dashboard } from './components/Dashboard';
import { InventoryPage } from './components/InventoryPage';
import { BedsPage } from './components/BedsPage';
import { PlannerPage } from './components/PlannerPage';
import { SettingsPage } from './components/SettingsPage';  // 👈 nieuw
import { TopNav } from './components/TopNav';
import type { Garden } from './lib/types';
import { myGardens } from './lib/api/gardens';

export default function App() {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [page, setPage] = useState<
    'dashboard' | 'inventory' | 'beds' | 'planner' | 'settings'
  >('dashboard');

  useEffect(() => {
    myGardens()
      .then((gs) => setGarden(gs[0] ?? null))
      .catch(() => setGarden(null));
  }, []);

  return (
    <AuthGate>
      <TopNav /> {/* bovenaan altijd zichtbaar */}
      {!garden ? (
        <div className="container mx-auto max-w-5xl px-4 py-10">
          <div className="bg-card text-card-foreground border border-border rounded-xl p-6 shadow-sm">
            <p>
              Er is nog geen tuin gekoppeld aan jouw account. Voeg jezelf toe in{' '}
              <code>garden_users</code> of vraag de beheerder.
            </p>
          </div>
        </div>
      ) : (
        <div className="container mx-auto max-w-5xl px-4 py-6">
          {/* Navigatie tabs */}
          <nav className="flex gap-2 border-b border-border mb-6">
            {(
              ['dashboard', 'inventory', 'beds', 'planner', 'settings'] as const
            ).map((key) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                className={`px-3 py-2 rounded-t-md text-sm
                  ${
                    page === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }
                `}
              >
                {key === 'dashboard'
                  ? 'Dashboard'
                  : key === 'inventory'
                  ? 'Voorraad'
                  : key === 'beds'
                  ? 'Bakken'
                  : key === 'planner'
                  ? 'Planner'
                  : 'Instellingen'}
              </button>
            ))}
          </nav>

          {/* Content per pagina */}
          {page === 'dashboard' && <Dashboard garden={garden} />}
          {page === 'inventory' && <InventoryPage garden={garden} />}
          {page === 'beds' && <BedsPage garden={garden} />}
          {page === 'planner' && <PlannerPage garden={garden} />}
          {page === 'settings' && <SettingsPage garden={garden} />}
        </div>
      )}
    </AuthGate>
  );
}
