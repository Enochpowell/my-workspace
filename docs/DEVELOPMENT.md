# Development guide

## Set up

```bash
node -v          # must be 22.13 or newer
npm test         # 47 automated tests
npm run dev      # server restarts when you save a file
```
In VS Code: install the recommended extensions (Prettier, REST Client). Press **F5** to run the server in the
debugger (you can set breakpoints in `server/`), or use **Terminal → Run Task…**.

**Format the whole front end once** (the app files are written in a compact style): open the Command Palette
(`Ctrl+Shift+P`), run **Format Document** on each file in `public/js`, or in a terminal run
`npx prettier --write "public/**/*.{js,css,html}" "server/**/*.js"`. Prettier then keeps it tidy on every save.

## Conventions

* Back end: small files, one topic each, a comment block at the top saying what the file is for.
* No dependencies. If you add one, say why in the pull request.
* Never log or return secrets, tokens, invite codes or password hashes.
* Every new route: check the user (`A.requireUser`/`requireMember`/...), validate input, add a test.
* SQL always uses `?` placeholders. Never build SQL with string concatenation of user input.

## Add a new list page (for example "Suppliers")

Front end only; the server already stores any list.
1. `public/js/00-config.js`: add `['suppliers','Suppliers']` to `PAGES`; add a `suppliers:{noun:…,plural:…,f:[…fields…]}`
   entry to `SCH`; add text to `HELP` / `DESC`.
2. `public/js/01-utils-data.js`: add `suppliers:[]` to the lists in `starter()`.
3. `public/js/02-state-storage.js`: add `'suppliers'` to `KEYS`; in `parts()` (same file) add `suppliers:{v:L.suppliers}`.
4. `public/js/03-views.js`: add it to `stats(p)` and the Home counts (search for `policies` and copy the pattern).
5. Refresh the page. The list, add/remove, comments and AI panel work automatically.

## Add a server route

1. Create or edit a file in `server/routes/` exporting `function register(add, deps)`.
2. `add('GET', '/api/thing/:id', (ctx) => { … ctx.json(200, {…}) })`. `ctx` has `user`, `params`, `query`,
   `await ctx.body()`, `db`, `config`.
3. Register the file in `server/app.js`. Add tests in `tests/`.

## Database changes

Never edit `001_init.sql` after people use the app. Add `server/migrations/002_something.sql`; it is applied
once, in order, at start-up.

## Replacing `node:sqlite`

All SQL goes through `server/db.js` (`get`, `all`, `run`, `tx`, `backupTo`). To use another SQLite library
(for example `better-sqlite3`), re-implement those five functions there and nothing else changes.

## The adapter, again

`public/js/runtime.js` section "the claude adapter" is the only place the app touches the server's data API.
If you later want a different front-end framework, you can call `/api/*` directly (see API.md).
