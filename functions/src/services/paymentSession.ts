import { HttpsError } from 'firebase-functions/v2/https';
import type {
  CheckoutFormInitializeRequest,
  CheckoutFormInitializeResult,
} from '../types/checkoutFormTypes.js';

import {
  COURT_RESERVATION_PRICE,
  FACILITY_NAME,
  iyzicoConfig,
} from '../config/iyzico.js';
import type { CreatePaymentSessionResponse } from '../types/payment.js';
import {
  buildBasketId,
  buildConversationId,
} from '../utils/reservationMetadata.js';
import { getIyzicoClient, Iyzipay } from './iyzicoClient.js';

function buildCheckoutFormRequest(
  date: string,
  slotTime: string,
  userId: string,
): CheckoutFormInitializeRequest {
  const conversationId = buildConversationId(userId, date, slotTime);
  const basketId = buildBasketId(date, slotTime);
  const itemName = `${FACILITY_NAME} (${date} ${slotTime})`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  return {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price: COURT_RESERVATION_PRICE,
    paidPrice: COURT_RESERVATION_PRICE,
    currency: Iyzipay.CURRENCY.TRY,
    basketId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: iyzicoConfig.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: userId,
      name: 'Mustafa',
      surname: 'Gorkem',
      gsmNumber: '+905551112233',
      email: 'mustafa.gorkem@example.com',
      identityNumber: '11111111111',
      lastLoginDate: now,
      registrationDate: now,
      registrationAddress: 'Istanbul, Turkey',
      ip: '85.34.78.112',
      city: 'Istanbul',
      country: 'Turkey',
      zipCode: '34000',
    },
    shippingAddress: {
      contactName: 'Mustafa Gorkem',
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Merkez Kort, Istanbul',
      zipCode: '34000',
    },
    billingAddress: {
      contactName: 'Mustafa Gorkem',
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Merkez Kort, Istanbul',
      zipCode: '34000',
    },
    basketItems: [
      {
        id: basketId,
        name: itemName,
        category1: 'Spor',
        category2: 'Tenis Kortu',
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: COURT_RESERVATION_PRICE,
      },
    ],
  };
}

function initializeCheckoutForm(
  request: CheckoutFormInitializeRequest,
): Promise<CheckoutFormInitializeResult> {
  const iyzipay = getIyzicoClient();

  return new Promise((resolve, reject) => {
    iyzipay.checkoutFormInitialize.create(
      request as Record<string, unknown>,
      (error: Error | null, result: CheckoutFormInitializeResult) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
      },
    );
  });
}

export async function createPaymentSession(
  date: string,
  slotTime: string,
  userId: string,
): Promise<CreatePaymentSessionResponse> {
  const request = buildCheckoutFormRequest(date, slotTime, userId);

  let result: CheckoutFormInitializeResult;

  try {
    result = await initializeCheckoutForm(request);
  } catch (error) {
    console.error('[paymentSession] Iyzico checkout initialization failed:', error);
    throw new HttpsError(
      'internal',
      'Payment session could not be created. Please try again.',
    );
  }

  if (result.status !== 'success') {
    console.error('[paymentSession] Iyzico returned failure:', result);
    throw new HttpsError(
      'internal',
      result.errorMessage ?? 'Payment provider rejected the session request.',
    );
  }

  if (!result.token) {
    throw new HttpsError(
      'internal',
      'Payment provider did not return a checkout token.',
    );
  }

  const paymentPageUrl =
    result.paymentPageUrl ??
    `https://sandbox-cpp.iyzipay.com?token=${result.token}&lang=tr`;

  return {
    paymentPageUrl,
    token: result.token,
    conversationId: result.conversationId ?? request.conversationId,
  };
}
