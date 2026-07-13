# Fretwire — project guide

A standalone **Next.js 15 (App Router, TS strict)** guitar storefront that takes
**crypto payment** through the NextPayments gateway as a third-party `api`
merchant. Sells electric / acoustic / classical / bass guitars. Visual system is
"Signal Chain" (warm-dark + amber, Bricolage display + Geist, Lucide icons).

This repo is self-contained — it does **not** depend on the gateway's monorepo.

## Commands (Node 22, pnpm)

```bash
pnpm install
pnpm dev          # http://localhost:3000  (mock mode — no DB/services needed)
pnpm build
pnpm test         # vitest: sign / IPN / store
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (next/core-web-vitals)
```

Always run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before
declaring work done. Format with `pnpm exec prettier --write`.

## Architecture

```
src/app/                routes (storefront, payment, /api/*) + SEO files
src/components/ui/       reusable primitives — Button, Card, Badge, Label,
                         Input, Select, IconButton, Toast (Lucide, tokens only)
src/components/          brand (Logo, FretRail, GuitarArt, SpecStrip) + features
src/lib/catalog/         static, typed guitar catalog (data.ts + index.ts)
src/lib/payments/        NextPaymentsClient (mock | http), HMAC sign, IPN
src/lib/store/           Store interface — memory (local) | Upstash Redis (prod)
src/lib/{site,format,cn,env}.ts
```

Two swappable seams keep integration isolated:

- **`getClient()`** (`src/lib/payments/client.ts`) → `MockClient` (offline, emits
  a self-signed IPN) or `HttpClient` (real HMAC calls), by `PAYMENTS_MODE`.
- **`getStore()`** (`src/lib/store/index.ts`) → `MemoryStore` or `RedisStore`,
  auto-selected by the presence of KV env. Holds orders, the per-publicKey
  nonce, and the IPN idempotency ledger.

Catalog is a static module (no DB) → reads instantly and deploys on serverless.

See [docs/storage.md](docs/storage.md) for the full storage reference (what's
persisted, MemoryStore vs Redis, key schemas, and the two expiry meanings).

### Payment flow

`POST /api/checkout` prices the cart, creates a gateway invoice, persists it, and
returns `/pay/[orderId]`. The pay page shows the address + QR + countdown and
polls `GET /api/orders/[id]/status`. The gateway (or, in mock, the
`POST /api/orders/[id]/simulate` route) delivers a signed IPN to
`POST /api/ipn`, which verifies it and advances the order; the poll then sees
`paid` and routes to the receipt.

## Integration contract

See [docs/integration.md](docs/integration.md) for the full spec. In short:

- **Order signing** (`src/lib/payments/sign.ts`):
  `HMAC_SHA512(privateKey, "${timestamp}.${nonce}.${METHOD}.${path}.${rawBody}")`
  in `X-Signature`, with `X-API-Key / X-Nonce / X-Timestamp`. Send the exact
  signed `rawBody`; `nonce` strictly increases per publicKey.
- **IPN** (`src/lib/payments/ipn.ts`):
  `HMAC_SHA512(ipnSecret, "${timestamp}.${deliveryId}.${rawBody}")` in
  `X-NP-Signature`; verify = freshness ±300s + constant-time compare +
  idempotency by `X-NP-Id`. This IPN scheme is **our design** — adjust
  `signIpn`/`verifyIpnSignature` if the live gateway differs.

## Conventions

- **TS strict, no `any`.** Schema/validation via `zod`.
- **No emoji and no hardcoded icon glyphs** — use `lucide-react` for all icons.
- **Design tokens only** — colors/radii are CSS vars from `@theme` in
  `src/app/globals.css` (`--color-*`, `--radius`, `--font-*`). No raw hex at call
  sites; compose classes with `cn()`.
- One component per file, kebab-case filename, PascalCase export. Reuse the
  `src/components/ui/*` primitives before building new UI.
- Prettier: `singleQuote`, `trailingComma: all`, `printWidth: 100`.

## Deploy (Vercel)

See [docs/deployment.md](docs/deployment.md) for the live deployment record
(GitHub/Vercel targets, env vars, the IPN-callback gotcha, and the TODO list).
Cloudflare Workers is also supported as an additive deploy target — see
[docs/cloudflare.md](docs/cloudflare.md) for setup, required vars, and
commands (not yet deployed to a live account).

- Hosted on Vercel; production build is clean. CLI deploys work; GitHub
  auto-deploy needs the Vercel↔GitHub app authorized on the `novtony3` account.
- **The order flow needs a shared store on serverless.** Without it, `MemoryStore`
  is per-invocation, so `simulate → status` stays `pending` (the IPN updates a
  different instance). **Add Vercel KV (Upstash Redis)** in the Storage tab — it
  injects `KV_REST_API_URL`/`KV_REST_API_TOKEN` and `getStore()` switches to
  Redis automatically. Catalog + UI work without it.
- Env for the real gateway: `PAYMENTS_MODE=http`, `NEXTPAYMENTS_API_URL`,
  `NEXTPAYMENTS_PUBLIC_KEY`, `NEXTPAYMENTS_PRIVATE_KEY` (secret),
  `NEXTPAYMENTS_IPN_SECRET`, and `NEXT_PUBLIC_SITE_URL` (canonical URL + IPN
  callback host). Keep the private key in env only — never commit it.

## Gotchas

- Use **Node 22** for pnpm/build (the gateway monorepo's toolchain matches).
- **No `better-sqlite3`** — it can't run on Vercel serverless; storage is the
  `Store` abstraction instead.
- Mock mode (`PAYMENTS_MODE` unset/`mock`) is the local default and needs no
  services; `http` mode talks to the live gateway and needs the env above.
