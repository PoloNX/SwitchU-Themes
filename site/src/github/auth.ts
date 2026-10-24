export interface AuthUser {
  login: string;
  name: string;
  avatarUrl: string;
}

export interface AuthCompletion {
  user: AuthUser | null;
  error: string | null;
}

const SESSION_STORAGE_KEY = 'switchu-themes-session';

function proxyBaseUrl(): string {
  const apiBase = import.meta.env.VITE_PR_PROXY_URL?.trim();
  if (!apiBase) {
    throw new Error('Missing VITE_PR_PROXY_URL. Configure the PR proxy before signing in.');
  }
  return apiBase.replace(/\/$/, '');
}

export function storedSessionToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionToken(token: string): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, token);
}

export function clearSessionToken(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function authHeaders(): HeadersInit {
  const token = storedSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function beginGitHubLogin(): Promise<void> {
  const base = proxyBaseUrl();
  const response = await fetch(`${base}/api/auth`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load OAuth config (${response.status}).`);
  }

  const { clientId } = await response.json() as { clientId?: string };
  if (!clientId) {
    throw new Error('GitHub OAuth is not configured on the proxy.');
  }

  const site = `${window.location.origin}${window.location.pathname}`;
  const state = encodeURIComponent(JSON.stringify({ site }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/auth/callback`,
    scope: 'read:user',
    state,
  });

  window.location.assign(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = storedSessionToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${proxyBaseUrl()}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      clearSessionToken();
      return null;
    }
    const { user } = await response.json() as { user: AuthUser };
    return user;
  } catch {
    return null;
  }
}

export async function completeAuthFromUrl(): Promise<AuthCompletion> {
  const url = new URL(window.location.href);
  const session = url.searchParams.get('session');
  const authError = url.searchParams.get('auth_error');

  if (!session && !authError) {
    return { user: null, error: null };
  }

  url.searchParams.delete('session');
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.toString());

  if (authError) {
    clearSessionToken();
    return { user: null, error: decodeURIComponent(authError) };
  }

  if (session) {
    storeSessionToken(session);
    return { user: await fetchCurrentUser(), error: null };
  }

  return { user: null, error: null };
}
