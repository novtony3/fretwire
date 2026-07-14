import { NextResponse } from 'next/server';

import { getPaymentsConfig } from '@/lib/payments/config';
import { emitMockPaidIpn } from '@/lib/payments/mock-client';
import { getOrder } from '@/lib/store/orders';

/** Mock-only: simulate the gateway paying this order by emitting a signed IPN. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const cfg = await getPaymentsConfig();
  if (cfg.mode !== 'mock') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  await emitMockPaidIpn(order, { appUrl: cfg.appUrl, ipnSecret: cfg.ipnSecret });
  return NextResponse.json({ ok: true });
}
