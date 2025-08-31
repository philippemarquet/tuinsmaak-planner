import { useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { GardenSetup } from './components/GardenSetup';
import { Dashboard } from './components/Dashboard';
import { InventoryPage } from './components/InventoryPage';
import { BedsPage } from './components/BedsPage';
import { PlannerPage } from './components/PlannerPage';
import type { Garden } from './lib/types';

export default function App() {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [page, setPage] = useState<'dashboard' | 'inventory' | 'beds' | 'planner'>('dashboard');

  if (!garden) {
    return (
      <AuthGate>
        <GardenSetup onSelected={(g) => setGarden(g)} />
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        <nav style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setPage('dashboard')} style={{ padding: '6px 10px', borderRadius: 8 }}>
            Dashboard
          </button>
          <button onClick={() => setPage('inventory')} style={{ padding: '6px 10px', borderRadius: 8 }}>
            Voorraad
          </button>
          <button onClick={() => setPage('beds')} style={{ padding: '6px 10px', borderRadius: 8 }}>
            Bakken
          </button>
          <button onClick={() => setPage('planner')} style={{ padding: '6px 10px', borderRadius: 8 }}>
            Planner
          </button>
        </nav>

        {page === 'dashboard' && <Dashboard garden={garden} />}
        {page === 'inventory' && <InventoryPage garden={garden} />}
        {page === 'beds' && <BedsPage garden={garden} />}
        {page === 'planner' && <PlannerPage garden={garden} />}
      </div>
    </AuthGate>
  );
}
