import type { PaymentsConfigOverride } from '../payments/types';

import type { Store, StoredOrder } from './types';

type MemState = {
  orders: Map<string, StoredOrder>;
  nonces: Map<string, number>;
  deliveries: Set<string>;
  config: PaymentsConfigOverride | null;
};

// Memoized on globalThis so dev HMR keeps one state across module reloads.
const g = globalThis as unknown as { __memStore?: MemState };

function state(): MemState {
  if (!g.__memStore) {
    g.__memStore = { orders: new Map(), nonces: new Map(), deliveries: new Set(), config: null };
  }
  return g.__memStore;
}

/**
 * In-process store for local dev. State lives in one Node process, so the mock
 * IPN self-callback (same server) sees the order. Not for multi-instance
 * serverless — use {@link RedisStore} there.
 */
export class MemoryStore implements Store {
  async createOrder(order: StoredOrder): Promise<void> {
    state().orders.set(order.externalOrderId, order);
  }

  async getOrder(externalOrderId: string): Promise<StoredOrder | null> {
    return state().orders.get(externalOrderId) ?? null;
  }

  async updateOrder(externalOrderId: string, patch: Partial<StoredOrder>): Promise<void> {
    const current = state().orders.get(externalOrderId);
    if (!current) return;
    state().orders.set(externalOrderId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async nextNonce(publicKey: string): Promise<number> {
    const next = Math.max((state().nonces.get(publicKey) ?? 0) + 1, Date.now());
    state().nonces.set(publicKey, next);
    return next;
  }

  async markDelivered(deliveryId: string): Promise<boolean> {
    const set = state().deliveries;
    if (set.has(deliveryId)) return false;
    set.add(deliveryId);
    return true;
  }

  async getConfig(): Promise<PaymentsConfigOverride | null> {
    return state().config;
  }

  async setConfig(patch: PaymentsConfigOverride): Promise<void> {
    state().config = { ...(state().config ?? {}), ...patch };
  }
}
