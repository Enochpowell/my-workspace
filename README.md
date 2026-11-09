# My workspace

An **invite-only team workspace** for a small consultancy: offers and rate card, quotations, a content
calendar, campaigns, ads, audits, policies, tasks, and a built-in chat (general channel, groups, private
direct messages and comments on any item). Every person signs in with their own account. People get
their own workspace, and an admin can invite others into theirs.

It runs on your own computer or server, stores everything in one file (SQLite), and has an **AI assistant
you can switch at any time**: Google Gemini (free tier), Anthropic Claude, OpenAI, Groq, OpenRouter,
or a free model running on your own computer with Ollama.

**There are no npm packages to install.** The server uses only what ships inside Node.js 22+.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Run it on your computer (10 minutes)](#2-run-it-on-your-computer)
3. [Create the first admin](#3-create-the-first-admin)
4. [Turn on the AI (free option included)](#4-turn-on-the-ai)
5. [Invite your team](#5-invite-your-team)
6. [Back it up to GitHub](#6-back-it-up-to-github)
7. [Put it on the internet](#7-put-it-on-the-internet)
8. [Project tour](#8-project-tour)
9. [Everyday commands](#9-everyday-commands)
10. [Troubleshooting](#10-troubleshooting)
11. [Honest limits](#11-honest-limits)

More detail lives in [`docs/`](docs): [ARCHITECTURE](docs/ARCHITECTURE.md), [API](docs/API.md),
[SECURITY](docs/SECURITY.md), [DEPLOYMENT](docs/DEPLOYMENT.md), [AI-PROVIDERS](docs/AI-PROVIDERS.md),
[DEVELOPMENT](docs/DEVELOPMENT.md), [TESTING](docs/TESTING.md).

---

## 1. What you need

* **Node.js 22.13 or newer** (the current "LTS" from <https://nodejs.org> is fine). Check with `node -v`.
* **VS Code** (<https://code.visualstudio.com>) is recommended. Any editor works.
* Optional: a free Gemini key (see step 4), **Git** and a **GitHub** account (step 6).

## 2. Run it on your computer

1. Unzip the folder and open it in VS Code: **File → Open Folder…** and choose the folder that holds `package.json`.
   When VS Code offers "Install recommended extensions", say yes (Prettier formats the code for you).
2. Open the built-in terminal: **Terminal → New Terminal**.
3. Copy the settings template:
   * Windows (PowerShell): `Copy-Item .env.example .env`
   * macOS / Linux: `cp .env.example .env`
4. Make a one-time setup code and paste it into `.env` after `ADMIN_SETUP_CODE=`:

   ```bash
   npm run gen:secret
   ```

5. Start the server:

   ```bash
   npm start
   ```

6. Open <http://localhost:3000> in your browser.

> Tip: `npm run dev` restarts the server automatically when you change a file.

## 3. Create the first admin

The first time, the page says **"Set up your workspace"**. Enter:

* the `ADMIN_SETUP_CODE` from your `.env` file,
* your name, email and a password (10+ characters),
* tick the security guidance box.

That creates the **platform admin** and your first workspace. The setup code **stops working** as soon as
an account exists, so it cannot be used to take over later. Prefer the command line? Run
`npm run setup:admin` instead.

## 4. Turn on the AI

Easiest: after you sign in, open **Settings, AI**, pick an AI and paste its key. Or put the key in `.env` as described below.

The "Ask AI" panels and the calendar generator need one AI provider. **You can use the free one:**

1. Get a free Gemini key at <https://aistudio.google.com/apikey>.
2. Put it in `.env`: `GEMINI_API_KEY=your-key`
3. Restart the server (`Ctrl+C`, then `npm start`).

To switch later, anyone can pick a different provider in the ** menu → AI assistant**, or you can change
`AI_PROVIDER` in `.env` for everyone. Full guide, including Groq, OpenRouter, Claude, OpenAI and Ollama:
[docs/AI-PROVIDERS.md](docs/AI-PROVIDERS.md).

## 5. Invite your team

Nobody can sign up without a code.

* **Into your workspace:** open **People**, type their email, choose Member or Admin, **Create invite**.
  Tap **Email invite** (opens your mail app) or **Copy invite** (paste into WhatsApp). The code works once,
  only for that email, and expires in 7 days.
* **With their own separate workspace:** the platform admin sees a **Platform admin** section on the People
  page: **Create invite for a new account**.

The person opens your site, chooses **Create your account**, and enters the code.

Direct messages are private to the two people, **even from admins**.

## 6. Back it up to GitHub

The project is ready for Git. `.gitignore` already keeps your **secrets (`.env`) and your database (`data/`)
out of GitHub**. Never remove those lines.

```bash
git init
git add .
git commit -m "First version of My workspace"
```

Create an **empty private repository** on <https://github.com/new>, then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR-NAME/my-workspace.git
git push -u origin main
```

A GitHub Action (`.github/workflows/ci.yml`) then runs the checks on every push. **GitHub backs up the code,
not your data.** Your data is the file in `data/`; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#backups).

## 7. Put it on the internet

Short version: the app needs Node 22 and a **disk that survives restarts** (SQLite stores everything in one
file). Many "free" hosts erase the disk on restart, which would delete your data. Read
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before choosing. A `Dockerfile` and `docker-compose.yml` are included.

## 8. Project tour

```
my-workspace/
├─ README.md                 you are here
├─ package.json              scripts (start, dev, test, backup, ...). No dependencies.
├─ .env.example              every setting, explained. Copy to .env.
├─ Dockerfile, docker-compose.yml, .github/   running in a container, and checks on GitHub
├─ .vscode/                  VS Code settings, debug launchers and tasks
├─ requests.http             try the API from VS Code (REST Client extension)
├─ server/                   THE BACK END (Node.js, no dependencies)
│  ├─ index.js               starts the server
│  ├─ app.js                 builds it: headers, routing, errors, backups
│  ├─ config.js              reads .env
│  ├─ db.js, migrations/     SQLite and the database layout
│  ├─ auth.js                passwords, sessions, permission checks
│  ├─ http.js                tiny router, cookies, rate limiter, static files
│  ├─ routes/                auth.js, workspaces.js, admin.js, store.js, ai.js
│  ├─ store/                 rules.js (who may read what), hub.js (live updates)
│  └─ ai/                    gemini.js, anthropic.js, openai.js (+ Groq, OpenRouter, Ollama)
├─ public/                   THE FRONT END (plain JavaScript, no build step)
│  ├─ index.html, css/
│  └─ js/runtime.js          sign-in pages + connection to the server
│     js/00-… to 99-…        the app, split by topic (see docs/ARCHITECTURE.md)
├─ scripts/                  setup-admin, backup, gen-secret, check-syntax
├─ tests/                    automated tests (npm test)
├─ docs/                     the detailed guides
└─ data/                     your database lives here (never committed to Git)
```

## 9. Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run and restart on every change |
| `npm test` | Run the automated tests (see tests/) |
| `npm run check` | Check that every JavaScript file parses |
| `npm run backup` | Save a safe copy of the database to `data/backups/` |
| `npm run setup:admin` | Create or reset an admin from the command line |
| `npm run gen:secret` | Print a long random secret |

## 10. Troubleshooting

| Problem | Fix |
| --- | --- |
| `My workspace needs Node.js 22.13 or newer` | Install the current LTS from nodejs.org, reopen the terminal. |
| The page says setup is not ready | Put a 16+ character `ADMIN_SETUP_CODE` in `.env`, restart. |
| "The AI isn't set up yet" | Add a key to `.env` (step 4) and restart. |
| "rejected the API key" | The key is wrong or has no access. Copy it again, without spaces or quotes. |
| "free limit … reached" | Free tiers have limits. Wait, or switch provider in the menu. |
| Forgot your password | Run `npm run setup:admin` with your email to set a new one. For other people, an admin can remove them and re-invite. |
| Port already in use | Change `PORT=` in `.env`. |
| Sign-in works but you are logged out after a restart | Hosting that erases the disk. See DEPLOYMENT.md. |

## Clickable preview (no server needed)

`npm run build:preview` writes `preview/workspace-preview.html`: the whole workspace in one file, with a pretend server and a demo AI inside it. Open it in any browser and sign in with any email and password. Use it to click through every screen before you set anything up. Nothing leaves the browser, the AI answers are demo text, and the data stays in that browser only.

## Creative tools

- **Images:** Make a picture (OpenAI or Gemini key), a picture editor in the browser, and a prompt writer.
- **Video:** Make a video clip (Gemini key with billing), a video editor in the browser (cut, split, reorder, captions in many fonts, export to .webm), and a script and edit-plan writer.
- **Website:** describe a business and get a complete one-file page. Preview on desktop, tablet and phone, change it by instruction, undo, and download.
- All of them are described in `docs/AI-PROVIDERS.md`, including what each one costs you at the AI provider.

## 11. Honest limits

* **No email sending.** Invites open your own mail app (or you copy them). Automatic email would need an
  email service, which is a possible next step.
* **No two-step verification and no password-reset email yet.** Admins can reset via `npm run setup:admin`.
* **One server process.** Rate limits and live updates are kept in memory, so run a single instance. That
  is plenty for a team.
* `node:sqlite` is marked *experimental* by Node. It works well, but Node may change it in future versions.
  Pin your Node version, and see docs/DEVELOPMENT.md to swap in another SQLite library if you ever need to.
* The AI sends the visible page data (for example your offers or quotations) to the provider you choose.
  Do not use a provider you do not trust with that information.
