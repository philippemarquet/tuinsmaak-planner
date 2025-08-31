import { useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { Dashboard } from './components/Dashboard';
import { InventoryPage } from './components/InventoryPage';
import { BedsPage } from './components/BedsPage';
import { PlannerPage } from './components/PlannerPage';
import type { Garden } from './lib/types';
import { myGardens } from './lib/api/gardens';

export default function App() {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [page, setPage] = useState<'dashboard' | 'inventory' | 'beds' | 'planner'>('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const gs = await myGardens();
        if (gs.length > 0) {
          setGarden(gs[0]); // pak gewoon de eerste tuin
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AuthGate>
        <p style={{ textAlign: 'center', marginTop: '2rem' }}>Laden…</p>
      </AuthGate>
    );
  }

  if (!garden) {
    return (
      <AuthGate>
        <p style={{ textAlign: 'center', marginTop: '2rem' }}>
          Er is nog geen tuin gekoppeld aan jouw account.<br />
          Vraag de beheerder om je toe te voegen.
        </p>
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
