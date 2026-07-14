import { getPaymentsConfig } from './config';
import { HttpClient } from './http-client';
import { MockClient } from './mock-client';
import type { NextPaymentsClient } from './types';

/**
 * Pick the gateway client from the resolved config (env base + Store override).
 * Async because the mode may be overridden at runtime via `/dev/config`. The
 * http client is handed the resolved credentials and asserts them on use.
 */
export async function getClient(): Promise<NextPaymentsClient> {
  const cfg = await getPaymentsConfig();
  return cfg.mode === 'http' ? new HttpClient(cfg) : new MockClient();
}
