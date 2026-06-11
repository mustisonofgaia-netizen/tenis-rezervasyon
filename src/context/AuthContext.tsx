import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

type AuthContextValue = {
  uid: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ uid }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>');
  return ctx;
}
