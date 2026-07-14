import { NextResponse } from 'next/server';

import { getClient } from '@/lib/payments/client';
import { getPaymentsConfig } from '@/lib/payments/config';
import { getOrder, markStatus } from '@/lib/store/orders';

/** Order status for the payment page to poll. Auto-expires; reconciles in http mode. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let order = await getOrder(id);
  if (!order) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Lazily expire a pending order past its window.
  if (order.status === 'pending' && order.expiresAt && Date.parse(order.expiresAt) < Date.now()) {
    await markStatus(id, { status: 'expired' });
    order = (await getOrder(id)) ?? order;
  }

  // In http mode, reconcile a still-pending order against the gateway.
  const cfg = await getPaymentsConfig();
  if (cfg.mode === 'http' && order.status === 'pending' && order.npOrderId) {
    try {
      const client = await getClient();
      const remote = await client.getOrder(order.npOrderId);
      if (remote.status !== order.status) {
        await markStatus(id, {
          status: remote.status,
          transactionHash: remote.transactionHash ?? null,
          paidAt: remote.paidAt ?? null,
        });
        order = (await getOrder(id)) ?? order;
      }
    } catch {
      // Reconcile failure is non-fatal — the local status stands.
    }
  }

  return NextResponse.json({
    status: order.status,
    coin: order.coin,
    network: order.network,
    amount: order.amount,
    address: order.address,
    memo: order.memo,
    expiresAt: order.expiresAt,
    transactionHash: order.transactionHash,
    paidAt: order.paidAt,
  });
}
