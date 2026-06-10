import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  QuerySnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

import {
  ConfirmedBooking,
  DEFAULT_SLOT_TIMES,
  LOCK_DURATION_MS,
  ReservationDocument,
  SlotInfo,
  SlotRecord,
  SlotStatus,
} from '../types/booking';
import { db } from './firebase';

const RESERVATIONS_COLLECTION = 'reservations';

function isLockActive(lockTimestamp: Timestamp | undefined): boolean {
  if (!lockTimestamp) {
    return true;
  }

  return Date.now() - lockTimestamp.toMillis() < LOCK_DURATION_MS;
}

function resolveSlotStatus(record: SlotRecord | undefined): SlotStatus {
  if (!record) {
    return 'FREE';
  }

  if (record.status === 'CONFIRMED') {
    return 'CONFIRMED';
  }

  if (record.status === 'LOCKED') {
    return isLockActive(record.lockTimestamp) ? 'LOCKED' : 'FREE';
  }

  return 'FREE';
}

function isSlotUnavailable(record: SlotRecord | undefined): boolean {
  const status = resolveSlotStatus(record);
  return status === 'CONFIRMED' || status === 'LOCKED';
}

function buildSlotList(slots: ReservationDocument['slots']): SlotInfo[] {
  return DEFAULT_SLOT_TIMES.map((time) => ({
    time,
    status: resolveSlotStatus(slots?.[time]),
  }));
}

export function subscribeToSlots(
  date: string,
  callback: (slots: SlotInfo[]) => void,
): () => void {
  const docRef = doc(db, RESERVATIONS_COLLECTION, date);

  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      const data = snapshot.exists()
        ? (snapshot.data() as ReservationDocument)
        : undefined;

      callback(buildSlotList(data?.slots));
    },
    (error) => {
      console.error(`[bookingService] Failed to subscribe to slots for ${date}:`, error);
      callback(buildSlotList(undefined));
    },
  );

  return unsubscribe;
}

export async function lockSlot(
  date: string,
  slotTime: string,
  userId: string,
): Promise<boolean> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, date);

  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);
      const data = snapshot.exists()
        ? (snapshot.data() as ReservationDocument)
        : undefined;
      const existingSlot = data?.slots?.[slotTime];

      if (isSlotUnavailable(existingSlot)) {
        return false;
      }

      const lockedSlot = {
        status: 'LOCKED' as const,
        userId,
        lockTimestamp: serverTimestamp(),
      };

      if (snapshot.exists()) {
        transaction.update(docRef, {
          [`slots.${slotTime}`]: lockedSlot,
        });
      } else {
        transaction.set(docRef, {
          slots: {
            [slotTime]: lockedSlot,
          },
        });
      }

      return true;
    });
  } catch (error) {
    console.error(
      `[bookingService] Failed to lock slot ${slotTime} on ${date}:`,
      error,
    );
    throw error;
  }
}

export async function confirmSlot(
  date: string,
  slotTime: string,
  userId: string,
  paymentId?: string,
): Promise<void> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, date);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);

    if (!snapshot.exists()) {
      throw new Error('Reservation document not found.');
    }

    const data = snapshot.data() as ReservationDocument;
    const existingSlot = data.slots?.[slotTime];

    if (!existingSlot) {
      throw new Error('Slot not found.');
    }

    if (existingSlot.status === 'CONFIRMED') {
      return;
    }

    if (existingSlot.status !== 'LOCKED') {
      throw new Error('Slot is not in a confirmable state.');
    }

    const confirmedSlot: SlotRecord = {
      status: 'CONFIRMED',
      userId: existingSlot.userId ?? userId,
      ...(paymentId ? { paymentId } : {}),
    };

    transaction.update(docRef, {
      [`slots.${slotTime}`]: confirmedSlot,
    });
  });
}

export async function unlockSlot(date: string, slotTime: string): Promise<void> {
  const docRef = doc(db, RESERVATIONS_COLLECTION, date);

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(docRef);

      if (!snapshot.exists()) {
        return;
      }

      const data = snapshot.data() as ReservationDocument;
      const existingSlot = data.slots?.[slotTime];

      if (!existingSlot || existingSlot.status !== 'LOCKED') {
        return;
      }

      transaction.update(docRef, {
        [`slots.${slotTime}`]: deleteField(),
      });
    });
  } catch (error) {
    console.error(
      `[bookingService] Failed to unlock slot ${slotTime} on ${date}:`,
      error,
    );
    throw error;
  }
}

function collectUserBookings(
  userId: string,
  snapshot: QuerySnapshot,
): ConfirmedBooking[] {
  const bookings: ConfirmedBooking[] = [];

  snapshot.forEach((docSnap) => {
    const date = docSnap.id;
    const data = docSnap.data() as ReservationDocument;
    const slots = data.slots ?? {};

    for (const [slotTime, slot] of Object.entries(slots)) {
      if (slot.status === 'CONFIRMED' && slot.userId === userId) {
        bookings.push({
          id: `${date}-${slotTime}`,
          date,
          slotTime,
        });
      }
    }
  });

  return bookings.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return b.slotTime.localeCompare(a.slotTime);
  });
}

export function subscribeToUserBookings(
  userId: string,
  callback: (bookings: ConfirmedBooking[]) => void,
): () => void {
  const colRef = collection(db, RESERVATIONS_COLLECTION);

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      callback(collectUserBookings(userId, snapshot));
    },
    (error) => {
      console.error('[bookingService] Failed to subscribe to user bookings:', error);
      callback([]);
    },
  );

  return unsubscribe;
}
