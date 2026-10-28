import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ShieldCheck, 
  ShieldAlert, 
  KeyRound, 
  Smartphone, 
  Power, 
  PowerOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Copy, 
  Lock,
  UserCheck
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { User } from '../types';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  // Password reset dialog state
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResettingPass, setIsResettingPass] = useState(false);

  // MFA setup dialog state
  const [mfaModalUser, setMfaModalUser] = useState<User | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState<string>('');
  const [isSettingUpMfa, setIsSettingUpMfa] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch('/api/auth/admin/users');
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setActionError(data.error || 'Failed to load user accounts.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error connecting to admin user service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleStatus = async (user: User) => {
    if (user.role === 'SUPERADMIN' || user.email.toLowerCase() === (currentUser?.email || 'vinuparab86@gmail.com').toLowerCase()) {
      setActionError('Cannot disable Master SuperAdmin account.');
      return;
    }

    setTogglingUserId(user.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch(`/api/auth/admin/users/${user.id}/toggle-status`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message || `Account ${user.email} updated successfully.`);
        await fetchUsers();
      } else {
        setActionError(data.error || 'Failed to update account status.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error updating user status.');
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleOpenResetModal = (user: User) => {
    setResetModalUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setActionError(null);
    setActionSuccess(null);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    if (newPassword.length < 8) {
      setActionError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setActionError('Passwords do not match.');
      return;
    }

    setIsResettingPass(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/auth/admin/users/${resetModalUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(`Password for ${resetModalUser.email} has been updated.`);
        setResetModalUser(null);
        fetchUsers();
      } else {
        setActionError(data.error || 'Failed to reset password.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error updating password.');
    } finally {
      setIsResettingPass(false);
    }
  };

  const handleOpenMfaModal = async (user: User) => {
    setMfaModalUser(user);
    setMfaSecret(null);
    setMfaQrCode(null);
    setMfaVerifyCode('');
    setCopiedSecret(false);
    setIsSettingUpMfa(true);
    setActionError(null);

    try {
      const res = await apiFetch(`/api/auth/admin/users/${user.id}/mfa/generate`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setMfaSecret(data.secret);
        setMfaQrCode(data.qrCodeDataUrl);
      } else {
        setActionError(data.error || 'Failed to generate MFA secret.');
        setMfaModalUser(null);
      }
    } catch (err: any) {
      setActionError(err.message || 'Error initializing MFA setup.');
      setMfaModalUser(null);
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleVerifyAndEnableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaModalUser || !mfaSecret) return;
    if (mfaVerifyCode.trim().length !== 6) {
      setActionError('Please enter the 6-digit code shown in Google Authenticator.');
      return;
    }

    setIsSettingUpMfa(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/auth/admin/users/${mfaModalUser.id}/mfa/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: mfaSecret, token: mfaVerifyCode.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message);
        setMfaModalUser(null);
        fetchUsers();
      } else {
        setActionError(data.error || 'Invalid verification code.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error activating MFA.');
    } finally {
      setIsSettingUpMfa(false);
    }
  };

  const handleDisableMfa = async (user: User) => {
    setActionError(null);
    try {
      const res = await apiFetch(`/api/auth/admin/users/${user.id}/mfa/disable`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccess(data.message || `MFA disabled for ${user.email}`);
        await fetchUsers();
      } else {
        setActionError(data.error || 'Failed to disable MFA.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Error disabling MFA.');
    }
  };

  const copySecretToClipboard = () => {
    if (mfaSecret) {
      navigator.clipboard.writeText(mfaSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>User Access Control &amp; MFA Management</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 font-mono uppercase tracking-wide border border-blue-700">
                  SuperAdmin Only
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage the fixed 5-user platform roster (1 Master Admin + 4 Operators). Enable/disable accounts, reset passwords, and bind Google Authenticator MFA.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Notifications */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {actionSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Main Body Table */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase text-slate-400 font-bold tracking-wider">
              Platform Authorized Users ({users.length})
            </span>
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded transition-colors font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/50">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                <tr>
                  <th className="py-3 px-4">User / Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Account Status</th>
                  <th className="py-3 px-4">MFA (TOTP)</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Administrative Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {users.map(u => {
                  const isCurrent = u.id === currentUser?.id;
                  const isActive = u.isActive !== false && u.is_active !== 0;
                  const isMfaActive = u.mfaEnabled || u.mfa_enabled === 1;

                  return (
                    <tr key={u.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{u.name || u.email}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.2 rounded border border-cyan-700">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">{u.email}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.role === 'SUPERADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-950/80 text-purple-300 border border-purple-700">
                            <ShieldCheck className="w-3 h-3 text-purple-400" />
                            SUPERADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700">
                            <UserCheck className="w-3 h-3 text-slate-400" />
                            OPERATOR
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-950/70 text-emerald-400 border border-emerald-700/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-950/70 text-rose-400 border border-rose-700/60">
                            <PowerOff className="w-2.5 h-2.5 text-rose-400" />
                            DISABLED
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isMfaActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-700/50">
                            <Smartphone className="w-3 h-3 text-cyan-400" />
                            AUTHENTICATOR ON
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800">
                            <Smartphone className="w-3 h-3 text-slate-500" />
                            OFF
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {u.lastLoginAt || u.last_login_at 
                          ? new Date(u.lastLoginAt || u.last_login_at!).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                          : 'Never'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {/* Status Toggle Button: Clear text + Icon + Loading state */}
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isCurrent || togglingUserId === u.id}
                            title={isCurrent ? "Cannot disable SuperAdmin" : isActive ? "Click to Disable Account" : "Click to Enable Account"}
                            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold flex items-center space-x-1 transition-all ${
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed bg-slate-800 text-slate-500 border border-slate-700'
                                : isActive
                                ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/60 hover:border-rose-400 cursor-pointer shadow-sm'
                                : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/60 hover:border-emerald-400 cursor-pointer shadow-sm'
                            }`}
                          >
                            {togglingUserId === u.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-slate-300" />
                            ) : isActive ? (
                              <PowerOff className="w-3 h-3 text-rose-400" />
                            ) : (
                              <Power className="w-3 h-3 text-emerald-400" />
                            )}
                            <span>
                              {togglingUserId === u.id
                                ? 'SAVING...'
                                : isActive
                                ? 'DISABLE'
                                : 'ENABLE'}
                            </span>
                          </button>

                          {/* Reset Password */}
                          <button
                            onClick={() => handleOpenResetModal(u)}
                            title="Reset User Password"
                            className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-blue-300 hover:text-white bg-blue-950/70 hover:bg-blue-900 border border-blue-600/50 hover:border-blue-400 transition-all cursor-pointer shadow-sm"
                          >
                            <KeyRound className="w-3 h-3 text-blue-400" />
                            <span>RESET PWD</span>
                          </button>

                          {/* Configure / Reset MFA */}
                          <button
                            onClick={() => handleOpenMfaModal(u)}
                            title="Setup / Re-bind Google Authenticator MFA"
                            className="flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-mono font-bold text-purple-300 hover:text-white bg-purple-950/70 hover:bg-purple-900 border border-purple-600/50 hover:border-purple-400 transition-all cursor-pointer shadow-sm"
                          >
                            <Smartphone className="w-3 h-3 text-purple-400" />
                            <span>MFA SETUP</span>
                          </button>

                          {/* Turn off MFA if active */}
                          {isMfaActive && (
                            <button
                              onClick={() => handleDisableMfa(u)}
                              title="Disable MFA for this user"
                              className="px-2 py-1 text-[10px] font-mono font-bold rounded bg-slate-800 text-rose-400 hover:bg-rose-950/80 border border-rose-700/50 transition-all cursor-pointer"
                            >
                              OFF MFA
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Security Architecture Footnote */}
          <div className="mt-6 p-4 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs space-y-1">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span>Restricted High-Security Quant Execution Environment</span>
            </div>
            <p>
              Public Google login and self-registration are permanently disabled. Only the Master Administrator can reset operator credentials, revoke sessions, or configure 2FA TOTP authenticator keys.
            </p>
          </div>
        </div>

        {/* Password Reset Submodal */}
        {resetModalUser && (
          <div className="absolute inset-0 z-60 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-slate-100 text-sm">
                    Reset Password: {resetModalUser.name || resetModalUser.email}
                  </h3>
                </div>
                <button
                  onClick={() => setResetModalUser(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSavePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    New Password (Min 8 Characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-sm text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResettingPass}
                    className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold font-mono transition-colors disabled:opacity-50"
                  >
                    {isResettingPass ? 'Saving...' : 'Apply Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Authenticator MFA Setup Submodal */}
        {mfaModalUser && (
          <div className="absolute inset-0 z-60 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-purple-500/40 rounded-xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold text-slate-100 text-sm">
                    Configure Google Authenticator: {mfaModalUser.email}
                  </h3>
                </div>
                <button
                  onClick={() => setMfaModalUser(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {mfaQrCode ? (
                <div className="space-y-4">
                  <div className="text-xs text-slate-300">
                    Scan this QR code using <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or <strong>1Password</strong>:
                  </div>

                  {/* QR Code Container */}
                  <div className="flex justify-center p-3 bg-white rounded-lg mx-auto w-fit shadow-md">
                    <img src={mfaQrCode} alt="TOTP QR Code" className="w-48 h-48" />
                  </div>

                  {/* Monospace Secret Key */}
                  <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="text-[11px] font-mono text-purple-300 truncate mr-2 select-all">
                      {mfaSecret}
                    </div>
                    <button
                      type="button"
                      onClick={copySecretToClipboard}
                      className="p-1 rounded text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
                      title="Copy Secret"
                    >
                      {copiedSecret ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Verification Input to Enable */}
                  <form onSubmit={handleVerifyAndEnableMfa} className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-mono text-slate-300 mb-1">
                        Enter 6-digit Authenticator verification code:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        value={mfaVerifyCode}
                        onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full text-center text-lg tracking-widest font-mono py-2 bg-slate-950 border border-purple-500/50 rounded text-purple-300 focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setMfaModalUser(null)}
                        className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSettingUpMfa || mfaVerifyCode.length !== 6}
                        className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold font-mono transition-colors disabled:opacity-50"
                      >
                        {isSettingUpMfa ? 'Verifying...' : 'Verify & Enable MFA'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
                  <span>Generating cryptographic TOTP secret...</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
