# security.signed-url-replay.v1

## Task concept
Issue and verify signed URLs (HMAC) that bind method + path + query, enforce
expiry with bounded clock-skew tolerance, and prevent replay via single-use
nonces. Must resist signature stripping, parameter tampering, canonicalization
bypass, and HMAC misuse.

## Public contract
- `POST /sign {method, path, query, ttl}` → a signed URL containing `sig`, `exp`,
  and `nonce`.
- Accessing the signed URL → `200` if valid; otherwise `403`.

## Hidden edge cases
- Expired URL → `403`; clock-skew tolerance is small and bounded, not unlimited.
- Replay: reusing a single-use `nonce` → `403` even within the validity window.
- Tampering: changing path/method/query after signing → `403` (binding covers all).
- Signature stripping / empty sig / swapped algorithm → `403`; comparison is
  constant-time.
- Canonicalization: equivalent encodings (`%2F` vs `/`, case, trailing slash)
  must not bypass the binding.
- Proper HMAC construction (no naive `secret + message` concatenation / no
  length-extension exposure).

## Why Claude might fail
- Signs only the path (not method/query); no nonce store so replay succeeds; naive
  `===` comparison (timing); canonicalization bypass; trusts a client-supplied `exp`.

## Why GPT-5 might fail
- Binds method+path+exp but omits single-use nonce, or misses a canonicalization
  edge, or sets the skew window too wide.

## Why a small model might fail
- Issues a token and checks equality; no expiry, replay protection, or request
  binding.

## Expected failure modes
- Replay succeeds; tampered requests pass; expired URLs accepted; timing side
  channel; encoding-based bypass.

## Benchmark gaming vectors
- Embed the whole URL verbatim in the signature but ignore canonical forms.
- Store nonces only for the test's values.
- Skip skew handling; detect the test signing flow.

## Capability tested
- Cryptographic request signing; replay/tamper resistance; canonicalization;
  constant-time verification.

## Difficulty
5/5 — security reasoning across signing, expiry, replay, and canonicalization.
