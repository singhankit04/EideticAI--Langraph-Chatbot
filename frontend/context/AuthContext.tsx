"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  avatar?: string;
  authProvider?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  signup: (token: string, user: AuthUser) => void;
  logout: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = "eideticai_auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authenticated fetch wrapper that automatically appends the Bearer token
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem(TOKEN_STORAGE_KEY) : null);
      const headers = new Headers(options.headers || {});

      if (activeToken) {
        headers.set("Authorization", `Bearer ${activeToken}`);
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [token]
  );

  // Fetch current user profile using active token
  const refreshUser = useCallback(async () => {
    const activeToken = typeof window !== "undefined" ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (!activeToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setToken(activeToken);
      } else {
        // Token invalid or expired
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
        setToken(null);
      }
    } catch (err) {
      console.warn("[Auth] Failed to restore session:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Hydrate session from localStorage on initial page load
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const signup = (newToken: string, newUser: AuthUser) => {
    login(newToken, newUser);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        signup,
        logout,
        authFetch,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
