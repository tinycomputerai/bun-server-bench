# background-jobs.cron-exactly-once.v1

## Task concept
A scheduler that runs recurring jobs exactly once per scheduled tick across
process restarts, handling missed ticks during downtime (catch-up vs skip
policy), overlapping long runs, and crash recovery — without drift or duplicates.

## Public contract
- Register a job with an interval/cron expression; a worker executes it on
  schedule; `GET /runs` lists executions with `scheduled_time` + `status`.
- Schedule and last-run marker persist; the scheduler survives a restart.

## Hidden edge cases
- Missed ticks during downtime: the configured policy (catch-up the missed slots
  OR skip to next) is honored — exactly once per slot, no duplicates.
- Overlap: a run exceeding the interval must not spawn a concurrent duplicate
  (skip or queue per spec).
- Crash mid-run: detected via lease/heartbeat and retried, not silently lost nor
  double-counted.
- Scheduling on slot boundaries, not a naive sleep loop that accumulates drift.
- Exactly-once per `(job, scheduled_time)` even with concurrent workers.

## Why Claude might fail
- Sleep-loop with accumulating drift; duplicate runs after restart (no persisted
  last-run marker); concurrent overlap; lost crashed runs.

## Why GPT-5 might fail
- Persists last-run but off-by-one on catch-up slot boundaries; overlap lease
  expiry race; double-run between restart recovery and the next live tick.

## Why a small model might fail
- `setInterval` with no persistence; no overlap/restart/drift reasoning.

## Expected failure modes
- Duplicate runs per slot; cumulative drift; lost runs after crash; concurrent
  overlapping executions.

## Benchmark gaming vectors
- Only exercise a single happy-path interval; idempotency by chance.
- Mark runs done before executing them.
- Detect the restart/downtime injection in tests.

## Capability tested
- Durable scheduling; exactly-once-per-slot; lease-based crash recovery; drift
  control.

## Difficulty
5/5 — time-slot exactly-once across restarts, overlap, and crashes.
