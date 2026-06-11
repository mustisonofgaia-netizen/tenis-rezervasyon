import { doc, runTransaction } from 'firebase/firestore';

import { db } from './firebase';
import { sendPushNotification } from './notificationService';
import type { MatchDocument } from '../types/match';

// ─── Constants ────────────────────────────────────────────────────────────────

const K_FACTOR           = 32;
const USERS_COLLECTION   = 'users';
const MATCHES_COLLECTION = 'matches';

// ─── Elo Calculation ─────────────────────────────────────────────────────────

/**
 * Returns new Elo ratings for a winner and a (primary) loser.
 * Uses the standard Elo formula with K = 32. Floor is 100.
 */
export function calculateNewElo(
  winnerElo: number,
  loserElo: number,
): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser  = 1 - expectedWinner;

  const newWinnerElo = Math.round(winnerElo + K_FACTOR * (1 - expectedWinner));
  const newLoserElo  = Math.max(100, Math.round(loserElo + K_FACTOR * (0 - expectedLoser)));

  return { newWinnerElo, newLoserElo };
}

// ─── Score Submission ─────────────────────────────────────────────────────────

/**
 * Atomically records the match result and updates Elo + stats for all involved
 * players. Stores an `_eloSnapshot` so the transaction can be cleanly reversed
 * by `updateMatchScore`.
 *
 * Elo is calculated between the winner and the *primary* loser (loserIds[0]).
 * All remaining participants only have their `matchesPlayed` counter incremented.
 */
export async function submitMatchScore(
  matchId: string,
  score: string,
  winnerId: string,
  loserIds: string[],
): Promise<void> {
  if (loserIds.length === 0) throw new Error('En az bir kaybeden gerekli.');

  const matchRef           = doc(db, MATCHES_COLLECTION, matchId);
  const winnerRef          = doc(db, USERS_COLLECTION, winnerId);
  const primaryLoserRef    = doc(db, USERS_COLLECTION, loserIds[0]!);
  const secondaryLoserRefs = loserIds.slice(1).map((id) => doc(db, USERS_COLLECTION, id));

  // Captured inside the transaction for post-tx notification dispatch
  let capturedJoinedPlayers: string[] = [];
  let capturedHostId = '';

  await runTransaction(db, async (tx) => {
    // ── 1. Reads (all before any write) ───────────────────────────────────
    const matchSnap        = await tx.get(matchRef);
    const winnerSnap       = await tx.get(winnerRef);
    const primaryLoserSnap = await tx.get(primaryLoserRef);
    const secSnaps         = await Promise.all(secondaryLoserRefs.map((r) => tx.get(r)));

    // ── 2. Guards ──────────────────────────────────────────────────────────
    if (!matchSnap.exists()) throw new Error('Maç bulunamadı.');
    if (matchSnap.data()?.isScored) throw new Error('Bu maç zaten skorlandı.');

    capturedJoinedPlayers = (matchSnap.data()?.joinedPlayers as string[] | undefined) ?? [];
    capturedHostId        = (matchSnap.data()?.hostId        as string  | undefined) ?? '';

    // ── 3. Elo ────────────────────────────────────────────────────────────
    const winnerElo       = (winnerSnap.data()?.eloRating       as number | undefined) ?? 1500;
    const primaryLoserElo = (primaryLoserSnap.data()?.eloRating as number | undefined) ?? 1500;

    const { newWinnerElo, newLoserElo } = calculateNewElo(winnerElo, primaryLoserElo);

    // ── 4. Writes ──────────────────────────────────────────────────────────
    // Store pre-scoring snapshot for clean rollback
    tx.update(matchRef, {
      isScored: true,
      score,
      winnerId,
      _eloSnapshot: { [winnerId]: winnerElo, [loserIds[0]!]: primaryLoserElo },
    });

    tx.set(winnerRef, {
      eloRating:     newWinnerElo,
      matchesPlayed: ((winnerSnap.data()?.matchesPlayed as number | undefined) ?? 0) + 1,
      wins:          ((winnerSnap.data()?.wins          as number | undefined) ?? 0) + 1,
    }, { merge: true });

    tx.set(primaryLoserRef, {
      eloRating:     newLoserElo,
      matchesPlayed: ((primaryLoserSnap.data()?.matchesPlayed as number | undefined) ?? 0) + 1,
    }, { merge: true });

    secondaryLoserRefs.forEach((ref, i) => {
      const snap = secSnaps[i];
      tx.set(ref, {
        matchesPlayed: ((snap?.data()?.matchesPlayed as number | undefined) ?? 0) + 1,
      }, { merge: true });
    });
  });

  // Notify all participants except the host — fire-and-forget
  const recipients = capturedJoinedPlayers.filter((id) => id !== capturedHostId);
  for (const playerId of recipients) {
    sendPushNotification(
      playerId,
      '🏆 Maç Sonucu Girildi!',
      `${score} skoruyla maç sonuçlandı. Güncel Elo puanını görmek için profiline bak!`,
      { matchId },
    ).catch(() => {});
  }
}

// ─── Score Update (with Elo rollback) ────────────────────────────────────────

/**
 * Atomically overwrites a previously submitted score while performing a clean
 * Elo rollback.
 *
 * Algorithm:
 *  1. Read match + `_eloSnapshot` (pre-scoring Elos stored by `submitMatchScore`).
 *  2. Recalculate the exact deltas applied during the original scoring.
 *  3. Subtract those deltas from each player's current rating (reversal).
 *  4. Apply a fresh Elo calculation for the new winner/loser pair.
 *  5. Adjust `wins` counter only if the winner identity has changed.
 *     `matchesPlayed` is NOT touched — we never double-count.
 */
export async function updateMatchScore(
  matchId: string,
  newScore: string,
  newWinnerId: string,
  newLoserIds: string[],
): Promise<void> {
  if (newLoserIds.length === 0) throw new Error('En az bir kaybeden gerekli.');

  const newPrimaryLoserId = newLoserIds[0]!;
  const matchRef          = doc(db, MATCHES_COLLECTION, matchId);

  // Captured inside the transaction for post-tx notification dispatch
  let capturedJoinedPlayers: string[] = [];
  let capturedHostId = '';

  await runTransaction(db, async (tx) => {
    // ── 1. Read match ──────────────────────────────────────────────────────
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists()) throw new Error('Maç bulunamadı.');

    const matchData = matchSnap.data() as MatchDocument & { _eloSnapshot?: Record<string, number> };
    if (!matchData.isScored) throw new Error('Henüz skorlanmamış bir maç güncellenemez.');

    capturedJoinedPlayers = matchData.joinedPlayers;
    capturedHostId        = matchData.hostId ?? '';

    const oldWinnerId       = matchData.winnerId ?? '';
    const oldPrimaryLoserId = matchData.joinedPlayers.find((id) => id !== oldWinnerId) ?? '';

    // ── 2. Collect all affected player IDs and read them ──────────────────
    const allIds = [...new Set(
      [oldWinnerId, oldPrimaryLoserId, newWinnerId, newPrimaryLoserId].filter(Boolean),
    )];
    const refs   = allIds.map((id) => doc(db, USERS_COLLECTION, id));
    const snaps  = await Promise.all(refs.map((r) => tx.get(r)));

    const getElo  = (id: string) => ((snaps[allIds.indexOf(id)]?.data()?.eloRating) as number | undefined) ?? 1500;
    const getWins = (id: string) => ((snaps[allIds.indexOf(id)]?.data()?.wins)       as number | undefined) ?? 0;

    // ── 3. Reverse old Elo using stored snapshot ───────────────────────────
    const snap         = matchData._eloSnapshot ?? {};
    const preOldWin    = (snap[oldWinnerId]       as number | undefined) ?? getElo(oldWinnerId);
    const preOldLoss   = (snap[oldPrimaryLoserId] as number | undefined) ?? getElo(oldPrimaryLoserId);

    const { newWinnerElo: postOldWin, newLoserElo: postOldLoss } = calculateNewElo(preOldWin, preOldLoss);

    const oldWinnerGain = postOldWin  - preOldWin;   // how much winner gained
    const oldLoserLoss  = preOldLoss  - postOldLoss;  // how much loser lost (positive)

    // Map: playerId → restored Elo (after reversal)
    const eloMap = new Map<string, number>(allIds.map((id) => [id, getElo(id)]));
    eloMap.set(oldWinnerId,       Math.max(100, getElo(oldWinnerId)       - oldWinnerGain));
    if (oldPrimaryLoserId) {
      eloMap.set(oldPrimaryLoserId, Math.max(100, getElo(oldPrimaryLoserId) + oldLoserLoss));
    }

    // ── 4. Apply new Elo ───────────────────────────────────────────────────
    const preNewWin  = eloMap.get(newWinnerId)       ?? getElo(newWinnerId);
    const preNewLoss = eloMap.get(newPrimaryLoserId) ?? getElo(newPrimaryLoserId);

    const { newWinnerElo, newLoserElo } = calculateNewElo(preNewWin, preNewLoss);
    eloMap.set(newWinnerId,       newWinnerElo);
    eloMap.set(newPrimaryLoserId, newLoserElo);

    // ── 5. Write match ─────────────────────────────────────────────────────
    tx.update(matchRef, {
      score:   newScore,
      winnerId: newWinnerId,
      _eloSnapshot: { [newWinnerId]: preNewWin, [newPrimaryLoserId]: preNewLoss },
    });

    // ── 6. Write player stats ──────────────────────────────────────────────
    for (const id of allIds) {
      const ref    = doc(db, USERS_COLLECTION, id);
      const newElo = eloMap.get(id) ?? getElo(id);

      // wins counter: only changes when winner identity changes
      let winsDelta = 0;
      if (id === oldWinnerId && id !== newWinnerId) winsDelta = -1;
      if (id === newWinnerId && id !== oldWinnerId) winsDelta = +1;

      const data: Record<string, number> = { eloRating: newElo };
      if (winsDelta !== 0) data.wins = Math.max(0, getWins(id) + winsDelta);

      tx.set(ref, data, { merge: true });
    }
  });

  // Notify all participants except the host — fire-and-forget
  const recipients = capturedJoinedPlayers.filter((id) => id !== capturedHostId);
  for (const playerId of recipients) {
    sendPushNotification(
      playerId,
      '🏆 Maç Sonucu Güncellendi!',
      `${newScore} skoruyla maç sonuçlandı. Güncel Elo puanını görmek için profiline bak!`,
      { matchId },
    ).catch(() => {});
  }
}
