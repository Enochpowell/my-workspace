# Security

This is what the app does, what it does not do, and what you must do yourself.

## What is protected

| Risk | How it is handled |
| --- | --- |
| Anyone signing up | **Invite only.** Codes are random, single-use, expire (7 days by default), can be locked to one email, and only their SHA-256 hash is stored. |
| First admin takeover | The setup code must be 16+ characters, comes from the server's `.env`, and **stops working once any account exists**. Compared in constant time. |
| Stolen database | Passwords are hashed with **scrypt** and a random salt. Session tokens and invite codes are stored only as hashes. |
| Guessing passwords | Per-IP and per-email rate limits on sign-in; unknown emails take as long as wrong passwords (no account probing). Passwords must be 10-128 characters and not trivially common. |
| Session theft | Random 256-bit token in an **HttpOnly, SameSite=Lax** cookie (**Secure** in production). Changing your password signs out your other devices. Disabling an account signs it out immediately. |
| Cross-site request forgery | Every state-changing call needs the custom header `X-Requested-With: bitwixt` and, if an `Origin` is sent, it must match the site. |
| Cross-site scripting | A strict **Content-Security-Policy** (scripts only from this site, no inline scripts, no framing). All user text is escaped before being drawn. |
| Reading other people's data | Every data call goes through `server/store/rules.js`. A workspace's data is invisible to non-members. **Direct messages are readable only by the two people**, not even admins. |
| Forged messages | The server requires `by` to be you, and messages cannot be edited. |
| Injection | All SQL uses bound parameters. Paths are validated against a strict pattern. Only three top-level collections exist. |
| Oversized input | Body size, document size, path depth, message length, photo size and invite counts are all capped. |
| Leaking AI keys | Keys live only in `.env` / the host's settings; the browser only learns *whether* a provider is set up. Error messages never include keys. |
| Clickjacking, MIME sniffing, referrers | `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS in production. |

Automated tests for most of these are in `tests/` (`npm test`).

## What is NOT included (be aware)

* **No email verification and no "forgot password" email.** Invites are locked to an email address, but the
  address is not proven by a link. The invite code itself is the proof, so send it privately.
* **No two-step verification (2FA).** Use long, unique passwords (a password manager helps).
* **Rate limits live in memory** (reset on restart; one server process only).
* **The AI provider sees what you send it.** When someone uses "Ask AI", the visible page data is part of
  the prompt. Treat that like emailing the data to that company; check its privacy terms.
* **Admins see everything except direct messages.** Say so in your team policy.
* **No end-to-end encryption.** The server can read stored data. Protect the server and its disk.

## Your checklist before going public

1. Use **HTTPS** only (see DEPLOYMENT.md). Set `NODE_ENV=production` and `PUBLIC_URL=https://…`.
2. Set `TRUST_PROXY=true` **only** if a proxy you control sits in front; otherwise leave it `false`.
3. Keep `.env` out of Git (it already is). If a key ever leaks, **revoke it at the provider and make a new one.**
4. Put `data/` on a persistent, private disk, and run `npm run backup` (or keep `AUTO_BACKUP=true`) and copy backups elsewhere.
5. Keep Node updated (security fixes arrive in Node releases).
6. Review **People** and **Platform admin** now and then; disable accounts of people who left.
7. Review the **Policies** page: the starter text is a draft. Have a lawyer check it for your situation
   (for Nigeria, the Nigeria Data Protection Act 2023 applies to personal data you handle).

## AI keys saved from Settings

Keys saved in **Settings, AI** are encrypted with AES-256-GCM before they go into the database. The secret is `data/.keysecret` (file mode 600). Someone who steals only the database file cannot read the keys, but someone who steals the whole `data` folder can. Keep that folder private, never commit it (it is in `.gitignore`), and rotate a key at the provider if you think it leaked. Only platform admins can save or remove keys, and each change is written to the audit log.
## Sign in with Google and GitHub

The sign-in and sign-up screens always show **Continue with Google** and **Continue with GitHub**. They only work once you add credentials; until then they explain that the server has not set them up.

1. Set `PUBLIC_URL` in `.env` to the real address of your workspace (for example `https://workspace.example.com`).
2. **Google**: in the Google Cloud console create an OAuth client of type "Web application". Add `PUBLIC_URL/api/auth/oauth/google/callback` as an authorised redirect address. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. **GitHub**: in GitHub, Settings, Developer settings, OAuth Apps, create an app. Set the callback address to `PUBLIC_URL/api/auth/oauth/github/callback`. Put the client ID and a generated secret in `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. Restart the server.

Rules the app enforces: the provider must report the email as **verified**; signing in works only for an existing account with that email; a new account still needs a valid **invite code** (or the setup code for the very first admin), exactly like password sign-up, so a Google or GitHub account alone cannot get in; disabled accounts are refused; and every sign-in is written to the audit log. Account creation by Google or GitHub gives the account a random password nobody knows, so that person signs in through the same provider.

## Reporting a problem

This is your own project: fix it, or open an issue in your GitHub repository. If you find a way to read
someone else's data, treat it as urgent: the rule files are small (`server/store/rules.js`).

## Security rules in the browser (Content-Security-Policy)

The app loads nothing from other websites: no external fonts, scripts or images. Videos and uploaded fonts are allowed from the browser's own memory (`media-src` and `font-src` allow `blob:` and `data:`). Pages made by the **Website builder** are previewed in a sandboxed frame; scripts inside a previewed page may be blocked by these rules, but they work in the downloaded file.
