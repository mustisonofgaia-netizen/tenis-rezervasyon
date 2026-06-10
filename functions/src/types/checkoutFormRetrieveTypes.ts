export type CheckoutFormRetrieveResult = {
  status: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  paymentId?: string;
  paymentStatus?: string;
  basketId?: string;
  currency?: string;
  paidPrice?: string;
  price?: string;
  signature?: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
};
