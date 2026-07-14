import type { OrderStatus, PaymentsConfigOverride } from '../payments/types';

export type StoredOrder = {
  externalOrderId: string;
  npOrderId: string | null;
  status: OrderStatus;
  coin: string;
  network: string | null;
  amount: number;
  address: string | null;
  memo: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  transactionHash: string | null;
  ipnStatus: string | null;
  ipnDeliveredAt: string | null;
  email: string | null;
  cartJson: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Persistence the payment flow needs. Async so it works over both an in-process
 * map (local dev) and Upstash Redis (serverless / Vercel).
 */
export interface Store {
  createOrder(order: StoredOrder): Promise<void>;
  getOrder(externalOrderId: string): Promise<StoredOrder | null>;
  updateOrder(externalOrderId: string, patch: Partial<StoredOrder>): Promise<void>;
  /** Strictly increasing per publicKey (HMAC nonce). */
  nextNonce(publicKey: string): Promise<number>;
  /** First time a delivery id is seen → true; repeats → false (idempotency). */
  markDelivered(deliveryId: string): Promise<boolean>;
  /** Dev-only runtime gateway config override (null when nothing is set). */
  getConfig(): Promise<PaymentsConfigOverride | null>;
  /** Merge a partial override into the stored config. */
  setConfig(patch: PaymentsConfigOverride): Promise<void>;
}
