# rate-limiting.distributed-fairness.v1

## Task concept
A rate limiter shared across multiple concurrent handlers (simulating multiple
instances sharing one store) that enforces a global per-client limit atomically,
without double-counting or window-rollover drift, fairly across clients, and
robust to per-handler clock skew.

## Public contract
- `GET /resource` with `X-Client-Id`; a global limit (e.g. 10/sec/client)
  enforced across all concurrent handlers.
- Returns `200`/`429` with `X-RateLimit-*` headers.

## Hidden edge cases
- Two concurrent handlers consuming the last remaining slot must not both pass
  (atomic check-and-decrement; no TOCTOU over-admission).
- Window rollover under concurrency → no double refill / lost reset.
- Clock skew: limit math must use a single shared/monotonic clock, not each
  handler's wall clock, so skew grants no extra budget.
- Fairness: one client's burst must not starve others sharing the store.
- Reset/expiry of the window is atomic.

## Why Claude might fail
- Non-atomic read-modify-write on the shared counter (TOCTOU) over-admits under
  concurrency; per-handler clock; refill race.

## Why GPT-5 might fail
- Atomic single-key counter but double-refill at the window boundary, or fairness
  starvation, or mishandled skew across handlers.

## Why a small model might fail
- Per-handler local counter with no shared-state reasoning; serial assumptions.

## Expected failure modes
- Global limit exceeded under load; double refill; client starvation; lost resets.

## Benchmark gaming vectors
- Serialize all requests through one mutex (correct counts but kills
  throughput/fairness and may fail a concurrency-perf assertion).
- Assume a single instance / no concurrency.
- Detect the concurrent-burst test shape.

## Capability tested
- Atomic shared-state updates; window arithmetic under concurrency; fairness;
  clock discipline.

## Difficulty
4/5 — atomic shared counting + rollover + fairness under contention.
