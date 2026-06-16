# Phase 5 — Claude Code Suite Results

Full suite executed against Claude Code (`claude` CLI 2.1.178, Bun 1.3.13) over
all 30 tasks (10 Phase 1–4 tasks + 20 Phase 5 hardening tasks).

```sh
bun run run:suite --agent claude-code --tasks 'tasks/**'
```

## Headline metrics

| Metric | Before Phase 5 (10 tasks) | After Phase 5 (30 tasks) |
|---|---|---|
| Pass rate | 10/10 (100%) | **29/30 (96.7%)** |
| Average score | 100.0 | **97.5** |
| Tasks losing points | 0 | **1** |

Average score across **only the 20 new tasks**: **96.25** (19×100 + 1×25).

The benchmark is now discriminative: the previously-saturated 100.0 average has
moved, and a real Claude Code failure mode was surfaced.

## Hardest task

**`authentication.jwt-verify.v1` — score 25/100, status `failed_hidden_tests`.**

The only task to lose points. Claude passed all public tests and 9/10 hidden
tests, but failed one hidden assertion:

```
alg:"none" token (empty signature) is rejected as invalid_alg, not accepted
  Expected: "invalid_alg"
  Received: "malformed"
```

This is the intended discriminative signal, and a subtle one. Claude **did**
defend against the alg-confusion attack — it rejected the `alg:"none"` token
rather than accepting an unsigned token (the dangerous outcome). But the contract
specifies the validation *order*: a well-formed 3-segment token whose header
declares `alg:"none"` must be rejected as `invalid_alg`, because algorithm
pinning precedes signature/format handling. Claude's implementation treated the
empty signature segment as `malformed` first, returning the wrong error code.

The task probes exactly this: algorithm pinning as a first-class, correctly-ordered
check rather than a side effect of signature verification. Claude got the security
property right but the contract precision wrong — a distinction the old benchmark
could not measure.

## Easiest tasks

All 29 other tasks scored the full 100. By solve effort (wall time):

- **Quickest full-credit solve overall**: `validation.required-name.v1` (28.9s, Phase 1).
- **Quickest full-credit Phase 5 task**: `authorization.scoped-tokens.v1` (56.1s).
- **Most effortful full-credit task**: `idempotency.payment-capture.v1` (358.6s ≈ 6 min) —
  the concurrency-safe single-flight requirement made Claude work hardest, but it
  still passed (the per-key in-flight lock was implemented correctly).

The Phase 5 tasks demonstrably cost more effort than the Phase 1–4 set: the new
difficulty-4 tasks averaged ~110s of agent time vs. ~35s for the older tasks,
with several (`etag-concurrency` 241s, `optimistic-version` 235s, `multipart-checksum`
185s) requiring multiple iterations.

## Tasks with hidden-test failures

| Task | Score | Failed hidden assertion |
|---|---|---|
| `authentication.jwt-verify.v1` | 25 | `alg:"none"` rejected as `malformed` instead of `invalid_alg` (algorithm-pinning order) |

All other 19 Phase 5 tasks passed both public and hidden suites.

## Interpretation

- The hardening worked: average dropped from a saturated 100 to 97.5, and the
  suite now distinguishes a contract-precision failure that the prior 10-task set
  could not.
- The single failure is a *fair* and *informative* one — not a flaky test or an
  ambiguous spec. Claude's behavior was secure but not contract-exact, which is
  precisely the kind of gap a hardened benchmark should expose.
- 19/20 new tasks still being solved at 100 confirms the tasks are well-specified
  and achievable (the reference solutions and the strong-model runs agree),
  rather than impossible or under-specified. As stronger discrimination is needed,
  more tasks in the mold of `jwt-verify` (subtle ordering / precision traps) can
  be added.

Per-run artifacts (prompts, agent stdout, test logs) are under
`runs/<timestamp>-<task-id>/`.
