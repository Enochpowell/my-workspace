# API reference

All endpoints are under `/api`, speak JSON, and use the session cookie `hub_sid`.
**Every request that changes data must send the header `X-Requested-With: bitwixt`** and, if it has a body,
`Content-Type: application/json`. Errors look like `{ "error": "Human readable text", "code": "machine_code" }`.

Try them from VS Code with `requests.http` (REST Client extension).

## Session and accounts

| Method and path | Who | Body → result |
| --- | --- | --- |
| `GET /api/health` | anyone | `{ ok: true }` |
| `GET /api/session` | anyone | `{ user, workspaces, setupRequired }` (`user` is `null` when signed out) |
| `POST /api/auth/signup` | anyone with a code | `{ code, email, name, password, ack:true }` → creates the account, signs in |
| `POST /api/auth/login` | anyone | `{ email, password }` |
| `POST /api/auth/logout` | signed in | ends this session |
| `POST /api/auth/password` | signed in | `{ current, next }`, signs out other devices |
| `PATCH /api/me` | signed in | `{ name?, avatar? }` (`avatar` is a small `data:image/…` URL or `""`) |
| `POST /api/invites/accept` | signed in | `{ code }` joins another workspace |

Sign-up codes: the **one-time `ADMIN_SETUP_CODE`** works only while no account exists. After that, only an
unused, unexpired invite code works.

## Workspaces

| Method and path | Who |
| --- | --- |
| `POST /api/workspaces` `{ name }` | signed in (limit `MAX_WORKSPACES_PER_USER`) |
| `PATCH /api/workspaces/:id` `{ name }` | workspace admin |
| `GET /api/workspaces/:id/members` | member (emails only visible to admins and yourself) |
| `PATCH /api/workspaces/:id/members/:uid` `{ role }` | workspace admin |
| `DELETE /api/workspaces/:id/members/:uid` | admin removes anyone; you may remove yourself |
| `GET /api/workspaces/:id/invites` | workspace admin |
| `POST /api/workspaces/:id/invites` `{ email?, role }` | workspace admin → `{ code, … }` (shown once) |
| `DELETE /api/workspaces/:id/invites/:iid` | workspace admin |

## Platform admin

| Method and path | Purpose |
| --- | --- |
| `GET /api/admin/users` | everyone with an account |
| `PATCH /api/admin/users/:id` `{ disabled }` | switch an account off or on (signs them out) |
| `GET/POST /api/admin/invites` | "own workspace" invites (`{ email? }`) |
| `DELETE /api/admin/invites/:id` | cancel one |
| `GET /api/admin/audit` | recent security events |

## Workspace data store

`:wid` is the workspace id. `path` is URL-encoded, e.g. `channels%2Fgeneral`. A path with an **even** number of
parts is a document, **odd** is a collection. Allowed first parts: `blobs`, `channels`, `comments`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/ws/:wid/doc?path=` | read → `{ exists, data }` |
| `PUT /api/ws/:wid/doc?path=` `{ data }` | replace |
| `PATCH /api/ws/:wid/doc?path=` `{ data }` | merge fields (404 if missing) |
| `DELETE /api/ws/:wid/doc?path=` | delete |
| `GET /api/ws/:wid/col?path=&order=field:desc&limit=` | list → `{ docs: [{ id, data }] }` |
| `POST /api/ws/:wid/col?path=` `{ data }` | add with a new id → `{ id }` |
| `GET /api/events?ws=:wid` | live updates (Server-Sent Events): `data: {"p":"path/that/changed"}` |

Limits: 900 KB per document, 1.2 MB per request, 10 path parts.

## AI

| Method and path | Purpose |
| --- | --- |
| `GET /api/ai/providers` | `{ providers: [{ id, label, model, configured }], default }` (never includes keys) |
| `POST /api/ai/chat` `{ prompt, provider?, stream? }` | `stream:false` → `{ text, provider }`. Default is a stream of `data: {"text":"…"}` events ending with `{"done":true}`. |

If the chosen provider is not set up, the server falls back to the default, then to any configured one.
If none is configured the answer is `503 not_configured`.
