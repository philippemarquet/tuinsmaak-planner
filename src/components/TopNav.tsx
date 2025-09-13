import { signOut } from "../lib/auth";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function TopNav() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 shadow-sm">
      {/* Left side: logo + title */}
      <div className="flex items-center gap-2">
        {/* Je kunt dit later vervangen door een echt logo-image */}
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
          B
        </div>
        <span className="font-semibold text-lg">Bosgoedt Planner</span>
      </div>

      {/* Right side: user info + logout */}
      <div className="flex items-center gap-3">
        {email && (
          <span className="text-sm text-muted-foreground hidden sm:block">
            {email}
          </span>
        )}
        <button
          onClick={() => signOut()}
          className="inline-flex items-center rounded-md border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 text-sm"
        >
          Uitloggen
        </button>
      </div>
    </header>
  );
}
