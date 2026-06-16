# databases.write-skew-isolation.v1

## Task concept
Enforce a cross-row invariant that is vulnerable to write skew under concurrent
transactions — e.g. "at least one engineer must remain on-call". Two concurrent
operations each individually see the invariant satisfied and both commit,
violating it. Requires serializable isolation, row/range locking, or a constraint.

## Public contract
- A set of rows with a shared invariant; an operation that checks the invariant
  then writes, e.g. `POST /oncall/:id/off` (allowed only if another stays on).
- Concurrent operations are issued in tests.

## Hidden edge cases
- Write skew: two concurrent "go off-call" transactions each observe the other
  still on-call and both commit → invariant violated. Exactly one must succeed.
- Phantom: the invariant is over a set; a concurrent insert/delete changes the set
  mid-check.
- Must not over-lock into a global serialize that deadlocks or destroys
  throughput for unrelated rows.
- Deterministic outcome under the concurrent pair.

## Why Claude might fail
- Read-check-write without locking the relevant rows/range; assumes the default
  isolation level prevents write skew (it does not under READ COMMITTED); no
  `SELECT ... FOR UPDATE`.

## Why GPT-5 might fail
- Locks the two known rows but misses the phantom/range case; uses SERIALIZABLE
  but doesn't retry on serialization failure.

## Why a small model might fail
- No transaction/isolation concept; in-memory check-then-set race.

## Expected failure modes
- Invariant violated under concurrency; deadlock; both operations fail; both
  succeed.

## Benchmark gaming vectors
- One global mutex (passes the pair test, fails throughput and the phantom/range
  test).
- Lean on SQLite's serialized writes to pass without real isolation reasoning.
- Detect the concurrent-pair test.

## Capability tested
- Transaction isolation reasoning; write-skew/phantom prevention; lock scoping.

## Difficulty
5/5 — anomaly-level isolation reasoning under concurrency.
