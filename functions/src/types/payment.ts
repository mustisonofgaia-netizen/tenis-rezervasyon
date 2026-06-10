export type CreatePaymentSessionRequest = {
  date: string;
  slotTime: string;
  userId: string;
};

export type CreatePaymentSessionResponse = {
  paymentPageUrl: string;
  token: string;
  conversationId: string;
};
