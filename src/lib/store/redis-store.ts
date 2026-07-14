import { Redis } from '@upstash/redis';

import type { PaymentsConfigOverride } from '../payments/types';

import type { Store, StoredOrder } from './types';

const orderKey = (id: string) => `order:${id}`;
const nonceKey = (pk: string) => `nonce:${pk}`;
const deliveryKey = (id: string) => `ipn:${id}`;
const CONFIG_KEY = 'config:payments';

/** Reads Upstash / Vercel KV env (either naming) for the REST connection. */
function fromEnv(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis store selected but KV env is missing');
  return new Redis({ url, token });
}

/**
 * Serverless-friendly store over Upstash Redis (Vercel KV). `INCR` gives an
 * atomic, persistent nonce; `SET NX` gives idempotency; orders are JSON values.
 */
export class RedisStore implements Store {
  private redis = fromEnv();

  async createOrder(order: StoredOrder): Promise<void> {
    await this.redis.set(orderKey(order.externalOrderId), order);
  }

  async getOrder(externalOrderId: string): Promise<StoredOrder | null> {
    return (await this.redis.get<StoredOrder>(orderKey(externalOrderId))) ?? null;
  }

  async updateOrder(externalOrderId: string, patch: Partial<StoredOrder>): Promise<void> {
    const current = await this.getOrder(externalOrderId);
    if (!current) return;
    await this.redis.set(orderKey(externalOrderId), {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async nextNonce(publicKey: string): Promise<number> {
    return this.redis.incr(nonceKey(publicKey));
  }

  async markDelivered(deliveryId: string): Promise<boolean> {
    const res = await this.redis.set(deliveryKey(deliveryId), '1', { nx: true });
    return res === 'OK';
  }

  async getConfig(): Promise<PaymentsConfigOverride | null> {
    return (await this.redis.get<PaymentsConfigOverride>(CONFIG_KEY)) ?? null;
  }

  async setConfig(patch: PaymentsConfigOverride): Promise<void> {
    const current = (await this.getConfig()) ?? {};
    await this.redis.set(CONFIG_KEY, { ...current, ...patch });
  }
}
