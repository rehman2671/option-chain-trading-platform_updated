import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { dbEngine } from './db.js';
import {validEmailInput,validLoginPassword,validNewPassword,validTotp,validMfaSecret,mfaState} from './release/authInputPolicy.js';
import { User } from '../types.js';
import { createPasswordResetToken, hashPasswordResetToken, passwordResetDeliveryConfig, type PasswordResetDeliveryConfig } from './release/passwordResetSecurity.js';

const JWT_SECRET = (() => {
  const configured = process.env.JWT_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a strong secret in production');
  }
  // Development/test sessions never share a predictable hardcoded signing key.
  return crypto.randomBytes(48).toString('hex');
})();

export interface AuthenticatedRequest extends Request {
  user?: User | null;
}

/**
  * Helper to issue session JWT cookie
  */
export function setAuthCookie(res: Response, user: User) {
  const sv=dbEngine.getUserSessionVersion(user.id);
  if (sv===null) throw Error('ACTIVE_SESSION_REQUIRED');
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, picture: user.picture, purpose:'session', sv },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('session_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
  return token;
}

/**
 * Clear session cookie
 */
export function clearAuthCookie(res: Response) {
  res.cookie('session_token', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 0,
    path: '/'
  });
}

/**
 * Extract authenticated user from request cookie or header
 */
function getVerifiedSessionPrincipal(req:Request):{user:User;sessionVersion:number}|null {
  try {
    let token = req.cookies?.session_token || req.cookies?.auth_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'] as string;
    }
    // Session credentials in URLs leak through history, referrers and access logs.
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, {algorithms:['HS256']}) as any;
      const userId = decoded?.sub;
      if (typeof userId==='string' && decoded?.purpose==='session' && Number.isSafeInteger(decoded.sv) && dbEngine.getUserSessionVersion(userId)===decoded.sv) {
        const user = dbEngine.findUserById(userId);
        if (user) {
          // If deactivated by Admin, deny session
          if (user.isActive === false || user.is_active === 0) {
            return null;
          }
          return {user,sessionVersion:decoded.sv};
        }
      }
    }

    // Never impersonate the most recently authenticated user for an anonymous request.

    return null;
  } catch (err) {
    return null;
  }
}

export function getUserFromRequest(req:Request,allowFallback:boolean=false):User|null {
  return getVerifiedSessionPrincipal(req)?.user??null;
}

/**
 * Express middleware to attach user to request
 */
export function attachUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  req.user = getUserFromRequest(req, false);
  next();
}

/**
 * Middleware requiring verified authentication without fallback
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req, false);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  req.user = user;
  next();
}

export function requireStrictAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req, false);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in with valid credentials.' });
  }
  req.user = user;
  next();
}

/**
 * Middleware requiring Master Administrator role
 */
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  if (user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Access denied: Master Administrator privileges required.' });
  }
  req.user = user;
  next();
}

/** Explicit SMTP delivery only; never log recovery tokens, links, recipients or provider errors. */
async function sendResetEmail(config: PasswordResetDeliveryConfig, to: string, resetLink: string): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
    await transporter.sendMail({
      from: { name: 'Option Chain Platform', address: config.from },
      to,
      subject: 'Password Reset Request',
      text: 'Reset your password using this one-time link (expires in 1 hour):\n' + resetLink
    });
    return true;
  } catch {
    console.warn('[AUTH] Password reset email delivery failed.');
    return false;
  }
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  // Use Express's trusted-proxy IP resolution, never a raw forwarded header.
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  // Use Express's trusted-proxy IP resolution, never a raw forwarded header.
  message: { error: 'Too many resend requests. Please wait 15 minutes.' }
});

export const authRouter = Router();

/**
 * POST /api/auth/login — Strictly Authorized Login (Password + Optional TOTP Authenticator)
 */
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control','no-store');
    const { email, password, totpCode } = req.body || {};
    if (!validEmailInput(email) || !validLoginPassword(password) || (totpCode!==undefined && totpCode!=='' && !validTotp(totpCode))) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRow = dbEngine.findUserByEmail(cleanEmail);

    if (!userRow || !userRow.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials. Access restricted to authorized accounts.' });
    }

    if (userRow.is_active === 0) {
      return res.status(403).json({ error: 'Account has been disabled by Administrator. Contact Master Admin.' });
    }

    const matches = await bcrypt.compare(password, userRow.password_hash);
    if (!matches || dbEngine.getUserSessionVersion(userRow.id)!==userRow.session_version) {
      return res.status(401).json({ error: 'Invalid credentials. Access restricted to authorized accounts.' });
    }

    // Check if 2FA Authenticator MFA is enabled on this account
    const mfa=mfaState(userRow.mfa_enabled,userRow.mfa_secret);
    if(mfa==='INVALID')return res.status(403).json({error:'Account authentication configuration requires administrator review.'});
    if (mfa==='REQUIRED') {
      if (!totpCode) {
        // Issue temporary 5-minute token for 2FA step
        const tempToken = jwt.sign(
          { tempUserId: userRow.id, purpose: 'mfa_verification', sv:userRow.session_version },
          JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({
          success: true,
          mfaRequired: true,
          tempToken,
          email: userRow.email,
          message: 'Two-factor authentication required. Please enter 6-digit Authenticator code.'
        });
      }

      // Verify supplied TOTP code
      const verifyRes = verifySync({
        token: String(totpCode).trim(),
        secret: userRow.mfa_secret
      });

      if (!verifyRes || !verifyRes.valid) {
        return res.status(401).json({ error: 'Invalid 6-digit Authenticator code. Please check your app.' });
      }
    }

    if (userRow.email_verified !== 1) {
      dbEngine.verifyUserEmail(userRow.id);
    }

    const user = dbEngine.findUserById(userRow.id)!;
    dbEngine.updateLastLogin(user.id);
    const token = setAuthCookie(res, user);

    return res.json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    console.error('[AUTH] Login failed.');
    return res.status(500).json({ error: 'Login failed due to server error' });
  }
});

/**
 * POST /api/auth/login/mfa — Verify MFA Step with temporary token
 */
authRouter.post('/login/mfa', authLimiter, async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control','no-store');
    const { tempToken, totpCode } = req.body || {};
    if (typeof tempToken!=='string' || !tempToken || tempToken.length>4096 || !validTotp(totpCode)) {
      return res.status(400).json({ error: 'Temporary token and 6-digit TOTP code are required' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET, {algorithms:['HS256']});
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }

    if (decoded?.purpose !== 'mfa_verification' || !decoded?.tempUserId) {
      return res.status(401).json({ error: 'Invalid MFA verification token' });
    }

    const userRow = dbEngine.findUserByEmail(
      (dbEngine.findUserById(decoded.tempUserId)?.email || '')
    );

    if (!userRow || mfaState(userRow.mfa_enabled,userRow.mfa_secret)!=='REQUIRED' || !Number.isSafeInteger(decoded.sv) || dbEngine.getUserSessionVersion(userRow.id)!==decoded.sv) {
      return res.status(400).json({ error: 'MFA is not configured for this account' });
    }

    if (userRow.is_active === 0) {
      return res.status(403).json({ error: 'Account has been disabled by Administrator' });
    }

    const verifyRes = verifySync({
      token: String(totpCode).trim(),
      secret: userRow.mfa_secret
    });

    if (!verifyRes || !verifyRes.valid) {
      return res.status(401).json({ error: 'Invalid 6-digit code. Please check your Authenticator app.' });
    }

    const user = dbEngine.findUserById(userRow.id)!;
    dbEngine.updateLastLogin(user.id);
    const token = setAuthCookie(res, user);

    return res.json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    console.error('[AUTH] MFA login verification failed.');
    return res.status(500).json({ error: 'Failed to verify MFA token' });
  }
});

/**
 * -------------------------------------------------------------
 * MASTER ADMIN USER MANAGEMENT ENDPOINTS (SUPERADMIN ONLY)
 * -------------------------------------------------------------
 */

/**
 * GET /api/auth/admin/users — List all fixed users and their operational status
 */
authRouter.get('/admin/users', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const users = dbEngine.getAllUsers();
    return res.json({ success: true, users });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve user list' });
  }
});

/**
 * POST /api/auth/admin/users/:id/toggle-status — Enable or Disable User Account
 */
authRouter.post('/admin/users/:id/toggle-status', requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const targetUser = dbEngine.findUserById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || 'vinuparab86@gmail.com').toLowerCase();
    if (targetUser.role === 'SUPERADMIN' || targetUser.email.toLowerCase() === adminEmail || req.user?.id === targetUserId) {
      return res.status(400).json({ error: 'Cannot disable Master SuperAdmin account.' });
    }

    const currentActive = targetUser.is_active !== undefined ? targetUser.is_active !== 0 : targetUser.isActive !== false;
    const newActive = !currentActive;
    dbEngine.setUserActiveStatus(targetUserId, newActive);

    const updated = dbEngine.findUserById(targetUserId);
    if(!updated || updated.isActive!==newActive)return res.status(503).json({error:'Account status write not confirmed.'});
    return res.json({
      success: true,
      message: `User ${targetUser.email} is now ${newActive ? 'ENABLED' : 'DISABLED'}.`,
      user: updated
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle account status' });
  }
});

/**
 * POST /api/auth/admin/users/:id/reset-password — Admin Overrides Operator Password
 */
authRouter.post('/admin/users/:id/reset-password', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const { newPassword } = req.body || {};

    if (!validNewPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters and at most 72 UTF-8 bytes.' });
    }

    const targetUser = dbEngine.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    dbEngine.setUserPassword(targetUserId, passwordHash);
    const saved=dbEngine.findUserByEmail(targetUser.email);
    if(!saved || saved.id!==targetUserId || saved.password_hash!==passwordHash)return res.status(503).json({error:'Password write not confirmed.'});

    return res.json({
      success: true,
      message: `Password for ${targetUser.email} has been updated successfully.`
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reset user password' });
  }
});

/**
 * POST /api/auth/admin/users/:id/mfa/generate — Generate Base32 TOTP Secret and QR Code for Authenticator
 */
authRouter.post('/admin/users/:id/mfa/generate', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const targetUser = dbEngine.findUserById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.setHeader('Cache-Control','no-store');
    const secret = generateSecret();
    const serviceName = 'OptionPlatform';
    const otpauth = generateURI({
      issuer: serviceName,
      label: targetUser.email,
      secret
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' }
    });

    return res.json({
      success: true,
      secret,
      qrCodeDataUrl,
      otpauth,
      user: targetUser
    });
  } catch (err: any) {
    console.error('[AUTH] MFA generation failed.');
    return res.status(500).json({ error: 'Failed to generate Authenticator MFA setup' });
  }
});

/**
 * POST /api/auth/admin/users/:id/mfa/enable — Verify Code and Activate MFA for User
 */
authRouter.post('/admin/users/:id/mfa/enable', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const { secret, token } = req.body || {};

    if (!validMfaSecret(secret) || !validTotp(token)) {
      return res.status(400).json({ error: 'Secret and verification code are required' });
    }

    const targetUser = dbEngine.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const verifyRes = verifySync({
      token: String(token).trim(),
      secret: secret.trim()
    });

    if (!verifyRes || !verifyRes.valid) {
      return res.status(400).json({ error: 'Verification code is invalid. Please make sure time is synced on your phone.' });
    }

    dbEngine.setUserMfaSecret(targetUserId, secret.trim(), true);
    const saved=dbEngine.findUserByEmail(targetUser.email);
    if(!saved || saved.id!==targetUserId || saved.mfa_enabled!==1 || saved.mfa_secret!==secret.trim())return res.status(503).json({error:'MFA activation not confirmed.'});
    const updated = dbEngine.findUserById(targetUserId);

    return res.json({
      success: true,
      message: `Google Authenticator MFA successfully enabled for ${targetUser.email}`,
      user: updated
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to enable MFA' });
  }
});

/**
 * POST /api/auth/admin/users/:id/mfa/disable — Turn off MFA for User
 */
authRouter.post('/admin/users/:id/mfa/disable', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const targetUser = dbEngine.findUserById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    dbEngine.setUserMfaSecret(targetUserId, null, false);
    const saved=dbEngine.findUserByEmail(targetUser.email);
    if(!saved || saved.id!==targetUserId || saved.mfa_enabled!==0 || saved.mfa_secret!==null)return res.status(503).json({error:'MFA deactivation not confirmed.'});
    const updated = dbEngine.findUserById(targetUserId);

    return res.json({
      success: true,
      message: `MFA disabled for ${targetUser.email}`,
      user: updated
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

/**
 * POST /api/auth/forgot-password — Initiate password reset email
 */
authRouter.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.trim() || email.length > 254) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const config = passwordResetDeliveryConfig(process.env);
    const userRow = config ? dbEngine.findUserByEmail(cleanEmail) : null;

    if (config && userRow && userRow.password_hash && userRow.is_active === 1) {
      const { token, digest } = createPasswordResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      dbEngine.setResetToken(userRow.id, digest, expiresAt);
      const resetLink = new URL('/reset-password', config.baseUrl);
      resetLink.searchParams.set('token', token);

      if (!(await sendResetEmail(config, cleanEmail, resetLink.toString()))) {
        dbEngine.clearResetTokenIfMatches(userRow.id, digest);
      }
    }

    // Generic response to prevent email enumeration
    return res.json({
      success: true,
      message: 'If an eligible account exists and email delivery is configured, password reset instructions will be sent.'
    });
  } catch (err) {
    console.error('[AUTH] Password reset request failed.');
    return res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password — Complete password reset
 */
authRouter.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body || {};
    const digest = hashPasswordResetToken(token);
    if (!digest || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Invalid reset token or password' });
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and at most 72 UTF-8 bytes' });
    }

    const userRow = dbEngine.findUserByResetToken(digest);
    const expires = Date.parse(userRow?.reset_token_expires_at || '');
    if (!userRow || userRow.is_active !== 1 || !userRow.password_hash || !Number.isFinite(expires) || expires <= Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (!dbEngine.consumeResetToken(userRow.id, digest, passwordHash, new Date().toISOString())) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    // A reset link proves mailbox access, not MFA. Never issue an authenticated session here.
    clearAuthCookie(res);
    return res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });
  } catch (err) {
    console.error('[AUTH] Password reset completion failed.');
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /api/auth/logout — Log out user and clear cookie
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const user=getUserFromRequest(req);
  if (user) dbEngine.revokeUserSessions(user.id);
  clearAuthCookie(res);
  return res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me — Get active session state
 */
authRouter.get('/me', (req: Request, res: Response) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.json({ authenticated: false, user: null, token: null });
  }
  res.setHeader('Cache-Control','no-store');
  const token = setAuthCookie(res, user);
  return res.json({ authenticated: true, user, token });
});


/** Owner-only, read-only preparation recovery. No client-provided account
 * identifiers, no order calls and no release or retry actions. */
authRouter.get('/broker-preparation/recovery',async(req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');
  if(!getVerifiedSessionPrincipal(req))return res.status(401).json({error:'Authentication required.'});
  try{
    const {activeProvider}=await import('./engine/providers/index.js');
    const provider=activeProvider as unknown as {
      getLiveConnectionStatus?:()=>{isConnected:boolean;userId?:string};
      getBrokerAuthEpoch?:()=>number;
    };
    // Reverify the original session after asynchronous import.
    const principal=getVerifiedSessionPrincipal(req);
    if(!principal)return res.status(401).json({error:'Authentication required.'});
    if(typeof provider.getLiveConnectionStatus!=='function'||typeof provider.getBrokerAuthEpoch!=='function')
      return res.status(503).json({error:'Verified broker connection unavailable.'});
    const connection=provider.getLiveConnectionStatus();
    const epoch=provider.getBrokerAuthEpoch();
    if(!connection.isConnected)return res.status(503).json({error:'Verified broker connection unavailable.'});
    const result=dbEngine.inspectAuthorizedBrokerPreparation({userId:principal.user.id,sessionVersion:principal.sessionVersion},
      {isConnected:connection.isConnected,userId:connection.userId,authEpoch:epoch},Date.now());
    if(!result)return res.status(403).json({error:'Broker preparation access not established.'});
    return res.json(result);
  }catch{return res.status(503).json({error:'Broker preparation recovery unavailable.'});}
});
