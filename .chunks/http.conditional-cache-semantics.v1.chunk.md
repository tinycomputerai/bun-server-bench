# http.conditional-cache-semantics.v1

## Task concept
Implement HTTP caching semantics correctly: strong/weak ETags, conditional
requests (`If-None-Match` / `If-Modified-Since` → `304`), `Cache-Control`
directives, and `Vary`-aware response selection — behaving correctly both as an
origin and as an intermediary cache.

## Public contract
- `GET /resource` → body with `ETag`, `Last-Modified`, and `Cache-Control`.
- Conditional `GET` returns `304 Not Modified` when the validator matches.
- `PUT /resource` updates content and changes the `ETag`.

## Hidden edge cases
- `If-None-Match` with a matching ETag → `304` with no body; non-match → `200`
  with full body.
- Weak vs strong ETag comparison: weak comparison is allowed for `GET`/`304` but
  strong is required for `If-Match` on writes/ranges (`W/` prefix handling).
- `Vary`: responses that vary by `Accept-Encoding`/`Accept` must be cache-keyed on
  those headers (don't serve a gzip variant to an identity client).
- `Cache-Control` `no-store` / `no-cache` / `private` / `max-age` honored; stale
  entries revalidated.
- When both `ETag` and `If-Modified-Since` are present, ETag takes precedence.
- `304` must echo the correct validators and omit the body.

## Why Claude might fail
- Always returns `200` (ignores conditionals); ignores `Vary` (serves the wrong
  variant); weak/strong comparison wrong; sends a body with `304`.

## Why GPT-5 might fail
- Handles ETag/304 but mis-keys on `Vary`, or gets weak-vs-strong precedence
  wrong, or mishandles a `Cache-Control` directive combination.

## Why a small model might fail
- No conditional handling; always returns the full response.

## Expected failure modes
- Never emits `304` (wasted bandwidth); serves the wrong cached variant (Vary
  bug); body present on `304`; incorrect validator precedence.

## Benchmark gaming vectors
- Hard-code `304` for the test's ETag value.
- Ignore `Vary` because tests may use a single variant.
- Check only for the presence of a conditional header, not its value.

## Capability tested
- HTTP caching/conditional-request correctness; validator comparison; Vary-aware
  content negotiation.

## Difficulty
4/5 — RFC 7232/9111 semantics with weak/strong and Vary subtleties.
