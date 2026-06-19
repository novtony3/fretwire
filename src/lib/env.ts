/**
 * Server-side environment access. Centralizes the payment-integration config so
 * route handlers and the payments client read one typed object, never
 * `process.env` directly. Mock mode needs none of the gateway secrets.
 */

const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
};

export type PaymentsMode = 'mock' | 'http';

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

  /** Gateway credentials, asserted present — call only on the `http` path. */
  requireHttp(): { apiUrl: string; publicKey: string; privateKey: string } {
    return {
      apiUrl: required(this.apiUrl, 'NEXTPAYMENTS_API_URL'),
      publicKey: required(this.publicKey, 'NEXTPAYMENTS_PUBLIC_KEY'),
      privateKey: required(this.privateKey, 'NEXTPAYMENTS_PRIVATE_KEY'),
    };
  },
};
