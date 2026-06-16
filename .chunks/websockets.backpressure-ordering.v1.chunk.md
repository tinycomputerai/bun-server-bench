# websockets.backpressure-ordering.v1

## Task concept
A WebSocket hub broadcasting a high-rate sequenced stream to consumers of varying
speed. It must apply backpressure to slow consumers, preserve per-connection
ordering, follow a defined overflow policy, and avoid head-of-line blocking that
would let one slow client stall the others.

## Public contract
- Clients subscribe to a topic; the server pushes sequenced messages.
- `GET /healthz` → 200. Each client receives its messages in order.

## Hidden edge cases
- Slow consumer whose send buffer fills → overflow policy applied (e.g.
  drop-oldest with a gap marker, or close with a status) — bounded memory, no OOM.
- Per-connection ordering preserved even under partial sends / backpressure.
- A fast and a slow client on the same topic: the fast client is unaffected by the
  slow client's backpressure (no cross-client head-of-line blocking).
- Disconnect during a send → clean teardown, buffer freed (no leak).
- The client can detect it missed messages (gap signaling) for resync.

## Why Claude might fail
- Unbounded per-client buffer (OOM); a single shared send loop where one slow
  client blocks all (HOL); no overflow policy; ordering broken on interleave.

## Why GPT-5 might fail
- Per-client queues but no overflow bound, or a drop policy without gap signaling;
  teardown race that leaks buffers.

## Why a small model might fail
- Naive broadcast loop awaiting each client's send → HOL blocking; no backpressure
  concept.

## Expected failure modes
- Memory blowup on a slow consumer; fast clients stalled by slow ones; silent loss
  or reordering; buffer leaks on disconnect.

## Benchmark gaming vectors
- Tiny buffers so overflow never triggers in tests.
- Serialize all sends (passes ordering, fails isolation).
- Detect the slow-consumer test and special-case it.

## Capability tested
- Backpressure and flow control; per-connection ordering; isolation; resource
  bounds and cleanup.

## Difficulty
5/5 — flow control + ordering + isolation + bounded memory.
