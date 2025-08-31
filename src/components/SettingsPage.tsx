import { useEffect, useState } from 'react';
import type { Garden, Profile } from '../lib/types';
import { getMyProfile, updateMyProfile } from '../lib/api/profile';

type Prefs = {
  remind_sow: boolean;
  remind_plant: boolean;
  remind_harvest: boolean;
};

export function SettingsPage({ garden }: { garden: Garden }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    remind_sow: true,
    remind_plant: true,
    remind_harvest: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        if (p?.notification_prefs) {
          setPrefs({ ...prefs, ...p.notification_prefs });
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const newProfile = await updateMyProfile({
        notification_prefs: prefs,
      });
      setProfile(newProfile);
      alert('Voorkeuren opgeslagen ✅');
    } catch (e: any) {
      alert('Opslaan mislukt: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Instellingen — {garden.name}</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">Notificatie voorkeuren</h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.remind_sow}
              onChange={(e) =>
                setPrefs({ ...prefs, remind_sow: e.target.checked })
              }
            />
            Herinnering voor zaaien / voorzaaien
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.remind_plant}
              onChange={(e) =>
                setPrefs({ ...prefs, remind_plant: e.target.checked })
              }
            />
            Herinnering voor uitplanten
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.remind_harvest}
              onChange={(e) =>
                setPrefs({ ...prefs, remind_harvest: e.target.checked })
              }
            />
            Herinnering voor oogsten
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 disabled:opacity-50"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      )}
    </div>
  );
}
