import { describe, expect, it } from 'vitest';

import { signIpn, verifyIpnSignature } from '@/lib/payments/ipn';

const secret = 's';
const ts = 1718800000;
const id = 'd1';
const body = '{"event":"invoicePaid"}';
const sig = signIpn({ ipnSecret: secret, timestamp: ts, deliveryId: id, rawBody: body });

describe('verifyIpnSignature', () => {
  it('accepts a fresh, valid signature', () => {
    expect(
      verifyIpnSignature({ ipnSecret: secret, timestamp: ts, deliveryId: id, rawBody: body, signature: sig, now: ts + 10 }),
    ).toEqual({ ok: true });
  });

  it('rejects a tampered body', () => {
    expect(
      verifyIpnSignature({ ipnSecret: secret, timestamp: ts, deliveryId: id, rawBody: '{"event":"x"}', signature: sig, now: ts }),
    ).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a stale timestamp (> 300s skew)', () => {
    expect(
      verifyIpnSignature({ ipnSecret: secret, timestamp: ts, deliveryId: id, rawBody: body, signature: sig, now: ts + 400 }),
    ).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects a missing signature', () => {
    expect(
      verifyIpnSignature({ ipnSecret: secret, timestamp: ts, deliveryId: id, rawBody: body, signature: '', now: ts }),
    ).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects a wrong secret', () => {
    expect(
      verifyIpnSignature({ ipnSecret: 'other', timestamp: ts, deliveryId: id, rawBody: body, signature: sig, now: ts }).ok,
    ).toBe(false);
  });
});
