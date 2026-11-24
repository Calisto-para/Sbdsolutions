import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [status, setStatus] = useState("loading");

  const refresh = useCallback(async () => {
    try {
      const data = await api("/auth/me");
      setUser(data.user);
      setBusiness(data.business);
    } catch {
      setUser(null);
      setBusiness(null);
    } finally {
      setStatus("ready");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    const data = await api("/auth/login", { method: "POST", body: credentials });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setBusiness(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      business,
      status,
      isAuthenticated: Boolean(user),
      refresh,
      login,
      logout,
      setBusiness,
      setUser,
    }),
    [user, business, status, refresh, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
