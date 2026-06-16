# databases.online-migration-backfill.v1

## Task concept
Perform an online schema migration (introduce a new field/representation) with a
backfill while the application keeps serving reads and writes, using dual-write
and dual-read phases to preserve consistency, and supporting a safe rollback.

## Public contract
- A resource with an old field; a migration introduces a new field; endpoints
  keep working throughout. `GET /migration/status` reports the current phase.
- After cutover the new field is authoritative.

## Hidden edge cases
- Dual-write phase: a write updates both representations; a concurrent write
  during backfill must NOT be clobbered by the backfill (backfill skips rows
  already newer).
- Read consistency: reads during migration return the correct value regardless of
  phase.
- Backfill is idempotent and resumable after a crash (no double or skipped rows).
- Rollback: aborting the migration returns to the old field cleanly with no data
  loss.
- Phase gating: cutover happens only after the backfill is verified complete
  (no premature cutover).

## Why Claude might fail
- Backfill overwrites concurrent writes (lost update); cuts over before the
  backfill finishes; no dual-write so reads are inconsistent; no rollback path.

## Why GPT-5 might fail
- Dual-write + backfill but the backfill-vs-write race (skip-if-newer / timestamp)
  is wrong, or cutover gating is off, or rollback drops dual-written data.

## Why a small model might fail
- A single `ALTER` plus a naive `UPDATE` all rows; no phases, no concurrency
  handling.

## Expected failure modes
- Lost writes during backfill; inconsistent reads mid-migration; premature
  cutover; unrecoverable rollback.

## Benchmark gaming vectors
- Run the migration instantly with no concurrent load in tests.
- Skip dual-write entirely.
- Detect the backfill test rows and special-case them.

## Capability tested
- Online migration choreography; dual-write/read consistency; idempotent
  resumable backfill; rollback safety.

## Difficulty
5/5 — zero-downtime migration consistency under concurrent traffic.
