import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  LOCK_DURATION_MS,
  RESERVATIONS_COLLECTION,
  ReservationDocument,
  SlotRecord,
} from '../types/booking.js';

type ConfirmSlotParams = {
  date: string;
  slotTime: string;
  userId: string;
  paymentId: string;
};

function isLockActive(lockTimestamp: Timestamp | undefined): boolean {
  if (!lockTimestamp) {
    return true;
  }

  return Date.now() - lockTimestamp.toMillis() < LOCK_DURATION_MS;
}

export async function confirmSlotAfterPayment({
  date,
  slotTime,
  userId,
  paymentId,
}: ConfirmSlotParams): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(RESERVATIONS_COLLECTION).doc(date);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);

    if (!snapshot.exists) {
      throw new Error('Reservation document not found for payment confirmation.');
    }

    const data = snapshot.data() as ReservationDocument;
    const slot = data.slots?.[slotTime];

    if (!slot) {
      throw new Error('Slot not found for payment confirmation.');
    }

    if (slot.status === 'CONFIRMED') {
      if (slot.paymentId === paymentId) {
        return;
      }

      throw new Error('Slot is already confirmed with a different payment.');
    }

    if (slot.status !== 'LOCKED' || slot.userId !== userId) {
      throw new Error('Slot is not locked by the paying user.');
    }

    if (!isLockActive(slot.lockTimestamp)) {
      throw new Error('Payment lock has expired.');
    }

    const confirmedSlot: SlotRecord = {
      status: 'CONFIRMED',
      userId,
      paymentId,
    };

    transaction.update(docRef, {
      [`slots.${slotTime}`]: confirmedSlot,
    });
  });
}

export async function releaseExpiredLocksForDate(date: string): Promise<number> {
  const db = getFirestore();
  const docRef = db.collection(RESERVATIONS_COLLECTION).doc(date);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return 0;
  }

  const data = snapshot.data() as ReservationDocument;
  const slots = data.slots ?? {};
  const updates: Record<string, FieldValue> = {};
  let releasedCount = 0;

  for (const [slotTime, slot] of Object.entries(slots)) {
    if (slot.status !== 'LOCKED') {
      continue;
    }

    if (isLockActive(slot.lockTimestamp)) {
      continue;
    }

    updates[`slots.${slotTime}`] = FieldValue.delete();
    releasedCount += 1;
  }

  if (releasedCount === 0) {
    return 0;
  }

  await docRef.update(updates);
  return releasedCount;
}

function formatDateKey(date: Date, timeZone = 'Europe/Istanbul'): string {
  return date.toLocaleDateString('en-CA', { timeZone });
}

export function getTodayAndTomorrowDateKeys(): [string, string] {
  const now = new Date();
  const today = formatDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDateKey(tomorrowDate);

  return [today, tomorrow];
}

export async function cleanupExpiredLocks(): Promise<number> {
  const [today, tomorrow] = getTodayAndTomorrowDateKeys();
  const results = await Promise.all([
    releaseExpiredLocksForDate(today),
    releaseExpiredLocksForDate(tomorrow),
  ]);

  return results.reduce((total, count) => total + count, 0);
}
