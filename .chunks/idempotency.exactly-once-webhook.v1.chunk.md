# idempotency.exactly-once-webhook.v1

## Task concept
Receive provider webhooks that may be duplicated, retried, and delivered out of
order, then apply each logical event exactly once to a derived state. Combines
deduplication, per-resource ordering by sequence, gap handling, and signature
verification.

## Public contract
- `POST /webhook {event_id, type, resource_id, sequence, data}` → `200` ack.
- `GET /resources/:id` → current derived state.
- Duplicate `event_id` → ack with no double-apply.
- Requests are HMAC-signed; signature header must verify.

## Hidden edge cases
- Out-of-order delivery: sequence 3 arrives before 2; final state must reflect
  sequence order, not arrival order.
- Duplicate after processing → idempotent ack (no re-apply, no error).
- Concurrent duplicates (same `event_id` in parallel) → exactly one apply.
- Replay of a superseded lower-sequence event after a newer one applied → ignored.
- Sequence gap: event must be acked (so provider stops retrying) but state must
  NOT advance past the gap until the missing event arrives.
- Tampered signature → 401 and the event is not recorded as processed.

## Why Claude might fail
- Applies events in arrival order; treats idempotency as plain dedup and misses
  ordering.
- Double-applies under concurrent duplicates; advances state across a gap.

## Why GPT-5 might fail
- Handles dedup + ordering but mishandles gap-buffering (blocks forever or skips),
  or has an apply-then-record race; may ack before verifying the signature.

## Why a small model might fail
- Simple seen-set dedup; no sequence ordering; no concurrency safety; skips HMAC.

## Expected failure modes
- State drift from out-of-order apply; double counting; lost updates; processing
  of tampered events; infinite provider retries when gaps aren't acked.

## Benchmark gaming vectors
- Dedup by `event_id` only and pass ordering tests by luck of arrival.
- Last-write-wins ignoring `sequence`.
- Skip signature verification (tests may not always send a bad one).
- Detect the test's sequence pattern.

## Capability tested
- Exactly-once semantics; per-key ordering; gap reasoning; concurrency safety;
  webhook authentication.

## Difficulty
5/5 — ordering + idempotency + gaps + concurrency + auth combined.
