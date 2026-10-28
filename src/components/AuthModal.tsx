import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LogIn, 
  KeyRound, 
  Mail, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  ShieldCheck, 
  Smartphone, 
  ArrowLeft,
  Users
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    setAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    mfaPending,
    cancelMfa,
    login,
    verifyMfa,
    forgotPassword,
    resetPassword,
    resetToken
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!authModalOpen) return null;

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const handleTabChange = (tab: 'login' | 'signup' | 'forgot' | 'reset') => {
    resetMessages();
    cancelMfa();
    setAuthModalTab(tab);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      setError('Please enter the 6-digit code from your Authenticator app.');
      return;
    }
    resetMessages();
    setSubmitting(true);
    try {
      await verifyMfa(totpCode.trim());
      setTotpCode('');
    } catch (err: any) {
      setError(err.message || 'Invalid 6-digit Authenticator code');
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
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!resetToken) {
      setError('Invalid or expired reset token');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide font-mono">
                {mfaPending.required
                  ? 'Two-Factor Authentication'
                  : authModalTab === 'login'
                  ? 'Operator & Admin Login'
                  : authModalTab === 'forgot'
                  ? 'Reset Password'
                  : 'Set New Password'}
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">Private Algorithmic Terminal</span>
            </div>
          </div>
          <button
            onClick={() => {
              cancelMfa();
              setAuthModalOpen(false);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Notifications / Errors */}
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </div>
          )}

          {/* MFA TOTP STEP */}
          {mfaPending.required ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-500/40 flex items-start gap-2.5">
                <Smartphone className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-200 space-y-1">
                  <p className="font-semibold">Google Authenticator Required</p>
                  <p className="text-purple-300/80">
                    Enter the 6-digit verification code from your authenticator app for <strong className="text-white">{mfaPending.email}</strong>.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">
                  6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center text-xl font-bold tracking-widest font-mono py-2.5 bg-slate-950 border border-purple-500/50 rounded-lg text-purple-300 placeholder-slate-600 focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting || totpCode.length !== 6}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {submitting ? 'Verifying Code...' : 'Verify & Enter Terminal'}
                </button>

                <button
                  type="button"
                  onClick={cancelMfa}
                  className="w-full py-2 text-xs font-mono text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Password Login</span>
                </button>
              </div>
            </form>
          ) : authModalTab === 'login' ? (
            /* STEP 1: PASSWORD LOGIN */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Account Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vinuparab86@gmail.com or operator1@..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => handleTabChange('forgot')}
                    className="text-xs text-cyan-400 hover:underline font-mono"
                  >
                    Forgot?
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
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
              >
                <LogIn className="w-4 h-4" />
                {submitting ? 'Authenticating...' : 'Sign In'}
              </button>

              {/* Security policy footnote */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-300 font-mono">
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Fixed 5-User Roster</span>
                </div>
                <p>
                  Access is strictly limited to pre-seeded credentials: <strong>1 Master Admin</strong> + <strong>4 Quant Operators</strong>. Public self-registration and Google Sign-in are permanently removed.
                </p>
              </div>
            </form>
          ) : authModalTab === 'forgot' ? (
            /* FORGOT PASSWORD */
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <p className="text-xs text-slate-400">
                Enter your authorized account email. If configured, a password reset link will be dispatched.
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
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="text-xs text-slate-400 hover:text-slate-200 font-mono"
                >
                  Back to Sign In
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          ) : (
            /* RESET PASSWORD */
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs uppercase rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Set New Password'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
