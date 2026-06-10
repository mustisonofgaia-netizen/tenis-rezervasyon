export type CheckoutFormInitializeRequest = {
  locale: string;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  basketId: string;
  paymentGroup: string;
  callbackUrl: string;
  enabledInstallments?: number[];
  buyer: {
    id: string;
    name: string;
    surname: string;
    gsmNumber: string;
    email: string;
    identityNumber: string;
    lastLoginDate: string;
    registrationDate: string;
    registrationAddress: string;
    ip: string;
    city: string;
    country: string;
    zipCode: string;
  };
  shippingAddress: {
    contactName: string;
    city: string;
    country: string;
    address: string;
    zipCode: string;
  };
  billingAddress: {
    contactName: string;
    city: string;
    country: string;
    address: string;
    zipCode: string;
  };
  basketItems: Array<{
    id: string;
    name: string;
    category1: string;
    category2?: string;
    itemType: string;
    price: string;
  }>;
};

export type CheckoutFormInitializeResult = {
  status: string;
  locale?: string;
  systemTime?: number;
  conversationId?: string;
  token?: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
  errorCode?: string;
  errorMessage?: string;
  errorGroup?: string;
};
