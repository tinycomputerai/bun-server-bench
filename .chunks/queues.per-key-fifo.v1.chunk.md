# queues.per-key-fifo.v1

## Task concept
A work queue that guarantees strict FIFO ordering per partition key while
processing different keys concurrently. It must prevent same-key reordering,
avoid head-of-line blocking across keys, and never process the same key on two
workers at once.

## Public contract
- `POST /enqueue {key, payload}`; one or more workers process items.
- `GET /processed` → the processed log, from which per-key order is observable.
- Different keys are processed in parallel.

## Hidden edge cases
- Same-key messages are processed strictly in enqueue order even with multiple
  workers (per-key serialization).
- A slow key must not block progress on other keys (no global head-of-line
  blocking on a shared worker pool).
- Concurrent dequeue must not let two workers process the same key simultaneously
  (per-key lock/lease).
- A failed message's retry preserves its per-key position (does not jump ahead of
  later same-key messages), per the defined policy.
- Crash mid-process → redelivery (at-least-once) without reordering; processing is
  idempotent.
- Backpressure when one key's backlog grows unbounded.

## Why Claude might fail
- Global FIFO (no concurrency) or fully concurrent processing (reorders same key);
  two workers grab the same key; retry reorders within a key.

## Why GPT-5 might fail
- Per-key serialization but a slow key still head-of-line-blocks a shared worker
  pool, or retry-position handling is wrong, or crash redelivery reorders.

## Why a small model might fail
- A single global queue with one worker (no concurrency), or unordered concurrent
  processing.

## Expected failure modes
- Same-key reordering; cross-key head-of-line blocking; duplicate concurrent
  same-key processing; reordering on retry/redelivery.

## Benchmark gaming vectors
- Use a single worker (passes ordering, fails the concurrency assertion).
- Process synchronously inside enqueue.
- Detect the key pattern used by tests.

## Capability tested
- Per-key ordering with concurrency; lease-based mutual exclusion; backpressure;
  idempotent redelivery.

## Difficulty
5/5 — ordering + concurrency + exclusivity + crash semantics together.
