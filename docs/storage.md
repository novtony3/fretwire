# Data storage

Everything Fretwire persists, where it lives on localhost vs production, the key
schemas, and the two different "expiry" meanings. For the payment wire contract
see [integration.md](integration.md); for deploy/env see
[deployment.md](deployment.md).

## TL;DR

- Fretwire persists **three things**: orders, the per-publicKey HMAC nonce, and
  the IPN idempotency ledger. Nothing else.
- The **catalog is not stored** — it is a static TypeScript module compiled into
  the bundle.
- Storage goes through one `Store` interface with two backends, chosen
  automatically: **in-process memory** locally, **Upstash Redis (Vercel KV)** in
  production.
- There are **two unrelated "expiries"**: the **invoice `expiresAt`** (business
  logic, ~15 min, flips an unpaid order to `expired`) and the **storage TTL**
  (there is **none** — records are kept indefinitely).

---

## 1. What is persisted (and what isn't)

The whole persistence surface is the `Store` interface
(`src/lib/store/types.ts`): orders, a nonce counter, and a delivery ledger.

| Concern | Key (Redis) | Written by | Read by |
| ------- | ----------- | ---------- | ------- |
| **Order / invoice** | `order:<externalOrderId>` | checkout (create), status & IPN routes (update) | pay page, status route, IPN route |
| **HMAC nonce** | `nonce:<publicKey>` | every signed gateway call (`http` mode) | the signer (`sign.ts` via `nextNonce`) |
| **IPN idempotency** | `ipn:<deliveryId>` | IPN route on first delivery | IPN route (dedupe replays) |

**Not stored:**

- **Catalog** (the 12 guitars, categories) — a static module
  `src/lib/catalog/data.ts`, read instantly, deployed inside the bundle. No DB.
- **Cart** — held client-side (`cart-provider.tsx`, browser state); only
  snapshotted into the order as `cartJson` at checkout.
- **Sessions / users** — Fretwire has no accounts; `email` is just a field on
  the order.

### `StoredOrder` shape (`src/lib/store/types.ts`)

```ts
type StoredOrder = {
  externalOrderId: string; // our id + Redis key + /pay/[id] route param (numeric string)
  npOrderId: string | null; // the gateway's order id (ord_…); null until the invoice is created
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  coin: string; // 'ETH' | 'USDT'
  network: string | null; // 'ETH' | 'ERC20'
  amount: number; // priced from the catalog (server-trusted)
  address: string | null; // on-chain pay-to address from the gateway
  memo: string | null; // tag/memo for chains that need it
  expiresAt: string | null; // ISO; the invoice deadline (see §4)
  paidAt: string | null;
  transactionHash: string | null;
  ipnStatus: string | null; // last IPN event name
  ipnDeliveredAt: string | null;
  email: string | null;
  cartJson: string; // JSON snapshot of the cart lines at checkout
  createdAt: string;
  updatedAt: string;
};
```

---

## 2. The `Store` seam

`getStore()` (`src/lib/store/index.ts`) picks the backend **once** (cached for
the process) by the presence of KV env:

```ts
const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL);
cached = hasRedis ? new RedisStore() : new MemoryStore();
```

The interface is intentionally tiny and async (so it works over both a Map and a
network call):

```ts
interface Store {
  createOrder(order: StoredOrder): Promise<void>;
  getOrder(externalOrderId: string): Promise<StoredOrder | null>;
  updateOrder(externalOrderId: string, patch: Partial<StoredOrder>): Promise<void>;
  nextNonce(publicKey: string): Promise<number>; // strictly increasing per publicKey
  markDelivered(deliveryId: string): Promise<boolean>; // first-seen → true; replay → false
}
```

Higher-level helpers in `src/lib/store/orders.ts` wrap it:
`createLocalOrder` (initial row), `setGatewayFields` (attach `npOrderId`,
`address`, `expiresAt`, …), `markStatus` (advance status / tx / paidAt).

---

## 3. localhost vs production

|  | **localhost — `MemoryStore`** | **production — `RedisStore` (Upstash / Vercel KV)** |
| --- | --- | --- |
| Backing | `Map`/`Set` in the **Node process heap**, memoized on `globalThis` (`src/lib/store/memory-store.ts`) | **Upstash Redis** over the REST API (`@upstash/redis`, `src/lib/store/redis-store.ts`) |
| Selected when | no KV env present | `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) present |
| Survives hot-reload (HMR) | **yes** — kept on `globalThis` across module reloads | n/a |
| Survives process restart / cold start | **no** — everything is lost on `pnpm dev` restart or crash | **yes** — external store, survives invocations, cold starts, **and deploys** |
| Scope | a **single** process (this is why the mock self-IPN can see the order) | shared across **all** serverless instances (required — see below) |
| TTL | none | **none** |

### Why production *needs* Redis

On Vercel each request can hit a **different** serverless instance with its own
memory. With `MemoryStore`, `simulate`/IPN would update one instance's map while
the status poll reads another → the order looks stuck on `pending`. A shared
store (Redis) makes the IPN write and the status read see the same order. Adding
Vercel KV is what flips `getStore()` to `RedisStore` automatically.

### Backend operations

| Op | `MemoryStore` | `RedisStore` |
| --- | --- | --- |
| createOrder | `orders.set(id, order)` | `SET order:<id> <json>` |
| getOrder | `orders.get(id)` | `GET order:<id>` |
| updateOrder | merge + `set` (+ `updatedAt`) | `GET` → merge → `SET` (+ `updatedAt`) |
| nextNonce | `max(prev+1, Date.now())` | `INCR nonce:<pk>` |
| markDelivered | `Set.has` → add | `SET ipn:<id> 1 NX` → returns `OK` only first time |

> **Nonce difference that matters:** `MemoryStore` seeds the nonce from
> `Date.now()` (ms), so a fresh local run is already far above any previously
> used value. `RedisStore` uses a plain `INCR` starting at 1 — on a key the
> gateway has already seen at a higher value, the first calls are rejected with
> `APER003` until the key is seeded above the last-used nonce. See
> [vnpayment-gateway notes in deployment.md](deployment.md).

---

## 4. Expiry — two different things

### (a) Invoice expiry — `expiresAt` (business logic)

This is the countdown on the pay page ("Expires in 14:11"). It is **not** a
storage TTL — it is a field on the order.

- **mock**: `now + 900s` (**15 minutes**, `DEFAULT_EXPIRES_IN_SEC` in
  `src/lib/payments/mock-client.ts`).
- **http (real gateway)**: the **gateway sets `expiresAt`**. The order body
  supports `expiresIn` (seconds, ≤ 86400 = 24h) but `checkout/route.ts` does not
  send it, so the gateway's default window applies (~15 min in practice).
- **Enforcement** is lazy, in `src/app/api/orders/[id]/status/route.ts`: on each
  status poll, a `pending` order whose `expiresAt` is in the past is marked
  `expired` (the buyer must start a new order). **The record is not deleted** —
  only `status` changes.

### (b) Storage TTL — none

Neither backend sets an expire on any key:

- **localhost**: data disappears on process restart — that's volatility of an
  in-memory map, **not** a TTL.
- **production**: `order:*`, `nonce:*`, and `ipn:*` keys live in Redis
  **indefinitely** (until manually deleted or evicted by Upstash under memory
  pressure). Expired and paid orders stay; the IPN ledger only grows.

---

## 5. Order lifecycle through storage

```
POST /api/checkout                    createLocalOrder  → order:{id} (status pending, npOrderId null)
  → gateway createOrder (http/mock)   setGatewayFields  → order:{id} += npOrderId, address, expiresAt
                                       nextNonce         → nonce:{publicKey}   (http only)
GET  /api/orders/[id]/status (poll)   getOrder          → read order:{id}
  → past expiresAt & pending          markStatus        → status = expired
  → http mode & still pending         getClient().getOrder(npOrderId) reconcile → markStatus(paid/…)
POST /api/ipn (gateway → us)          markDelivered     → ipn:{deliveryId}  (replay → ack, no-op)
                                       getOrder/markStatus → status = paid (+ tx, paidAt)
POST /api/orders/[id]/simulate (mock) getOrder → emit self-signed IPN → /api/ipn (same as above)
```

So an order is **written** at checkout and **mutated in place** thereafter; the
nonce and IPN ledger are write-mostly side tables.

---

## 6. Environment

- **Local**: nothing to set — absence of KV env selects `MemoryStore`.
- **Production**: add **Vercel KV (Upstash Redis)** in the Storage tab. It
  injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` (and `UPSTASH_REDIS_REST_*`),
  which `getStore()` detects. `RedisStore` reads either naming.
- Inspect/seed KV directly with the Upstash REST API using those creds, e.g.
  `GET {KV_REST_API_URL}/get/order:<id>` with `Authorization: Bearer <token>`.

---

## 7. Operational notes & caveats

- **No cleanup job.** Expired/paid orders persist in Redis. Fine for a demo; a
  real store would add a TTL to `order:*` (e.g. 7 days after a terminal state).
- **IPN ledger grows unbounded.** `ipn:*` keys are never removed. Replays only
  happen near-term, so a TTL (24–48h) on `markDelivered`'s `SET` would bound it
  without weakening idempotency. Not implemented yet.
- **Nonce must never expire.** `nonce:<publicKey>` has to keep increasing
  forever; do **not** add a TTL to it.
- **Mock is single-process by design.** The mock self-IPN posts to the same
  server, so it only works because `MemoryStore` shares one process. Don't run
  mock across multiple instances.
- **Secrets are never stored here.** API keys / IPN secret live only in env; the
  store holds order data, a counter, and delivery ids.

---

## 8. Code map

| Concern | File |
| --- | --- |
| Store interface + `StoredOrder` | `src/lib/store/types.ts` |
| Backend selection (`getStore`) | `src/lib/store/index.ts` |
| In-process backend | `src/lib/store/memory-store.ts` |
| Redis backend | `src/lib/store/redis-store.ts` |
| Order helpers (`createLocalOrder`, `setGatewayFields`, `markStatus`) | `src/lib/store/orders.ts` |
| Nonce helper | `src/lib/store/nonce.ts` |
| IPN idempotency helper | `src/lib/store/ipn-delivery.ts` |
| Invoice expiry (mock default) | `src/lib/payments/mock-client.ts` |
| Lazy expire + reconcile | `src/app/api/orders/[id]/status/route.ts` |
| Catalog (not stored) | `src/lib/catalog/data.ts` |
