import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "../types/user";
import { api } from "../lib/api";
import { clearPostLoginSplashSession } from "../session/postLoginSplashSession";

type AuthState = {
  accessToken: string | null;
  user: User | null;
};

type AuthContextValue = AuthState & {
  isAuthenticated: () => boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
};

const STORAGE_KEY = "edumed.auth.v0.1";

function loadFromStorage(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, user: null };
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      user: (parsed.user as User) ?? null,
    };
  } catch {
    return { accessToken: null, user: null };
  }
}

function saveToStorage(state: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => loadFromStorage());

  const isAuthenticated = useCallback(
    () => Boolean(state.accessToken && state.user),
    [state.accessToken, state.user],
  );

  const bootstrap = useCallback(async () => {
    const stored = loadFromStorage();
    if (!stored.accessToken) {
      setState({ accessToken: null, user: null });
      return;
    }
    try {
      const me = await api.me(stored.accessToken);
      const next = { accessToken: stored.accessToken, user: me.user };
      setState(next);
      saveToStorage(next);
    } catch {
      setState({ accessToken: null, user: null });
      saveToStorage({ accessToken: null, user: null });
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { accessToken, user } = await api.login({ username, password });
    const next = { accessToken, user };
    setState(next);
    saveToStorage(next);
  }, []);

  const logout = useCallback(() => {
    clearPostLoginSplashSession();
    const next = { accessToken: null, user: null };
    setState(next);
    saveToStorage(next);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = state.accessToken;
    if (!token) return;
    const me = await api.me(token);
    setState((prev) => {
      if (!prev.accessToken) return prev;
      const next = { accessToken: prev.accessToken, user: me.user };
      saveToStorage(next);
      return next;
    });
  }, [state.accessToken]);

  const setUser = useCallback((user: User) => {
    setState((prev) => {
      if (!prev.accessToken) return prev;
      const next = { accessToken: prev.accessToken, user };
      saveToStorage(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, isAuthenticated, bootstrap, login, logout, refreshUser, setUser }),
    [state, isAuthenticated, bootstrap, login, logout, refreshUser, setUser],
  );

  useEffect(() => {
    // Восстанавливаем сессию при перезагрузке страницы.
    // Это не добавляет новой продуктовой логики, а обеспечивает корректную работу слоя 0.
    void bootstrap();
  }, [bootstrap]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

