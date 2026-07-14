/**
 * Server-side environment access. Centralizes the payment-integration config so
 * route handlers read one typed object, never `process.env` directly. This is
 * the *base* layer — the request path reads it through `getPaymentsConfig`,
 * which layers the dev-only Store override on top. Mock mode needs no secrets.
 */

import type { PaymentsMode } from './payments/types';

export type { PaymentsMode };

export const env = {
  mode: (process.env.PAYMENTS_MODE === 'http' ? 'http' : 'mock') as PaymentsMode,
  apiUrl: process.env.NEXTPAYMENTS_API_URL ?? '',
  publicKey: process.env.NEXTPAYMENTS_PUBLIC_KEY ?? '',
  privateKey: process.env.NEXTPAYMENTS_PRIVATE_KEY ?? '',
  ipnSecret: process.env.NEXTPAYMENTS_IPN_SECRET ?? 'dev-ipn-secret',
  appUrl:
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
};
