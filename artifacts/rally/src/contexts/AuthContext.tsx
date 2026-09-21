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
  isAdmin: boolean;
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

/**
 * Auth if there is any, null if there isn't — for screens that are reached
 * WITHOUT an account (Part A, 21 September 2026).
 *
 * /manage is the case. Almost everybody on it arrived by a link sent to them —
 * a recipient, or a manager the family added — and has no account at all; an
 * organiser signed in on the same screen is the exception. Such a screen wants
 * to ASK whether anyone is signed in, which is a different question from
 * useAuth's "I require a signed-in context and it is a bug if there isn't
 * one". Throwing would be wrong for them, so this does not.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
