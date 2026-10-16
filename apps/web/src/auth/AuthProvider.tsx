import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Login, User } from "@wapp/contracts";
import { api, setToken, tokenStorageKey } from "../lib/api";
interface Auth {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const clear = useCallback(() => {
    sessionStorage.removeItem(tokenStorageKey);
    setToken("");
    setUser(null);
  }, []);
  useEffect(() => {
    let active = true;
    const token = sessionStorage.getItem(tokenStorageKey);
    if (!token) setLoading(false);
    else {
      setToken(token);
      void api<User>("/auth/me")
        .then((value) => {
          if (active) setUser(value);
        })
        .catch(() => {
          if (active) clear();
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    const expired = () => clear();
    window.addEventListener("wapp:unauthorized", expired);
    return () => {
      active = false;
      window.removeEventListener("wapp:unauthorized", expired);
    };
  }, [clear]);
  const login = async (username: string, password: string) => {
    const result = await api<Login>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    setToken(result.accessToken);
    sessionStorage.setItem(tokenStorageKey, result.accessToken);
    setUser(result.user);
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clear();
    }
  };
  return (
    <Context.Provider value={{ user, loading, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider ausente.");
  return context;
}
