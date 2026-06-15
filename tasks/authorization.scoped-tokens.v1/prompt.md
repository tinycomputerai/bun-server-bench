# Scope-Based Authorization with Challenge Headers

Build a Bun HTTP service that manages files and authorizes requests using
OAuth-style scopes. Storage is in memory.

## Authentication

Every request authenticates with a bearer token in the `Authorization` header:
`Authorization: Bearer <token>`. The valid tokens and the scopes they grant are
fixed:

| token       | scopes                                        |
| ----------- | --------------------------------------------- |
| `tok-ro`    | `files:read`                                  |
| `tok-rw`    | `files:read`, `files:write`                   |
| `tok-admin` | `files:read`, `files:write`, `files:delete`   |

- If the `Authorization` header is missing, malformed, or names an unknown
  token, respond `401` with `{ "error": "unauthorized" }`.
- If the request is authenticated but its token lacks the scope required for the
  endpoint, respond `403` with `{ "error": "insufficient_scope" }` AND include a
  `WWW-Authenticate` response header of the form `Bearer scope="<required-scope>"`,
  where `<required-scope>` is the single scope the endpoint requires.

## Files

A file has a string `id` and a string `name`.

## Endpoints

`GET /files` — list files. Requires scope `files:read`.

- On success respond `200` with `{ "files": [ { "id", "name" }, ... ] }`.

`POST /files` — create a file. Requires scope `files:write`.

- Request body: `{ "name": string }`.
- On success respond `201` with `{ "id", "name" }`.

`DELETE /files/:id` — delete a file. Requires scope `files:delete`.

- On success respond `204` with no body.
- Unknown id → `404`.

## Notes

- Authentication (`401`) always precedes the scope check (`403`). An unknown or
  missing token is `401`, never `403`.
- Scope enforcement is per-endpoint: holding any valid token is not enough; the
  token must carry the specific scope the endpoint requires.
- On a `403` insufficient-scope response the `WWW-Authenticate` header must name
  the exact scope that was required (`files:read`, `files:write`, or
  `files:delete`).
- Return JSON for every response except the `204` delete.
