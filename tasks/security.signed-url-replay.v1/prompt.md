# Signed URL Replay Protection

Build a Bun HTTP service that issues HMAC-signed URLs binding method, path, and
query parameters with expiry, bounded clock skew, and single-use nonces.

## Requirements

- Listen on the port provided by `PORT`.
- Signing secret: `signed-url-secret` (fixed for this task).
- Clock skew tolerance: **30** seconds.
- Return JSON for every response.

### Endpoints

`GET /healthz` → `200` `{ "ok": true }`.

`POST /sign` — create a signed URL.

- Body: `{ "method": string, "path": string, "query"?: object, "ttl"?: seconds }`.
- `ttl` is an integer second offset added to the current Unix time to compute
  `exp` (default `300`). Negative values are valid and produce URLs that are
  already expired.
- Canonicalize query keys sorted; exclude `sig`, `exp`, `nonce` from the signed query string.
- Signature payload (newline-separated): `METHOD`, `path`, canonical query string,
  `exp`, `nonce` — all as strings in that order.
- Returns `200` `{ "url": "<path>?...&exp=&nonce=&sig=", "exp", "nonce" }`.

Any request whose URL includes `sig`, `exp`, and `nonce` query params is verified:

- Valid first use → `200` `{ "ok": true, "path" }`.
- Expired (`exp` more than 30 seconds in the past, after skew tolerance), tampered,
  missing, or replayed nonce → `403` `{ "error": "forbidden" }`.
- Use constant-time signature comparison.

## Notes

- Nonces are single-use even within the validity window.
- Do not expose stack traces.
