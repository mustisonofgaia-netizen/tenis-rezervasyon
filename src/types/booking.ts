import type { Timestamp } from 'firebase/firestore';

export type SlotStatus = 'FREE' | 'LOCKED' | 'CONFIRMED' | 'BLOCKED';

export type SlotInfo = {
  time: string;
  status: SlotStatus;
};

export type SlotRecord = {
  status: SlotStatus;
  userId?: string;
  lockTimestamp?: Timestamp;
  paymentId?: string;
};

// Full slot data exposed to admin views — raw DB state, no expiry logic applied
export type AdminSlotInfo = {
  time: string;
  status: SlotStatus;
  userId?: string;
  paymentId?: string;
};

export type ConfirmedBooking = {
  id: string;
  date: string;
  slotTime: string;
};

export type ReservationDocument = {
  slots?: Record<string, SlotRecord>;
};

export const DEFAULT_SLOT_TIMES = [
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
] as const;

export const LOCK_DURATION_MS = 5 * 60 * 1000;
