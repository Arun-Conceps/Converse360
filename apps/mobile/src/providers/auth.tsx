import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setApiWorkspace } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import type { Workspace } from '@/types';

const WS_KEY = 'c360_ws';

/**
 * loading      — resolving session / workspaces
 * signedOut    — no session
 * noWorkspace  — a REAL state (removed from their only workspace), not an error
 * needsPick    — several workspaces and none chosen yet
 * ready        — `accountId` is set; account-scoped queries may run
 */
type Status = 'loading' | 'signedOut' | 'noWorkspace' | 'needsPick' | 'ready' | 'error';

interface AuthValue {
  status: Status;
  session: Session | null;
  userId: string | null;
  workspaces: Workspace[];
  /** Null until `status === 'ready'`. Gate account-scoped queries on it. */
  accountId: string | null;
  workspace: Workspace | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ activeAccountId: string | null; workspaces: Workspace[] }>('/account/workspaces');
      const stored = await AsyncStorage.getItem(`${WS_KEY}:${userId}`);
      const valid = (id: string | null | undefined) =>
        id && res.workspaces.some((w) => w.id === id) ? id : null;
      // Stored choice, else the only workspace, else ask. The server's own
      // fallback is deliberately NOT used when several exist: landing an agency
      // operator in the wrong client is how somebody broadcasts to it.
      const pick = valid(stored) ?? (res.workspaces.length === 1 ? res.workspaces[0].id : null);
      setWorkspaces(res.workspaces);
      setApiWorkspace(pick);
      setAccountId(pick);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && e.code === 'no_workspace') {
        setWorkspaces([]);
        setApiWorkspace(null);
        setAccountId(null);
      } else {
        setError(e instanceof Error ? e.message : 'Could not load workspaces');
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setWorkspaces(null);
      setAccountId(null);
      setApiWorkspace(null);
      return;
    }
    void load();
  }, [userId, load]);

  const selectWorkspace = useCallback(
    async (id: string) => {
      await api('/account/workspaces/active', { method: 'POST', body: { accountId: id } });
      await AsyncStorage.setItem(`${WS_KEY}:${userId}`, id);
      // Mobile's equivalent of the web's full page load: drop every cached query
      // so one client's data cannot render under another's name. Realtime
      // channels are torn down because the workspace-keyed screens unmount.
      qc.clear();
      setApiWorkspace(id);
      setAccountId(id);
    },
    [qc, userId],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return err ? err.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const value = useMemo<AuthValue>(() => {
    let status: Status;
    if (!sessionLoaded) status = 'loading';
    else if (!session) status = 'signedOut';
    else if (error) status = 'error';
    else if (workspaces === null) status = 'loading';
    else if (workspaces.length === 0) status = 'noWorkspace';
    else if (!accountId) status = 'needsPick';
    else status = 'ready';
    return {
      status,
      session,
      userId,
      workspaces: workspaces ?? [],
      accountId,
      workspace: workspaces?.find((w) => w.id === accountId) ?? null,
      error,
      signIn,
      signOut,
      selectWorkspace,
      refresh: load,
    };
  }, [sessionLoaded, session, userId, workspaces, accountId, error, signIn, signOut, selectWorkspace, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
