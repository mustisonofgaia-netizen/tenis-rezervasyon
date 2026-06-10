import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
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
