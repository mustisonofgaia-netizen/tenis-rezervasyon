import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { db } from './firebase';

// ─── Re-exported domain types ─────────────────────────────────────────────────
// These types are the single source of truth shared between the service layer
// and the UI. The UI layer should import them from here, not redefine them.

export type TournamentTab = 'Lig' | 'Defi' | 'Özel';

export type CustomFormat = 'Eleme' | 'Lig' | 'Lig+Eleme';

/**
 * Tier-based point table the organizer defines for their tournament.
 * After each standings refresh, every player's `points` field is set
 * to the value that matches their computed rank bucket.
 */
export type TierPoints = {
  rank1:     number;
  rank2to5:  number;
  rank6to10: number;
  rest:      number;
};

/**
 * Criteria used to break ties when ranking players.
 *   - `'wins'`    — more wins ranks higher
 *   - `'winRate'` — higher wins / max(played, 1) ratio ranks higher
 *   - `'played'`  — more games played ranks higher (participation bonus)
 */
export type TieBreakerPriority = 'wins' | 'winRate' | 'played';

/** Ordered list of criteria the organizer has defined for breaking ties. */
export type TieBreakerConfig = TieBreakerPriority[];

/**
 * A result is considered verified once EITHER the opponent OR the organizer
 * approves it — dual-path approval prevents stalled results when one party
 * is unresponsive.
 */
export type ApprovalStatus = 'pending_opponent' | 'pending_organizer' | 'approved';

export type ApprovalFlow = {
  id: string;
  player1: string;
  player2: string;
  score: string;
  submittedBy: string;
  status: ApprovalStatus;
};

// ─── Firestore document interfaces ───────────────────────────────────────────

export type TournamentRules = {
  /** Point values awarded per rank bucket when standings are refreshed. */
  tierPoints: TierPoints;
  /** Ordered list of criteria used to rank players. */
  tieBreaker: TieBreakerConfig;
  /** How often standings are automatically refreshed by the cron job. */
  updateInterval: 'weekly' | 'monthly';
  /**
   * When `true` the weekly/monthly cron updates standings automatically.
   * When `false` the organizer must press "Puan Güncelle" to refresh.
   */
  autoUpdate: boolean;
};

export type TournamentStatus = 'upcoming' | 'active' | 'completed';

/** Mirrors a document stored in the `tournaments` Firestore collection. */
export type Tournament = {
  id: string;
  title: string;
  /** Used by the UI to route the tournament to the correct tab. */
  type: TournamentTab;
  format: CustomFormat;
  entryFee: number;
  rules: TournamentRules;
  status: TournamentStatus;
  organizerId: string;
  createdAt: number;
};

export type TournamentMatchStatus = ApprovalStatus | 'rejected';

/**
 * Mirrors a document in the `matches` collection for tournament matches.
 * Distinguished from open-lobby matches by the presence of `tournamentId`
 * and the use of ApprovalStatus values instead of 'OPEN' / 'FULL'.
 */
export type TournamentMatch = {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  score: string;
  status: TournamentMatchStatus;
  /** The player who submitted the result — typically player1. */
  submittedBy: string;
  createdAt: number;
};

/**
 * Mirrors a document in the `tournaments/{tournamentId}/players/{userId}`
 * subcollection. One document per registered player per tournament.
 *
 * `points` is the single "Turnuva Puanı" field — assigned by
 * `refreshTournamentStandings` based on the player's rank bucket.
 * It is never written to by `onMatchApproved`.
 */
export type TournamentPlayer = {
  userId:   string;
  status:   'pending' | 'approved';
  points:   number;
  wins:     number;
  losses:   number;
  played:   number;
  joinedAt: number;
};

// ─── Collection path constants ────────────────────────────────────────────────

const TOURNAMENTS_COL = 'tournaments';
const MATCHES_COL     = 'matches';

/** Returns a reference to the players subcollection of a given tournament. */
function playersSubcol(tournamentId: string) {
  return collection(db, TOURNAMENTS_COL, tournamentId, 'players');
}

// ─── Firestore data converters ────────────────────────────────────────────────
// Centralised converters ensure every read path applies the same type coercions
// and defaults, eliminating scattered `as` casts throughout the codebase.

function toTournament(snap: QueryDocumentSnapshot<DocumentData>): Tournament {
  const d = snap.data();
  return {
    id:          snap.id,
    title:       (d.title        as string)           ?? '',
    type:        (d.type         as TournamentTab)    ?? 'Lig',
    format:      (d.format       as CustomFormat)     ?? 'Lig',
    entryFee:    (d.entryFee     as number)           ?? 0,
    rules:       (d.rules        as TournamentRules),
    status:      (d.status       as TournamentStatus) ?? 'active',
    organizerId: (d.organizerId  as string)           ?? '',
    createdAt:   (d.createdAt    as number)           ?? 0,
  };
}

function toTournamentMatch(snap: QueryDocumentSnapshot<DocumentData>): TournamentMatch {
  const d = snap.data();
  return {
    id:           snap.id,
    tournamentId: (d.tournamentId as string)               ?? '',
    player1Id:    (d.player1Id   as string)               ?? '',
    player2Id:    (d.player2Id   as string)               ?? '',
    score:        (d.score       as string)               ?? '',
    status:       (d.status      as TournamentMatchStatus) ?? 'pending_opponent',
    submittedBy:  (d.submittedBy as string)               ?? '',
    createdAt:    (d.createdAt   as number)               ?? 0,
  };
}

function toTournamentPlayer(snap: QueryDocumentSnapshot<DocumentData>): TournamentPlayer {
  const d = snap.data();
  return {
    userId:   snap.id,
    status:   (d.status   as 'pending' | 'approved') ?? 'pending',
    points:   (d.points   as number) ?? 0,
    wins:     (d.wins     as number) ?? 0,
    losses:   (d.losses   as number) ?? 0,
    played:   (d.played   as number) ?? 0,
    joinedAt: (d.joinedAt as number) ?? 0,
  };
}

// ─── createTournament ─────────────────────────────────────────────────────────

/**
 * Adds a new tournament document to the `tournaments` collection.
 * `id` and `createdAt` are generated automatically.
 * Returns the Firestore-assigned document ID.
 */
export async function createTournament(
  data: Omit<Tournament, 'id' | 'createdAt'>,
): Promise<string> {
  try {
    const ref = await addDoc(collection(db, TOURNAMENTS_COL), {
      ...data,
      createdAt: Date.now(),
    });
    return ref.id;
  } catch (error) {
    throw new Error(
      `createTournament failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── fetchActiveTournaments ───────────────────────────────────────────────────

/**
 * One-shot query returning all active tournaments matching the given tab type.
 *
 * Requires a Firestore composite index on:
 *   `type` (Ascending) + `status` (Ascending)
 *
 * Results are sorted client-side by `createdAt` (newest first) to avoid
 * adding an `orderBy` clause that would require an additional index field.
 */
export async function fetchActiveTournaments(
  tab: TournamentTab,
): Promise<Tournament[]> {
  try {
    const q = query(
      collection(db, TOURNAMENTS_COL),
      where('type',   '==', tab),
      where('status', '==', 'active'),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(toTournament)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    throw new Error(
      `fetchActiveTournaments failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── joinTournament ───────────────────────────────────────────────────────────

/**
 * Registers a player in `tournaments/{tournamentId}/players/{userId}`.
 *
 * Uses the userId as the document ID so registrations are deduplicated by
 * design — a player cannot accidentally register twice.
 *
 * Throws if the player is already registered (pending or approved) to prevent
 * double-charging entry fees.
 */
export async function joinTournament(
  tournamentId: string,
  userId: string,
): Promise<void> {
  if (!tournamentId || !userId) {
    throw new Error('joinTournament: tournamentId and userId are required');
  }

  try {
    const playerRef = doc(playersSubcol(tournamentId), userId);
    const existing  = await getDoc(playerRef);

    if (existing.exists()) {
      const currentStatus = existing.data()?.status as string | undefined;
      throw new Error(
        currentStatus === 'approved'
          ? 'Bu turnuvada zaten aktif bir oyuncusunuz.'
          : 'Turnuva başvurunuz zaten inceleniyor.',
      );
    }

    const payload: Omit<TournamentPlayer, 'userId'> = {
      status:   'pending',
      points:   0,
      wins:     0,
      losses:   0,
      played:   0,
      joinedAt: Date.now(),
    };

    await setDoc(playerRef, payload);
  } catch (error) {
    // Re-throw our own typed errors as-is; wrap unexpected Firestore errors.
    if (error instanceof Error) throw error;
    throw new Error(`joinTournament failed: ${String(error)}`);
  }
}

// ─── submitMatchResult ────────────────────────────────────────────────────────

/**
 * Submits a match result to the `matches` collection with an initial status
 * of `pending_opponent`, requiring confirmation from either the opponent
 * or the organizer before it is applied to the leaderboard.
 *
 * Returns the new match document ID.
 */
export async function submitMatchResult(
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  score: string,
): Promise<string> {
  if (!tournamentId || !player1Id || !player2Id) {
    throw new Error('submitMatchResult: tournamentId, player1Id, and player2Id are required');
  }
  if (!score.trim()) {
    throw new Error('submitMatchResult: score must not be empty');
  }

  try {
    const payload: Omit<TournamentMatch, 'id'> = {
      tournamentId,
      player1Id,
      player2Id,
      score:       score.trim(),
      status:      'pending_opponent',
      submittedBy: player1Id,
      createdAt:   Date.now(),
    };
    const ref = await addDoc(collection(db, MATCHES_COL), payload);
    return ref.id;
  } catch (error) {
    throw new Error(
      `submitMatchResult failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── approveMatchResult ───────────────────────────────────────────────────────

/**
 * Transitions a match result to `approved`.
 * Either the opponent or the organizer may call this — whichever acts first
 * verifies the result per the dual-path approval rule.
 *
 * Point calculation (Power Points transfer + League Points update) should be
 * handled by a Cloud Function triggered on this status change to guarantee
 * atomic, server-side consistency.
 */
export async function approveMatchResult(matchId: string): Promise<void> {
  if (!matchId) throw new Error('approveMatchResult: matchId is required');
  try {
    await updateDoc(doc(db, MATCHES_COL, matchId), {
      status: 'approved' as TournamentMatchStatus,
    });
  } catch (error) {
    throw new Error(
      `approveMatchResult failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── rejectMatchResult ────────────────────────────────────────────────────────

/**
 * Transitions a match result to `rejected`.
 * The submitting player must re-enter the correct score before
 * the result can be re-submitted.
 */
export async function rejectMatchResult(matchId: string): Promise<void> {
  if (!matchId) throw new Error('rejectMatchResult: matchId is required');
  try {
    await updateDoc(doc(db, MATCHES_COL, matchId), {
      status: 'rejected' as TournamentMatchStatus,
    });
  } catch (error) {
    throw new Error(
      `rejectMatchResult failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── buildTieBreakerSort ──────────────────────────────────────────────────────

/**
 * Returns a comparator function that sorts `TournamentPlayer` objects
 * according to the ordered `tieBreaker` priority array defined by the
 * tournament organizer.
 *
 * Mapping of `TieBreakerPriority` values:
 *   - `'wins'`    → `wins` descending
 *   - `'winRate'` → wins / max(played, 1) ratio descending
 *   - `'played'`  → `played` descending (participation bonus)
 *
 * All comparisons are descending (higher value = better rank).
 * If all criteria tie, relative order is preserved (stable sort).
 */
function buildTieBreakerSort(
  tieBreaker: TieBreakerConfig,
): (a: TournamentPlayer, b: TournamentPlayer) => number {
  return (a, b) => {
    for (const rule of tieBreaker) {
      let diff = 0;
      if (rule === 'wins') {
        diff = b.wins - a.wins;
      } else if (rule === 'winRate') {
        const rateA = a.played > 0 ? a.wins / a.played : 0;
        const rateB = b.played > 0 ? b.wins / b.played : 0;
        diff = rateB - rateA;
      } else if (rule === 'played') {
        diff = b.played - a.played;
      }
      if (diff !== 0) return diff;
    }
    return 0;
  };
}

// ─── subscribeToTournamentLeaderboard ─────────────────────────────────────────

/**
 * Real-time listener for all approved players in a tournament's
 * `players` subcollection, sorted by the tournament's `tieBreaker` config.
 *
 * Pass the tournament's `rules.tieBreaker` array so sorting stays consistent
 * with the backend `onMatchApproved` Cloud Function.
 *
 * Returns an unsubscribe function — call it in a `useEffect` cleanup.
 */
export function subscribeToTournamentLeaderboard(
  tournamentId: string,
  tieBreaker: TieBreakerConfig,
  callback: (players: TournamentPlayer[]) => void,
): () => void {
  const q = query(
    playersSubcol(tournamentId),
    where('status', '==', 'approved'),
  );

  const comparator = buildTieBreakerSort(tieBreaker);

  return onSnapshot(
    q,
    (snap) => {
      const players = snap.docs
        .map(toTournamentPlayer)
        .sort(comparator);
      callback(players);
    },
    (error) => {
      console.error('[tournamentService] subscribeToTournamentLeaderboard:', error);
    },
  );
}

// ─── updateTournamentRules ────────────────────────────────────────────────────

/**
 * Overwrites the `rules` field of a tournament document with `newRules`.
 *
 * Allows organizers to live-update `tieBreaker` priority order or
 * `powerPoints.tierDistribution` values for an active tournament without
 * requiring a full document replace.  The next leaderboard snapshot and the
 * next cron cycle will automatically pick up the new configuration.
 *
 * Throws if `tournamentId` is empty or the Firestore write fails.
 */
export async function updateTournamentRules(
  tournamentId: string,
  newRules: TournamentRules,
): Promise<void> {
  if (!tournamentId) {
    throw new Error('updateTournamentRules: tournamentId is required');
  }
  try {
    await updateDoc(doc(db, TOURNAMENTS_COL, tournamentId), {
      rules: newRules,
    });
  } catch (error) {
    throw new Error(
      `updateTournamentRules failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── subscribeToTournamentApprovals ───────────────────────────────────────────

/**
 * Real-time listener for all pending match results belonging to a tournament.
 * Results are sorted newest-first by `createdAt`.
 *
 * Intended to drive the organizer's approval action hub.
 * Returns an unsubscribe function — call it in a `useEffect` cleanup.
 *
 * Requires a Firestore composite index on:
 *   `tournamentId` (Ascending) + `status` (Ascending)
 */
export function subscribeToTournamentApprovals(
  tournamentId: string,
  callback: (matches: TournamentMatch[]) => void,
): () => void {
  const q = query(
    collection(db, MATCHES_COL),
    where('tournamentId', '==', tournamentId),
    where('status', 'in', ['pending_opponent', 'pending_organizer']),
  );

  return onSnapshot(
    q,
    (snap) => {
      const matches = snap.docs
        .map(toTournamentMatch)
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(matches);
    },
    (error) => {
      console.error('[tournamentService] subscribeToTournamentApprovals:', error);
    },
  );
}

// ─── fetchOrganizerTournaments ────────────────────────────────────────────────

/**
 * Returns all tournaments whose `organizerId` matches the given `uid`,
 * sorted newest-first. Used to populate the Organizer Dashboard selector.
 */
export async function fetchOrganizerTournaments(
  uid: string,
): Promise<Tournament[]> {
  if (!uid) throw new Error('fetchOrganizerTournaments: uid is required');
  try {
    const q    = query(collection(db, TOURNAMENTS_COL), where('organizerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map(toTournament)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    throw new Error(
      `fetchOrganizerTournaments failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── subscribeToPendingPlayers ────────────────────────────────────────────────

/**
 * Real-time listener for all players in a tournament's `players` subcollection
 * whose `status` is `'pending'`, sorted oldest-first (FIFO approval queue).
 *
 * Returns an unsubscribe function — call it in a `useEffect` cleanup.
 */
export function subscribeToPendingPlayers(
  tournamentId: string,
  callback: (players: TournamentPlayer[]) => void,
): () => void {
  const q = query(playersSubcol(tournamentId), where('status', '==', 'pending'));

  return onSnapshot(
    q,
    (snap) => {
      const players = snap.docs
        .map(toTournamentPlayer)
        .sort((a, b) => a.joinedAt - b.joinedAt);
      callback(players);
    },
    (error) => {
      console.error('[tournamentService] subscribeToPendingPlayers:', error);
    },
  );
}

// ─── approvePlayerRegistration ────────────────────────────────────────────────

/**
 * Promotes a player's registration status from `'pending'` to `'approved'`,
 * granting them full tournament participation rights.
 */
export async function approvePlayerRegistration(
  tournamentId: string,
  userId: string,
): Promise<void> {
  if (!tournamentId || !userId) {
    throw new Error('approvePlayerRegistration: tournamentId and userId are required');
  }
  try {
    await updateDoc(doc(playersSubcol(tournamentId), userId), {
      status: 'approved' as const,
    });
  } catch (error) {
    throw new Error(
      `approvePlayerRegistration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── rejectPlayerRegistration ─────────────────────────────────────────────────

/**
 * Permanently removes a pending player registration document from the
 * `players` subcollection. The player may re-apply if the tournament allows it.
 */
export async function rejectPlayerRegistration(
  tournamentId: string,
  userId: string,
): Promise<void> {
  if (!tournamentId || !userId) {
    throw new Error('rejectPlayerRegistration: tournamentId and userId are required');
  }
  try {
    await deleteDoc(doc(playersSubcol(tournamentId), userId));
  } catch (error) {
    throw new Error(
      `rejectPlayerRegistration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── triggerStandingsRefresh ──────────────────────────────────────────────────

/**
 * Client-side wrapper that invokes the `adminRefreshStandings` Cloud Function.
 *
 * Can be called by an organizer when `rules.autoUpdate` is `false` and they
 * want to manually trigger a full standings recalculation.
 *
 * Throws on network failure or if the Cloud Function returns an error.
 */
export async function triggerStandingsRefresh(tournamentId: string): Promise<void> {
  if (!tournamentId) {
    throw new Error('triggerStandingsRefresh: tournamentId is required');
  }
  try {
    const fns     = getFunctions();
    const refresh = httpsCallable<{ tournamentId: string }, { success: boolean }>(
      fns,
      'adminRefreshStandings',
    );
    await refresh({ tournamentId });
  } catch (error) {
    throw new Error(
      `triggerStandingsRefresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── seedMockData (DEV ONLY) ──────────────────────────────────────────────────

/** Shared tier-point table reused by both seed tournaments. */
const SEED_TIER_POINTS: TierPoints = {
  rank1:     100,
  rank2to5:  75,
  rank6to10: 50,
  rest:      25,
};

/**
 * DEV-ONLY helper that writes one "Özel" and one "Lig" tournament into
 * Firestore, then injects three approved players into the Özel tournament's
 * `players` subcollection so the leaderboard renders immediately.
 *
 * **Idempotent** — if any tournament document already exists the function
 * returns early without writing anything, preventing accidental re-seeding.
 */
export async function seedMockData(): Promise<void> {
  // ── Guard: skip if collection is already seeded ────────────────────────────
  const probe = await getDocs(query(collection(db, TOURNAMENTS_COL), limit(1)));
  if (!probe.empty) return;

  const now = Date.now();

  // ── Shared rules ──────────────────────────────────────────────────────────
  const sharedRules: TournamentRules = {
    tierPoints:     SEED_TIER_POINTS,
    tieBreaker:     ['wins', 'winRate', 'played'],
    updateInterval: 'weekly',
    autoUpdate:     true,
  };

  // ── Özel tournament ────────────────────────────────────────────────────────
  const ozelRef = await addDoc(collection(db, TOURNAMENTS_COL), {
    title:       'Bosphorus Open 2026',
    type:        'Özel',
    format:      'Lig+Eleme',
    entryFee:    150,
    rules:       sharedRules,
    status:      'active',
    organizerId: 'seed_organizer',
    createdAt:   now,
  } satisfies Omit<Tournament, 'id'>);

  // ── 3 approved seed players for the Özel leaderboard ──────────────────────
  const seedPlayers: Array<{ id: string; data: Omit<TournamentPlayer, 'userId'> }> = [
    { id: 'player_alguen', data: { status: 'approved', points: 100, wins: 5, losses: 1, played: 6, joinedAt: now } },
    { id: 'player_kaya',   data: { status: 'approved', points: 75,  wins: 3, losses: 2, played: 5, joinedAt: now } },
    { id: 'player_celik',  data: { status: 'approved', points: 50,  wins: 2, losses: 3, played: 5, joinedAt: now } },
  ];

  await Promise.all(
    seedPlayers.map(({ id, data }) =>
      setDoc(doc(playersSubcol(ozelRef.id), id), data),
    ),
  );

  // ── Lig tournament (createdAt +1 ms for deterministic ordering) ───────────
  await addDoc(collection(db, TOURNAMENTS_COL), {
    title:       'İstanbul Tenis Ligi',
    type:        'Lig',
    format:      'Lig',
    entryFee:    0,
    rules:       { ...sharedRules, autoUpdate: false },
    status:      'active',
    organizerId: 'seed_organizer',
    createdAt:   now + 1,
  } satisfies Omit<Tournament, 'id'>);
}
