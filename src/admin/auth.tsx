import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Row } from "./lib";

interface AuthState {
  loading: boolean;
  session: Session | null;
  staff: Row | null;
  permissions: Set<string>;
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Row | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setStaff(null);
        setPermissions(new Set());
        setLoading(false);
        return;
      }
      setLoading(true);
      const [{ data: s }, { data: perms }] = await Promise.all([
        supabase.from("staff").select("*").eq("id", userId).maybeSingle(),
        supabase.rpc("my_permissions"),
      ]);
      if (cancelled) return;
      setStaff(s?.active ? s : null);
      setPermissions(new Set((perms as string[] | null) ?? []));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value: AuthState = {
    loading,
    session,
    staff,
    permissions,
    can: (p) => permissions.has(p),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
