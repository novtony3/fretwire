import { NextResponse } from 'next/server';

import { getPaymentsConfig } from '@/lib/payments/config';
import { markDelivered } from '@/lib/store/ipn-delivery';
import { getOrder, markStatus } from '@/lib/store/orders';
import { IPN_HEADERS, ipnPayloadSchema, verifyIpnSignature } from '@/lib/payments/ipn';

/** Receive a gateway IPN: verify signature → dedupe → advance the local order. */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const headers = req.headers;
  const timestamp = Number(headers.get(IPN_HEADERS.TIMESTAMP) ?? '0');
  const deliveryId = headers.get(IPN_HEADERS.ID) ?? '';
  const signature = headers.get(IPN_HEADERS.SIGNATURE) ?? '';

  const { ipnSecret } = await getPaymentsConfig();
  const verdict = verifyIpnSignature({
    ipnSecret,
    timestamp,
    deliveryId,
    rawBody,
    signature,
    now: Math.floor(Date.now() / 1000),
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: 401 });
  }

  // Idempotency: a replay is acknowledged but not re-processed.
  if (!(await markDelivered(deliveryId))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const parsed = ipnPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_payload' }, { status: 400 });
  }
  const payload = parsed.data;

  if (!(await getOrder(payload.externalOrderId))) {
    return NextResponse.json({ received: true, unknownOrder: true });
  }
  await markStatus(payload.externalOrderId, {
    status: payload.status,
    transactionHash: payload.transactionHash ?? null,
    paidAt: payload.paidAt ?? null,
    ipnStatus: payload.event,
    ipnDeliveredAt: new Date().toISOString(),
  });
  return NextResponse.json({ received: true });
}
