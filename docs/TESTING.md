# Testing

## Automated: `npm test`

Uses Node's built-in test runner (no packages). Each file starts a throw-away server with an in-memory database.

| File | Covers |
| --- | --- |
| `tests/auth.test.js` | first-time setup code, invite-only sign-up, single-use and email-locked invites, login, lockout, logout, password change, disabled accounts, CSRF header/origin |
| `tests/workspaces.test.js` | workspaces, roles, last-admin protection, removing members, platform-admin invites, expiry |
| `tests/store.test.js` | data store rules, workspace isolation, path validation, size limits, message rules, **direct-message privacy**, forged chats, private groups, live updates |
| `tests/ai.test.js` | Gemini, Claude and OpenAI-compatible streaming against fake services, provider switching, friendly errors, no key leaks |

## Manual checklist (about 10 minutes)

1. Start fresh (delete `data/`), `npm start`, open the site: **Set up your workspace** appears.
2. Wrong setup code → refused. Right code → you are in; the sidebar shows your workspace name.
3. Reload: still signed in. ** → Sign out** → sign-in page. Sign in again.
4. **People → Create invite** for a second email. Copy the code. In a private window, **Create your account**
   with a different email → refused. With the right email → in, and sees the shared data, **no People page**.
5. Chat: send in General from both windows; they appear live. Open a direct message: only those two see it.
6. Make a quotation in one window; the other sees it within a second or two.
7. Tasks: assign one to the second person → **Message assignee** → it arrives as a direct message.
8. **Ask AI** on Offers with a key set. Switch provider in the menu and ask again.
9. Phone-size window:  at top left opens the sidebar; nothing scrolls sideways.
10. Menu → colour theme and Light/Dark; reload; it is remembered.
