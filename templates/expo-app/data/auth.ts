// TEMPLATE FILE — owned by the platform, never written by the model.
// Sign-in for apps with App Cloud enabled. Without App Cloud, `available` is false and the
// app should not show sign-in screens.
import { useCallback, useEffect, useState } from "react";
import { backend } from "./backend";
import { api, setToken } from "./remote";
import { deleteSupportData, forgetSupportUser, identifySupportUser } from "./support";

export interface AppUser {
  id: string;
  email: string | null;
  name: string | null;
  anonymous: boolean;
}

export function useAuth() {
  const available = Boolean(backend.apiUrl);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(available);

  const refresh = useCallback(async () => {
    if (!available) return;
    try {
      const { user: me } = await api<{ user: AppUser }>("/auth/me");
      setUser(me);
      if (!me.anonymous) identifySupportUser(me);
    } finally {
      setLoading(false);
    }
  }, [available]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signUp = async (email: string, password: string, name?: string) => {
    const result = await api<{ token: string; user: AppUser }>("/auth/sign-up", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    await setToken(result.token);
    setUser(result.user);
    identifySupportUser(result.user);
    return result.user;
  };

  const signIn = async (email: string, password: string) => {
    const result = await api<{ token: string; user: AppUser }>("/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await setToken(result.token);
    setUser(result.user);
    identifySupportUser(result.user);
    return result.user;
  };

  const signOut = async () => {
    forgetSupportUser();
    await api("/auth/sign-out", { method: "POST" }).catch(() => {});
    await setToken(null);
    await refresh();
  };

  /**
   * "Forgot password", step 1: email a six-digit code to the account (the answer is the same
   * whether or not the email has an account).
   */
  const requestPasswordReset = async (email: string) => {
    await api("/auth/reset-request", { method: "POST", body: JSON.stringify({ email }) });
  };

  /** Step 2: the emailed code and a new password; signs the person in. */
  const resetPassword = async (email: string, code: string, password: string) => {
    const result = await api<{ token: string; user: AppUser }>("/auth/reset", {
      method: "POST",
      body: JSON.stringify({ email, code, password }),
    });
    await setToken(result.token);
    setUser(result.user);
    identifySupportUser(result.user);
    return result.user;
  };

  /**
   * Delete the account and everything stored for it, then continue as a new anonymous user.
   * Apple requires apps with sign-up to offer this in the app (Guideline 5.1.1(v)).
   */
  const deleteAccount = async () => {
    await deleteSupportData();
    await api("/auth/me", { method: "DELETE" });
    await setToken(null);
    await refresh();
  };

  return {
    available,
    loading,
    user,
    signedIn: Boolean(user && !user.anonymous),
    signUp,
    signIn,
    signOut,
    deleteAccount,
    requestPasswordReset,
    resetPassword,
  };
}
