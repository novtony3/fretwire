import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildMessage, signRequest } from '@/lib/payments/sign';

describe('buildMessage', () => {
  it('joins timestamp.nonce.METHOD.path.rawBody with method uppercased', () => {
    expect(buildMessage(1718800000, 42, 'post', '/api/orders', '{"a":1}')).toBe(
      '1718800000.42.POST./api/orders.{"a":1}',
    );
  });
});

describe('signRequest', () => {
  const base = {
    method: 'POST',
    path: '/api/orders',
    privateKey: 'secret',
    timestamp: 1718800000,
    nonce: 42,
  };

  it('signs HMAC-SHA512 over the canonical message and sends the exact rawBody', () => {
    const r = signRequest({ ...base, body: { amount: 12.5, coin: 'USDT' } });
    const expected = createHmac('sha512', 'secret')
      .update(`1718800000.42.POST./api/orders.${r.rawBody}`, 'utf8')
      .digest('hex');
    expect(r.rawBody).toBe('{"amount":12.5,"coin":"USDT"}');
    expect(r.signature).toBe(expected);
    expect(r.signature).toHaveLength(128); // sha512 hex
  });

  it('uses an empty rawBody when there is no body (e.g. GET)', () => {
    const r = signRequest({ ...base, method: 'GET', path: '/api/orders/abc' });
    expect(r.rawBody).toBe('');
    expect(r.signature).toBe(
      createHmac('sha512', 'secret')
        .update('1718800000.42.GET./api/orders/abc.', 'utf8')
        .digest('hex'),
    );
  });
});
