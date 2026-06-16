# caching.cache-stampede.v1

## Task concept
A read-through cache in front of an expensive computation that must prevent the
thundering-herd / cache-stampede problem via single-flight, serve
stale-while-revalidate after TTL, cache negative results without pinning errors,
and keep per-key isolation with bounded memory.

## Public contract
- `GET /compute/:key` → `{value, cached: bool}`. First miss computes; later hits
  served from cache within TTL.
- The expensive function is instrumented so its invocation count is observable.

## Hidden edge cases
- Stampede: N concurrent misses for the same key → compute invoked exactly once;
  all N receive the value (single-flight).
- Stale-while-revalidate: after TTL expiry, serve stale immediately while exactly
  one background refresh runs.
- Negative caching: a computation that errors caches the failure briefly, with
  recovery after backoff (no permanent error pinning).
- Per-key isolation: a stampede lock on key A must not block key B.
- Key correctness: distinct params → distinct keys (no collision); bounded cache
  size with eviction (no unbounded growth).

## Why Claude might fail
- Computes per request (no single-flight); uses a global lock that serializes all
  keys; blocks on refresh instead of SWR; caches errors forever or not at all.

## Why GPT-5 might fail
- Single-flight on miss but refresh storms on expiry (no refresh dedup); SWR
  returns stale forever when refresh keeps failing; negative-cache TTL wrong.

## Why a small model might fail
- Naive get-or-compute with a race window; no locking, no SWR, no eviction.

## Expected failure modes
- Compute called N times under load; cross-key blocking; permanent stale serving;
  error pinning; unbounded memory growth.

## Benchmark gaming vectors
- Make compute trivially cheap so stampede counts aren't observable.
- Global mutex (passes correctness, fails isolation/perf).
- Detect the concurrent-burst test shape and special-case it.

## Capability tested
- Concurrency control (single-flight); cache lifecycle (TTL/SWR/negative);
  isolation and memory bounds.

## Difficulty
5/5 — concurrent dedup + cache lifecycle + isolation + bounds.
