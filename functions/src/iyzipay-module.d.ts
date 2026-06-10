declare module 'iyzipay' {
  type IyzipayCallback<T> = (error: Error | null, result: T) => void;

  interface IyzipayConfig {
    apiKey: string;
    secretKey: string;
    uri: string;
  }

  interface CheckoutFormInitializeResult {
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
  }

  interface CheckoutFormRetrieveResult {
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
  }

  interface CheckoutFormInitializeResource {
    create(
      request: Record<string, unknown>,
      callback: IyzipayCallback<CheckoutFormInitializeResult>,
    ): void;
  }

  interface CheckoutFormResource {
    retrieve(
      request: Record<string, unknown>,
      callback: IyzipayCallback<CheckoutFormRetrieveResult>,
    ): void;
  }

  interface IyzipayConstants {
    LOCALE: { TR: string; EN: string };
    CURRENCY: { TRY: string };
    PAYMENT_GROUP: { PRODUCT: string; LISTING: string; SUBSCRIPTION: string };
    BASKET_ITEM_TYPE: { PHYSICAL: string; VIRTUAL: string };
  }

  interface IyzipayInstance extends IyzipayConstants {
    checkoutFormInitialize: CheckoutFormInitializeResource;
    checkoutForm: CheckoutFormResource;
  }

  interface IyzipayConstructor extends IyzipayConstants {
    new (config: IyzipayConfig): IyzipayInstance;
    (config: IyzipayConfig): IyzipayInstance;
  }

  const Iyzipay: IyzipayConstructor;
  export = Iyzipay;
}
