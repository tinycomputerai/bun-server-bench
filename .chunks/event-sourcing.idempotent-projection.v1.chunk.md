# event-sourcing.idempotent-projection.v1

## Task concept
Build and rebuild a read-model projection from an append-only event log. Events
must apply idempotently, gaps and out-of-order events must be detected, appends
use optimistic versioning, and a from-scratch replay must be deterministic.

## Public contract
- `POST /events {aggregate_id, version, type, data}` appends an event.
- `GET /projections/:id` → the current read model.
- `POST /projections/:id/rebuild` → recompute from the log.

## Hidden edge cases
- Idempotent apply: replaying the same `(aggregate_id, version)` does not
  double-apply; a rebuild yields identical state.
- Out-of-order / gap: version 5 arriving before 4 → buffered or rejected; the
  projection never applies past a gap.
- Optimistic concurrency on append: two writers at version N → one succeeds, the
  other `409`.
- Determinism: rebuild-from-scratch state == incremental state.
- Snapshot + tail replay is correct at the boundary.
- Poison event (unknown type) → quarantined/skipped; the projection continues.

## Why Claude might fail
- Applies events in arrival order; double-applies on replay (non-idempotent
  projection); no version-conflict detection; ignores gaps (state corruption).

## Why GPT-5 might fail
- Idempotent + versioned but rebuild ≠ incremental (nondeterministic ordering), or
  a snapshot/tail boundary bug, or buffers a gap forever.

## Why a small model might fail
- Appends and sums; no versioning, idempotency, or replay concept.

## Expected failure modes
- Divergent projection on rebuild; double counting; gap-induced corruption; lost
  concurrent appends.

## Benchmark gaming vectors
- Store final state directly and ignore the event log (passes read tests).
- Dedup by exact event bytes only.
- Detect the replay/rebuild test.

## Capability tested
- Event-sourcing semantics; idempotent projection; gap/version handling;
  deterministic replay.

## Difficulty
5/5 — log-derived state with idempotency, ordering, and determinism guarantees.
