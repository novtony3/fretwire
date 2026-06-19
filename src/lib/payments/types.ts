/**
 * Payment domain shared by both client implementations and the route handlers.
 * The gateway integration depends only on these names, so `MockClient` and
 * `HttpClient` are interchangeable.
 */

export const ORDER_STATUSES = ['pending', 'paid', 'expired', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Enabled (coin, network) pairs the demo offers — the gateway's catalog. */
export const ACCEPTED_COINS = [
  { coin: 'ETH', network: 'ETH', label: 'Ethereum (ETH)' },
  { coin: 'USDT', network: 'ERC20', label: 'Tether (USDT · ERC20)' },
] as const;

export type AcceptedCoin = (typeof ACCEPTED_COINS)[number]['coin'];

export function networkForCoin(coin: string): string | undefined {
  return ACCEPTED_COINS.find((c) => c.coin === coin)?.network;
}

/** Body of `POST /api/orders`. */
export type CreateOrderInput = {
  amount: number;
  coin: string;
  network?: string;
  externalOrderId?: string | number;
  description?: string;
  metadata?: Record<string, unknown>;
  expiresIn?: number;
};

/** Normalized order returned by either client (mock or real gateway). */
export type GatewayOrder = {
  orderId: string;
  address: string;
  memo?: string;
  amount: number | string;
  coin: string;
  network?: string;
  status: OrderStatus;
  expiresAt: string;
  transactionHash?: string;
  paidAt?: string;
};

export interface NextPaymentsClient {
  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;
  getOrder(orderId: string): Promise<GatewayOrder>;
}
