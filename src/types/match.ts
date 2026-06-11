export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type MatchDocument = {
  /** Firestore document ID — populated client-side after fetch */
  id: string;
  /** ID of the associated court reservation booking */
  bookingId: string;
  /** uid of the player who created the match listing */
  hostId: string;
  /** Court where the match will be played */
  courtId: string;
  /** ISO-8601 date string e.g. "2026-06-14" */
  date: string;
  /** Slot start time e.g. "19:00" */
  slotTime: string;
  /** Total number of players needed (including the host) */
  requiredPlayers: number;
  /** uids of all players who have joined (host is always index 0) */
  joinedPlayers: string[];
  skillLevel: SkillLevel;
  status: 'OPEN' | 'FULL' | 'CANCELLED';
  /** epoch-ms timestamp set by the client at creation time */
  createdAt: number;

  // ── Post-match scoring ────────────────────────────────────────────────────
  /** Whether a score has been submitted for this match. Defaults to false. */
  isScored?: boolean;
  /** Human-readable score string, e.g. "6-4, 5-7, 7-6" */
  score?: string;
  /** uid of the player who won */
  winnerId?: string;
  /**
   * Internal snapshot of Elo ratings immediately BEFORE this match was scored.
   * Stored by scoreService to enable clean Elo rollbacks when the score is updated.
   * Key = uid, Value = pre-scoring eloRating.
   */
  _eloSnapshot?: Record<string, number>;
};
