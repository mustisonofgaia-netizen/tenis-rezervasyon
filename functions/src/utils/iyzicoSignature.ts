import { createHmac } from 'node:crypto';

import type { CheckoutFormRetrieveResult } from '../types/checkoutFormRetrieveTypes.js';

export function verifyCheckoutFormRetrieveSignature(
  result: CheckoutFormRetrieveResult,
  secretKey: string,
): boolean {
  const {
    paymentStatus,
    paymentId,
    currency,
    basketId,
    conversationId,
    paidPrice,
    price,
    token,
    signature,
  } = result;

  if (
    !signature ||
    !paymentStatus ||
    !paymentId ||
    !currency ||
    !basketId ||
    !conversationId ||
    !paidPrice ||
    !price ||
    !token
  ) {
    return false;
  }

  const payload = [
    paymentStatus,
    paymentId,
    currency,
    basketId,
    conversationId,
    paidPrice,
    price,
    token,
  ].join(':');

  const calculatedSignature = createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');

  return calculatedSignature === signature;
}
