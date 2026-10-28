import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { apiFetch, setAuthToken } from '../lib/api';

interface MfaPendingState {
  required: boolean;
  tempToken: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  authModalTab: 'login' | 'signup' | 'forgot' | 'reset';
  setAuthModalTab: (tab: 'login' | 'signup' | 'forgot' | 'reset') => void;
  resetToken: string | null;
  setResetToken: (token: string | null) => void;
  mfaPending: MfaPendingState;
  cancelMfa: () => void;
  login: (email: string, pass: string, totpCode?: string) => Promise<any>;
  verifyMfa: (totpCode: string) => Promise<any>;
  signup: (email: string, pass: string, name?: string) => Promise<any>;
  googleLogin: (credential: string) => Promise<any>;
  logout: () => Promise<void>;
  resendVerification: (email: string) => Promise<any>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (token: string, newPass: string) => Promise<any>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [mfaPending, setMfaPending] = useState<MfaPendingState>({
    required: false,
    tempToken: null,
    email: null
  });

  const cancelMfa = () => {
    setMfaPending({ required: false, tempToken: null, email: null });
  };

  const refreshUser = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
        if (data.token) {
          setAuthToken(data.token);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    // Check query params for reset password or email verified notification
    const params = new URLSearchParams(window.location.search);
    const verifiedParam = params.get('verified');
    const resetTokenParam = params.get('token');

    if (window.location.pathname === '/reset-password' && resetTokenParam) {
      setResetToken(resetTokenParam);
      setAuthModalTab('reset');
      setAuthModalOpen(true);
    } else if (verifiedParam === 'true') {
      refreshUser();
    }
  }, []);

  const parseJsonResponse = async (res: Response, defaultError: string) => {
    const contentType = res.headers.get('content-type') || '';
    let data: any = {};
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (err) {
        data = { error: defaultError };
      }
    } else {
      const text = await res.text();
      data = { error: text ? (text.length > 200 ? text.substring(0, 200) + '...' : text) : defaultError };
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || defaultError);
    }
    return data;
  };

  const login = async (email: string, pass: string, totpCode?: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass, totpCode })
    });
    const data = await parseJsonResponse(res, 'Login failed');

    // If 2FA MFA is required, retain tempToken and trigger TOTP prompt
    if (data.mfaRequired) {
      setMfaPending({
        required: true,
        tempToken: data.tempToken,
        email: data.email || email
      });
      return data;
    }

    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    setMfaPending({ required: false, tempToken: null, email: null });
    setAuthModalOpen(false);
    return data;
  };

  const verifyMfa = async (totpCode: string) => {
    if (!mfaPending.tempToken) {
      throw new Error('No active MFA verification session. Please sign in again.');
    }
    const res = await apiFetch('/api/auth/login/mfa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: mfaPending.tempToken, totpCode })
    });
    const data = await parseJsonResponse(res, 'Invalid Authenticator code');
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    setMfaPending({ required: false, tempToken: null, email: null });
    setAuthModalOpen(false);
    return data;
  };

  const signup = async () => {
    throw new Error('Self-registration is disabled. Contact Master Administrator for credentials.');
  };

  const googleLogin = async () => {
    throw new Error('Google Sign-In is disabled on this private system.');
  };

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAuthToken(null);
    setUser(null);
    window.location.reload();
  };

  const resendVerification = async (email: string) => {
    const res = await apiFetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await parseJsonResponse(res, 'Failed to resend verification email');
  };

  const forgotPassword = async (email: string) => {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await parseJsonResponse(res, 'Password reset request failed');
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await parseJsonResponse(res, 'Password reset failed');
    if (data.token) {
      setAuthToken(data.token);
    }
    setUser(data.user);
    setAuthModalOpen(false);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authModalOpen,
        setAuthModalOpen,
        authModalTab,
        setAuthModalTab,
        resetToken,
        setResetToken,
        mfaPending,
        cancelMfa,
        login,
        verifyMfa,
        signup,
        googleLogin,
        logout,
        resendVerification,
        forgotPassword,
        resetPassword,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
