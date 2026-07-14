import { env } from '../env';
import { getStore } from '../store';

import {
  CONFIG_FIELDS,
  PAYMENTS_MODES,
  type ConfigField,
  type ConfigSource,
  type PaymentsMode,
  type ResolvedPaymentsConfig,
} from './types';

/**
 * Single source of gateway config for the request path. The env is the base;
 * a dev-only Store override (see `/dev/config`) is layered on top — a non-empty
 * override field wins, an empty/absent one falls back to env. `getClient`, the
 * IPN route, and the status/simulate routes all read through here so the
 * override applies everywhere at once.
 */

export type { ConfigField, ConfigSource };

function envBase(): ResolvedPaymentsConfig {
  return {
    mode: env.mode,
    apiUrl: env.apiUrl,
    publicKey: env.publicKey,
    privateKey: env.privateKey,
    ipnSecret: env.ipnSecret,
    appUrl: env.appUrl,
  };
}

function isMode(value: unknown): value is PaymentsMode {
  return typeof value === 'string' && (PAYMENTS_MODES as readonly string[]).includes(value);
}

async function resolve(): Promise<{
  effective: ResolvedPaymentsConfig;
  sources: Record<ConfigField, ConfigSource>;
}> {
  const effective = envBase();
  const sources = Object.fromEntries(CONFIG_FIELDS.map((k) => [k, 'env'])) as Record<
    ConfigField,
    ConfigSource
  >;
  const override = await getStore().getConfig();
  if (!override) return { effective, sources };

  if (isMode(override.mode)) {
    effective.mode = override.mode;
    sources.mode = 'override';
  }
  for (const key of ['apiUrl', 'publicKey', 'privateKey', 'ipnSecret', 'appUrl'] as const) {
    const value = override[key];
    if (typeof value === 'string' && value.trim() !== '') {
      effective[key] = value;
      sources[key] = 'override';
    }
  }
  return { effective, sources };
}

/** Fully-resolved config (env base + Store override). Store wins per field. */
export async function getPaymentsConfig(): Promise<ResolvedPaymentsConfig> {
  return (await resolve()).effective;
}

/** Effective config plus where each field came from — for the dev config UI. */
export async function getConfigWithSources(): Promise<{
  effective: ResolvedPaymentsConfig;
  sources: Record<ConfigField, ConfigSource>;
}> {
  return resolve();
}

/** Assert the http-path credentials are present; throws a clear error if not. */
export function requireHttpConfig(cfg: ResolvedPaymentsConfig): {
  apiUrl: string;
  publicKey: string;
  privateKey: string;
} {
  const missing = (['apiUrl', 'publicKey', 'privateKey'] as const).filter((k) => !cfg[k]);
  if (missing.length > 0) {
    throw new Error(`Missing gateway config: ${missing.join(', ')}`);
  }
  return { apiUrl: cfg.apiUrl, publicKey: cfg.publicKey, privateKey: cfg.privateKey };
}
