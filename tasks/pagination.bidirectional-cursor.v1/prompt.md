# Bidirectional Cursor Pagination

Build a Bun HTTP service that stores an in-memory list of items and serves it with
forward AND backward cursor pagination, always returning items in ascending id
order with Relay-style `page_info`.

## Requirements

- Listen on the port provided by `PORT`.
- Storage is in-memory only; no database or persistence is required.
- Each item has an integer `id` (server-assigned, monotonic, starting at `1` and
  increasing by one per created item) and a string `label`.

### Endpoints

`POST /items` — append an item.

- Request body: `{ "label": string }`.
- On success return `201` with `{ "id": number, "label": string }`.
- Invalid JSON, a missing `label`, or a `label` that is not a string → `422`
  with a JSON error body.

`GET /items` — read a page of items, always ordered by id ascending.

- Query parameters:
  - `limit` — maximum number of items to return. Default `10`. If `limit` is
    greater than `100`, clamp it to `100`. If `limit` is less than or equal to
    `0`, or is not an integer, return `400` with `{ "error": "invalid_limit" }`.
  - `after` — an opaque forward cursor. Returns items with `id` strictly greater
    than the decoded id (the lowest-id matches first, ascending), up to `limit`.
  - `before` — an opaque backward cursor. Returns items with `id` strictly less
    than the decoded id. Take the **highest-id** matching items (the slice
    immediately below the cursor), but still return them ordered by id
    **ascending**, up to `limit` items.
  - With neither `after` nor `before`, return the first `limit` items ascending.
  - Passing BOTH `after` and `before` → `400` with
    `{ "error": "invalid_cursor_combination" }`.
  - A garbage, malformed, or forged `after`/`before` cursor → `400` with
    `{ "error": "invalid_cursor" }`.
- Response `200` with:
  ```json
  { "items": [ /* items, ascending by id */ ],
    "page_info": {
      "has_next": boolean,
      "has_prev": boolean,
      "start_cursor": "<opaque>" | null,
      "end_cursor": "<opaque>" | null
    } }
  ```
- `start_cursor` is the opaque encoding of the **first** returned item's id;
  `end_cursor` is the opaque encoding of the **last** returned item's id. Both
  are `null` when `items` is empty.
- `has_next` is `true` if at least one item exists with id greater than the last
  returned id (`end_cursor`). `has_prev` is `true` if at least one item exists
  with id less than the first returned id (`start_cursor`). Compute these by
  peeking one row beyond each edge, not by guessing from the page size.
- Cursors are opaque to clients: each is the base64url encoding of the decimal id
  of the boundary item, and MUST round-trip through your own encoder/decoder.

## Notes

- With an empty list, return `200` with
  `{ "items": [], "page_info": { "has_next": false, "has_prev": false,
  "start_cursor": null, "end_cursor": null } }`.
- Return JSON for every response.
