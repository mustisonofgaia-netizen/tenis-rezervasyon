import type { CheckoutFormRetrieveResult } from '../types/checkoutFormRetrieveTypes.js';
import { getIyzicoClient, Iyzipay } from './iyzicoClient.js';

export async function retrieveCheckoutForm(
  token: string,
  conversationId?: string,
): Promise<CheckoutFormRetrieveResult> {
  const iyzipay = getIyzicoClient();

  return new Promise((resolve, reject) => {
    iyzipay.checkoutForm.retrieve(
      {
        locale: Iyzipay.LOCALE.TR,
        conversationId: conversationId ?? token,
        token,
      },
      (error: Error | null, result: CheckoutFormRetrieveResult) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      },
    );
  });
}
