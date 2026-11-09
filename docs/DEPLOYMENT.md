# Deployment

## Read this first: where does the data live?

The app keeps **everything in one SQLite file** (`data/bitwixt.db`). That is simple and fast, but it means:

> **The server needs a disk that survives restarts and redeploys.** If your host wipes the disk each time
> the app restarts or sleeps, **you lose all your data.**

Many "free" web hosts do exactly that (their free apps use a temporary disk). Free offers and their rules
change often and I cannot see them today, so **check the host's current page for "persistent disk" or
"volume" before you trust it with real data.**

## Options, from easiest to most solid

### A. Run it on a computer you control (best for a small team to start)
Any always-on computer (an office PC, a spare laptop, a Raspberry Pi).
1. Follow the README: `npm start`.
2. To let people outside the office in **without opening your router**, use a tunnel such as
   **Cloudflare Tunnel** (free) or **Tailscale** (free for small teams). The tunnel gives you an HTTPS address.
3. Set in `.env`: `NODE_ENV=production`, `PUBLIC_URL=https://your-address`, `TRUST_PROXY=true`.

### B. A small virtual server (a "VPS") with Docker
Providers sell these cheaply; some have "always free" machines (check the current terms; they may ask for a card).
```bash
# on the server, with Docker installed
git clone https://github.com/YOUR-NAME/my-workspace.git && cd my-workspace
cp .env.example .env     # edit it: ADMIN_SETUP_CODE, PUBLIC_URL, AI keys
docker compose up -d --build
```
The app listens on `127.0.0.1:3000`. Put **HTTPS** in front, for example with **Caddy** (automatic certificates):
```
workspace.example.com {
    reverse_proxy 127.0.0.1:3000
}
```
Data is kept in the Docker volume `workspace-data`.

### C. A platform-as-a-service (Render, Railway, Fly.io and similar)
They run the Dockerfile for you and give you HTTPS. **You must attach a persistent volume mounted at
`/app/data`**, and set the environment variables from `.env.example` in the dashboard. Volumes are often a
paid feature; if there is no volume, **do not use it for real data.** Keep to one instance (do not scale to
several: rate limits and live updates are per process).

## Settings for production

```
NODE_ENV=production
HOST=0.0.0.0            # the host forwards traffic to this
PORT=3000               # or whatever the host provides
PUBLIC_URL=https://your-address
TRUST_PROXY=true        # only when a proxy/host you trust sits in front
DATA_DIR=/app/data      # the persistent disk
ADMIN_SETUP_CODE=…      # long and random; used once
```

## First launch on a new server

1. Open the site. It shows **Set up your workspace**.
2. Enter the `ADMIN_SETUP_CODE`, your details, and create the admin. (Or run `npm run setup:admin` on the server.)
3. Optionally **remove `ADMIN_SETUP_CODE` from the settings** once you are in. It no longer works anyway.

## Backups

* `AUTO_BACKUP=true` (default) writes a consistent copy to `data/backups/bitwixt-YYYY-MM-DD.db` daily and
  keeps the last `BACKUP_KEEP` (14).
* **Copy backups off the machine** (another computer, cloud storage). A backup on the same disk does not help
  if the disk dies.
* Run one any time: `npm run backup`.
* **Restore:** stop the server, replace `data/bitwixt.db` with a backup file (delete `bitwixt.db-wal` and
  `bitwixt.db-shm` if present), start the server.
* GitHub stores the **code**, never your data (the `data/` folder is excluded on purpose).

## Updating

```bash
git pull
docker compose up -d --build     # or: stop the server, git pull, npm start
```
Database changes ship as new files in `server/migrations/` and are applied automatically, once, at start-up.

## Health check

`GET /api/health` returns `{"ok":true}`. Point your host's health check at it.
