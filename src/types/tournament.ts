/**
 * @file src/types/tournament.ts
 *
 * Canonical type definitions for the Custom League & Power Point Engine.
 *
 * Design principles
 * -----------------
 * - Discriminated unions enforce mutually exclusive state at the type level
 *   (e.g. `powerPointConfig` is only present when `scoringSystem === 'custom'`;
 *   `entryFee` is only present when `paymentMethod !== 'free'`).
 * - Every exported name is prefixed with `Tournament*` except for small
 *   value-object types that are compositional building blocks.
 * - The service layer (`tournamentService.ts`) should eventually migrate its
 *   inline types to re-export from here. Until then both can coexist.
 */

// ─── Navigation / Tab ─────────────────────────────────────────────────────────

/** Maps to the three tabs in TournamentScreen. Kept stable for nav-param types. */
export type TournamentTab = 'Lig' | 'Defi' | 'Özel';

/** High-level bracket/group format for a tournament. */
export type TournamentFormat = 'Eleme' | 'Lig' | 'Lig+Eleme';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export type TournamentStatus = 'upcoming' | 'active' | 'completed';

// ─── Privacy ──────────────────────────────────────────────────────────────────

/**
 * Controls who can discover and view the tournament.
 *   `'public'`  — listed in the global explore feed.
 *   `'private'` — hidden from the feed; entry requires a valid `inviteCode`.
 */
export type TournamentVisibilityLevel = 'public' | 'private';

// ─── Scoring System ───────────────────────────────────────────────────────────

/**
 * `'classic'` — win/loss only; standings use built-in comparators.
 * `'custom'`  — organizer defines a full `TournamentPowerConfig` tier table.
 */
export type TournamentScoringSystem = 'classic' | 'custom';

// ─── Payment ──────────────────────────────────────────────────────────────────

/**
 * How entry fees are collected.
 *   `'in_app'` — charged via the platform's payment gateway.
 *   `'manual'` — organizer collects payment outside the app.
 *   `'free'`   — no entry fee required.
 */
export type TournamentPaymentMethod = 'in_app' | 'manual' | 'free';

// ─── Update Frequency ─────────────────────────────────────────────────────────

/**
 * Controls when the Power Point tier table is applied to recalculate standings.
 *   `'dynamic'`  — standings recalculate in real-time after every approved match.
 *   `'periodic'` — a scheduled job (weekly / monthly) triggers recalculation.
 *   `'manual'`   — only the organizer's explicit "Puan Güncelle" action triggers it.
 */
export type TournamentUpdateFrequency = 'dynamic' | 'periodic' | 'manual';

// ─── Tie-Breaker Criterion ────────────────────────────────────────────────────

/**
 * A single criterion used to break ties in the standings table.
 * The order of the `tieBreakerPriority` array on `Tournament` determines
 * which criterion is consulted first.
 *
 *   `'head_to_head'`    — direct match result between the tied players.
 *   `'set_difference'`  — net sets won minus sets lost across all matches.
 *   `'game_difference'` — net games won minus games lost across all matches.
 *   `'power_points'`    — accumulated Power Points from the tier assignment table.
 */
export type TieBreakerCriterion =
  | 'head_to_head'
  | 'set_difference'
  | 'game_difference'
  | 'power_points';

// ─── Approval ─────────────────────────────────────────────────────────────────

/**
 * Lifecycle state of a match result submitted by one player.
 *   `'pending_opponent'`  — waiting for the opposing player to confirm.
 *   `'pending_organizer'` — escalated to organizer review.
 *   `'approved'`          — result accepted; standings update is triggered.
 */
export type ApprovalStatus = 'pending_opponent' | 'pending_organizer' | 'approved';

/** Full set of statuses a match document can carry, including `'rejected'`. */
export type TournamentMatchStatus = ApprovalStatus | 'rejected';

// ─── TournamentMatchRule ──────────────────────────────────────────────────────

/**
 * Defines the scoring rules for every match played within the tournament.
 */
export interface TournamentMatchRule {
  /** Number of sets a player must win to claim the match (e.g. 2 for best-of-3). */
  setsToWin: number;
  /**
   * When `true`, the final set is decided by a tie-break game instead of
   * requiring the winner to reach the normal set-win threshold.
   */
  lastSetTieBreak: boolean;
  /**
   * When `true`, a player must win by two clear games within a set.
   * Applies standard advantage-set rules; incompatible with `lastSetTieBreak`
   * in the deciding set — the UI should enforce this constraint.
   */
  winByTwo: boolean;
}

// ─── TierAssignment ───────────────────────────────────────────────────────────

/**
 * A single rank-range → point-value mapping inside a `TournamentPowerConfig`.
 * Ranges must be non-overlapping and are evaluated top-to-bottom; the first
 * range that contains a player's rank wins.
 *
 * Example: `{ rankStart: 1, rankEnd: 1, pointsAssigned: 100 }` gives the
 * overall winner 100 Power Points.
 */
export interface TierAssignment {
  /** Inclusive start of the rank range (1-indexed). */
  rankStart: number;
  /** Inclusive end of the rank range. Must be ≥ `rankStart`. */
  rankEnd: number;
  /** Points awarded to every player whose rank falls in [rankStart, rankEnd]. */
  pointsAssigned: number;
}

// ─── TournamentPowerConfig ────────────────────────────────────────────────────

/**
 * Full configuration for the Custom Power Point Engine.
 * Only present on a tournament when `scoringSystem === 'custom'`.
 */
export interface TournamentPowerConfig {
  /**
   * Maximum number of distinct point-type columns the leaderboard may display.
   * The platform enforces a hard cap of 10 — the UI and backend must both
   * reject configs where `tierAssignments.length > maxPointTypes`.
   */
  maxPointTypes: number;
  /**
   * Ordered list of rank-range → point mappings.
   * The array length must not exceed `maxPointTypes`.
   */
  tierAssignments: TierAssignment[];
  /** Controls when the tier table is applied to recalculate player standings. */
  updateFrequency: TournamentUpdateFrequency;
}

// ─── TournamentVisibility (column/stats visibility) ───────────────────────────

/**
 * Per-column visibility flags that allow an organizer to hide certain
 * leaderboard statistics from participant view.
 *
 * Note: organizers always see all columns regardless of these flags.
 */
export interface TournamentVisibility {
  /** Show/hide the Power Points column in the public-facing leaderboard. */
  showPowerPoints: boolean;
  /** Show/hide the Matches Played column. */
  showMatchesPlayed: boolean;
  /** Show/hide the Wins column. */
  showWins: boolean;
  /** Show/hide the Games Won column. */
  showGamesWon: boolean;
}

// ─── TournamentStanding ───────────────────────────────────────────────────────

/**
 * A single computed row in the tournament leaderboard.
 *
 * Derived by the standings engine from `TournamentPlayer` sub-documents and
 * approved `TournamentMatch` records. Never written directly by clients.
 */
export interface TournamentStanding {
  userId: string;
  /** Resolved display name; falls back to a truncated `userId` if unavailable. */
  displayName?: string;
  /** 1-indexed rank position after all tie-breaker criteria are applied. */
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  /** Total individual games won across all approved matches. */
  gamesWon: number;
  /** Net set differential: sets won − sets lost across all approved matches. */
  setDifference: number;
  /** Net game differential: games won − games lost across all approved matches. */
  gameDifference: number;
  /**
   * Accumulated Power Points from the active `TournamentPowerConfig` tier table.
   * Always 0 when `scoringSystem === 'classic'`.
   */
  powerPoints: number;
}

// ─── TournamentPlayer (Firestore sub-document) ────────────────────────────────

/**
 * Mirrors a document in `tournaments/{tournamentId}/players/{userId}`.
 * One document per registered player per tournament.
 */
export interface TournamentPlayer {
  userId: string;
  status: 'pending' | 'approved';
  /** Tier-assigned Power Points. Set by the standings engine; never by clients. */
  points: number;
  wins: number;
  losses: number;
  played: number;
  joinedAt: number;
}

// ─── TournamentMatch (Firestore document) ─────────────────────────────────────

/**
 * A match result submitted within a tournament context.
 * Distinguished from open-lobby `MatchDocument` records by `tournamentId`.
 */
export interface TournamentMatch {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  /** Human-readable score string, e.g. "6-4, 5-7, 7-6". */
  score: string;
  status: TournamentMatchStatus;
  /** UID of the player who originally submitted the result. */
  submittedBy: string;
  createdAt: number;
}

// ─── ApprovalFlow ─────────────────────────────────────────────────────────────

/** Pending match result surfaced in the organizer's approval action hub. */
export interface ApprovalFlow {
  id: string;
  player1: string;
  player2: string;
  score: string;
  submittedBy: string;
  status: ApprovalStatus;
}

// ─── LegacyStandingImport ─────────────────────────────────────────────────────

/**
 * A single record from a legacy system that an organizer wants to import
 * as a starting point for the standings. Only relevant when
 * `tournament.hasLegacyData === true`.
 */
export interface LegacyStandingImport {
  userId: string;
  /** Display name from the old system — may not match the current auth profile. */
  legacyDisplayName: string;
  legacyPoints: number;
  legacyWins: number;
  legacyMatchesPlayed: number;
  /** Epoch-ms timestamp sourced from the originating system. */
  importedAt: number;
}

// ─── Discriminated Unions ─────────────────────────────────────────────────────

/**
 * Scoring-system branch of `Tournament`.
 *
 * TypeScript narrows `powerPointConfig` as a required field only when the
 * caller has already checked `tournament.scoringSystem === 'custom'`.
 */
type TournamentClassicScoring = {
  scoringSystem: 'classic';
  /** Explicitly absent in classic mode so callers cannot accidentally read it. */
  powerPointConfig?: never;
};

type TournamentCustomScoring = {
  scoringSystem: 'custom';
  /** Required — must be fully specified when `scoringSystem === 'custom'`. */
  powerPointConfig: TournamentPowerConfig;
};

export type TournamentScoringConfig = TournamentClassicScoring | TournamentCustomScoring;

/**
 * Payment branch of `Tournament`.
 *
 * `entryFee` is structurally forbidden (`never`) when `paymentMethod === 'free'`
 * so the compiler rejects code that tries to set a fee on a free tournament.
 */
type TournamentPaymentFree = {
  paymentMethod: 'free';
  entryFee?: never;
};

type TournamentPaymentPaid = {
  paymentMethod: 'in_app' | 'manual';
  /** Mandatory for paid tournaments. Amount in the platform's base currency. */
  entryFee: number;
};

export type TournamentPaymentConfig = TournamentPaymentFree | TournamentPaymentPaid;

// ─── Tournament (root Firestore document) ─────────────────────────────────────

/**
 * The canonical shape of a document stored in the `tournaments` collection.
 *
 * `Tournament` is a union of the base fields intersected with two independent
 * discriminated unions (`TournamentScoringConfig` and `TournamentPaymentConfig`).
 * This means TypeScript correctly narrows additional fields once the caller
 * checks the discriminant properties `scoringSystem` and `paymentMethod`.
 *
 * @example
 * ```ts
 * function getPoints(t: Tournament): number {
 *   if (t.scoringSystem === 'custom') {
 *     // t.powerPointConfig is fully typed here
 *     return t.powerPointConfig.tierAssignments[0]?.pointsAssigned ?? 0;
 *   }
 *   return 0;
 * }
 * ```
 */
export type Tournament = {
  /** Firestore document ID — populated client-side after fetch. */
  id: string;
  title: string;
  /** Routes the tournament to the correct UI tab. */
  type: TournamentTab;
  format: TournamentFormat;
  status: TournamentStatus;
  /** UID of the user who created and administers the tournament. */
  organizerId: string;
  /** Epoch-ms creation timestamp. */
  createdAt: number;

  // ── Scheduling & location ─────────────────────────────────────────────────
  /** Epoch-ms timestamp when the tournament starts (first match day). */
  startDate: number;
  /** Epoch-ms timestamp when the tournament ends (last match day / finals). */
  endDate: number;
  /** Venue or city where matches are played (free-form string). */
  location: string;

  // ── Privacy ──────────────────────────────────────────────────────────────
  visibility: TournamentVisibilityLevel;
  /**
   * Short alphanumeric code shared with invited players.
   * Required when `visibility === 'private'`; omitted otherwise.
   */
  inviteCode?: string;

  // ── Match rules ───────────────────────────────────────────────────────────
  matchRules: TournamentMatchRule;

  // ── Tie-breaker priority ──────────────────────────────────────────────────
  /**
   * Ordered list of criteria used to break ties in the standings table.
   * Index 0 has the highest priority; subsequent indices are consulted only
   * when all preceding criteria still result in a tie.
   */
  tieBreakerPriority: TieBreakerCriterion[];

  // ── Stats column visibility ───────────────────────────────────────────────
  visibilityRules: TournamentVisibility;

  // ── Legacy data ───────────────────────────────────────────────────────────
  /**
   * `true` when the organizer has imported historical standings from a
   * previous system. The UI should display an import-provenance banner.
   */
  hasLegacyData: boolean;
} & TournamentScoringConfig
  & TournamentPaymentConfig;
