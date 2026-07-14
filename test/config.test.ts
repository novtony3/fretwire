import { describe, expect, it } from 'vitest';

import { getConfigWithSources, getPaymentsConfig } from '@/lib/payments/config';
import { getStore } from '@/lib/store';

// No gateway env in tests → env base is mock / empty creds / ipnSecret
// 'dev-ipn-secret'. getStore() uses the in-memory MemoryStore.

describe('payments/config', () => {
  it('lets a non-empty override win over env', async () => {
    await getStore().setConfig({ mode: 'http', apiUrl: 'https://gw.test', ipnSecret: 'ov-secret' });
    const cfg = await getPaymentsConfig();
    expect(cfg.mode).toBe('http');
    expect(cfg.apiUrl).toBe('https://gw.test');
    expect(cfg.ipnSecret).toBe('ov-secret');
  });

  it('falls back to env when an override field is emptied', async () => {
    await getStore().setConfig({ ipnSecret: 'temp' });
    expect((await getPaymentsConfig()).ipnSecret).toBe('temp');
    await getStore().setConfig({ ipnSecret: '' });
    expect((await getPaymentsConfig()).ipnSecret).toBe('dev-ipn-secret');
  });

  it('ignores an invalid mode override', async () => {
    await getStore().setConfig({ mode: 'nope' as never });
    expect((await getPaymentsConfig()).mode).toBe('mock');
  });

  it('reports the source of each field', async () => {
    await getStore().setConfig({ apiUrl: 'https://src.test' });
    expect((await getConfigWithSources()).sources.apiUrl).toBe('override');
    await getStore().setConfig({ apiUrl: '' });
    expect((await getConfigWithSources()).sources.apiUrl).toBe('env');
  });
});

describe('store config round-trip', () => {
  it('merges successive partial patches', async () => {
    await getStore().setConfig({ publicKey: 'pk-1' });
    await getStore().setConfig({ privateKey: 'sk-1' });
    const stored = await getStore().getConfig();
    expect(stored?.publicKey).toBe('pk-1');
    expect(stored?.privateKey).toBe('sk-1');
  });
});
