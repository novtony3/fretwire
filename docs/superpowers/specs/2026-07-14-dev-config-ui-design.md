# Dev config UI — runtime gateway config override

**Date:** 2026-07-14
**Repo:** fretwire (storefront)
**Status:** design, pending approval

## Goal

A **dev-only** page at `/dev/config` to set the gateway integration values at
runtime, persisted in the `Store`, overriding environment variables. Lets a
developer test different gateway credentials (and switch mock/http) without
editing `.env` and restarting.

## Decisions (from brainstorming)

- **Audience:** dev/local only — no auth, secrets shown in plain text. The page
  and its API return **404 when `NODE_ENV === 'production'`**.
- **Persistence:** server-side `Store` (MemoryStore local / RedisStore on Vercel),
  key `config:payments`.
- **Precedence:** Store override **>** env. An empty/absent override field falls
  back to env.
- **Scope:** includes `PAYMENTS_MODE` (mock/http) plus the 5 gateway values →
  `getClient()` becomes async.

## Config shape

```ts
// resolved, used everywhere the request path needs config
type ResolvedPaymentsConfig = {
  mode: 'mock' | 'http';
  apiUrl: string;
  publicKey: string;
  privateKey: string;
  ipnSecret: string;
  appUrl: string;
};
// stored override — every field optional; empty string / undefined = "use env"
type PaymentsConfigOverride = Partial<ResolvedPaymentsConfig>;
```

## New units

- **`src/lib/payments/config.ts`**
  - `getPaymentsConfig(): Promise<ResolvedPaymentsConfig>` — read env base, merge
    Store override on top (non-empty override wins; mode override only if
    `'mock'|'http'`).
  - `requireHttpConfig(cfg)` — assert `apiUrl/publicKey/privateKey` non-empty
    (replaces `env.requireHttp()` on the http path), throwing a clear error.
- **`src/app/api/dev/config/route.ts`** — `GET` returns the effective config +
  per-field source (`env` | `override`); `POST` validates a `PaymentsConfigOverride`
  (zod) and writes it via `Store.setConfig`. Both 404 in production.
- **`src/app/dev/config/page.tsx`** + **`src/components/dev-config-form.tsx`** —
  server page guards prod; client form with the 6 fields (mode = Select,
  rest = Input), Save button, shows current effective value + source. Reuses
  `components/ui/*` (Input, Select, Button, Label, Toast). Tokens only, Lucide.

## Changed units

- **`src/lib/store/types.ts`** — add `getConfig(): Promise<PaymentsConfigOverride | null>`
  and `setConfig(patch: PaymentsConfigOverride): Promise<void>` to `Store`.
- **`memory-store.ts` / `redis-store.ts`** — implement both (MemState gains a
  `config` field; Redis uses key `config:payments`, `setConfig` merges).
- **`src/lib/payments/client.ts`** — `getClient()` → `async getClient()`; resolves
  config and injects it into `HttpClient` (MockClient needs none), picks impl by
  `cfg.mode`.
- **`src/lib/payments/http-client.ts`** — constructor takes the resolved
  `{apiUrl,publicKey,privateKey}` instead of reading `env.requireHttp()`.
- **Routes** — `checkout`, `orders/[id]/status`, `orders/[id]/simulate`,
  `ipn` switch from `env.*` / `getClient()` to `await getPaymentsConfig()` /
  `await getClient()`. `ipn` and `simulate` read `ipnSecret`/`appUrl`/`mode` from
  the resolved config.
- **`src/lib/env.ts`** — stays the base env source that `getPaymentsConfig`
  reads. `requireHttp()` superseded by `requireHttpConfig` (keep or remove).

## Data flow

```
/dev/config form → POST /api/dev/config → Store.setConfig(override)
checkout / ipn / status / simulate → getPaymentsConfig()  [Store override > env]
```

## Testing

- `config.ts`: override > env; empty override falls back to env; invalid mode
  ignored.
- `Store`: `getConfig`/`setConfig` round-trip + merge (MemoryStore).
- Existing `sign` / `ipn` / `store` / `mock-client` tests keep passing.
- Manual: set http creds via UI, run checkout against the gateway.

## Out of scope (YAGNI)

No auth, no secret masking, no `.env` writing, no per-request header override,
no production exposure.
