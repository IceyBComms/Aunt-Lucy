import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

const TOKEN_KEY = "aunt_lucy_session";

interface Organiser {
  id: string;
  email: string;
}

interface AuthContextValue {
  token: string | null;
  organiser: Organiser | null;
  isLoading: boolean;
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [organiser, setOrganiser] = useState<Organiser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setOrganiser(null);
      return;
    }

    setIsLoading(true);
    apiFetch<Organiser>("/auth/me", { token })
      .then((org) => setOrganiser(org))
      .catch(() => {
        // Token invalid or expired — clear it
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setOrganiser(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  const signIn = useCallback((newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const signOut = useCallback(async () => {
    if (token) {
      await apiFetch("/auth/logout", {
        method: "POST",
        token,
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setOrganiser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, organiser, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
