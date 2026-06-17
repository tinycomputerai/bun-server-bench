# WebSocket Backpressure and Ordering

Build a Bun HTTP/WebSocket service that broadcasts sequenced messages per topic
with per-client bounded queues, drop-oldest overflow policy, and gap markers.

## Requirements

- Listen on the port provided by `PORT`.
- Per-client outbound queue capacity: **8** messages.
- Return JSON for HTTP responses.

### Endpoints

`GET /healthz` → `200` `{ "ok": true }`.

`POST /publish` — broadcast to a topic.

- Body: `{ "topic": string, "data": any }`.
- Assigns monotonically increasing `seq` per topic starting at 1.
- Returns `201` `{ "topic", "seq" }`.
- Must not block on slow subscribers (no head-of-line blocking across clients).

`GET /ws?topic=<name>` — WebSocket upgrade.

- Live messages: `{ "seq": number, "data": any }`.
- Gap marker when messages dropped: `{ "type": "gap", "from_seq": number, "to_seq": number }`.

### Overflow policy

When a client's queue exceeds capacity, drop the **oldest** message and enqueue a
gap marker so the client knows it missed a range.

- Queue capacity counts messages **not yet delivered** to the client. Messages
  already accepted by `ws.send()` still count toward capacity until the client
  has been handed the payload (do not let the socket buffer absorb an unbounded
  backlog and bypass drop-oldest).
- A slow subscriber must emit gap markers under publish floods even when the
  publisher loop does not block.

## Notes

- Each client receives its messages in ascending `seq` order (gaps excepted).
- Clean up client state on disconnect.
- Do not expose stack traces.
