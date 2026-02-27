/**
 * Auth context + hook.
 *
 * DC-01: JWT is stored in an HttpOnly cookie (managed by the server).
 * The frontend NEVER touches localStorage for auth.
 * On app load, we call POST /api/auth/refresh to hydrate the user object
 * from the existing cookie.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Login with email + password. Server sets HttpOnly cookie on success. */
  login: (credentials: LoginCredentials) => Promise<void>;
  /** Logout. Server clears the HttpOnly cookie. Redirects to /login. */
  logout: () => Promise<void>;
  /** Re-validate the existing cookie and update user state. */
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context (default value is a "not initialised" sentinel)
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Validate the existing HttpOnly cookie by calling /api/auth/refresh. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser((data as { user?: AuthUser }).user ?? (data as AuthUser) ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Hydrate on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** POST /api/auth/login — server sets HttpOnly cookie on success */
  const login = useCallback(async (credentials: LoginCredentials) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? 'Credenziali non valide');
    }

    const data = await res.json();
    setUser((data as { user?: AuthUser }).user ?? (data as AuthUser) ?? null);
  }, []);

  /** POST /api/auth/logout — server clears the HttpOnly cookie */
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
    refresh,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access auth state and actions.
 *
 * @throws if used outside of `<AuthProvider>`.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default useAuth;
