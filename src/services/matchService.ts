import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  where,
  query,
} from 'firebase/firestore';

import type { MatchDocument, SkillLevel } from '../types/match';
import { db } from './firebase';

// ─── Collection ───────────────────────────────────────────────────────────────

const MATCHES_COLLECTION = 'matches';

// ─── Publish a new match listing ──────────────────────────────────────────────

export type PublishMatchInput = {
  bookingId: string;
  hostId: string;
  courtId: string;
  date: string;
  slotTime: string;
  requiredPlayers: number;
  skillLevel: SkillLevel;
};

/**
 * Creates a new open match in Firestore.
 * The host is automatically added to `joinedPlayers`.
 * Returns the new document ID.
 */
export async function publishMatch(input: PublishMatchInput): Promise<string> {
  const payload: Omit<MatchDocument, 'id'> = {
    ...input,
    joinedPlayers: [input.hostId],
    status: 'OPEN',
    createdAt: Date.now(),
  };

  const ref = await addDoc(collection(db, MATCHES_COLLECTION), payload);
  return ref.id;
}

// ─── Subscribe to open matches ────────────────────────────────────────────────

/**
 * Real-time listener for all matches with status 'OPEN'.
 * Results are sorted client-side by date → slotTime to avoid requiring a
 * composite Firestore index on the (status, date, slotTime) fields.
 */
export function subscribeToOpenMatches(
  callback: (matches: MatchDocument[]) => void,
): () => void {
  const q = query(
    collection(db, MATCHES_COLLECTION),
    where('status', '==', 'OPEN'),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const matches: MatchDocument[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MatchDocument, 'id'>) }))
        .sort((a, b) => {
          const dateDiff = a.date.localeCompare(b.date);
          return dateDiff !== 0 ? dateDiff : a.slotTime.localeCompare(b.slotTime);
        });
      callback(matches);
    },
    (error) => {
      console.error('[matchService] Failed to subscribe to open matches:', error);
      callback([]);
    },
  );
}

// ─── Subscribe to matches hosted by a user ────────────────────────────────────

/**
 * Real-time listener for all non-cancelled matches where the caller is the host.
 * Used by MyBookingsScreen to detect active listings and suppress the "Oyuncu Ara" button.
 */
export function subscribeToMyHostedMatches(
  userId: string,
  callback: (matches: MatchDocument[]) => void,
): () => void {
  const q = query(
    collection(db, MATCHES_COLLECTION),
    where('hostId', '==', userId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const matches: MatchDocument[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MatchDocument, 'id'>) }))
        .filter((m) => m.status !== 'CANCELLED');
      callback(matches);
    },
    (error) => {
      console.error('[matchService] Failed to subscribe to hosted matches:', error);
      callback([]);
    },
  );
}

// ─── Join a match ─────────────────────────────────────────────────────────────

/**
 * Atomically adds `userId` to `joinedPlayers` and flips the status to 'FULL'
 * once `joinedPlayers.length` reaches `requiredPlayers`.
 *
 * Throws a human-readable Turkish error string on validation failures so
 * callers can surface it directly in an Alert.
 */
export async function joinMatch(matchId: string, userId: string): Promise<void> {
  const docRef = doc(db, MATCHES_COLLECTION, matchId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error('Maç bulunamadı.');

    const data = snapshot.data() as Omit<MatchDocument, 'id'>;

    if (data.status !== 'OPEN') throw new Error('Bu maça artık katılınamaz.');
    if (data.joinedPlayers.includes(userId)) throw new Error('Bu maça zaten katıldınız.');

    const newPlayers = [...data.joinedPlayers, userId];
    const updates: Record<string, unknown> = { joinedPlayers: newPlayers };
    if (newPlayers.length >= data.requiredPlayers) updates.status = 'FULL';

    transaction.update(docRef, updates);
  });
}

// ─── Subscribe to matches the user has joined ─────────────────────────────────

/**
 * Real-time listener for all non-cancelled matches in which `userId` appears
 * in `joinedPlayers` (includes both hosted and joined-as-participant matches).
 * Results are sorted client-side by date → slotTime.
 */
export function subscribeToMyJoinedMatches(
  userId: string,
  callback: (matches: MatchDocument[]) => void,
): () => void {
  const q = query(
    collection(db, MATCHES_COLLECTION),
    where('joinedPlayers', 'array-contains', userId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const matches: MatchDocument[] = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MatchDocument, 'id'>) }))
        .filter((m) => m.status !== 'CANCELLED')
        .sort((a, b) => {
          const dateDiff = a.date.localeCompare(b.date);
          return dateDiff !== 0 ? dateDiff : a.slotTime.localeCompare(b.slotTime);
        });
      callback(matches);
    },
    (error) => {
      console.error('[matchService] Failed to subscribe to joined matches:', error);
      callback([]);
    },
  );
}

// ─── Remove a player from a match (host only) ─────────────────────────────────

/**
 * Atomically removes `targetUserId` from `joinedPlayers`.
 * Caller must be the `hostId`. If the match was 'FULL', status reverts to 'OPEN'.
 * Throws a human-readable Turkish error on validation failures.
 */
export async function removePlayerFromMatch(
  matchId: string,
  targetUserId: string,
  hostId: string,
): Promise<void> {
  const docRef = doc(db, MATCHES_COLLECTION, matchId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error('Maç bulunamadı.');

    const data = snapshot.data() as Omit<MatchDocument, 'id'>;

    if (data.hostId !== hostId) throw new Error('Yalnızca maç sahibi oyuncu çıkarabilir.');
    if (targetUserId === hostId) throw new Error('Maç sahibi kendini çıkaramaz.');
    if (!data.joinedPlayers.includes(targetUserId)) throw new Error('Oyuncu bu maçta değil.');

    const newPlayers = data.joinedPlayers.filter((uid) => uid !== targetUserId);
    const updates: Record<string, unknown> = { joinedPlayers: newPlayers };
    if (data.status === 'FULL') updates.status = 'OPEN';

    transaction.update(docRef, updates);
  });
}
