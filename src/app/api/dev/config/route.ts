import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getConfigWithSources } from '@/lib/payments/config';
import { getStore } from '@/lib/store';

/**
 * Dev-only runtime override for the gateway config (see `/dev/config`). Writes a
 * partial override into the Store; the request path reads it via
 * `getPaymentsConfig` (Store over env). Returns 404 in production so a deployed
 * build never exposes or accepts secrets here.
 */

const isProd = process.env.NODE_ENV === 'production';

const overrideSchema = z.object({
  mode: z.union([z.literal('mock'), z.literal('http')]).optional(),
  apiUrl: z.string().optional(),
  publicKey: z.string().optional(),
  privateKey: z.string().optional(),
  ipnSecret: z.string().optional(),
  appUrl: z.string().optional(),
});

export async function GET(): Promise<Response> {
  if (isProd) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(await getConfigWithSources());
}

export async function POST(req: Request): Promise<Response> {
  if (isProd) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body: unknown = await req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  await getStore().setConfig(parsed.data);
  return NextResponse.json({ ok: true, ...(await getConfigWithSources()) });
}
