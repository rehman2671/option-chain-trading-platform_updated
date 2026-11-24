import { createHash, randomBytes } from 'node:crypto';

export interface PasswordResetDeliveryConfig {
  baseUrl: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Read configuration at request time, after dotenv/hosting secret loading.
 * No implicit mail relay, no request-derived URL, no token-bearing log fallback.
 */
export function passwordResetDeliveryConfig(env: NodeJS.ProcessEnv): PasswordResetDeliveryConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const from = (env.SMTP_FROM || env.EMAIL_FROM || user || '').trim();
  const portText = env.SMTP_PORT?.trim() || '587';
  if (!host || !user || !pass?.trim() || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) ||
      /[\s\x00-\x1f]/.test(host) || !/^\d+$/.test(portText)) return null;
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const raw = env.APP_BASE_URL?.trim() || env.APP_URL?.trim() ||
    (env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' &&
      !(env.NODE_ENV !== 'production' && url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    if (url.hostname.includes('my_app_url') || (env.NODE_ENV === 'production' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return { baseUrl: url.origin, host, port, user, pass, from };
  } catch { return null; }
}

export function hashPasswordResetToken(token: unknown): string | null {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createPasswordResetToken(): { token: string; digest: string } {
  const token = randomBytes(32).toString('hex');
  return { token, digest: hashPasswordResetToken(token)! };
}
