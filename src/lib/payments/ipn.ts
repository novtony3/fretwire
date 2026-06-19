import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { ORDER_STATUSES } from './types';

/**
 * IPN (instant payment notification) contract for the gateway → merchant
 * callback. Signature mirrors the order convention: HMAC-SHA512 over
 * `timestamp.deliveryId.rawBody`, keyed by the integration's `ipnSecret`.
 * Verification additionally enforces freshness and constant-time comparison;
 * idempotency (by delivery id) lives in `ipn-repo`.
 *
 * This is the demo's designed contract — `signIpn`/`verifyIpnSignature` are the
 * single pair to adjust if the real gateway uses a different scheme.
 */

export const IPN_FRESHNESS_WINDOW_SEC = 300;

/** Lowercased header names (Next normalizes incoming headers to lowercase). */
export const IPN_HEADERS = {
  EVENT: 'x-np-event',
  TIMESTAMP: 'x-np-timestamp',
  ID: 'x-np-id',
  SIGNATURE: 'x-np-signature',
} as const;

export function ipnMessage(timestamp: number, deliveryId: string, rawBody: string): string {
  return `${timestamp}.${deliveryId}.${rawBody}`;
}

export function signIpn(params: {
  ipnSecret: string;
  timestamp: number;
  deliveryId: string;
  rawBody: string;
}): string {
  return createHmac('sha512', params.ipnSecret)
    .update(ipnMessage(params.timestamp, params.deliveryId, params.rawBody), 'utf8')
    .digest('hex');
}

export type IpnVerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'stale' | 'bad-signature' };

export function verifyIpnSignature(params: {
  ipnSecret: string;
  timestamp: number;
  deliveryId: string;
  rawBody: string;
  signature: string;
  /** Current time in UNIX seconds. */
  now: number;
}): IpnVerifyResult {
  if (!params.signature || !params.deliveryId || !params.timestamp) {
    return { ok: false, reason: 'missing' };
  }
  if (Math.abs(params.now - params.timestamp) > IPN_FRESHNESS_WINDOW_SEC) {
    return { ok: false, reason: 'stale' };
  }
  const expected = signIpn(params);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(params.signature, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true };
}

/** Body of an IPN callback. */
export const ipnPayloadSchema = z.object({
  event: z.string(),
  orderId: z.string(),
  externalOrderId: z.union([z.string(), z.number()]).transform(String),
  status: z.enum(ORDER_STATUSES),
  amount: z.union([z.number(), z.string()]),
  coin: z.string(),
  network: z.string().optional(),
  address: z.string().optional(),
  transactionHash: z.string().optional(),
  paidAt: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string().optional(),
});

export type IpnPayload = z.infer<typeof ipnPayloadSchema>;
