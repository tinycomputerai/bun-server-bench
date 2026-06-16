# scheduling.dst-recurrence.v1

## Task concept
Compute occurrences of recurring events in a given IANA timezone across daylight
saving transitions, correctly handling nonexistent local times (spring-forward
gap) and ambiguous local times (fall-back overlap), and emitting correct UTC
instants throughout.

## Public contract
- `POST /events {recurrence: e.g. "daily at 09:30", tz: "America/New_York"}`.
- `GET /occurrences?from&to` → list of UTC instants for the event in the range.

## Hidden edge cases
- A daily 09:30 event across spring-forward: 09:30 maps to a different UTC offset
  that day; the emitted UTC instant must shift accordingly.
- An event scheduled at a nonexistent local time (inside the spring-forward gap)
  → defined resolution (skip or shift), not a crash or a phantom instant.
- A fall-back ambiguous local time (occurs twice) → exactly one chosen instance
  per the rule, not both or neither.
- Week/day boundaries computed in the local tz, not UTC.
- Different zones have different DST rules → must use tz-database semantics, not a
  fixed offset.

## Why Claude might fail
- Uses a fixed UTC offset (ignores DST) → occurrences off by an hour after a
  transition; computes in UTC then converts naively; no gap/overlap handling.

## Why GPT-5 might fail
- Uses a tz library correctly for ordinary dates but mishandles the gap/overlap
  edge (drops or duplicates an occurrence), or computes week boundaries in UTC.

## Why a small model might fail
- Treats timezone as a fixed numeric offset; no DST awareness whatsoever.

## Expected failure modes
- Off-by-one-hour occurrences after a transition; missing or duplicated
  occurrences at the transition; wrong day/week boundaries.

## Benchmark gaming vectors
- Hard-code the test timezone's offset table.
- Only test dates away from DST transitions.
- Detect the specific transition dates used by tests.

## Capability tested
- Time-zone / DST reasoning; recurrence expansion; gap/overlap correctness.

## Difficulty
5/5 — calendar/DST correctness at transition boundaries.
