/** Gamification statistics stored on each user document in Firestore. */
export type UserStats = {
  eloRating: number;
  matchesPlayed: number;
  wins: number;
};

export const DEFAULT_USER_STATS: UserStats = {
  eloRating: 1500,
  matchesPlayed: 0,
  wins: 0,
};

// ─── Role & Profile ───────────────────────────────────────────────────────────

/**
 * Canonical user roles stored in `users/{uid}.role`.
 *
 * - `player`      — end consumer; can browse clubs and book courts
 * - `club_admin`  — B2B partner; manages a single club, scoped via `managedClubId`
 * - `super_admin` — platform operator; can switch between and manage all clubs
 *
 * Legacy Firestore values `'ADMIN'` and `'CUSTOMER'` are coerced to
 * `'super_admin'` and `'player'` respectively at read-time in App.tsx.
 */
export type AdminRole = 'player' | 'club_admin' | 'super_admin';

/** Progressive onboarding / identity fields on `users/{uid}`. */
export type UserVerificationProfile = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  /** Set to true after SMS OTP verification completes. Defaults to false. */
  isVerified: boolean;
};

export const DEFAULT_VERIFICATION_PROFILE: UserVerificationProfile = {
  firstName: '',
  lastName: '',
  phoneNumber: '',
  isVerified: false,
};

/** Shape of a user document as stored in `users/{uid}`. */
export type UserProfile = UserVerificationProfile & {
  role: AdminRole;
  /**
   * Only meaningful when `role === 'club_admin'`.
   * Maps the admin to a specific club in the marketplace.
   * Empty string for `super_admin` and `player`.
   */
  managedClubId: string;
};

/** Returns true when the user must complete progressive verification. */
export function needsVerification(profile: UserVerificationProfile): boolean {
  return (
    !profile.isVerified
    || !profile.firstName.trim()
    || !profile.lastName.trim()
    || !profile.phoneNumber.trim()
  );
}
