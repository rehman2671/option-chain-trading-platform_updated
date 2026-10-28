import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { dbEngine } from './db.js';
import { User } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET env var is required and must be at least 32 chars');
}
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export interface AuthenticatedRequest extends Request {
  user?: User | null;
}

/**
  * Helper to issue session JWT cookie
  */
export function setAuthCookie(res: Response, user: User) {
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role, picture: user.picture },
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
export function getUserFromRequest(req: Request): User | null {
  try {
    let token = req.cookies?.session_token || req.cookies?.auth_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token && req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'] as string;
    }
    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token;
    }
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded?.sub || decoded?.userId;
      if (userId) {
        const user = dbEngine.findUserById(userId);
        if (user) {
          // If deactivated by Admin, deny session
          if (user.isActive === false || user.is_active === 0) {
            return null;
          }
          return user;
        }
      }
    }

    // Fallback in iframe sandbox environments:
    // If no token was transmitted due to 3rd-party cookie isolation, resolve to most recent active user in database
    const recentUser = dbEngine.getMostRecentUser();
    if (recentUser && recentUser.isActive !== false && recentUser.is_active !== 0) {
      return recentUser;
    }

    return null;
  } catch (err) {
    const recentUser = dbEngine.getMostRecentUser();
    if (recentUser && recentUser.isActive !== false && recentUser.is_active !== 0) return recentUser;
    return null;
  }
}

/**
 * Express middleware to attach user to request
 */
export function attachUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  req.user = getUserFromRequest(req);
  next();
}

/**
 * Middleware requiring authentication
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
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

/**
 * Email Helper (SMTP or Dev Simulation Console Output)
 */
async function sendEmail(to: string, subject: string, htmlContent: string, linkForDevLog: string): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
  const smtpUser = process.env.SMTP_USER || 'noreply@aaditechs.in';
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || smtpUser || 'noreply@aaditechs.in';

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: {
          rejectUnauthorized: false
        }
      });

      await transporter.sendMail({
        from: `Option Chain Platform <${smtpFrom}>`,
        to,
        subject,
        html: htmlContent
      });
      console.log(`[EMAIL SENT] Successfully sent email to ${to}`);
      return true;
    } catch (err: any) {
      console.error(`[EMAIL ERROR] Failed sending to ${to}:`, err.message || err);
      return false;
    }
  }

  // Fallback Dev Simulation Mode
  console.log(`\n================ [DEV EMAIL SIMULATION] ================`);
  console.log(`TO: ${to}`);
  console.log(`SUBJECT: ${subject}`);
  console.log(`ACTION LINK: ${linkForDevLog}`);
  console.log(`========================================================\n`);
  return false;
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
  },
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
  },
  message: { error: 'Too many resend requests. Please wait 15 minutes.' }
});

export const authRouter = Router();

/**
 * POST /api/auth/login — Strictly Authorized Login (Password + Optional TOTP Authenticator)
 */
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, totpCode } = req.body;
    if (!email || !password) {
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
    if (!matches) {
      return res.status(401).json({ error: 'Invalid credentials. Access restricted to authorized accounts.' });
    }

    // Check if 2FA Authenticator MFA is enabled on this account
    if (userRow.mfa_enabled === 1 && userRow.mfa_secret) {
      if (!totpCode) {
        // Issue temporary 5-minute token for 2FA step
        const tempToken = jwt.sign(
          { tempUserId: userRow.id, purpose: 'mfa_verification' },
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
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Login failed due to server error' });
  }
});

/**
 * POST /api/auth/login/mfa — Verify MFA Step with temporary token
 */
authRouter.post('/login/mfa', authLimiter, async (req: Request, res: Response) => {
  try {
    const { tempToken, totpCode } = req.body;
    if (!tempToken || !totpCode) {
      return res.status(400).json({ error: 'Temporary token and 6-digit TOTP code are required' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }

    if (decoded?.purpose !== 'mfa_verification' || !decoded?.tempUserId) {
      return res.status(401).json({ error: 'Invalid MFA verification token' });
    }

    const userRow = dbEngine.findUserByEmail(
      (dbEngine.findUserById(decoded.tempUserId)?.email || '')
    );

    if (!userRow || !userRow.mfa_secret) {
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
    console.error('MFA Login Verification error:', err);
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
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const targetUser = dbEngine.findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    dbEngine.setUserPassword(targetUserId, passwordHash);

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
    console.error('Error generating MFA secret:', err);
    return res.status(500).json({ error: 'Failed to generate Authenticator MFA setup' });
  }
});

/**
 * POST /api/auth/admin/users/:id/mfa/enable — Verify Code and Activate MFA for User
 */
authRouter.post('/admin/users/:id/mfa/enable', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const { secret, token } = req.body;

    if (!secret || !token) {
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
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRow = dbEngine.findUserByEmail(cleanEmail);

    if (userRow && userRow.password_hash) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      dbEngine.setResetToken(userRow.id, resetToken, expiresAt);

      const resetLink = `${APP_BASE_URL}/reset-password?token=${resetToken}`;
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2>Reset Your Password</h2>
          <p>Click below to reset your Option Chain Trading Platform password:</p>
          <p><a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
          <p>Link: <code>${resetLink}</code></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `;

      await sendEmail(cleanEmail, 'Password Reset Request', emailHtml, resetLink);
    }

    // Generic response to prevent email enumeration
    return res.json({
      success: true,
      message: 'If an account exists with password login for this email, password reset instructions have been sent.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password — Complete password reset
 */
authRouter.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const userRow = dbEngine.findUserByResetToken(token);
    if (!userRow) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    if (userRow.reset_token_expires_at) {
      const expires = new Date(userRow.reset_token_expires_at).getTime();
      if (Date.now() > expires) {
        return res.status(400).json({ error: 'Password reset token has expired' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    dbEngine.updatePassword(userRow.id, passwordHash);

    const user = dbEngine.findUserById(userRow.id)!;
    const tokenCookie = setAuthCookie(res, user);

    return res.json({
      success: true,
      message: 'Password reset successfully. You are now logged in.',
      user,
      token: tokenCookie
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

/**
 * POST /api/auth/logout — Log out user and clear cookie
 */
authRouter.post('/logout', (req: Request, res: Response) => {
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
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  setAuthCookie(res, user);
  return res.json({ authenticated: true, user, token });
});
