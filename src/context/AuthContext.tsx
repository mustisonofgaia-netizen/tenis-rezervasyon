import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { CompleteProfileModal } from '../components/CompleteProfileModal';
import { db } from '../services/firebase';
import type { AdminRole, UserVerificationProfile } from '../types/user';
import { DEFAULT_VERIFICATION_PROFILE, needsVerification } from '../types/user';

// ─── Context shape ────────────────────────────────────────────────────────────

type AuthContextValue = {
  uid: string;
  role: AdminRole;
  managedClubId: string;
  profile: UserVerificationProfile;
  /**
   * Runs `actionCallback` immediately if the user is verified.
   * Otherwise opens the global CompleteProfileModal and defers execution
   * until verification succeeds.
   */
  requireVerification: (actionCallback: () => void) => void;
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
  const [profile, setProfile] = useState<UserVerificationProfile>(DEFAULT_VERIFICATION_PROFILE);
  const [modalVisible, setModalVisible] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Live profile subscription — keeps verification state in sync
  useEffect(() => {
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      setProfile({
        firstName:   (data.firstName   as string  | undefined) ?? '',
        lastName:    (data.lastName    as string  | undefined) ?? '',
        phoneNumber: (data.phoneNumber as string  | undefined) ?? '',
        isVerified:  (data.isVerified  as boolean | undefined) ?? false,
      });
    });
  }, [uid]);

  const requireVerification = useCallback(
    (actionCallback: () => void) => {
      if (!needsVerification(profile)) {
        actionCallback();
        return;
      }
      pendingActionRef.current = actionCallback;
      setModalVisible(true);
    },
    [profile],
  );

  const handleComplete = useCallback(() => {
    setModalVisible(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    // Defer one tick so Firestore snapshot can propagate before the action runs
    if (action) setTimeout(action, 0);
  }, []);

  const handleClose = useCallback(() => {
    setModalVisible(false);
    pendingActionRef.current = null;
  }, []);

  return (
    <AuthContext.Provider value={{ uid, role, managedClubId, profile, requireVerification }}>
      {children}
      <CompleteProfileModal
        isVisible={modalVisible}
        uid={uid}
        onClose={handleClose}
        onComplete={handleComplete}
      />
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be called inside <AuthProvider>');
  return ctx;
}
