# Phase 5 — Benchmark Hardening

## Motivation

After Phase 4, Claude Code scored **10/10 tasks at an average of 100**. The
benchmark could no longer discriminate between capability levels: every task was
solved, so the score carried no signal. Phase 5 adds **20 new tasks at
difficulty 3–4** that target realistic backend engineering and are designed to
be *discriminative* — a plausible-but-wrong implementation passes the public
tests yet fails the hidden edge cases.

## How discrimination is engineered

The runner scores by run status: `completed` (all public **and** hidden tests
pass) → 100; `failed_hidden_tests` → 25; any earlier failure → 0. A task is only
discriminative if a naive solution can clear the public tests but trip a hidden
test. Every Phase 5 task was therefore built so that:

1. **Public tests** cover the happy path and one or two obvious cases.
2. **Hidden tests** cover the state transitions, concurrency races, and edge
   cases that a shortcut implementation gets wrong.
3. The shipped **starter fails** the public tests (the task is non-trivial), and
   the private **reference solution passes** every public and hidden test.

All 20 tasks use **zero runtime dependencies** (native `Bun.serve`,
`bun:sqlite`, `node:crypto`). Installs run `bun install --no-save` with network
denied, removing install flakiness and forcing the model to implement the
capability itself rather than importing a library.

Acceptance gate, verified for all 20 (see "Verification" below):
`bun run validate:task` passes, the reference solution is all-green, and the
starter fails the public suite.

## The 20 new tasks

| # | Task ID | Category | Diff | Capability under test |
|---|---------|----------|------|-----------------------|
| 1 | `pagination.keyset-feed.v1` | http-apis | 4 | Keyset/cursor pagination, stable under concurrent inserts |
| 2 | `pagination.bidirectional-cursor.v1` | http-apis | 4 | Bidirectional cursors with correct `has_next`/`has_prev` |
| 3 | `idempotency.payment-capture.v1` | http-apis | 4 | Idempotency keys: fingerprinting, replay, concurrency-safe single-exec |
| 4 | `idempotency.dedup-conflict.v1` | crud-systems | 3 | Idempotency replay vs business-level dedup (two conflict mechanisms) |
| 5 | `databases.sqlite-ledger.v1` | databases | 4 | Transactional money movement, invariants, durability |
| 6 | `databases.sqlite-migrations.v1` | databases | 4 | Idempotent ordered migrations, restart-safe schema evolution |
| 7 | `databases.optimistic-version.v1` | databases | 4 | Version + If-Match optimistic concurrency (gold exemplar) |
| 8 | `crud-systems.etag-concurrency.v1` | crud-systems | 4 | Content-hash strong ETag conditional updates (412/428/`*`) |
| 9 | `authentication.jwt-verify.v1` | authentication | 4 | Manual JWT verification with alg-confusion defense |
| 10 | `authentication.jwt-refresh-rotation.v1` | authentication | 4 | Refresh-token rotation with reuse detection / family revocation |
| 11 | `authorization.rbac-roles.v1` | authorization | 4 | RBAC with ownership + admin override; 401-vs-403 |
| 12 | `authorization.scoped-tokens.v1` | authorization | 3 | Scope-based authz with RFC 6750 `insufficient_scope` challenge |
| 13 | `rate-limiting.sliding-window.v1` | rate-limiting | 4 | Sliding-window limiter with correct rolling boundary + Retry-After |
| 14 | `rate-limiting.token-bucket.v1` | rate-limiting | 4 | Token bucket: continuous refill math + capacity cap |
| 15 | `background-jobs.retry-queue.v1` | background-jobs | 4 | Async queue: bounded retries, backoff, dead-letter state machine |
| 16 | `websockets.presence-room.v1` | websockets | 4 | WS room presence with disconnect cleanup + isolation |
| 17 | `websockets.seqnum-resume.v1` | websockets | 4 | Message sequencing + resumable, gap/dupe-free catch-up |
| 18 | `file-uploads.multipart-checksum.v1` | file-uploads | 4 | Secure multipart: size/type/path-traversal + sha256 integrity |
| 19 | `observability.request-metrics.v1` | observability | 4 | Metrics with bounded label cardinality + request-id propagation |
| 20 | `error-handling.circuit-breaker.v1` | error-handling | 4 | Retry semantics + circuit-breaker state machine |

All 12 required topic areas are covered: pagination (1,2), idempotency (3,4),
sqlite persistence (5,6), optimistic concurrency (7,8), JWT auth (9,10), RBAC
(11,12), rate limiting (13,14), background jobs (15), websocket state (16,17),
file uploads (18), observability (19), retry semantics (20).

## Per-task acceptance rationale

Each task was accepted only with an explicit answer to three questions: why a
strong model (Claude) might fail, why a small model might fail, and which single
capability is being tested.

### 1. pagination.keyset-feed.v1
- **Strong model trap**: the `next_cursor` terminator — the contract requires a
  non-null cursor whenever a page is filled to `limit`, even when it exhausts the
  feed; a "null when no more items" shortcut breaks the exact-boundary case.
- **Small model trap**: reaches for offset/limit pagination, which shifts older
  pages when new high-id events arrive (skipped items), and exposes/accepts raw
  ids instead of opaque cursors.
- **Capability**: keyset/cursor pagination with stable ordering under inserts.

### 2. pagination.bidirectional-cursor.v1
- **Strong model trap**: `before` semantics — the slice must be taken from the
  high end of items below the cursor but returned ascending; a naive
  `filter(id<before).slice(0,limit)` returns the wrong (lowest) rows.
- **Small model trap**: computes `has_next`/`has_prev` from page fullness instead
  of peeking one row beyond each edge (off-by-one); mishandles mutually-exclusive
  `after`/`before`.
- **Capability**: bidirectional cursor pagination with correct page-info.

### 3. idempotency.payment-capture.v1
- **Strong model trap**: the concurrency race — checking the key map then
  creating across an `await` lets a burst of identical requests create multiple
  payments. Requires a per-key in-flight single-flight promise.
- **Small model trap**: conflates replay with key-reuse (returns cached response
  on a different body, or 200 instead of 409), or omits the replay header.
- **Capability**: idempotency keys with request fingerprinting + concurrency-safe
  single execution.

### 4. idempotency.dedup-conflict.v1
- **Strong model trap**: check ordering — if business uniqueness (reference) is
  checked before the idempotency key, a legitimate replay wrongly returns
  `duplicate_reference` instead of replaying.
- **Small model trap**: collapses both conflicts into one generic 409 rather than
  two independent indexes.
- **Capability**: idempotent create vs business-level dedup with correct
  precedence.

### 5. databases.sqlite-ledger.v1
- **Strong model trap**: doing balance-check/debit/credit as separate steps (or
  checking balance before the transaction) lets two concurrent transfers both
  read the pre-debit balance and overdraw; a failed path can leave a partial
  change. Requires re-reading inside the same `db.transaction()`.
- **Small model trap**: lacks multi-statement transactions; stores balances in
  memory (fails restart) or applies debit-then-credit without rollback.
- **Capability**: transactional money movement preserving invariants +
  durability.

### 6. databases.sqlite-migrations.v1
- **Strong model trap**: the non-idempotent `ALTER TABLE ADD COLUMN` — there is no
  `IF NOT EXISTS` for columns, so running it unconditionally on the second boot
  throws "duplicate column" and the process never reaches readiness. Requires
  gating each migration on a recorded `schema_migrations` row.
- **Small model trap**: no migration-tracking table; re-runs the list every boot
  (crashing) or hard-codes the version number.
- **Capability**: idempotent ordered migrations with a durable version table.

### 7. databases.optimistic-version.v1 (gold exemplar)
- **Strong model trap**: read-modify-write without a transaction lets two writers
  both bump the version (lost update); confusing 409/412/428 semantics; treating
  a missing If-Match as an unconditional update.
- **Small model trap**: in-memory storage (fails restart); no conflict detection
  (blind overwrite); mishandles If-Match parsing.
- **Capability**: version + If-Match optimistic concurrency with durable,
  transactional compare-and-set.

### 8. crud-systems.etag-concurrency.v1
- **Strong model trap**: concurrent compare-and-set — an `await` between the ETag
  check and the mutation lets both writers commit; also returning 409 (the
  optimistic-concurrency reflex) instead of RFC 7232's 412, and forgetting the
  `*` wildcard.
- **Small model trap**: substitutes a version counter / timestamp / random token
  for a real content hash (breaks "same content → same ETag").
- **Capability**: content-addressed strong-ETag conditional updates.

### 9. authentication.jwt-verify.v1
- **Strong model trap**: alg-confusion — accepting `alg:"none"` (skipping
  signature) or any HMAC family because the digest is computed from `header.alg`.
  Requires pinning to exactly `HS256` before any signature handling.
- **Small model trap**: cannot manually base64url-decode and recompute HMAC-SHA256
  over the raw `header.payload`, nor keep the validation steps correctly ordered.
- **Capability**: manual JWT verification with algorithm pinning.

### 10. authentication.jwt-refresh-rotation.v1
- **Strong model trap**: reuse detection requires *remembering consumed tokens*;
  a model that simply deletes/overwrites the old refresh treats a replay as merely
  "unknown" and never revokes the family, leaving the current token alive.
- **Small model trap**: builds a flat valid-token set that cannot express family
  revocation or distinguish reuse from unknown.
- **Capability**: refresh-token rotation with reuse detection + family revocation.

### 11. authorization.rbac-roles.v1
- **Strong model trap**: collapsing the two orthogonal axes — role permission and
  resource ownership. Forgetting the per-document owner check, or adding ownership
  but forgetting the admin override, passes happy-path but fails cross-editor /
  admin-override cases.
- **Small model trap**: cannot keep the 401-vs-403 distinction exact or layer
  authn → role → ownership in the right order.
- **Capability**: RBAC with ownership + admin override; correct 401/403.

### 12. authorization.scoped-tokens.v1
- **Strong model trap**: the `WWW-Authenticate` challenge — omitting it, using a
  generic `realm=...`, or naming the wrong scope instead of the single required
  one per endpoint (RFC 6750).
- **Small model trap**: authorizes on blanket token validity rather than the
  specific scope each endpoint requires.
- **Capability**: scope-based authz with the `insufficient_scope` challenge.

### 13. rate-limiting.sliding-window.v1
- **Strong model trap**: implementing a fixed/calendar window
  (`Math.floor(now/1000)` bucketing) passes the naive "5 then 429" case but wrongly
  admits a request mid-burst after 500ms. Only a true rolling window that ages out
  individual timestamps survives.
- **Small model trap**: cannot track and age out a per-client timestamp list
  relative to a moving `now`, nor derive `Retry-After`.
- **Capability**: sliding-window rate limiting with correct rolling boundary.

### 14. rate-limiting.token-bucket.v1
- **Strong model trap**: omitting the `min(capacity, …)` cap (a long idle lets a
  client accumulate a >5 burst), or refilling in discrete steps instead of
  continuously by elapsed time.
- **Small model trap**: models a per-window counter instead of an accruing bucket;
  missing the refill math and `Retry-After` derivation.
- **Capability**: token-bucket limiting with continuous refill + capacity cap.

### 15. background-jobs.retry-queue.v1
- **Strong model trap**: terminal-state enforcement with an async worker — a stale
  retry timer can re-fire after a job has dead-lettered (attempts → 4) or flip a
  terminal job back to running. Also, processing inside the POST handler makes the
  create response already `succeeded`, which the async contract rejects.
- **Small model trap**: incorrect per-job attempt accounting (the `flaky` type
  needs a threaded counter); processes synchronously or retries forever.
- **Capability**: async job queue with bounded retries, backoff, dead-lettering.

### 16. websockets.presence-room.v1
- **Strong model trap**: chat fan-out must exclude the sender and be room-scoped;
  the joining socket gets the full roster while peers get a separate broadcast —
  easy to conflate or to broadcast to all sockets.
- **Small model trap**: maintaining a `room → Set<socket>` registry and mutating
  it on `close`; tends to leak disconnected users or never wire up cleanup.
- **Capability**: stateful WS room/presence with disconnect cleanup + isolation.

### 17. websockets.seqnum-resume.v1
- **Strong model trap**: using one global sequence counter instead of per-channel,
  and replaying by array index/offset rather than by `seq > last_seq` (gaps or
  duplicates on resume); replay must complete synchronously in `open` so a publish
  during catch-up is neither dropped nor duplicated.
- **Small model trap**: only does live fan-out with no per-channel buffer, failing
  every resume/replay case.
- **Capability**: message sequencing with gap/dupe-free resumable delivery.

### 18. file-uploads.multipart-checksum.v1
- **Strong model trap**: Bun appends `;charset=utf-8` to text part types, so a
  naive `ALLOWED.has(file.type)` 415s valid uploads — must compare the MIME
  essence; and basename sanitization must split on both `/` and `\` and drop
  `.`/`..` segments.
- **Small model trap**: cannot compose `request.formData()` extraction +
  standards-correct lowercase-hex sha256 + size/type ordering + traversal-proof
  basename with the precise status codes.
- **Capability**: secure multipart upload (size/type/path-traversal + integrity).

### 19. observability.request-metrics.v1
- **Strong model trap**: the high-cardinality bug — keying the counter by the raw
  path (`/items/123`) instead of the route template; and forgetting to exclude
  `GET /metrics` from both counters and duration aggregates.
- **Small model trap**: cannot emit a strictly parseable Prometheus line (exact
  label order, quoting) or implement correct echo-vs-generate request-id logic.
- **Capability**: metrics with bounded label cardinality + request-id propagation.

### 20. error-handling.circuit-breaker.v1
- **Strong model trap**: the counting model — a failed GET makes 3 dependency
  invocations but must count as one consecutive failure; incrementing per attempt
  opens the breaker after ~2 GETs instead of 5.
- **Small model trap**: retrying the non-idempotent POST, invoking the dependency
  while open instead of failing fast, or not allowing a single half-open trial.
- **Capability**: method-aware retry semantics + circuit-breaker state machine.

## Verification

Independently re-run from the repo root (not relying on author self-reports):

```sh
bun run validate                 # 30/30 tasks structurally valid
# for each new task:
#   BUN_BENCH_APP_DIR=solutions/reference bun test tests/public tests/hidden  -> all pass
#   bun test tests/public (starter)                                            -> fails
```

Result: **20/20 references green, 20/20 starters fail, 30/30 validate.**

## Suite results

See `docs/PHASE5-RESULTS.md` for the Claude Code suite run (pass rate, average
score, hardest/easiest task, and tasks with hidden-test failures).
