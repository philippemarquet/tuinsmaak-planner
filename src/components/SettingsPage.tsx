import { useEffect, useState } from 'react';
import type { Garden, Profile } from '../lib/types';
import { getMyProfile, updateMyProfile } from '../lib/api/profile';
import { Button } from './ui/button';
import { toast } from 'sonner';

type Prefs = {
  weekly_digest: boolean;
  digest_day: number; // 0-6, 0=zondag
  digest_time: string; // HH:MM format
};

type EmailLog = {
  id: string;
  email_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  error_message: string | null;
  tasks_count: number;
  overdue_count: number;
  sent_at: string;
};

export function SettingsPage({ garden }: { garden: Garden }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    weekly_digest: true,
    digest_day: 1, // Maandag
    digest_time: '08:00',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');
  const [testingSend, setTestingSend] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        if (p?.notification_prefs) {
          const savedPrefs = p.notification_prefs as any;
          setPrefs({
            weekly_digest: savedPrefs.weekly_digest ?? true,
            digest_day: savedPrefs.digest_day ?? 1,
            digest_time: savedPrefs.digest_time ?? '08:00',
          });
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      setLogs(data || []);
    } catch (e: any) {
      toast.error('Kon logs niet laden: ' + e.message);
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const newProfile = await updateMyProfile({
        notification_prefs: {
          ...prefs,
          email_notifications: prefs.weekly_digest, // Auto-enable als digest aan staat
        },
      });
      setProfile(newProfile);
      toast.success('Voorkeuren opgeslagen');
    } catch (e: any) {
      toast.error('Opslaan mislukt: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testSendDigest() {
    setTestingSend(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.functions.invoke('send-weekly-digest', {
        body: {},
      });
      
      if (error) throw error;
      toast.success('Test email wordt verstuurd! Check je inbox.');
      
      // Refresh logs na paar seconden
      setTimeout(() => loadLogs(), 3000);
    } catch (e: any) {
      toast.error('Kon test email niet versturen: ' + e.message);
    } finally {
      setTestingSend(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Instellingen — {garden.name}</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'settings'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Notificatie instellingen
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'logs'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Email log
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
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
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">Wekelijkse samenvatting inschakelen</div>
                    <div className="text-xs text-muted-foreground">
                      Inclusief achterstallige en aankomende acties
                    </div>
                  </div>
                </label>

                {prefs.weekly_digest && (
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

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Email verzendlog</h3>
                  <p className="text-sm text-muted-foreground">
                    Overzicht van alle verstuurde emails
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={loadLogs} 
                    disabled={logsLoading}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {logsLoading ? 'Laden...' : '🔄 Verversen'}
                  </Button>
                  <Button 
                    onClick={testSendDigest} 
                    disabled={testingSend}
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {testingSend ? 'Versturen…' : '✉️ Test email'}
                  </Button>
                </div>
              </div>

              {logsLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Logs laden...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="bg-muted/30 rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nog geen emails verstuurd
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div 
                      key={log.id}
                      className="bg-card border border-border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                              log.status === 'sent' 
                                ? 'bg-green-100 text-green-800 border border-green-200'
                                : 'bg-red-100 text-red-800 border border-red-200'
                            }`}>
                              {log.status === 'sent' ? '✓ Verstuurd' : '✗ Mislukt'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.sent_at).toLocaleString('nl-NL', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="font-medium text-sm mt-1">{log.subject}</p>
                          <p className="text-xs text-muted-foreground">Naar: {log.recipient_email}</p>
                          {log.tasks_count > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {log.overdue_count} achterstallig • {log.tasks_count - log.overdue_count} aankomend
                            </p>
                          )}
                          {log.error_message && (
                            <p className="text-xs text-red-600 mt-1">Fout: {log.error_message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
