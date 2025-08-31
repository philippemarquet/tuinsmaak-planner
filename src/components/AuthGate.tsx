import { useEffect, useState } from 'react';
import { signIn, signUp, signOut } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: '4rem auto', padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>{mode === 'login' ? 'Inloggen' : 'Registreren'}</h2>

        {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Wachtwoord"
          style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #ddd' }}
        />

        <button
          onClick={async () => {
            try {
              setError(null);
              if (mode === 'login') {
                await signIn(email, password);
              } else {
                await signUp(email, password);
              }
            } catch (e: any) {
              setError(e.message);
            }
          }}
          style={{ padding: '10px 14px', borderRadius: 10, width: '100%' }}
        >
          {mode === 'login' ? 'Log in' : 'Account aanmaken'}
        </button>

        <div style={{ marginTop: 12, fontSize: 12 }}>
          {mode === 'login' ? (
            <>
              Nog geen account?{' '}
              <a href="#" onClick={() => setMode('signup')}>Registreer</a>
            </>
          ) : (
            <>
              Heb je al een account?{' '}
              <a href="#" onClick={() => setMode('login')}>Log in</a>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '8px 12px' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Ingelogd als {session.user?.email}
        </span>
        <button onClick={() => signOut()} style={{ padding: '6px 10px', borderRadius: 8 }}>Uitloggen</button>
      </div>
      {children}
    </div>
  );
}
