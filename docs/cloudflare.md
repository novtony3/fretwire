# Cloudflare Workers (additive deploy target)

Fretwire also builds and runs on Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare). This is **additive** to the
Vercel deployment described in [deployment.md](deployment.md), which stays the
documented production target. Nothing here has been deployed to a live
Cloudflare account yet — this doc covers local build/preview and what's needed
to actually deploy when that's wanted.

## Why OpenNext, not `@cloudflare/next-on-pages`

The payment core (`src/lib/payments/sign.ts`, `ipn.ts`, `mock-client.ts`) uses
`node:crypto` (`createHmac`, `createHash`, `randomUUID`, `timingSafeEqual`) in
standard Node-runtime route handlers. OpenNext runs the built app under
workerd's `nodejs_compat` layer, which supports all four functions natively —
no rewrite to Web Crypto needed. `next-on-pages` would force `edge` runtime
and a much thinner Node shim.

## Store

Unchanged: `getStore()` still picks `RedisStore` (Upstash, REST API — plain
`fetch` under the hood, so it runs the same on Workers as on Vercel) when
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set, else
`MemoryStore`. No Cloudflare KV/D1 binding is used.

## Commands

```bash
pnpm run cf:build     # opennextjs-cloudflare build -> .open-next/
pnpm run cf:preview   # build, then `wrangler dev` (fully local, no Cloudflare login)
pnpm run cf:deploy    # build, then `wrangler deploy` (needs `wrangler login` first)
```

## Required vars/secrets

Same names as the Vercel setup (see [deployment.md](deployment.md)'s env
table), set as Worker vars/secrets instead of Vercel env vars:

| Var                                                | Why                                                    |
| --------------------------------------------------- | ------------------------------------------------------- |
| `PAYMENTS_MODE`                                     | `mock` or `http`                                         |
| `NEXTPAYMENTS_API_URL` / `_PUBLIC_KEY` / `_PRIVATE_KEY` / `_IPN_SECRET` | Only for `PAYMENTS_MODE=http`         |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Selects `RedisStore`; omit both for `MemoryStore`      |
| `NEXT_PUBLIC_SITE_URL`                              | Canonical URL **and** the IPN self-callback host (see gotcha below) |

For local `wrangler dev`, copy `.dev.vars.example` to `.dev.vars` (gitignored)
and fill in. For a real deployment, use `wrangler secret put <NAME>` for
secrets and the `vars` block in `wrangler.jsonc` for non-secret values.

## Gotcha — IPN self-callback needs an explicit public URL

Vercel auto-injects `VERCEL_URL`, which `src/lib/env.ts` falls back to when
`NEXT_PUBLIC_SITE_URL` is unset. **Cloudflare Workers has no equivalent
auto-injected URL var.** Without `NEXT_PUBLIC_SITE_URL` set, `env.appUrl` falls
all the way back to `http://localhost:3000`, so in mock mode the self-signed
IPN never reaches the running Worker and orders stay `pending` forever. Always
set `NEXT_PUBLIC_SITE_URL` explicitly — to `http://localhost:8787` for
`wrangler dev`, or to the Worker's public URL (`https://fretwire.<subdomain>.workers.dev`
or a custom domain) once actually deployed.

## Not done yet (would be needed before a real deploy)

- [ ] `wrangler login` against a real Cloudflare account.
- [ ] Provision the vars/secrets above on the Worker (dashboard or `wrangler secret put`).
- [ ] `pnpm run cf:deploy`, then verify the same checkout → simulate → status
      flow documented in [deployment.md](deployment.md) against the deployed
      Worker.
- [ ] Custom domain, if wanted, in place of the `workers.dev` subdomain.
