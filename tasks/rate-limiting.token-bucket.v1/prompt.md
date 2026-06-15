# Token Bucket Rate Limiter

Build a Bun HTTP service that rate-limits requests per client using a
**token-bucket** algorithm with continuous, time-based refill and a hard
capacity cap.

## Requirements

- Listen on the port provided by `PORT`.
- State lives in memory for the process lifetime, keyed by the `X-Client-Id`
  request header. Each client id has its own independent bucket.
- Each bucket has:
  - **capacity 5 tokens** (the hard maximum it can ever hold),
  - **refill 1 token per 200 ms** (i.e. 5 tokens per second), applied
    continuously over elapsed time,
  - and **starts full** (5 tokens) the first time a client is seen.
- Each `GET /resource` costs **1 token**.

### Endpoint

`GET /resource`

- If the `X-Client-Id` header is missing, return `400` with
  `{ "error": "missing_client_id" }`.
- If the bucket has at least 1 token: consume 1 token and return `200` with body
  `{ "ok": true }` and header `X-RateLimit-Remaining: <floor(tokens)>` (the
  number of whole tokens left after consuming this one).
- If the bucket has fewer than 1 token: return `429` with body
  `{ "error": "rate_limited" }` and headers:
  - `Retry-After: <seconds>` — integer seconds (at least `1`) until at least one
    token will be available.
  - `X-RateLimit-Remaining: 0`

## Notes

- Refill is continuous and based on elapsed wall-clock time, not a per-window
  reset. Compute the tokens accrued since the bucket was last touched.
- The bucket is capped at capacity 5: waiting a long time never lets a client
  exceed a 5-request burst. Tokens do not accumulate beyond capacity.
- Any path other than `GET /resource` may return `404`.
