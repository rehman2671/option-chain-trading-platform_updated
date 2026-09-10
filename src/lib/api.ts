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

// In-flight GET requests promise deduplication map
const inFlightRequests = new Map<string, Promise<Response>>();

// In-memory short TTL response cache for GET requests (2 seconds)
interface CachedResponse {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  timestamp: number;
}
const responseCache = new Map<string, CachedResponse>();

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (token && !headers.has('x-auth-token')) {
    headers.set('x-auth-token', token);
  }

  // Only deduplicate and cache idempotent GET requests
  if (method === 'GET') {
    const cacheKey = `${url}::${token || 'anon'}`;
    const now = Date.now();

    const cached = responseCache.get(cacheKey);
    if (cached && (now - cached.timestamp < 2000)) {
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: new Headers(cached.headers)
      });
    }

    if (inFlightRequests.has(cacheKey)) {
      const pending = inFlightRequests.get(cacheKey)!;
      const res = await pending;
      return res.clone();
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(url, {
          ...options,
          credentials: options.credentials || 'include',
          headers
        });

        if (response.ok) {
          const clone = response.clone();
          const text = await clone.text();
          const headerEntries: [string, string][] = [];
          response.headers.forEach((val, key) => headerEntries.push([key, val]));
          responseCache.set(cacheKey, {
            body: text,
            status: response.status,
            statusText: response.statusText,
            headers: headerEntries,
            timestamp: Date.now()
          });
        }
        return response;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  return fetch(url, {
    ...options,
    credentials: options.credentials || 'include',
    headers
  });
}
