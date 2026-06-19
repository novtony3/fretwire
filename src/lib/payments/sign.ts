import { createHmac } from 'node:crypto';

/**
 * HMAC request signing for the NextPayments gateway, matching the merchant
 * reference exactly: `message = timestamp.nonce.METHOD.path.rawBody`, signed
 * with HMAC-SHA512 of the private key. The EXACT `rawBody` returned here must be
 * the bytes sent on the wire — re-stringifying would change the signature.
 */

export type SignedRequest = {
  timestamp: number;
  nonce: number;
  signature: string;
  rawBody: string;
};

export function buildMessage(
  timestamp: number,
  nonce: number,
  method: string,
  path: string,
  rawBody: string,
): string {
  return `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${rawBody}`;
}

export function signRequest(params: {
  method: string;
  /** Route path WITHOUT query string — must equal the server's `req.originalUrl`. */
  path: string;
  body?: unknown;
  privateKey: string;
  /** UNIX seconds; gateway accepts a ±300s window. */
  timestamp: number;
  /** Strictly increasing per publicKey (see nonce-repo). */
  nonce: number;
}): SignedRequest {
  const rawBody = params.body ? JSON.stringify(params.body) : '';
  const message = buildMessage(params.timestamp, params.nonce, params.method, params.path, rawBody);
  const signature = createHmac('sha512', params.privateKey).update(message, 'utf8').digest('hex');
  return { timestamp: params.timestamp, nonce: params.nonce, signature, rawBody };
}
