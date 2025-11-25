import { useEffect, useState } from 'react';
import type { Garden, Profile } from '../lib/types';
import { getMyProfile, updateMyProfile } from '../lib/api/profile';
import { Button } from './ui/button';
import { toast } from 'sonner';

type Prefs = {
  email_notifications: boolean;
  weekly_digest: boolean;
  digest_day: number; // 0-6, 0=zondag
  digest_time: string; // HH:MM format
};

export function SettingsPage({ garden }: { garden: Garden }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    email_notifications: true,
    weekly_digest: true,
    digest_day: 1, // Maandag
    digest_time: '08:00',
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

          {/* Weekly Digest */}
          <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Wekelijkse samenvatting</h3>
              <p className="text-sm text-muted-foreground">
                Ontvang één keer per week een overzicht van al je tuintaken.
              </p>
            </div>

            <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <input
                type="checkbox"
                checked={prefs.weekly_digest}
                onChange={(e) =>
                  setPrefs({ ...prefs, weekly_digest: e.target.checked })
                }
                disabled={!prefs.email_notifications}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Wekelijkse samenvatting inschakelen</div>
                <div className="text-xs text-muted-foreground">
                  Inclusief achterstallige en aankomende acties
                </div>
              </div>
            </label>

            {prefs.weekly_digest && prefs.email_notifications && (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-sm font-medium mb-2">Dag van de week</label>
                  <select
                    value={prefs.digest_day}
                    onChange={(e) =>
                      setPrefs({ ...prefs, digest_day: parseInt(e.target.value) })
                    }
                    className="w-full p-2 border border-border rounded-lg bg-background"
                  >
                    <option value="0">Zondag</option>
                    <option value="1">Maandag</option>
                    <option value="2">Dinsdag</option>
                    <option value="3">Woensdag</option>
                    <option value="4">Donderdag</option>
                    <option value="5">Vrijdag</option>
                    <option value="6">Zaterdag</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Tijdstip</label>
                  <input
                    type="time"
                    value={prefs.digest_time}
                    onChange={(e) =>
                      setPrefs({ ...prefs, digest_time: e.target.value })
                    }
                    className="w-full p-2 border border-border rounded-lg bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    De mail wordt verstuurd op het gekozen tijdstip
                  </p>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-2">
                  <p className="font-medium">De wekelijkse mail bevat:</p>
                  <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
                    <li>Achterstallige acties die je nog moet doen</li>
                    <li>Alle acties voor de komende 7 dagen</li>
                    <li>Per actie: gewas, bak, en geplande datum</li>
                  </ul>
                </div>
              </div>
            )}

            <Button onClick={save} disabled={saving} className="w-full">
              {saving ? 'Opslaan…' : 'Voorkeuren opslaan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
