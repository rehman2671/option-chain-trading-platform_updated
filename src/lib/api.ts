/**
 * Client-side API Request Helper with JWT Bearer Token Injection
 * Ensures all cross-origin, iframe, and subresource API requests carry authentication.
 */

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem('auth_token', token);
      sessionStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    }
  } catch {}
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  return headers;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (token && !headers.has('x-auth-token')) {
    headers.set('x-auth-token', token);
  }

  return fetch(url, {
    ...options,
    credentials: options.credentials || 'include',
    headers
  });
}
