import { nextNonce } from '../store/nonce';

import { requireHttpConfig } from './config';
import { signRequest } from './sign';
import {
  ORDER_STATUSES,
  type CreateOrderInput,
  type GatewayOrder,
  type NextPaymentsClient,
  type OrderStatus,
  type ResolvedPaymentsConfig,
} from './types';

const ORDERS_PATH = '/api/orders';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function coerceStatus(value: unknown): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value as string)
    ? (value as OrderStatus)
    : 'pending';
}

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;

/** Defensively map the gateway envelope (`{data:{order}}` / `{data}` / flat). */
function parseGatewayOrder(json: unknown): GatewayOrder {
  const root = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const order =
    data.order && typeof data.order === 'object' ? (data.order as Record<string, unknown>) : data;
  return {
    orderId: asStr(order.orderId) ?? asStr(order._id) ?? asStr(order.id) ?? '',
    address: asStr(order.address) ?? '',
    memo: asStr(order.memo),
    amount: typeof order.amount === 'number' || typeof order.amount === 'string' ? order.amount : 0,
    coin: asStr(order.coin) ?? '',
    network: asStr(order.network),
    status: coerceStatus(order.status),
    expiresAt: asStr(order.expiresAt) ?? '',
    transactionHash: asStr(order.transactionHash),
    paidAt: asStr(order.paidAt),
  };
}

/**
 * Real gateway client. Signs each request per the HMAC contract (nonce from the
 * per-publicKey store) and sends the EXACT signed `rawBody`.
 */
export class HttpClient implements NextPaymentsClient {
  constructor(private readonly cfg: ResolvedPaymentsConfig) {}

  async createOrder(input: CreateOrderInput): Promise<GatewayOrder> {
    const { apiUrl, publicKey, privateKey } = requireHttpConfig(this.cfg);
    const nonce = await nextNonce(publicKey);
    const { signature, timestamp, rawBody } = signRequest({
      method: 'POST',
      path: ORDERS_PATH,
      body: input,
      privateKey,
      timestamp: nowSeconds(),
      nonce,
    });
    const res = await fetch(`${apiUrl}${ORDERS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': publicKey,
        'X-Nonce': String(nonce),
        'X-Timestamp': String(timestamp),
        'X-Signature': signature,
      },
      body: rawBody,
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`createOrder failed [${res.status}]: ${JSON.stringify(json)}`);
    return parseGatewayOrder(json);
  }

  async getOrder(orderId: string): Promise<GatewayOrder> {
    const { apiUrl, publicKey, privateKey } = requireHttpConfig(this.cfg);
    const path = `${ORDERS_PATH}/${orderId}`;
    const nonce = await nextNonce(publicKey);
    const { signature, timestamp } = signRequest({
      method: 'GET',
      path,
      privateKey,
      timestamp: nowSeconds(),
      nonce,
    });
    const res = await fetch(`${apiUrl}${path}`, {
      method: 'GET',
      headers: {
        'X-API-Key': publicKey,
        'X-Nonce': String(nonce),
        'X-Timestamp': String(timestamp),
        'X-Signature': signature,
      },
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`getOrder failed [${res.status}]: ${JSON.stringify(json)}`);
    return parseGatewayOrder(json);
  }
}
