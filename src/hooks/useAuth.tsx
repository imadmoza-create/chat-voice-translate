import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      authEventReceived = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active || authEventReceived) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (active && !authEventReceived) setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
