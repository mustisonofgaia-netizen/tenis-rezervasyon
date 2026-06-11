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
 * `'super_admin'` and `'player'` respectively at read-time in the
 * App.tsx auth state machine.
 */
export type AdminRole = 'player' | 'club_admin' | 'super_admin';

/** Partial shape of a user document as stored in `users/{uid}`. */
export type UserProfile = {
  role: AdminRole;
  /**
   * Only meaningful when `role === 'club_admin'`.
   * Maps the admin to a specific club in the marketplace.
   * Empty string for `super_admin` and `player`.
   */
  managedClubId: string;
};
