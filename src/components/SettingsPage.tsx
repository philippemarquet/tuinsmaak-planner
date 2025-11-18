import { useEffect, useState } from 'react';
import type { Garden, Profile } from '../lib/types';
import { getMyProfile, updateMyProfile } from '../lib/api/profile';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushNotificationSubscribed } from '../lib/pushNotifications';
import { Button } from './ui/button';
import { toast } from 'sonner';

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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [checkingPush, setCheckingPush] = useState(true);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        if (p?.notification_prefs) {
          setPrefs({ ...prefs, ...p.notification_prefs });
        }
      })
      .finally(() => setLoading(false));
    
    // Check push notification status
    isPushNotificationSubscribed()
      .then(setPushEnabled)
      .finally(() => setCheckingPush(false));
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

  async function handleEnablePush() {
    try {
      await subscribeToPushNotifications();
      setPushEnabled(true);
      toast.success('Push notificaties ingeschakeld');
    } catch (e: any) {
      console.error('Push subscription error:', e);
      toast.error('Kon push notificaties niet inschakelen: ' + e.message);
    }
  }

  async function handleDisablePush() {
    try {
      await unsubscribeFromPushNotifications();
      setPushEnabled(false);
      toast.success('Push notificaties uitgeschakeld');
    } catch (e: any) {
      toast.error('Kon push notificaties niet uitschakelen: ' + e.message);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Instellingen — {garden.name}</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <div className="space-y-6">
          {/* Push Notifications */}
          <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold">Push Notificaties</h3>
            <p className="text-sm text-muted-foreground">
              Ontvang meldingen op je telefoon, zelfs als de app gesloten is.
            </p>
            
            {checkingPush ? (
              <p className="text-sm text-muted-foreground">Controleren...</p>
            ) : pushEnabled ? (
              <div className="space-y-2">
                <p className="text-sm text-green-600">✅ Push notificaties zijn ingeschakeld</p>
                <Button onClick={handleDisablePush} variant="outline" size="sm">
                  Uitschakelen
                </Button>
              </div>
            ) : (
              <Button onClick={handleEnablePush} size="sm">
                Notificaties inschakelen
              </Button>
            )}
          </div>

          {/* Notification Preferences */}
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

            <Button onClick={save} disabled={saving}>
              {saving ? 'Opslaan…' : 'Opslaan'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
