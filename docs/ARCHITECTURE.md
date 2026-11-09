# Architecture

## The big picture

```
 Browser (public/)                                  Server (server/)                    Disk
┌──────────────────────────┐   HTTPS / JSON      ┌──────────────────────────┐     ┌──────────────┐
│ runtime.js               │ ───────────────────▶│ app.js  (headers, CSRF,  │     │ data/        │
│  sign-in / sign-up pages │   cookie: hub_sid   │         routing, errors) │     │  bitwixt.db  │
│  window.HUB, adapter     │ ◀───────────────────│ routes/*.js              │────▶│  (SQLite)    │
│ 00-…99-*.js  the app     │   SSE (live updates)│ auth.js, store/rules.js  │     │  backups/    │
└──────────────────────────┘                     │ ai/*.js ───────────────────▶ Gemini / Claude / …
                                                 └──────────────────────────┘
```

* The **browser** never talks to an AI service and never sees an API key. It asks the server, which asks the AI.
* The **server** checks *every* request: who are you (session cookie), are you in this workspace, may you
  touch this path. The browser is never trusted to enforce anything.
* **Live updates:** the browser keeps one Server-Sent-Events connection per workspace. The server only
  announces *which path changed*; the browser then re-reads it through the normal permission check.

## Data model (server/migrations/001_init.sql)

| Table | Holds |
| --- | --- |
| `users` | email, name, photo, password hash (scrypt), `is_admin` (platform admin), `disabled` |
| `sessions` | SHA-256 of each session token, expiry. The token itself is never stored. |
| `workspaces` | id, name |
| `members` | who is in which workspace, as `admin` or `member` |
| `invites` | SHA-256 of each invite code, kind (`workspace` or `account`), optional locked email, expiry, used-by |
| `docs` | the workspace data store: one JSON document per path, scoped to a workspace |
| `audit_log` | sign-ups, sign-ins, failed sign-ins, invites, removals |

### The `docs` store

Everything the app saves inside a workspace is a JSON document at a path, for example:

```
blobs/ws-quotes_0              part 0 of the list of quotations (a JSON string, chunked)
blobs/ws-quotes_meta           how many parts, plus a revision id
channels/general               the General chat channel
channels/general/msgs/<id>     one message
channels/dm_<A>.<B>            a private conversation between users A and B
comments/quotes-<itemId>/msgs/<id>   a comment on one item
```

Only three top-level names are allowed: `blobs`, `channels`, `comments`. Rules are in `server/store/rules.js`.

## Permissions in one table

| Thing | Who |
| --- | --- |
| Read/write workspace data (`blobs`, `comments`) | any member |
| Read a direct message | only the two people in it (admins too are excluded) |
| Read a private group | its members and workspace admins |
| Send a message | only as yourself; messages cannot be edited |
| Delete a message | its author, or a workspace admin |
| Rename/delete a group | its creator or a workspace admin |
| Invite, change roles, remove people, rename workspace | workspace admin |
| Disable accounts, invite brand-new accounts | platform admin (first account) |

## The front end

A plain-JavaScript app with **no build step**. `runtime.js` runs first, signs you in, then loads these
scripts in order (they share one global scope, like one big file split into chapters):

| File | Contents |
| --- | --- |
| `logo-data.js` | the default logo as data URLs |
| `00-config.js` | pages, list fields, help texts |
| `01-utils-data.js` | helpers, starter data, `defaults()` (everything at zero) |
| `02-state-storage.js` | the app state `S`, saving/loading to the server, live refresh |
| `03-views.js` | drawing fields, cards, quotations, the Ads page, the AI panel |
| `04-people-workspaces.js` | boot, People page, invites, workspace switching |
| `05-send-helpers.js` | email / WhatsApp / copy / print helpers, ad platform links |
| `06-appearance-menu.js` | brand, themes, dark mode, the  menu, the left rail |
| `07-chat.js` | channels, direct messages, comment threads |
| `08-profile-tasks.js` | avatars, your profile, tasks |
| `09-pages-actions.js` | navigation, the Offers page, the main click handlers |
| `99-start.js` | first draw, then `boot()` |

### The adapter (`window.claude`)

The app began life inside Claude's artifact environment and talks to storage, the signed-in user, the AI
and downloads through four small interfaces. `runtime.js` implements those four interfaces on top of this
server's REST API, so the app code did not have to be rewritten. The name `claude` is only history; no
Claude service is contacted unless you choose Claude as your AI provider. If you want to rename it, search
for `claude.use(` in `public/js`.

Data flow when you edit something: UI event → `queue()` → `save()` → `cloudSave()` writes the changed lists
as chunked "blobs" → the server publishes "path changed" → other people's `pull()` reloads the lists.
