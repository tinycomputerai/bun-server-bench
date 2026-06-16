# observability.trace-context-propagation.v1

## Task concept
Propagate W3C trace context (`traceparent` / `tracestate`) across nested async
service calls, maintain correct parent/child span relationships, and honor the
sampling decision consistently for the whole trace.

## Public contract
- An incoming request carries an optional `traceparent`; the service makes two
  (simulated) downstream calls; `GET /trace/:trace_id` returns the assembled span
  tree.
- When `traceparent` is absent, generate a valid trace id and root span.

## Hidden edge cases
- Parent/child correctness: each child span references its immediate parent span
  id (not the root) across nested async boundaries.
- Sampling consistency: the `sampled` flag is decided once for the trace and
  honored by all spans; an upstream "not sampled" must not be re-sampled downstream.
- Malformed `traceparent` (bad version/length/flags) → regenerate, don't crash,
  don't trust garbage.
- `tracestate` vendor-list ordering preserved and size limits enforced (truncate
  oldest correctly).
- Concurrent requests must not cross-contaminate context (async-local correctness).

## Why Claude might fail
- Flat span list all parented to the root; re-decides sampling per span; leaks
  context across concurrent requests via a global variable; mis-parses traceparent.

## Why GPT-5 might fail
- Correct parent linkage but re-samples downstream, or mis-handles `tracestate`
  truncation/order, or loses propagation across one specific await boundary.

## Why a small model might fail
- No trace model; ignores inbound context; emits random ids per span with no tree.

## Expected failure modes
- Broken span tree; inconsistent sampling across spans; context bleed under
  concurrency; crash on malformed header.

## Benchmark gaming vectors
- Echo the inbound `traceparent` and fabricate a plausible static tree.
- Hard-code the sampling decision.
- Detect the test's trace ids.

## Capability tested
- Distributed tracing semantics; async context propagation; sampling consistency.

## Difficulty
4/5 — context propagation correctness across async + sampling invariants.
