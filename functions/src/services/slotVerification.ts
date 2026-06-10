import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  LOCK_DURATION_MS,
  RESERVATIONS_COLLECTION,
  ReservationDocument,
  SlotRecord,
} from '../types/booking.js';

function isLockActive(lockTimestamp: Timestamp | undefined): boolean {
  if (!lockTimestamp) {
    return true;
  }

  return Date.now() - lockTimestamp.toMillis() < LOCK_DURATION_MS;
}

function isLockedByUser(slot: SlotRecord | undefined, userId: string): boolean {
  if (!slot || slot.status !== 'LOCKED' || slot.userId !== userId) {
    return false;
  }

  return isLockActive(slot.lockTimestamp);
}

export async function assertSlotLockedByUser(
  date: string,
  slotTime: string,
  userId: string,
): Promise<void> {
  const db = getFirestore();
  const snapshot = await db.collection(RESERVATIONS_COLLECTION).doc(date).get();

  if (!snapshot.exists) {
    throw new HttpsError(
      'failed-precondition',
      'No reservation document exists for the selected date.',
    );
  }

  const data = snapshot.data() as ReservationDocument;
  const slot = data.slots?.[slotTime];

  if (!isLockedByUser(slot, userId)) {
    throw new HttpsError(
      'failed-precondition',
      'The selected slot is not locked by this user or the lock has expired.',
    );
  }
}
