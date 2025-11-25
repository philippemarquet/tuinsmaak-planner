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

type EmailTemplate = {
  header: string;
  greeting: string;
  intro: string;
  overdueHeader: string;
  overdueSubtext: string;
  upcomingHeader: string;
  upcomingSubtext: string;
  noTasksMessage: string;
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
  const [template, setTemplate] = useState<EmailTemplate>({
    header: '🌱 Wekelijkse Tuinagenda',
    greeting: 'Hallo {naam},',
    intro: 'Hier is je overzicht voor de komende week:',
    overdueHeader: '⚠️ Achterstallige acties',
    overdueSubtext: 'Deze acties hadden al gedaan moeten zijn:',
    upcomingHeader: '📅 Aankomende acties',
    upcomingSubtext: 'Deze acties staan gepland voor de komende 7 dagen:',
    noTasksMessage: '✨ Je hebt geen openstaande taken! Geniet van je tuin.',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'logs' | 'template'>('settings');
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
          if (savedPrefs.email_template) {
            setTemplate({
              header: savedPrefs.email_template.header ?? '🌱 Wekelijkse Tuinagenda',
              greeting: savedPrefs.email_template.greeting ?? 'Hallo {naam},',
              intro: savedPrefs.email_template.intro ?? 'Hier is je overzicht voor de komende week:',
              overdueHeader: savedPrefs.email_template.overdueHeader ?? '⚠️ Achterstallige acties',
              overdueSubtext: savedPrefs.email_template.overdueSubtext ?? 'Deze acties hadden al gedaan moeten zijn:',
              upcomingHeader: savedPrefs.email_template.upcomingHeader ?? '📅 Aankomende acties',
              upcomingSubtext: savedPrefs.email_template.upcomingSubtext ?? 'Deze acties staan gepland voor de komende 7 dagen:',
              noTasksMessage: savedPrefs.email_template.noTasksMessage ?? '✨ Je hebt geen openstaande taken! Geniet van je tuin.',
            });
          }
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
          email_template: activeTab === 'template' ? template : undefined,
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
        body: { forceTest: true },
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
            <button
              onClick={() => setActiveTab('template')}
              className={`px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'template'
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Email template
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

          {activeTab === 'template' && (
            <div className="space-y-4">
              <div className="bg-card text-card-foreground border border-border rounded-xl p-4 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Email template aanpassen</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Pas de teksten van je wekelijkse digest email aan. Gebruik {'{naam}'} om de naam van de gebruiker in te voegen.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Header titel</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.header}
                      onChange={(e) => setTemplate({ ...template, header: e.target.value })}
                      placeholder="Bijv. 🌱 Wekelijkse Tuinagenda"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Begroeting</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.greeting}
                      onChange={(e) => setTemplate({ ...template, greeting: e.target.value })}
                      placeholder="Bijv. Hallo {naam},"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Intro tekst</label>
                    <textarea 
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      rows={2}
                      value={template.intro}
                      onChange={(e) => setTemplate({ ...template, intro: e.target.value })}
                      placeholder="Intro tekst voor de email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Achterstallige acties - Koptekst</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.overdueHeader}
                      onChange={(e) => setTemplate({ ...template, overdueHeader: e.target.value })}
                      placeholder="Koptekst voor achterstallige taken"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Achterstallige acties - Subtekst</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.overdueSubtext}
                      onChange={(e) => setTemplate({ ...template, overdueSubtext: e.target.value })}
                      placeholder="Subtekst voor achterstallige taken"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Aankomende acties - Koptekst</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.upcomingHeader}
                      onChange={(e) => setTemplate({ ...template, upcomingHeader: e.target.value })}
                      placeholder="Koptekst voor aankomende taken"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Aankomende acties - Subtekst</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.upcomingSubtext}
                      onChange={(e) => setTemplate({ ...template, upcomingSubtext: e.target.value })}
                      placeholder="Subtekst voor aankomende taken"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Geen taken bericht</label>
                    <input 
                      type="text"
                      className="w-full p-2 border border-border rounded-lg bg-background"
                      value={template.noTasksMessage}
                      onChange={(e) => setTemplate({ ...template, noTasksMessage: e.target.value })}
                      placeholder="Tekst wanneer er geen taken zijn"
                    />
                  </div>

                  <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Tip:</p>
                    <p>Gebruik {'{naam}'} om de naam van de ontvanger dynamisch in te voegen in de tekst.</p>
                  </div>

                  <Button onClick={save} disabled={saving} className="w-full">
                    {saving ? 'Opslaan…' : 'Template opslaan'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
