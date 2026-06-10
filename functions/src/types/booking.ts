import type { Timestamp } from 'firebase-admin/firestore';

export type SlotStatus = 'FREE' | 'LOCKED' | 'CONFIRMED';

export type SlotRecord = {
  status: SlotStatus;
  userId?: string;
  lockTimestamp?: Timestamp;
  paymentId?: string;
};

export type ReservationDocument = {
  slots?: Record<string, SlotRecord>;
};

export const RESERVATIONS_COLLECTION = 'reservations';
export const LOCK_DURATION_MS = 5 * 60 * 1000;
