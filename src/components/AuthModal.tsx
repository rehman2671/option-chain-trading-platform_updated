import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { LogIn, UserPlus, KeyRound, Mail, AlertCircle, CheckCircle2, X, ShieldCheck } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    setAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    login,
    signup,
    googleLogin,
    resendVerification,
    forgotPassword,
    resetPassword,
    resetToken
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const rawClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || (import.meta as any).env?.GOOGLE_CLIENT_ID || '';
  const isGoogleConfigured = Boolean(
    rawClientId &&
    rawClientId !== 'your-google-client-id' &&
    !rawClientId.includes('your-google') &&
    !rawClientId.includes('unconfigured') &&
    rawClientId.includes('.apps.googleusercontent.com')
  );

  if (!authModalOpen) return null;

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
    setUnverifiedEmail(null);
  };

  const handleTabChange = (tab: 'login' | 'signup' | 'forgot' | 'reset') => {
    resetMessages();
    setAuthModalTab(tab);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      if (err.message && err.message.includes('verify your email')) {
        setUnverifiedEmail(email);
      }
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await signup(email, password, name);
      if (res.user) {
        setSuccessMsg(res.message || 'Account created successfully!');
        setTimeout(() => {
          setAuthModalOpen(false);
        }, 1200);
      } else {
        setSuccessMsg(res.message || 'Registration successful! Check your email for verification link.');
        setUnverifiedEmail(email);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const res = await forgotPassword(email);
      setSuccessMsg(res.message || 'If an account exists, password reset instructions have been sent.');
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!resetToken) {
      setError('Missing reset token');
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetPassword(resetToken, newPassword);
      setSuccessMsg(res.message || 'Password reset successfully!');
      setTimeout(() => {
        setAuthModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail && !email) return;
    const targetEmail = unverifiedEmail || email;
    resetMessages();
    setSubmitting(true);
    try {
      const res = await resendVerification(targetEmail);
      setSuccessMsg(res.message || 'Verification link sent!');
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    resetMessages();
    if (!credentialResponse.credential) {
      setError('Google Sign-In failed');
      return;
    }
    setSubmitting(true);
    try {
      await googleLogin(credentialResponse.credential);
    } catch (err: any) {
      setError(err.message || 'Google Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              {authModalTab === 'login' && 'Sign In to Account'}
              {authModalTab === 'signup' && 'Create Free Account'}
              {authModalTab === 'forgot' && 'Reset Password'}
              {authModalTab === 'reset' && 'Set New Password'}
            </h2>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Notifications / Errors */}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>{error}</p>
                {unverifiedEmail && (
                  <button
                    onClick={handleResend}
                    disabled={submitting}
                    className="text-xs text-blue-400 underline hover:text-blue-300 font-medium"
                  >
                    Click here to resend verification email
                  </button>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </div>
          )}

          {/* Google Sign-In (For Login & Signup Tabs) */}
          {(authModalTab === 'login' || authModalTab === 'signup') && (
            <div className="space-y-3">
              {isGoogleConfigured ? (
                <div className="flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError(`Google OAuth Origin Error (origin_mismatch): To use Google Sign-In, please add '${window.location.origin}' to Authorized JavaScript Origins in your Google Cloud Console Credentials page.`)}
                    theme="filled_blue"
                    shape="rectangular"
                    width="320"
                    text={authModalTab === 'signup' ? 'signup_with' : 'signin_with'}
                  />
                </div>
              ) : (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-200">Google OAuth Setup Required</p>
                    <p className="text-slate-300">
                      To enable Google Sign-In, set your Google OAuth Client ID in environment variable <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300 font-mono">VITE_GOOGLE_CLIENT_ID</code>.
                    </p>
                  </div>
                </div>
              )}

              <div className="relative flex items-center justify-center pt-1">
                <div className="w-full border-t border-slate-800"></div>
                <span className="absolute px-3 bg-slate-900 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  or continue with email &amp; password
                </span>
              </div>
            </div>
          )}

          {/* Login Form */}
          {authModalTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => handleTabChange('forgot')}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {submitting ? 'Signing In...' : 'Sign In'}
              </button>

              <div className="text-center text-xs text-slate-400 pt-2">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleTabChange('signup')}
                  className="text-blue-400 font-medium hover:underline"
                >
                  Create free account
                </button>
              </div>
            </form>
          )}

          {/* Signup Form */}
          {authModalTab === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name (Optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password (Min 8 characters)</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {submitting ? 'Creating Account...' : 'Register Account'}
              </button>

              <div className="text-center text-xs text-slate-400 pt-2">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="text-blue-400 font-medium hover:underline"
                >
                  Sign in here
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form */}
          {authModalTab === 'forgot' && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <p className="text-xs text-slate-400">
                Enter your email address and we will send you a password reset link.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Sending Link...' : 'Send Password Reset Link'}
              </button>

              <div className="text-center text-xs text-slate-400 pt-2">
                Back to{' '}
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="text-blue-400 font-medium hover:underline"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* Reset Password Form */}
          {authModalTab === 'reset' && (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Password (Min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Resetting Password...' : 'Reset Password'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
