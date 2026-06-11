import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { AdminRole } from '../types/user';

// ─── Context shape ────────────────────────────────────────────────────────────

type AuthContextValue = {
  uid: string;
  /** Canonical role — see `AdminRole` in `src/types/user.ts`. */
  role: AdminRole;
  /**
   * Club ID that a `club_admin` is authorised to manage.
   * Always an empty string for `super_admin` and `player`.
   */
  managedClubId: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({
  uid,
  role,
  managedClubId,
  children,
}: {
  uid: string;
  role: AdminRole;
  managedClubId: string;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ uid, role, managedClubId }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>');
  return ctx;
}
