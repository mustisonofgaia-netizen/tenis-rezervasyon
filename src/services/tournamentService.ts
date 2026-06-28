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
import type {
  ApprovalFlow,
  ApprovalStatus,
  LegacyStandingImport,
  TieBreakerCriterion,
  TierAssignment,
  Tournament,
  TournamentFormat,
  TournamentMatch,
  TournamentMatchRule,
  TournamentMatchStatus,
  TournamentPaymentMethod,
  TournamentPlayer,
  TournamentPowerConfig,
  TournamentStatus,
  TournamentTab,
  TournamentUpdateFrequency,
  TournamentVisibility,
  TournamentVisibilityLevel,
} from '../types/tournament';

// Re-export so UI layers can import domain types from a single location if needed.
export type {
  ApprovalFlow,
  ApprovalStatus,
  LegacyStandingImport,
  TieBreakerCriterion,
  TournamentFormat,
  TournamentMatch,
  TournamentMatchRule,
  TournamentMatchStatus,
  TournamentPaymentMethod,
  TournamentPlayer,
  TournamentPowerConfig,
  Tournament,
  TournamentStatus,
  TournamentTab,
  TournamentUpdateFrequency,
  TournamentVisibility,
  TournamentVisibilityLevel,
} from '../types/tournament';

// ─── Collection path constants ────────────────────────────────────────────────

const TOURNAMENTS_COL = 'tournaments';
const MATCHES_COL     = 'matches';

function playersSubcol(tournamentId: string) {
  return collection(db, TOURNAMENTS_COL, tournamentId, 'players');
}

// ─── Firestore data converters ────────────────────────────────────────────────

/**
 * Maps a raw Firestore document to the canonical `Tournament` discriminated
 * union. Defensive defaults ensure old documents read cleanly during the
 * Phase 2 → Phase 3 migration window.
 */
function toTournamentData(id: string, d: DocumentData): Tournament {
  const scoringSystem = d.scoringSystem === 'custom' ? 'custom' : 'classic';
  const rawPayment    = (d.paymentMethod as string) ?? 'free';
  const paymentMethod: TournamentPaymentMethod =
    rawPayment === 'in_app' || rawPayment === 'manual' ? rawPayment : 'free';

  const base = {
    id,
    title:       (d.title       as string)                    ?? '',
    type:        (d.type        as TournamentTab)             ?? 'Özel',
    format:      (d.format      as TournamentFormat)          ?? 'Lig',
    status:      (d.status      as TournamentStatus)          ?? 'upcoming',
    organizerId: (d.organizerId as string)                    ?? '',
    createdAt:   (d.createdAt   as number)                    ?? 0,
    startDate:   (d.startDate   as number)                    ?? 0,
    endDate:     (d.endDate     as number)                    ?? 0,
    location:    (d.location    as string)                    ?? '',
    visibility:  (d.visibility  as TournamentVisibilityLevel) ?? 'public',
    ...(d.inviteCode != null ? { inviteCode: d.inviteCode as string } : {}),
    matchRules: {
      setsToWin:       (d.matchRules?.setsToWin       as number)  ?? 2,
      lastSetTieBreak: (d.matchRules?.lastSetTieBreak as boolean) ?? false,
      winByTwo:        (d.matchRules?.winByTwo        as boolean) ?? false,
    } satisfies TournamentMatchRule,
    tieBreakerPriority: (d.tieBreakerPriority as TieBreakerCriterion[]) ?? [
      'head_to_head',
      'set_difference',
      'game_difference',
    ],
    visibilityRules: {
      showPowerPoints:   (d.visibilityRules?.showPowerPoints   as boolean) ?? true,
      showMatchesPlayed: (d.visibilityRules?.showMatchesPlayed as boolean) ?? true,
      showWins:          (d.visibilityRules?.showWins          as boolean) ?? true,
      showGamesWon:      (d.visibilityRules?.showGamesWon      as boolean) ?? true,
    } satisfies TournamentVisibility,
    hasLegacyData: (d.hasLegacyData as boolean) ?? false,
  };

  const scoringBranch = scoringSystem === 'custom'
    ? {
        scoringSystem: 'custom' as const,
        powerPointConfig: {
          maxPointTypes:   (d.powerPointConfig?.maxPointTypes   as number)             ?? 3,
          tierAssignments: (d.powerPointConfig?.tierAssignments as TierAssignment[])   ?? [],
          updateFrequency: (d.powerPointConfig?.updateFrequency as TournamentUpdateFrequency) ?? 'dynamic',
        } satisfies TournamentPowerConfig,
      }
    : { scoringSystem: 'classic' as const };

  const paymentBranch =
    paymentMethod === 'in_app' || paymentMethod === 'manual'
      ? { paymentMethod, entryFee: (d.entryFee as number) ?? 0 }
      : { paymentMethod: 'free' as const };

  return { ...base, ...scoringBranch, ...paymentBranch };
}

function toTournament(snap: QueryDocumentSnapshot<DocumentData>): Tournament {
  return toTournamentData(snap.id, snap.data());
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
 * One-shot query returning up to 50 tournaments.
 *
 * `visibility === 'public'`  — only documents where the `visibility` field is
 *   `'public'` are returned (the global explore feed).
 * `visibility === 'all'`     — no visibility filter; returns all documents
 *   (intended for internal/admin use only).
 *
 * Results are sorted client-side by `createdAt` descending.
 *
 * Requires a Firestore index on `visibility` (Ascending) for the public path.
 */
export async function fetchActiveTournaments(
  visibility: 'public' | 'all',
): Promise<Tournament[]> {
  try {
    const constraints =
      visibility === 'public'
        ? [where('visibility', '==', 'public'), limit(50)]
        : [limit(50)];

    const q    = query(collection(db, TOURNAMENTS_COL), ...constraints);
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

// ─── fetchTournamentById ──────────────────────────────────────────────────────

/**
 * Single-document fetch by ID.  Used by `TournamentDetailScreen` on mount.
 * Returns `null` when the document does not exist.
 */
export async function fetchTournamentById(id: string): Promise<Tournament | null> {
  try {
    const snap = await getDoc(doc(db, TOURNAMENTS_COL, id));
    if (!snap.exists()) return null;
    return toTournamentData(snap.id, snap.data());
  } catch (error) {
    throw new Error(
      `fetchTournamentById failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── updateTournament ─────────────────────────────────────────────────────────

/**
 * Partially updates a tournament document.
 * `id`, `createdAt`, and `organizerId` are immutable and are excluded from
 * the accepted `data` shape to prevent accidental overwrites.
 */
export async function updateTournament(
  id: string,
  data: Partial<Omit<Tournament, 'id' | 'createdAt' | 'organizerId'>>,
): Promise<void> {
  if (!id) throw new Error('updateTournament: id is required');
  try {
    await updateDoc(doc(db, TOURNAMENTS_COL, id), data as Record<string, unknown>);
  } catch (error) {
    throw new Error(
      `updateTournament failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── importLegacyStandings ────────────────────────────────────────────────────

/**
 * Bulk-imports historical standing records into a tournament's `players`
 * subcollection as pre-approved players with initial stats.
 *
 * • Each record is upserted (merged) so running this multiple times is safe.
 * • After a successful import, `hasLegacyData` is set to `true` on the
 *   tournament document so the UI can display a provenance banner.
 */
export async function importLegacyStandings(
  tournamentId: string,
  records: LegacyStandingImport[],
): Promise<void> {
  if (!tournamentId) throw new Error('importLegacyStandings: tournamentId is required');
  if (records.length === 0) throw new Error('importLegacyStandings: records array is empty');

  try {
    await Promise.all(
      records.map((r) => {
        const payload: Omit<TournamentPlayer, 'userId'> = {
          status:   'approved',
          points:   r.legacyPoints,
          wins:     r.legacyWins,
          losses:   Math.max(0, r.legacyMatchesPlayed - r.legacyWins),
          played:   r.legacyMatchesPlayed,
          joinedAt: r.importedAt,
        };
        return setDoc(
          doc(playersSubcol(tournamentId), r.userId),
          payload,
          { merge: true },
        );
      }),
    );
    await updateDoc(doc(db, TOURNAMENTS_COL, tournamentId), { hasLegacyData: true });
  } catch (error) {
    throw new Error(
      `importLegacyStandings failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── adjustPlayerPoints ───────────────────────────────────────────────────────

/**
 * Manual override: sets a player's Power Points to an explicit value.
 * Intended for the organizer's "Manuel Müdahale" panel.
 */
export async function adjustPlayerPoints(
  tournamentId: string,
  userId: string,
  newPoints: number,
): Promise<void> {
  if (!tournamentId || !userId) {
    throw new Error('adjustPlayerPoints: tournamentId and userId are required');
  }
  try {
    await updateDoc(doc(playersSubcol(tournamentId), userId), { points: newPoints });
  } catch (error) {
    throw new Error(
      `adjustPlayerPoints failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── subscribeToMyTournaments ─────────────────────────────────────────────────

/**
 * Real-time listener for all tournaments where `organizerId === uid`.
 *
 * • No status filter — `upcoming`, `active`, and `completed` tournaments all
 *   appear so that a newly-created tournament shows immediately.
 * • Results are sorted client-side by `createdAt` descending; this avoids
 *   a composite Firestore index while the data volume stays within the 50-doc
 *   `limit` cap.
 * • The listener fires instantly on subscribe (local cache) and again whenever
 *   Firestore writes a matching document, so `CreateTournamentScreen` → back
 *   navigation propagates within milliseconds.
 *
 * Returns an unsubscribe function — call it in a `useEffect` cleanup.
 *
 * Full participant lookup (tournaments where uid is an approved player)
 * requires a denormalized `participantIds` array field — deferred to Phase 4.
 */
export function subscribeToMyTournaments(
  uid: string,
  callback: (tournaments: Tournament[]) => void,
): () => void {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, TOURNAMENTS_COL),
    where('organizerId', '==', uid),
    limit(50),
  );

  return onSnapshot(
    q,
    (snap) => {
      const tournaments = snap.docs
        .map(toTournament)
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(tournaments);
    },
    (error) => {
      console.error('[tournamentService] subscribeToMyTournaments:', error);
    },
  );
}

// ─── joinTournament ───────────────────────────────────────────────────────────

/**
 * Registers a player in `tournaments/{tournamentId}/players/{userId}`.
 * Uses the userId as the document ID so registrations are deduplicated.
 * Throws if the player is already registered.
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
    if (error instanceof Error) throw error;
    throw new Error(`joinTournament failed: ${String(error)}`);
  }
}

// ─── Score validation helpers ─────────────────────────────────────────────────

/**
 * Parses a human-readable score string ("6-4, 7-5, 6-3") into numeric pairs.
 * Throws a descriptive Turkish-language error on malformed input.
 */
function parseMatchScore(score: string): Array<[number, number]> {
  const setStrings = score.split(',').map((s) => s.trim()).filter(Boolean);
  if (setStrings.length === 0) throw new Error('Skor boş olamaz.');

  return setStrings.map((s, idx) => {
    const parts = s.split('-').map((n) => parseInt(n.trim(), 10));
    if (parts.length !== 2 || parts.some(isNaN) || parts.some((p) => p < 0)) {
      throw new Error(
        `Set ${idx + 1} geçersiz format: "${s}". Beklenen format: "6-4"`,
      );
    }
    return [parts[0]!, parts[1]!] as [number, number];
  });
}

/**
 * Validates a parsed set array against the tournament's `matchRules`.
 *
 * Rules enforced:
 *  • Every set must have a clear winner (no draws).
 *  • Tie-break sets (7-6) are only legal in the LAST (deciding) set when
 *    `lastSetTieBreak === true` and `winByTwo === false`.
 *  • With `winByTwo === true`, the winner of each set must lead by ≥ 2 games
 *    (tie-break sets are therefore forbidden).
 *  • A set cannot end at 6-5 (neither 6-5 nor 5-6).
 *  • The match must terminate as soon as one player reaches `setsToWin`;
 *    extra sets are rejected.
 */
function validateMatchScore(
  sets: Array<[number, number]>,
  rules: TournamentMatchRule,
): void {
  const { setsToWin, winByTwo, lastSetTieBreak } = rules;
  let p1Sets = 0;
  let p2Sets = 0;

  for (let i = 0; i < sets.length; i++) {
    const [a, b] = sets[i]!;
    const isDecidingSet = i === sets.length - 1;
    const tieBreakLegal = isDecidingSet && lastSetTieBreak && !winByTwo;

    if (a === b) {
      throw new Error(`Set ${i + 1} skoru ${a}-${b}: Berabere biten set geçersiz.`);
    }

    const isTieBreak = (a === 7 && b === 6) || (a === 6 && b === 7);

    if (isTieBreak) {
      if (!tieBreakLegal) {
        throw new Error(
          winByTwo
            ? `Set ${i + 1} skoru ${a}-${b}: "2 fark" kuralı aktifken tie-break geçersizdir.`
            : `Set ${i + 1} skoru ${a}-${b}: Tie-break yalnızca belirleyici sette geçerlidir.`,
        );
      }
    } else {
      const winner = Math.max(a, b);
      const loser  = Math.min(a, b);
      const diff   = winner - loser;

      if (winner < 6) {
        throw new Error(
          `Set ${i + 1} skoru ${a}-${b}: Bir seti kazanmak için en az 6 oyun gerekli.`,
        );
      }
      if (winner === 6 && loser === 5) {
        throw new Error(
          `Set ${i + 1} skoru ${a}-${b}: 6-5 geçersiz skor — kazanan 7-5 oynamalı veya tie-break aktif olmalı.`,
        );
      }
      if (winByTwo && diff < 2) {
        throw new Error(
          `Set ${i + 1} skoru ${a}-${b}: "2 fark" kuralı aktif — kazanan en az 2 oyun önde bitirmeli.`,
        );
      }
    }

    if (a > b) p1Sets++;
    else p2Sets++;

    // Match must end as soon as someone reaches setsToWin
    if ((p1Sets === setsToWin || p2Sets === setsToWin) && i < sets.length - 1) {
      throw new Error(
        `Maç ${i + 1}. sette bitmeli, ancak fazladan set(ler) girilmiş.`,
      );
    }
  }

  if (p1Sets !== setsToWin && p2Sets !== setsToWin) {
    throw new Error(
      `Maç henüz tamamlanmamış: ${setsToWin} set kazanılması gerekiyor (şu an ${p1Sets}-${p2Sets}).`,
    );
  }
}

// ─── submitMatchResult ────────────────────────────────────────────────────────

/**
 * Validates the score string against the tournament's `matchRules`, then
 * writes the result with an initial `pending_opponent` status.
 *
 * Fetches the tournament document first so the validation is always based on
 * the latest rules — players cannot submit scores that violate current config.
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
  const trimmedScore = score.trim();
  if (!trimmedScore) throw new Error('submitMatchResult: score must not be empty');

  try {
    // Fetch tournament to get authoritative matchRules
    const tournament = await fetchTournamentById(tournamentId);
    if (!tournament) {
      throw new Error(`submitMatchResult: tournament "${tournamentId}" not found`);
    }

    // Parse and validate before any writes
    const sets = parseMatchScore(trimmedScore);
    validateMatchScore(sets, tournament.matchRules);

    const payload: Omit<TournamentMatch, 'id'> = {
      tournamentId,
      player1Id,
      player2Id,
      score:       trimmedScore,
      status:      'pending_opponent',
      submittedBy: player1Id,
      createdAt:   Date.now(),
    };
    const ref = await addDoc(collection(db, MATCHES_COL), payload);
    return ref.id;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`submitMatchResult failed: ${String(error)}`);
  }
}

// ─── approveMatchResult ───────────────────────────────────────────────────────

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
 * Returns a comparator for `TournamentPlayer` objects based on the organiser's
 * ordered `TieBreakerCriterion` list.
 *
 * Criteria mapping to `TournamentPlayer` fields:
 *   `'power_points'`    → `points` descending
 *   `'head_to_head'`    → not computable from player doc alone; falls through
 *   `'set_difference'`  → not stored on player doc; falls through
 *   `'game_difference'` → not stored on player doc; falls through
 *
 * Ultimate fallback: `wins` descending, then `played` descending.
 * Full per-criterion data will be available once standings are promoted to
 * `TournamentStanding` documents in a future phase.
 */
function buildTieBreakerSort(
  tieBreaker: TieBreakerCriterion[],
): (a: TournamentPlayer, b: TournamentPlayer) => number {
  return (a, b) => {
    for (const rule of tieBreaker) {
      let diff = 0;
      if (rule === 'power_points') {
        diff = b.points - a.points;
      }
      // head_to_head / set_difference / game_difference require match-level
      // aggregation; fall through to the next criterion.
      if (diff !== 0) return diff;
    }
    const winDiff = b.wins - a.wins;
    return winDiff !== 0 ? winDiff : b.played - a.played;
  };
}

// ─── subscribeToTournamentLeaderboard ─────────────────────────────────────────

/**
 * Real-time listener for all approved players in a tournament's `players`
 * subcollection, sorted by the tournament's `tieBreakerPriority`.
 * Returns an unsubscribe function — call it in a `useEffect` cleanup.
 */
export function subscribeToTournamentLeaderboard(
  tournamentId: string,
  tieBreaker: TieBreakerCriterion[],
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

// ─── subscribeToTournamentApprovals ───────────────────────────────────────────

/**
 * Real-time listener for pending match results belonging to a tournament.
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
 * Returns all tournaments whose `organizerId` matches `uid`, sorted newest-first.
 * Used to populate the Organizer Dashboard selector.
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
 * Real-time listener for pending player registrations, sorted oldest-first (FIFO).
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
 * Invokes the `adminRefreshStandings` Cloud Function.
 * Intended for organizers whose tournament uses `updateFrequency: 'manual'`.
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

/**
 * DEV-ONLY: writes one Özel (custom scoring) and one Lig (classic) tournament
 * into Firestore, then seeds three approved players into the Özel tournament.
 *
 * **Idempotent** — returns early if the collection is already seeded.
 */
export async function seedMockData(): Promise<void> {
  const probe = await getDocs(query(collection(db, TOURNAMENTS_COL), limit(1)));
  if (!probe.empty) return;

  const now = Date.now();

  const ozelRef = await addDoc(collection(db, TOURNAMENTS_COL), {
    title:       'Bosphorus Open 2026',
    type:        'Özel'       as TournamentTab,
    format:      'Lig+Eleme'  as const,
    status:      'active'     as TournamentStatus,
    organizerId: 'seed_organizer',
    createdAt:   now,
    visibility:  'public'     as TournamentVisibilityLevel,
    matchRules: {
      setsToWin: 2, lastSetTieBreak: false, winByTwo: false,
    } satisfies TournamentMatchRule,
    tieBreakerPriority: [
      'head_to_head', 'set_difference', 'game_difference', 'power_points',
    ] as TieBreakerCriterion[],
    visibilityRules: {
      showPowerPoints: true, showMatchesPlayed: true, showWins: true, showGamesWon: true,
    } satisfies TournamentVisibility,
    hasLegacyData:  false,
    scoringSystem:  'custom' as const,
    powerPointConfig: {
      maxPointTypes: 3,
      tierAssignments: [
        { rankStart: 1, rankEnd: 1,  pointsAssigned: 100 },
        { rankStart: 2, rankEnd: 5,  pointsAssigned: 60  },
        { rankStart: 6, rankEnd: 10, pointsAssigned: 30  },
      ] satisfies TierAssignment[],
      updateFrequency: 'dynamic' as TournamentUpdateFrequency,
    } satisfies TournamentPowerConfig,
    paymentMethod: 'in_app' as const,
    entryFee:      150,
  });

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

  await addDoc(collection(db, TOURNAMENTS_COL), {
    title:       'İstanbul Tenis Ligi',
    type:        'Lig'    as TournamentTab,
    format:      'Lig'    as const,
    status:      'active' as TournamentStatus,
    organizerId: 'seed_organizer',
    createdAt:   now + 1,
    visibility:  'public' as TournamentVisibilityLevel,
    matchRules: {
      setsToWin: 2, lastSetTieBreak: true, winByTwo: false,
    } satisfies TournamentMatchRule,
    tieBreakerPriority: [
      'head_to_head', 'set_difference',
    ] as TieBreakerCriterion[],
    visibilityRules: {
      showPowerPoints: false, showMatchesPlayed: true, showWins: true, showGamesWon: true,
    } satisfies TournamentVisibility,
    hasLegacyData: false,
    scoringSystem: 'classic' as const,
    paymentMethod: 'free'   as const,
  });
}
