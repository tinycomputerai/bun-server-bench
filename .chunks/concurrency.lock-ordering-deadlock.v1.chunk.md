# concurrency.lock-ordering-deadlock.v1

## Task concept
Operations that lock two resources at once (e.g. transferring between two
accounts, in both directions concurrently) must acquire locks in a consistent
global order to avoid deadlock, while still allowing maximal concurrency for
disjoint resource pairs.

## Public contract
- `POST /transfer {from, to, amount}`; tests issue concurrent transfers,
  including simultaneous A→B and B→A.
- Balances remain correct with no lost updates.

## Hidden edge cases
- Concurrent A→B and B→A must not deadlock (consistent lock ordering by id, or a
  lock-free CAS approach).
- Disjoint transfers (A→B and C→D) run concurrently — no single global lock that
  serializes everything.
- Self-transfer / same account → handled (no double-lock-on-self deadlock).
- Failure mid-transfer releases all held locks (no leak); any timeout/backoff is
  bounded (no livelock).
- Invariant under high concurrency: total conserved, no negative balances.

## Why Claude might fail
- Locks in argument order (`from` then `to`) → A→B and B→A deadlock; or a single
  global lock killing concurrency; self-transfer double-lock.

## Why GPT-5 might fail
- Orders locks correctly but mishandles self-transfer, or the lock-release path on
  error, or introduces livelock under a retry/backoff strategy.

## Why a small model might fail
- No locking (race), or one coarse global lock.

## Expected failure modes
- Deadlock (hang / timeout); lost updates; negative balances; zero concurrency.

## Benchmark gaming vectors
- A single global mutex (passes correctness and deadlock tests, fails the
  concurrency/throughput assertion).
- Detect the A↔B pattern specifically.
- Insert sleeps to dodge races probabilistically.

## Capability tested
- Deadlock-free multi-resource locking; lock-ordering discipline; concurrency
  preservation; safe release on failure.

## Difficulty
5/5 — deadlock avoidance with retained concurrency and invariant safety.
