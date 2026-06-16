# retry.poison-message-budget.v1

## Task concept
A processing endpoint with retry semantics that distinguishes transient from
permanent failures, enforces a bounded retry budget with backoff + jitter,
detects poison messages and dead-letters them, and never duplicates
non-idempotent side effects under at-least-once retry.

## Public contract
- `POST /process {id, payload}` → processed or queued; `GET /status/:id` →
  `{state, attempts, last_error?}`.
- Transient failures are retried; permanent failures are dead-lettered.

## Hidden edge cases
- Poison message (always fails) → bounded retries then dead-letter, never an
  infinite loop; the retry budget is honored exactly.
- Classification: a "permanent" (4xx-equivalent) failure must NOT be retried; a
  "transient" (5xx-equivalent) one is.
- Idempotency: retried processing must not duplicate observable side effects
  (e.g. a counter increment) — at-least-once delivery + idempotent apply.
- Backoff schedule respected (no immediate hammering); jitter bounded.
- Concurrent retries of the same id → single in-flight execution.
- Budget exhausted → dead-letter with a recorded reason.

## Why Claude might fail
- Retries everything including permanent failures; duplicates side effects on
  retry (no idempotency key); infinite retry on poison; no real backoff.

## Why GPT-5 might fail
- Classifies and backs off but duplicates effects under at-least-once, or is
  off-by-one on the budget, or double-runs concurrent retries of the same id.

## Why a small model might fail
- Naive try/catch retry loop; no classification, dead-letter, or idempotency.

## Expected failure modes
- Infinite retry loops; duplicated side effects; retried permanent failures;
  hammering with no backoff; lost dead-letter reasons.

## Benchmark gaming vectors
- Dead-letter immediately (no real retry) to pass termination tests.
- Detect poison by a magic payload value.
- Skip idempotency since tests may not always re-check side-effect counts.

## Capability tested
- Failure classification; bounded retry with backoff; dead-lettering; idempotent
  side effects; concurrency control.

## Difficulty
5/5 — retry policy + classification + idempotency + termination guarantees.
