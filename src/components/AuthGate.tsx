import { useEffect, useState } from 'react';
import { signInWithEmail, signOut } from '../lib/auth';
import { supabase } from '../lib/supabaseClient';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    // Initial session load
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Subscribe to auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div style={{ maxWidth: 460, margin: '4rem auto', padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Log in met e-mail</h2>
        <p>We sturen je een <em>magic link</em>.</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jij@example.com"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <div style={{ marginTop: 12 }}>
          <button
            onClick={async () => {
              if (!email) return alert('Vul je e-mail in');
              await signInWithEmail(email);
              alert('Check je e-mail voor de login link.');
            }}
            style={{ padding: '10px 14px', borderRadius: 10 }}
          >
            Stuur magic link
          </button>
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
