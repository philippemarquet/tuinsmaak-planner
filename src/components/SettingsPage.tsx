import { useEffect, useState } from 'react';
import type { Garden, Profile } from '../lib/types';
import { getMyProfile, updateMyProfile } from '../lib/api/profile';
import { Button } from './ui/button';
import { toast } from 'sonner';

type Prefs = {
  email_notifications: boolean;
  remind_sow: boolean;
  remind_plant: boolean;
  remind_harvest: boolean;
  conflict_alerts: boolean;
  daily_digest: boolean;
};

export function SettingsPage({ garden }: { garden: Garden }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    email_notifications: true,
    remind_sow: true,
    remind_plant: true,
    remind_harvest: true,
    conflict_alerts: true,
    daily_digest: false,
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
      toast.success('Voorkeuren opgeslagen');
    } catch (e: any) {
      toast.error('Opslaan mislukt: ' + e.message);
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
        <div className="space-y-6">
          {/* Email Notifications */}
          <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Email Notificaties</h3>
              <p className="text-sm text-muted-foreground">
                Ontvang herinneringen en updates per email.
              </p>
            </div>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <input
                type="checkbox"
                checked={prefs.email_notifications}
                onChange={(e) =>
                  setPrefs({ ...prefs, email_notifications: e.target.checked })
                }
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Email notificaties inschakelen</div>
                <div className="text-xs text-muted-foreground">
                  Schakel alle email notificaties in of uit
                </div>
              </div>
            </label>
          </div>

          {/* Notification Preferences */}
          <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold">Notificatie voorkeuren</h3>
            <p className="text-sm text-muted-foreground">
              Kies voor welke acties je herinneringen wilt ontvangen.
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={prefs.remind_sow}
                  onChange={(e) =>
                    setPrefs({ ...prefs, remind_sow: e.target.checked })
                  }
                  disabled={!prefs.email_notifications}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Zaaien / Voorzaaien</div>
                  <div className="text-xs text-muted-foreground">
                    Herinnering wanneer het tijd is om te zaaien
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={prefs.remind_plant}
                  onChange={(e) =>
                    setPrefs({ ...prefs, remind_plant: e.target.checked })
                  }
                  disabled={!prefs.email_notifications}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Uitplanten</div>
                  <div className="text-xs text-muted-foreground">
                    Herinnering wanneer je moet uitplanten
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={prefs.remind_harvest}
                  onChange={(e) =>
                    setPrefs({ ...prefs, remind_harvest: e.target.checked })
                  }
                  disabled={!prefs.email_notifications}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Oogsten</div>
                  <div className="text-xs text-muted-foreground">
                    Herinnering voor oogstmomenten
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={prefs.conflict_alerts}
                  onChange={(e) =>
                    setPrefs({ ...prefs, conflict_alerts: e.target.checked })
                  }
                  disabled={!prefs.email_notifications}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Conflict waarschuwingen</div>
                  <div className="text-xs text-muted-foreground">
                    Melding bij planning conflicten
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                <input
                  type="checkbox"
                  checked={prefs.daily_digest}
                  onChange={(e) =>
                    setPrefs({ ...prefs, daily_digest: e.target.checked })
                  }
                  disabled={!prefs.email_notifications}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">Dagelijkse samenvatting</div>
                  <div className="text-xs text-muted-foreground">
                    Ontvang elke ochtend een overzicht van je taken
                  </div>
                </div>
              </label>
            </div>

            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? 'Opslaan…' : 'Voorkeuren opslaan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
