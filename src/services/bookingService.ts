import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  QuerySnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

import { COURT_IDS, getCourtById } from '../config/courts';
import {
  AdminSlotInfo,
  ConfirmedBooking,
  CourtId,
  CourtPriceDocument,
  DEFAULT_SLOT_TIMES,
  LOCK_DURATION_MS,
  ReservationDocument,
  SlotInfo,
  SlotRecord,
  SlotStatus,
} from '../types/booking';
import { db } from './firebase';

// ─── Collection names ─────────────────────────────────────────────────────────

const RESERVATIONS_COLLECTION = 'reservations';
const COURTS_COLLECTION = 'courts';

// ─── Document ID helpers ──────────────────────────────────────────────────────

// Schema: reservations/{courtId}_{date}  e.g.  "court_1_2026-06-11"
function reservationDocId(courtId: CourtId, date: string): string {
  return `${courtId}_${date}`;
}

function parseReservationDocId(
  docId: string,
): { courtId: CourtId; date: string } | null {
  const match = /^(court_\d+)_(\d{4}-\d{2}-\d{2})$/.exec(docId);
  if (!match) return null;
  return { courtId: match[1] as CourtId, date: match[2] };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isLockActive(lockTimestamp: Timestamp | undefined): boolean {
  if (!lockTimestamp) return true;
  return Date.now() - lockTimestamp.toMillis() < LOCK_DURATION_MS;
}

function resolveSlotStatus(record: SlotRecord | undefined): SlotStatus {
  if (!record) return 'FREE';
  if (record.status === 'CONFIRMED') return 'CONFIRMED';
  if (record.status === 'BLOCKED') return 'BLOCKED';
  if (record.status === 'LOCKED') {
    return isLockActive(record.lockTimestamp) ? 'LOCKED' : 'FREE';
  }
  return 'FREE';
}

function isSlotUnavailable(record: SlotRecord | undefined): boolean {
  const status = resolveSlotStatus(record);
  return status === 'CONFIRMED' || status === 'LOCKED' || status === 'BLOCKED';
}

function buildSlotList(slots: ReservationDocument['slots']): SlotInfo[] {
  return DEFAULT_SLOT_TIMES.map((time) => {
    const record = slots?.[time];
    const status = resolveSlotStatus(record);
    const info: SlotInfo = { time, status };

    if (status === 'LOCKED') {
      if (record?.userId) info.lockedBy = record.userId;
      // lockTimestamp may be null during optimistic pending writes
      if (record?.lockTimestamp) info.lockedAt = record.lockTimestamp.toMillis();
    }

    return info;
  });
}

function buildAdminSlotList(slots: ReservationDocument['slots']): AdminSlotInfo[] {
  return DEFAULT_SLOT_TIMES.map((time) => {
    const record = slots?.[time];
    return {
      time,
      // Raw status — no lock-expiry logic. Admin sees true DB state.
      status: record?.status ?? 'FREE',
      userId: record?.userId,
      paymentId: record?.paymentId,
    };
  });
}

// ─── Player: slot subscriptions ───────────────────────────────────────────────

export function subscribeToSlots(
  date: string,
  courtId: CourtId,
  callback: (slots: SlotInfo[]) => void,
): () => void {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  return onSnapshot(
    docRef,
    (snapshot) => {
      const data = snapshot.exists()
        ? (snapshot.data() as ReservationDocument)
        : undefined;
      callback(buildSlotList(data?.slots));
    },
    (error) => {
      console.error(`[bookingService] Failed to subscribe to slots for ${courtId}/${date}:`, error);
      callback(buildSlotList(undefined));
    },
  );
}

// ─── Player: booking flow ─────────────────────────────────────────────────────

export type LockResult = { secured: boolean; lockedAt: number };

export async function lockSlot(
  date: string,
  slotTime: string,
  userId: string,
  courtId: CourtId,
): Promise<LockResult> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  try {
    const secured = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const data = snapshot.exists()
        ? (snapshot.data() as ReservationDocument)
        : undefined;
      const existingSlot = data?.slots?.[slotTime];

      if (isSlotUnavailable(existingSlot)) return false;

      const lockedSlot = {
        status: 'LOCKED' as const,
        userId,
        lockTimestamp: serverTimestamp(),
      };

      if (snapshot.exists()) {
        transaction.update(docRef, { [`slots.${slotTime}`]: lockedSlot });
      } else {
        transaction.set(docRef, { slots: { [slotTime]: lockedSlot } });
      }

      return true;
    });

    // Use client-side Date.now() as lockedAt; within ~1 s of the server timestamp.
    return { secured, lockedAt: secured ? Date.now() : 0 };
  } catch (error) {
    console.error(`[bookingService] Failed to lock slot ${slotTime} on ${courtId}/${date}:`, error);
    throw error;
  }
}

export async function confirmSlot(
  date: string,
  slotTime: string,
  userId: string,
  courtId: CourtId,
  paymentId?: string,
): Promise<void> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) throw new Error('Reservation document not found.');

    const data = snapshot.data() as ReservationDocument;
    const existingSlot = data.slots?.[slotTime];
    if (!existingSlot) throw new Error('Slot not found.');
    if (existingSlot.status === 'CONFIRMED') return;
    if (existingSlot.status !== 'LOCKED') throw new Error('Slot is not in a confirmable state.');

    const confirmedSlot: SlotRecord = {
      status: 'CONFIRMED',
      userId: existingSlot.userId ?? userId,
      ...(paymentId ? { paymentId } : {}),
    };

    transaction.update(docRef, { [`slots.${slotTime}`]: confirmedSlot });
  });
}

export async function unlockSlot(
  date: string,
  slotTime: string,
  courtId: CourtId,
): Promise<void> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (!snapshot.exists()) return;

      const data = snapshot.data() as ReservationDocument;
      const existingSlot = data.slots?.[slotTime];
      if (!existingSlot || existingSlot.status !== 'LOCKED') return;

      transaction.update(docRef, { [`slots.${slotTime}`]: deleteField() });
    });
  } catch (error) {
    console.error(`[bookingService] Failed to unlock slot ${slotTime} on ${courtId}/${date}:`, error);
    throw error;
  }
}

export async function cancelBooking(
  date: string,
  slotTime: string,
  userId: string,
  courtId: CourtId,
): Promise<boolean> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  try {
    await updateDoc(docRef, { [`slots.${slotTime}`]: deleteField() });
    return true;
  } catch (error) {
    console.error(
      `[bookingService] Failed to cancel slot ${slotTime} on ${courtId}/${date} for user ${userId}:`,
      error,
    );
    return false;
  }
}

// ─── Player: user bookings subscription ──────────────────────────────────────

function collectUserBookings(
  userId: string,
  snapshot: QuerySnapshot,
): ConfirmedBooking[] {
  const bookings: ConfirmedBooking[] = [];

  snapshot.forEach((docSnap) => {
    const parsed = parseReservationDocId(docSnap.id);
    if (!parsed) return; // skip legacy or malformed documents

    const { courtId, date } = parsed;
    const data = docSnap.data() as ReservationDocument;
    const slots = data.slots ?? {};

    for (const [slotTime, slot] of Object.entries(slots)) {
      if (slot.status === 'CONFIRMED' && slot.userId === userId) {
        bookings.push({
          id: `${courtId}_${date}_${slotTime}`,
          date,
          slotTime,
          courtId,
        });
      }
    }
  });

  return bookings.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare !== 0 ? dateCompare : b.slotTime.localeCompare(a.slotTime);
  });
}

export function subscribeToUserBookings(
  userId: string,
  callback: (bookings: ConfirmedBooking[]) => void,
): () => void {
  const colRef = collection(db, RESERVATIONS_COLLECTION);

  return onSnapshot(
    colRef,
    (snapshot) => callback(collectUserBookings(userId, snapshot)),
    (error) => {
      console.error('[bookingService] Failed to subscribe to user bookings:', error);
      callback([]);
    },
  );
}

// ─── Court pricing ────────────────────────────────────────────────────────────

export function subscribeToCourtPrice(
  courtId: CourtId,
  callback: (price: number) => void,
): () => void {
  const docRef = doc(db, COURTS_COLLECTION, courtId);

  return onSnapshot(
    docRef,
    (snapshot) => {
      const data = snapshot.exists() ? (snapshot.data() as CourtPriceDocument) : null;
      callback(typeof data?.price === 'number' ? data.price : getCourtById(courtId).basePrice);
    },
    () => callback(getCourtById(courtId).basePrice),
  );
}

export async function adminUpdateCourtPrice(
  courtId: CourtId,
  price: number,
): Promise<boolean> {
  try {
    await setDoc(doc(db, COURTS_COLLECTION, courtId), { price }, { merge: true });
    return true;
  } catch (error) {
    console.error(`[bookingService] Failed to update price for ${courtId}:`, error);
    return false;
  }
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export function subscribeToAdminSlots(
  date: string,
  courtId: CourtId,
  callback: (slots: AdminSlotInfo[]) => void,
): () => void {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  return onSnapshot(
    docRef,
    (snapshot) => {
      const data = snapshot.exists()
        ? (snapshot.data() as ReservationDocument)
        : undefined;
      callback(buildAdminSlotList(data?.slots));
    },
    (error) => {
      console.error(`[bookingService] Admin: failed to subscribe to slots for ${courtId}/${date}:`, error);
      callback(buildAdminSlotList(undefined));
    },
  );
}

// Aggregate subscription for all courts on a given date — used for admin metrics
export function subscribeToAllCourtsAdminSlots(
  date: string,
  callback: (allSlots: Record<CourtId, AdminSlotInfo[]>) => void,
): () => void {
  const state: Record<CourtId, AdminSlotInfo[]> = {
    court_1: buildAdminSlotList(undefined),
    court_2: buildAdminSlotList(undefined),
    court_3: buildAdminSlotList(undefined),
  };

  const unsubscribers = COURT_IDS.map((courtId) =>
    subscribeToAdminSlots(date, courtId, (slots) => {
      state[courtId] = slots;
      callback({ ...state });
    }),
  );

  return () => unsubscribers.forEach((u) => u());
}

/**
 * Aggregate subscription for an explicit list of courts on a given date.
 * Used by the multi-tenant admin dashboard to scope metrics to a single club.
 *
 * Unlike `subscribeToAllCourtsAdminSlots`, this function is not hardcoded to
 * any court list — pass only the courts that belong to the active club.
 */
export function subscribeToSelectedCourtsAdminSlots(
  date: string,
  courtIds: CourtId[],
  callback: (allSlots: Record<string, AdminSlotInfo[]>) => void,
): () => void {
  const state: Record<string, AdminSlotInfo[]> = Object.fromEntries(
    courtIds.map((id) => [id, buildAdminSlotList(undefined)]),
  );

  const unsubscribers = courtIds.map((courtId) =>
    subscribeToAdminSlots(date, courtId, (slots) => {
      state[courtId] = slots;
      callback({ ...state });
    }),
  );

  return () => unsubscribers.forEach((u) => u());
}

export async function adminBlockSlot(
  date: string,
  slotTime: string,
  courtId: CourtId,
): Promise<boolean> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));
  const blockedSlot: SlotRecord = { status: 'BLOCKED' };

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      if (snapshot.exists()) {
        transaction.update(docRef, { [`slots.${slotTime}`]: blockedSlot });
      } else {
        transaction.set(docRef, { slots: { [slotTime]: blockedSlot } });
      }
    });
    return true;
  } catch (error) {
    console.error(`[bookingService] Admin: failed to block slot ${slotTime} on ${courtId}/${date}:`, error);
    return false;
  }
}

export async function adminUnblockSlot(
  date: string,
  slotTime: string,
  courtId: CourtId,
): Promise<boolean> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  try {
    await updateDoc(docRef, { [`slots.${slotTime}`]: deleteField() });
    return true;
  } catch (error) {
    console.error(`[bookingService] Admin: failed to unblock slot ${slotTime} on ${courtId}/${date}:`, error);
    return false;
  }
}

export async function adminCancelSlot(
  date: string,
  slotTime: string,
  courtId: CourtId,
): Promise<boolean> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, reservationDocId(courtId, date));

  try {
    await updateDoc(docRef, { [`slots.${slotTime}`]: deleteField() });
    return true;
  } catch (error) {
    console.error(`[bookingService] Admin: failed to cancel slot ${slotTime} on ${courtId}/${date}:`, error);
    return false;
  }
}
