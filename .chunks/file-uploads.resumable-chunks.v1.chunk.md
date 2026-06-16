# file-uploads.resumable-chunks.v1

## Task concept
A resumable chunked-upload protocol: initialize an upload, send chunks by byte
offset (possibly out of order, retried, or overlapping), query received ranges,
and finalize with a whole-file checksum — safe against duplicate/concurrent
chunks and partial state.

## Public contract
- `POST /uploads` → `{upload_id, chunk_size, total_size}`.
- `PUT /uploads/:id/chunks?offset=` with raw bytes → records the chunk.
- `GET /uploads/:id` → status with received byte ranges.
- `POST /uploads/:id/complete {sha256}` → finalize.

## Hidden edge cases
- Out-of-order chunks assemble correctly; a missing chunk → complete fails and
  reports which range is missing.
- Duplicate / retried chunk at the same offset → idempotent, no corruption.
- Overlapping or misaligned chunk → rejected or handled deterministically (never
  silent corruption).
- Concurrent uploads of different chunks for one upload → no race corruption.
- Final checksum mismatch → `422`, upload not marked complete; partial state is
  cleanable.
- Offset beyond `total_size`, negative, or non-aligned → `400`.

## Why Claude might fail
- Append-only assembly assuming in-order arrival; duplicate chunk doubles bytes;
  no range tracking so it can't report missing ranges; checksum over a wrong
  assembly.

## Why GPT-5 might fail
- Tracks ranges but mishandles overlap/misalignment, or a concurrent same-offset
  race, or an off-by-one in the "all ranges present" check at complete.

## Why a small model might fail
- Treats the upload as a single PUT; no offset/range concept at all.

## Expected failure modes
- Corrupted assembly; wrong final checksum; accepting incomplete uploads;
  double-written bytes; crash on misaligned offset.

## Benchmark gaming vectors
- Only exercise in-order chunks.
- Last-chunk-wins storage.
- Skip the final checksum verification.
- Detect the chunk-offset sequence used by tests.

## Capability tested
- Range/offset bookkeeping; idempotent + concurrent chunk handling; integrity
  verification; partial-state management.

## Difficulty
5/5 — out-of-order assembly + idempotency + concurrency + integrity.
