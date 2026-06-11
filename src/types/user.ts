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
