import Iyzipay from 'iyzipay';

import { iyzicoConfig } from '../config/iyzico.js';

type IyzicoClient = InstanceType<typeof Iyzipay>;

let client: IyzicoClient | null = null;

export function getIyzicoClient(): IyzicoClient {
  if (!client) {
    client = new Iyzipay({
      apiKey: iyzicoConfig.apiKey,
      secretKey: iyzicoConfig.secretKey,
      uri: iyzicoConfig.baseUrl,
    });
  }

  return client;
}

export { Iyzipay };
