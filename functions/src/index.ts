import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

import {
  handleIyzicoCallback,
  handleIyzicoSuccessPage,
} from './handlers/iyzicoCallbackHandler.js';
import { createPaymentSession as initializeIyzicoPaymentSession } from './services/paymentSession.js';
import { cleanupExpiredLocks as runCleanupExpiredLocks } from './services/reservationService.js';
import { assertSlotLockedByUser } from './services/slotVerification.js';
import type {
  CreatePaymentSessionRequest,
  CreatePaymentSessionResponse,
} from './types/payment.js';

initializeApp();
const db = getFirestore();
setGlobalOptions({ maxInstances: 10 });

function parseCreatePaymentSessionRequest(
  data: unknown,
): CreatePaymentSessionRequest {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body must be an object.');
  }

  const { date, slotTime, userId } = data as Partial<CreatePaymentSessionRequest>;

  if (!date || typeof date !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid date string is required.');
  }

  if (!slotTime || typeof slotTime !== 'string') {
    throw new HttpsError(
      'invalid-argument',
      'A valid slotTime string is required.',
    );
  }

  if (!userId || typeof userId !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid userId string is required.');
  }

  return { date, slotTime, userId };
}

export const createPaymentSession = onCall<
  CreatePaymentSessionRequest,
  Promise<CreatePaymentSessionResponse>
>(async (request) => {
  const { date, slotTime, userId } = parseCreatePaymentSessionRequest(
    request.data,
  );

  logger.info('Creating payment session', { date, slotTime, userId });

  await assertSlotLockedByUser(date, slotTime, userId);

  const session = await initializeIyzicoPaymentSession(date, slotTime, userId);

  logger.info('Payment session created', {
    date,
    slotTime,
    userId,
    conversationId: session.conversationId,
  });

  return session;
});

export const iyzicoCallback = onRequest(async (req, res) => {
  await handleIyzicoCallback(req, res);
});

export const paymentSuccessPage = onRequest((req, res) => {
  handleIyzicoSuccessPage(req, res);
});

export const cleanupExpiredLocks = onSchedule('every 5 minutes', async () => {
  const releasedCount = await runCleanupExpiredLocks();

  logger.info('Expired slot lock cleanup completed', { releasedCount });
});

// ─── Push notification helper ─────────────────────────────────────────────────

/**
 * Sends a push notification to a single user via FCM.
 *
 * Token lookup order: `pushToken` → `fcmToken` → `expoPushToken`.
 * Failures are logged and swallowed so a bad/expired token never crashes
 * the calling Cloud Function.
 */
async function sendNotificationToUser(
  userId: string,
  title:  string,
  body:   string,
): Promise<void> {
  try {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      logger.info('sendNotificationToUser: user document not found', { userId });
      return;
    }

    const data  = userSnap.data();
    const token = (
      (data?.pushToken     as string | undefined) ??
      (data?.fcmToken      as string | undefined) ??
      (data?.expoPushToken as string | undefined)
    );

    if (!token) {
      logger.info('sendNotificationToUser: no push token found for user', { userId });
      return;
    }

    await getMessaging().send({ token, notification: { title, body } });
    logger.info('sendNotificationToUser: notification sent', { userId, title });
  } catch (error) {
    logger.error('sendNotificationToUser: failed to send notification', {
      userId,
      title,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Tournament Engine ────────────────────────────────────────────────────────

type TieBreakerPriority = 'wins' | 'winRate' | 'played';

type TierPoints = {
  rank1:     number;
  rank2to5:  number;
  rank6to10: number;
  rest:      number;
};

const DEFAULT_TIER_POINTS: TierPoints = {
  rank1:     100,
  rank2to5:  75,
  rank6to10: 50,
  rest:      25,
};

/**
 * Parses a tennis score string (e.g. "6:4, 3:6, 6:2") and determines
 * the winner by counting sets won. Falls back to player2 on a draw.
 */
function determineWinner(
  score:     string,
  player1Id: string,
  player2Id: string,
): { winnerId: string; loserId: string } {
  let p1Sets = 0;
  let p2Sets = 0;

  const sets = score.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  for (const set of sets) {
    const [rawP1, rawP2] = set.split(':');
    const p1Games = parseInt(rawP1 ?? '0', 10);
    const p2Games = parseInt(rawP2 ?? '0', 10);
    if (p1Games > p2Games) p1Sets++;
    else                   p2Sets++;
  }

  return p1Sets > p2Sets
    ? { winnerId: player1Id, loserId: player2Id }
    : { winnerId: player2Id, loserId: player1Id };
}

/**
 * Fires on every update to a `matches/{matchId}` document.
 *
 * In the Controlled/Buffered Update model this trigger does NOT calculate
 * or distribute points — that responsibility belongs exclusively to
 * `refreshTournamentStandings`.  Here we only confirm the `* → approved`
 * transition and notify both players so they receive immediate feedback.
 */
export const onMatchApproved = onDocumentUpdated(
  'matches/{matchId}',
  async (event) => {
    const after  = event.data?.after.data();
    const before = event.data?.before.data();

    if (!after || !before) {
      logger.error('onMatchApproved: missing event data', {
        matchId: event.params.matchId,
      });
      return null;
    }

    // Only react to the `* → approved` transition; ignore all other writes.
    if (after.status !== 'approved' || before.status === 'approved') {
      return null;
    }

    const matchId:   string = event.params.matchId;
    const player1Id: string = (after.player1Id as string) ?? '';
    const player2Id: string = (after.player2Id as string) ?? '';

    logger.info('onMatchApproved: approved transition detected', {
      matchId,
      tournamentId: (after.tournamentId as string) ?? '',
      player1Id,
      player2Id,
    });

    // ── Notify both players (fire-and-forget) ───────────────────────────────
    await Promise.allSettled([
      sendNotificationToUser(
        player1Id,
        'Maç Onaylandı ✅',
        'Maç sonucunuz onaylandı. Sıralama tablosu bir sonraki güncellemede yenilenir.',
      ),
      sendNotificationToUser(
        player2Id,
        'Maç Onaylandı ✅',
        'Maç sonucunuz onaylandı. Sıralama tablosu bir sonraki güncellemede yenilenir.',
      ),
    ]);

    logger.info('onMatchApproved: notifications dispatched', { matchId });

    return null;
  },
);

// ─── Standings Refresh Engine ─────────────────────────────────────────────────

/**
 * Core standings refresh logic.
 *
 * Algorithm:
 *   1. Fetch all `approved` matches that belong to this tournament.
 *   2. Tally `wins`, `losses`, and `played` per player from raw match history
 *      (source-of-truth rebuild — does NOT trust existing player doc values).
 *   3. Fetch all approved players in the tournament.
 *   4. Sort players in-memory using the tournament's `rules.tieBreaker`.
 *   5. Assign a fresh `points` value from `rules.tierPoints` based on rank.
 *   6. Commit one `WriteBatch` update per player (atomic, < 500 player limit).
 *
 * Requires a composite Firestore index on `matches`:
 *   `tournamentId` (Ascending) + `status` (Ascending)
 */
async function refreshTournamentStandings(tournamentId: string): Promise<void> {
  // ── Fetch tournament config ───────────────────────────────────────────────
  const tSnap = await db.collection('tournaments').doc(tournamentId).get();
  if (!tSnap.exists) {
    logger.error('refreshTournamentStandings: tournament not found', { tournamentId });
    return;
  }

  const tData           = tSnap.data()!;
  const tierPoints: TierPoints =
    (tData.rules?.tierPoints as TierPoints | undefined) ?? DEFAULT_TIER_POINTS;
  const tieBreakerRules: TieBreakerPriority[] =
    (tData.rules?.tieBreaker as TieBreakerPriority[] | undefined) ?? ['wins', 'played'];

  logger.info('refreshTournamentStandings: config loaded', {
    tournamentId, tieBreakerRules, tierPoints,
  });

  // ── Tally wins/losses/played from approved match history ──────────────────
  const matchesSnap = await db
    .collection('matches')
    .where('tournamentId', '==', tournamentId)
    .where('status',       '==', 'approved')
    .get();

  const statsMap = new Map<string, { wins: number; losses: number; played: number }>();

  for (const matchDoc of matchesSnap.docs) {
    const m         = matchDoc.data();
    const score     = (m.score     as string) ?? '';
    const player1Id = (m.player1Id as string) ?? '';
    const player2Id = (m.player2Id as string) ?? '';

    if (!player1Id || !player2Id || !score) continue;

    const { winnerId, loserId } = determineWinner(score, player1Id, player2Id);

    if (!statsMap.has(winnerId)) statsMap.set(winnerId, { wins: 0, losses: 0, played: 0 });
    if (!statsMap.has(loserId))  statsMap.set(loserId,  { wins: 0, losses: 0, played: 0 });

    statsMap.get(winnerId)!.wins   += 1;
    statsMap.get(winnerId)!.played += 1;
    statsMap.get(loserId)!.losses  += 1;
    statsMap.get(loserId)!.played  += 1;
  }

  logger.info('refreshTournamentStandings: match history tallied', {
    tournamentId, matchCount: matchesSnap.size,
  });

  // ── Fetch approved players ────────────────────────────────────────────────
  const playersSnap = await db
    .collection('tournaments')
    .doc(tournamentId)
    .collection('players')
    .where('status', '==', 'approved')
    .get();

  if (playersSnap.empty) {
    logger.info('refreshTournamentStandings: no approved players, skipping', { tournamentId });
    return;
  }

  // ── Build in-memory player list with fresh stats ──────────────────────────
  type StandingPlayer = {
    userId:  string;
    wins:    number;
    losses:  number;
    played:  number;
    ref:     DocumentReference;
  };

  const players: StandingPlayer[] = playersSnap.docs.map((d) => {
    const stats = statsMap.get(d.id) ?? { wins: 0, losses: 0, played: 0 };
    return {
      userId: d.id,
      wins:   stats.wins,
      losses: stats.losses,
      played: stats.played,
      ref:    d.ref,
    };
  });

  // ── Sort by tieBreaker priority (descending = better rank) ────────────────
  players.sort((a, b) => {
    for (const rule of tieBreakerRules) {
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
  });

  // ── Assign tier-based points and commit atomically ────────────────────────
  const batch        = db.batch();
  let   updatedCount = 0;

  players.forEach((player, index) => {
    const rank = index + 1;
    let newPoints: number;

    if (rank === 1)      newPoints = tierPoints.rank1;
    else if (rank <= 5)  newPoints = tierPoints.rank2to5;
    else if (rank <= 10) newPoints = tierPoints.rank6to10;
    else                 newPoints = tierPoints.rest;

    batch.update(player.ref, {
      points:  newPoints,
      wins:    player.wins,
      losses:  player.losses,
      played:  player.played,
    });
    updatedCount++;
  });

  await batch.commit();

  logger.info('refreshTournamentStandings: standings committed', {
    tournamentId, updatedCount, tierPoints,
  });
}

// ─── adminRefreshStandings (callable) ────────────────────────────────────────

/**
 * Callable Cloud Function that lets an organizer manually trigger a standings
 * refresh for a tournament.  Used when `rules.autoUpdate` is `false`.
 *
 * Requires the caller to be authenticated.
 * Throws `permission-denied` if called without a valid Firebase Auth token.
 */
export const adminRefreshStandings = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const tournamentId = (request.data as { tournamentId?: unknown }).tournamentId;
    if (typeof tournamentId !== 'string' || !tournamentId) {
      throw new HttpsError('invalid-argument', 'A valid tournamentId string is required.');
    }

    logger.info('adminRefreshStandings: manual refresh requested', {
      tournamentId,
      uid: request.auth.uid,
    });

    await refreshTournamentStandings(tournamentId);

    logger.info('adminRefreshStandings: refresh complete', { tournamentId });

    return { success: true };
  },
);

// ─── autoRefreshStandings (weekly cron) ──────────────────────────────────────

/**
 * Runs every Monday at midnight.
 *
 * Finds every active tournament with `rules.autoUpdate === true` and
 * `rules.updateInterval === 'weekly'`, then calls
 * `refreshTournamentStandings` for each.
 *
 * Tournaments where `autoUpdate` is `false` are intentionally skipped —
 * their organizers control the refresh manually via `adminRefreshStandings`.
 */
export const autoRefreshStandings = onSchedule(
  'every monday 00:00',
  async () => {
    logger.info('autoRefreshStandings: starting weekly auto-refresh');

    const tournamentsSnap = await db
      .collection('tournaments')
      .where('status',                  '==', 'active')
      .where('rules.autoUpdate',        '==', true)
      .where('rules.updateInterval',    '==', 'weekly')
      .get();

    if (tournamentsSnap.empty) {
      logger.info('autoRefreshStandings: no eligible tournaments found, exiting');
      return;
    }

    logger.info('autoRefreshStandings: eligible tournaments found', {
      count: tournamentsSnap.size,
    });

    for (const tDoc of tournamentsSnap.docs) {
      try {
        await refreshTournamentStandings(tDoc.id);
      } catch (err) {
        logger.error('autoRefreshStandings: failed for tournament', {
          tournamentId: tDoc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('autoRefreshStandings: all eligible tournaments processed');
  },
);

// ─── onMatchSubmitted ─────────────────────────────────────────────────────────

/**
 * Fires when a new `matches/{matchId}` document is created (i.e. a player
 * submits a score).  Notifies the tournament organizer that a result is
 * awaiting review, and notifies the opponent so they can confirm or dispute.
 *
 * `player1Id` is treated as the submitter per the `submitMatchResult` service
 * convention, so `player2Id` is the opponent who receives the confirmation
 * notification.
 */
export const onMatchSubmitted = onDocumentCreated(
  'matches/{matchId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) {
      logger.error('onMatchSubmitted: missing event data', {
        matchId: event.params.matchId,
      });
      return null;
    }

    const matchId:      string = event.params.matchId;
    const tournamentId: string = (data.tournamentId as string) ?? '';
    const player1Id:    string = (data.player1Id    as string) ?? '';
    const player2Id:    string = (data.player2Id    as string) ?? '';

    logger.info('onMatchSubmitted: new match document created', {
      matchId, tournamentId, player1Id, player2Id,
    });

    if (!tournamentId || !player1Id || !player2Id) {
      logger.error('onMatchSubmitted: missing required fields', {
        matchId, tournamentId, player1Id, player2Id,
      });
      return null;
    }

    // ── Resolve organizer from tournament document ──────────────────────────
    const tournamentSnap = await db.collection('tournaments').doc(tournamentId).get();
    const organizerId: string = (tournamentSnap.data()?.organizerId as string) ?? '';

    if (!organizerId) {
      logger.info('onMatchSubmitted: no organizerId on tournament, skipping organizer notify', {
        tournamentId,
      });
    }

    // ── player1Id is the submitter; player2Id is the opponent ───────────────
    const opponentId = player2Id;

    logger.info('onMatchSubmitted: dispatching notifications', {
      matchId, organizerId, opponentId,
    });

    await Promise.allSettled([
      organizerId
        ? sendNotificationToUser(
            organizerId,
            'Yeni Maç Sonucu',
            'Onay bekleyen yeni bir skor girildi.',
          )
        : Promise.resolve(),
      sendNotificationToUser(
        opponentId,
        'Hakkınızda Skor Girildi',
        'Hakkınızda yeni bir maç skoru girildi. Lütfen onaylayın.',
      ),
    ]);

    logger.info('onMatchSubmitted: notifications dispatched', {
      matchId, organizerId, opponentId,
    });

    return null;
  },
);
