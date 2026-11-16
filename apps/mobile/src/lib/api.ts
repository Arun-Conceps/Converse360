import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL (see .env.example)');

/**
 * The workspace the NEXT request is for. A selection, not a credential: the
 * API matches it against account_members (see apps/api auth/active-workspace.ts).
 * Set by AuthProvider; never read from anywhere user-editable.
 */
let activeWorkspaceId: string | null = null;
export const setApiWorkspace = (id: string | null) => {
  activeWorkspaceId = id;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Not signed in');

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(activeWorkspaceId ? { 'x-workspace-id': activeWorkspaceId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof json?.error === 'string' ? json.error : json?.error?.code;
    const message = json?.message ?? (typeof json?.error === 'string' ? json.error : null) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, code);
  }
  return json as T;
}
