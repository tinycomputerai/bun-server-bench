# pagination.consistent-snapshot.v1

## Task concept
Cursor pagination over a dataset that mutates during traversal. The page sequence
must present a consistent view: no skipped items, no duplicates, and correct
handling of deletions (tombstones) and updates that move an item's sort position
— the hazard being a sort key on a mutable field.

## Public contract
- `GET /items?cursor=&limit=` sorted by `(updated_at, id)`.
- Items can be created, updated (which changes `updated_at`, moving them), and
  deleted concurrently while a client pages.

## Hidden edge cases
- An item updated between pages so its sort key moves forward → must not appear
  twice nor be skipped.
- An item deleted between pages whose id is the cursor anchor → cursor still
  valid (tombstone/stable cursor), no crash.
- Insertions before the cursor must not shift already-returned items.
- Sorting on a mutable field (`updated_at`) is the trap: naive keyset produces
  duplicates/skips unless a snapshot or stable anchor is used.
- A cursor from a different sort/filter shape → rejected.

## Why Claude might fail
- Keyset on `updated_at` without a snapshot: an item bumped after page 1
  reappears on a later page (duplicate), or is skipped if it moved past the cursor.

## Why GPT-5 might fail
- Snapshots via `created_at` but then live updates aren't reflected consistently;
  mishandles the deleted-anchor cursor or tombstone boundary.

## Why a small model might fail
- Uses offset pagination; unaware of mutation hazards entirely.

## Expected failure modes
- Duplicate items across pages; skipped items; crash on a deleted cursor anchor;
  shifting of already-seen items on insert.

## Benchmark gaming vectors
- Snapshot the entire list into memory behind an opaque token (passes but
  unbounded memory and not real keyset).
- Order by immutable `id` only and ignore the `updated_at` requirement.
- Detect the mutation test pattern.

## Capability tested
- Stable pagination under concurrent mutation; snapshot/tombstone reasoning.

## Difficulty
5/5 — mutation-during-traversal correctness with a moving sort key.
