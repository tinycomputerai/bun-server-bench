# Idempotent Event-Sourced Projection

Build a Bun HTTP service that appends versioned events to a log and maintains an
incremental read-model projection with idempotent replay, out-of-order buffering,
optimistic version conflicts, and deterministic rebuild.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory.
- Return JSON for every response.

### Event types

- `created` with `{ "name": string }` — sets projection `name`.
- `increment` with `{ "amount": number }` — adds to projection `total`.
- Unknown types are **quarantined** (stored in the log but do not change the projection).

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`POST /events` — append an event.

- Body: `{ "aggregate_id": string, "version": positive integer, "type": string, "data": object }`.
- Next expected version is `last_version + 1` for the aggregate (consider pending buffers).
- Exact duplicate replay (same aggregate, version, type, and data) → `200` `{ duplicate: true }`
  without double-applying.
- Same version with different payload → `409` `{ "error": "version_conflict" }`.
- Version gap too large to buffer (skips over a missing slot) → `409` `{ "error": "gap_not_allowed" }`.
- Success → `201` with `{ "id", "aggregate_id", "version", "quarantined": boolean }`.
- Out-of-order events (e.g. version 3 before 2) are buffered; the projection must not
  apply past a gap.

`GET /projections/:aggregate_id` — current read model.

- Returns `{ "aggregate_id", "name", "total", "last_version" }`.
- `last_version` is the highest event **version whose effect was applied** to the
  projection. Quarantined events are stored in the log but do **not** advance
  `last_version` (a single quarantined v1 event leaves `last_version` at 0).

`POST /projections/:aggregate_id/rebuild` — rebuild the projection from the log.

- Replays quarantine-skipping events in version order.
- Returns the rebuilt projection; must match the incremental projection.

## Notes

- Do not store projection state without using the event log.
- Do not expose stack traces.
