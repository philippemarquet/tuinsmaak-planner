import { useEffect, useState, useRef } from 'react';
import { signIn, signUp, signOut } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';

export function AuthGate({
  children
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Haal initiële sessie op
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Luister naar auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);
  if (!session) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm bg-card text-card-foreground border border-border rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-1">
            {mode === 'login' ? 'Inloggen' : 'Account aanmaken'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {mode === 'login' ? 'Log in met je e-mail en wachtwoord.' : 'Maak een account aan om te starten.'}
          </p>

          {error && <div className="mb-3 text-sm text-destructive">⚠ {error}</div>}

          <div className="space-y-2 mb-3">
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" type="password" placeholder="Wachtwoord" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button onClick={async () => {
          try {
            setError(null);
            setLoading(true);
            if (mode === 'login') {
              await signIn(email, password);
            } else {
              await signUp(email, password);
            }
          } catch (e: any) {
            setError(e.message ?? String(e));
          } finally {
            setLoading(false);
          }
        }} disabled={loading} className="w-full inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 transition">
            {loading ? 'Bezig…' : mode === 'login' ? 'Log in' : 'Account aanmaken'}
          </button>

          <div className="mt-3 text-xs text-muted-foreground">
            {mode === 'login' ? <>
                Nog geen account?{' '}
                <button className="text-foreground underline" onClick={() => setMode('signup')}>
                  Registreer
                </button>
              </> : <>
                Heb je al een account?{' '}
                <button className="text-foreground underline" onClick={() => setMode('login')}>
                  Log in
                </button>
              </>}
          </div>
        </div>
      </div>;
  }
  return <div>
      
      {children}
    </div>;
}