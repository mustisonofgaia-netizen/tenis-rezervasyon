import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';

import { iyzicoConfig } from '../config/iyzico.js';
import { retrieveCheckoutForm } from '../services/checkoutFormService.js';
import { confirmSlotAfterPayment } from '../services/reservationService.js';
import { verifyCheckoutFormRetrieveSignature } from '../utils/iyzicoSignature.js';
import {
  renderPaymentFailurePage,
  renderPaymentSuccessPage,
} from '../utils/paymentPages.js';
import { resolveReservationMetadata } from '../utils/reservationMetadata.js';

function extractToken(req: Request): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const query = req.query as Record<string, unknown>;

  if (typeof body?.token === 'string' && body.token.length > 0) {
    return body.token;
  }

  if (typeof query.token === 'string' && query.token.length > 0) {
    return query.token;
  }

  return null;
}

function sendHtmlResponse(res: Response, status: number, html: string): void {
  res.status(status).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

export async function handleIyzicoCallback(
  req: Request,
  res: Response,
): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const token = extractToken(req);

  if (!token) {
    logger.warn('Iyzico callback missing token', {
      method: req.method,
      hasBody: Boolean(req.body),
      queryKeys: Object.keys(req.query ?? {}),
    });
    sendHtmlResponse(
      res,
      400,
      renderPaymentFailurePage('Ödeme doğrulama bilgisi bulunamadı.'),
    );
    return;
  }

  try {
    const checkoutResult = await retrieveCheckoutForm(token);

    if (checkoutResult.status !== 'success') {
      logger.error('Iyzico retrieve returned non-success status', checkoutResult);
      sendHtmlResponse(
        res,
        400,
        renderPaymentFailurePage('Ödeme doğrulaması başarısız oldu.'),
      );
      return;
    }

    const signatureValid = verifyCheckoutFormRetrieveSignature(
      checkoutResult,
      iyzicoConfig.secretKey,
    );

    if (!signatureValid) {
      logger.error('Iyzico callback signature verification failed', {
        conversationId: checkoutResult.conversationId,
        paymentId: checkoutResult.paymentId,
      });
      sendHtmlResponse(
        res,
        403,
        renderPaymentFailurePage('Ödeme doğrulaması güvenlik kontrolünden geçemedi.'),
      );
      return;
    }

    if (checkoutResult.paymentStatus !== 'SUCCESS') {
      logger.info('Iyzico payment not successful', {
        paymentStatus: checkoutResult.paymentStatus,
        paymentId: checkoutResult.paymentId,
      });
      sendHtmlResponse(
        res,
        400,
        renderPaymentFailurePage('Ödeme tamamlanmadı veya iptal edildi.'),
      );
      return;
    }

    const metadata = resolveReservationMetadata({
      basketId: checkoutResult.basketId,
      conversationId: checkoutResult.conversationId,
    });

    if (!metadata || !metadata.userId) {
      logger.error('Unable to resolve reservation metadata from Iyzico callback', {
        basketId: checkoutResult.basketId,
        conversationId: checkoutResult.conversationId,
      });
      sendHtmlResponse(
        res,
        400,
        renderPaymentFailurePage('Rezervasyon bilgileri çözümlenemedi.'),
      );
      return;
    }

    if (!checkoutResult.paymentId) {
      sendHtmlResponse(
        res,
        400,
        renderPaymentFailurePage('Ödeme kimliği alınamadı.'),
      );
      return;
    }

    await confirmSlotAfterPayment({
      date: metadata.date,
      slotTime: metadata.slotTime,
      userId: metadata.userId,
      paymentId: checkoutResult.paymentId,
    });

    logger.info('Reservation confirmed after successful payment', {
      date: metadata.date,
      slotTime: metadata.slotTime,
      userId: metadata.userId,
      paymentId: checkoutResult.paymentId,
    });

    const successUrl = new URL(iyzicoConfig.successRedirectUrl);
    successUrl.searchParams.set('status', 'success');
    successUrl.searchParams.set('date', metadata.date);
    successUrl.searchParams.set('slotTime', metadata.slotTime);
    successUrl.searchParams.set('paymentId', checkoutResult.paymentId);

    res.redirect(302, successUrl.toString());
  } catch (error) {
    logger.error('Iyzico callback processing failed', error);
    sendHtmlResponse(
      res,
      500,
      renderPaymentFailurePage('Ödeme işlenirken bir hata oluştu.'),
    );
  }
}

export function handleIyzicoSuccessPage(req: Request, res: Response): void {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  sendHtmlResponse(
    res,
    200,
    renderPaymentSuccessPage(iyzicoConfig.successRedirectUrl),
  );
}
