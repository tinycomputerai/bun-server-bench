# sagas.compensation-rollback.v1

## Task concept
Orchestrate a multi-step distributed transaction (saga) where each step has a
compensating action. On partial failure the saga must compensate completed steps
in reverse order, idempotently, and handle compensation failures, duplicate
messages, and crash recovery.

## Public contract
- `POST /book-trip` orchestrates `reserve_flight → reserve_hotel → charge_card`.
- Success → all committed. Any failure → previously completed steps compensated.
- `GET /sagas/:id` → saga state and step log.

## Hidden edge cases
- Step 3 fails → steps 2 then 1 compensated in reverse, exactly once each.
- A compensation itself fails → retried idempotently; the saga ends in a defined
  `compensation_failed` / needs-attention state, never silently lost.
- Duplicate completion or compensation messages → idempotent.
- Crash mid-saga → recovery resumes from the persisted log (not a restart from
  scratch), without double-compensating.
- Non-compensatable ordering respected (irreversible step last).
- A partially-committed saga is never reported as success.

## Why Claude might fail
- No compensation on failure (leaves resources reserved); compensates in the wrong
  order; non-idempotent compensation double-refunds; no recovery log.

## Why GPT-5 might fail
- Implements forward + reverse compensation but mishandles the compensation-failure
  terminal state, crash-recovery resume point, or duplicate compensation.

## Why a small model might fail
- Linear try/catch with no compensation orchestration at all.

## Expected failure modes
- Orphaned reservations (resource leaks); double refunds; stuck/zombie sagas;
  partial success reported as success.

## Benchmark gaming vectors
- Make all steps succeed in tests (never exercise compensation).
- "Compensate" by wiping all state instead of true reverse actions.
- Detect the failure-injection step/value.

## Capability tested
- Saga orchestration; idempotent compensation; reverse-order rollback; crash
  recovery; terminal-state modeling.

## Difficulty
5/5 — distributed-transaction compensation with recovery and idempotency.
