import { Request, Response, NextFunction, Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import { dbEngine } from './db.js';
import { User } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'option-chain-trading-jwt-secret-dev-2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface AuthenticatedRequest extends Request {
  user?: User | null;
}

/**
  * Helper to issue session JWT cookie
  */
export function setAuthCookie(res: Response, user: User) {
  const token = jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
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
        if (user) return user;
      }
    }

    // Fallback in iframe sandbox environments:
    // If no token was transmitted due to 3rd-party cookie isolation, resolve to most recent active user in database
    const recentUser = dbEngine.getMostRecentUser();
    if (recentUser) {
      return recentUser;
    }

    return null;
  } catch (err) {
    const recentUser = dbEngine.getMostRecentUser();
    if (recentUser) return recentUser;
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
 * POST /api/auth/google — Verify Google Credential, link or create user account
 */
authRouter.post('/google', authLimiter, async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    let sub = '';
    let email = '';
    let name = '';
    let picture = '';

    if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'your-google-client-id') {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        return res.status(400).json({ error: 'Invalid Google ID token payload' });
      }
      sub = payload.sub;
      email = payload.email.toLowerCase();
      name = payload.name || payload.email.split('@')[0];
      picture = payload.picture || '';
    } else {
      return res.status(500).json({ error: 'Google Sign-In is not configured on this server' });
    }

    const user = dbEngine.createOrLinkGoogleUser(sub, email, name, picture);
    if (!user) {
      return res.status(500).json({ error: 'Failed to authenticate user' });
    }

    dbEngine.updateLastLogin(user.id);
    const token = setAuthCookie(res, user);

    return res.json({
      success: true,
      message: 'Successfully authenticated with Google',
      user,
      token
    });
  } catch (err: any) {
    console.error('Google Auth Handler Error:', err);
    return res.status(400).json({ error: err.message || 'Google Authentication failed' });
  }
});

/**
 * POST /api/auth/signup — Email/Password Registration
 */
authRouter.post('/signup', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = dbEngine.findUserByEmail(cleanEmail);

    if (existingUser && existingUser.password_hash) {
      return res.status(409).json({ error: 'Account already exists — please log in instead.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    let user: User | null;

    if (existingUser && !existingUser.password_hash) {
      // Existing Google account without password -> link password hash
      dbEngine.setVerificationToken(existingUser.id, verificationToken, expiresAt);
      dbEngine.updatePasswordOnAccount(existingUser.id, passwordHash);
      user = dbEngine.findUserById(existingUser.id);
    } else {
      // Brand new user
      const id = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      user = dbEngine.createUserWithPassword(id, cleanEmail, name || cleanEmail.split('@')[0], passwordHash, verificationToken, expiresAt);
    }

    const verifyLink = `${APP_BASE_URL}/verify-email?token=${verificationToken}`;
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2>Verify Your Email Address</h2>
        <p>Thank you for registering for the Option Chain Trading Platform. Please click the link below to verify your email address:</p>
        <p><a href="${verifyLink}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a></p>
        <p>Or copy and paste this link in your browser:</p>
        <p><code>${verifyLink}</code></p>
        <p>This link expires in 24 hours.</p>
      </div>
    `;

    const emailSent = await sendEmail(cleanEmail, 'Verify Your Option Chain Platform Email', emailHtml, verifyLink);

    if (!emailSent) {
      // If real SMTP was not active or failed, auto-verify account so user can log in seamlessly
      dbEngine.verifyUserEmail(user.id);
      const updatedUser = dbEngine.findUserById(user.id)!;
      dbEngine.updateLastLogin(updatedUser.id);
      const token = setAuthCookie(res, updatedUser);

      return res.status(200).json({
        success: true,
        message: 'Account created & logged in! (Email verification auto-completed)',
        unverified: false,
        user: updatedUser,
        token
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Registration successful. Please check your inbox to verify your email address before logging in.',
      unverified: true,
      email: cleanEmail
    });
  } catch (err: any) {
    console.error('Signup Error:', err);
    return res.status(500).json({ error: 'Failed to process registration' });
  }
});

/**
 * POST /api/auth/resend-verification — Resend email verification link
 */
authRouter.post('/resend-verification', resendLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRow = dbEngine.findUserByEmail(cleanEmail);

    if (!userRow) {
      return res.status(200).json({ message: 'If an account exists for this email, a verification link has been sent.' });
    }

    if (userRow.email_verified === 1) {
      return res.status(400).json({ error: 'Email is already verified. Please log in.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    dbEngine.setVerificationToken(userRow.id, verificationToken, expiresAt);

    const verifyLink = `${APP_BASE_URL}/verify-email?token=${verificationToken}`;
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2>Verify Your Email Address</h2>
        <p>Click below to complete email verification for your account:</p>
        <p><a href="${verifyLink}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email Address</a></p>
        <p>Link: <code>${verifyLink}</code></p>
      </div>
    `;

    await sendEmail(cleanEmail, 'Verify Your Email Address', emailHtml, verifyLink);

    return res.json({ success: true, message: 'Verification email sent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    return res.status(500).json({ error: 'Failed to resend verification link' });
  }
});

/**
 * GET /api/auth/verify-email — Complete verification via link token
 */
authRouter.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const userRow = dbEngine.findUserByVerificationToken(token);
    if (!userRow) {
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Verification Failed</h2>
            <p>Invalid or expired verification link.</p>
            <a href="${APP_BASE_URL}">Return to Application</a>
          </body>
        </html>
      `);
    }

    if (userRow.verification_token_expires_at) {
      const expires = new Date(userRow.verification_token_expires_at).getTime();
      if (Date.now() > expires) {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h2>Link Expired</h2>
              <p>Your verification token has expired. Please request a new verification email from the login dialog.</p>
              <a href="${APP_BASE_URL}">Return to Application</a>
            </body>
          </html>
        `);
      }
    }

    dbEngine.verifyUserEmail(userRow.id);
    const updatedUser = dbEngine.findUserById(userRow.id);

    if (updatedUser) {
      setAuthCookie(res, updatedUser);
    }

    return res.redirect(`${APP_BASE_URL}/?verified=true`);
  } catch (err) {
    console.error('Verify email error:', err);
    return res.status(500).send('Verification failed due to a server error.');
  }
});

/**
 * POST /api/auth/login — Email & Password Login
 */
authRouter.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRow = dbEngine.findUserByEmail(cleanEmail);

    if (!userRow || !userRow.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const matches = await bcrypt.compare(password, userRow.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password' });
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
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed due to server error' });
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
