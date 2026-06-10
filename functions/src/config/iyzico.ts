export type IyzicoConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  callbackUrl: string;
  successRedirectUrl: string;
};

export const iyzicoConfig: IyzicoConfig = {
  apiKey: process.env.IYZICO_API_KEY ?? 'YOUR_IYZICO_API_KEY',
  secretKey: process.env.IYZICO_SECRET_KEY ?? 'YOUR_IYZICO_SECRET_KEY',
  baseUrl: process.env.IYZICO_BASE_URL ?? 'https://sandbox-api.iyzipay.com',
  callbackUrl:
    process.env.IYZICO_CALLBACK_URL ?? 'https://your-app.com/payment/callback',
  successRedirectUrl:
    process.env.IYZICO_SUCCESS_REDIRECT_URL ??
    'https://your-app.com/payment/success',
};

export const COURT_RESERVATION_PRICE = '500.00';
export const FACILITY_NAME = 'Mustafa Görkem Tenis Kulübü - Merkez Kort';
