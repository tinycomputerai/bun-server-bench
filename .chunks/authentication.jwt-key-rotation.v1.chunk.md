# authentication.jwt-key-rotation.v1

## Task concept
Verify JWTs signed under a rotating key set identified by the `kid` header.
Signing keys rotate over time with overlapping validity windows (a JWKS-style
key set): a newly introduced key becomes active, the previous key stays valid
until explicitly retired, and verification must select the correct key by `kid`
while keeping a coherent, invalidatable key cache.

## Public contract
- `POST /verify` with `Authorization: Bearer <jwt>` → `200 {sub}` when valid.
- `POST /keys/rotate` introduces a new active signing key; prior keys remain
  valid until retired via `POST /keys/:kid/retire`.
- `GET /.well-known/jwks` exposes current verification keys.
- Tokens carry `kid` in the header selecting the verification key.

## Hidden edge cases
- Token `kid` references a previous-but-not-yet-retired key → must still verify.
- Rotation race: token minted under key N arrives after rotation to N+1 but
  before N is retired → valid; after N retired → 401.
- Stale cache: a token under a just-rotated key must verify (cache invalidation).
- `kid` references unknown/retired key → 401, no fallback to another key.
- `kid` absent → reject (no "try every key", no `alg:none`).
- `kid` crafted as a file path / SQL fragment (kid injection) → reject safely.

## Why Claude might fail
- Assumes a single active key; verifies only against the newest key, breaking the
  overlap window.
- Ignores cache invalidation on rotation; or "tries all keys", which silently
  defeats retirement and weakens security.

## Why GPT-5 might fail
- Implements rotation but mishandles the overlap/retirement boundary (off-by-one
  on validity), or keeps keys forever so retired-key tokens still verify.
- Treats the JWKS cache as immutable and misses post-rotation invalidation.

## Why a small model might fail
- No concept of a `kid`-indexed key set; verifies against one secret; no cache
  invalidation; likely vulnerable to alg confusion.

## Expected failure modes
- 401 on valid old-key tokens during the overlap window.
- 200 on retired-key tokens (security hole).
- Crash or fallback on unknown `kid`; kid-injection acceptance.

## Benchmark gaming vectors
- Hard-code the test secret/key.
- Try-all-keys to pass verification without honoring retirement.
- Disable caching entirely to dodge invalidation tests (fails perf budget).
- Special-case the rotation endpoint call sequence seen in tests.

## Capability tested
- Security reasoning; multi-key state consistency; cache coherence; time-window
  correctness.

## Difficulty
5/5 — security + state consistency + cache invalidation + validity windows.
