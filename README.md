# SleepClick

[![Security](https://github.com/kozliatko/SleepClick/actions/workflows/security.yml/badge.svg)](https://github.com/kozliatko/SleepClick/actions/workflows/security.yml)
[![CodeQL](https://github.com/kozliatko/SleepClick/actions/workflows/codeql.yml/badge.svg)](https://github.com/kozliatko/SleepClick/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/kozliatko/SleepClick/badge)](https://scorecard.dev/viewer/?uri=github.com/kozliatko/SleepClick)
![Version](https://img.shields.io/github/v/release/kozliatko/SleepClick)
![License](https://img.shields.io/github/license/kozliatko/SleepClick)
![Last commit](https://img.shields.io/github/last-commit/kozliatko/SleepClick)
![Issues](https://img.shields.io/github/issues/kozliatko/SleepClick)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

A progressive web app for tracking a baby's fragmented sleep patterns. Designed for exhausted parents who need to log sleep with one tap — including at 3 AM with one eye open.

<p align="center">
  <img src="screenshots/screenshot-tracker.png" width="280" alt="Tracking screen" />
  &nbsp;&nbsp;&nbsp;
  <img src="screenshots/screenshot-stats.png" width="280" alt="Statistics screen" />
</p>

## Features

### Tracking
- **One-tap tracking** — single SLEEP / AWAKE button pair
- **Live timer** — shows current sleep duration or wake window since last sleep ended
- **Wake-up counter** — log mid-sleep wake-ups without ending the session
- **Manual entry** — add past sessions with exact start/end times
- **Edit records** — correct any past entry including times, tags, notes, and wake-up count

### Sleep visualization
- **Today card** — mini 24h timeline + night sleep, day naps, longest stretch at a glance
- **7-day chart** — scrollable week overview with clickable rows
- **Day detail modal** — full-width timeline for any day with gap labels and per-session list
- **Two day modes**:
  - Baby day (20:00 → 20:00) — groups overnight sleep with the following morning
  - Midnight (00:00 → 00:00) — standard calendar day

### Statistics
- Night sleep total, day nap total, total per day, longest stretch
- **Night fragmentation card** — segment count, longest night stretch, average awake gap, night total
- Cross-midnight sessions are automatically split to the correct day window

### Session tags & notes
Tags: Easy · Crying · Nursed · Pacifier · Stroller · Sick  
Free-text note per session. Tags rendered as chips in history.

### Notifications
- Lock-screen push notification while baby sleeps (via Service Worker)
- Shows elapsed time, updates every 60 s
- "Woke up" action button directly on the notification
- Per-device opt-in/opt-out toggle

### App quality
- **PWA** — installable on iOS and Android home screen
- **Offline-first** — full functionality without network (Service Worker cache)
- **Local fonts** — Outfit loaded from bundled woff2, no CDN dependency
- **Dark / light theme** toggle
- **SK / EN language switcher** — all UI strings translated, persisted per device
- **Export / Import** — JSON backup and restore
- **Mock data** — load 14 days of realistic test data in one tap
- **Clear all** — wipe all records with confirmation

### Garmin watch app
- **Start, stop and count wake-ups from the wrist** — no phone needed
- **Offline-first** — sessions are kept on the watch until the server confirms them, so nothing is lost out of range
- **Automatic sync** — on app start and after every finished session
- Runs on **Forerunner 935** (Connect IQ 3.1) and **Forerunner 230** (Connect IQ 1.4)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS, CSS custom properties |
| PWA | Service Worker (cache-first), Web App Manifest |
| Notifications | Push Notifications API, Service Worker actions |
| Storage (web) | `localStorage` — the PWA needs no account |
| Watch app | Monkey C (Connect IQ), Forerunner 935 + 230 |
| Sync backend | Node 24, zero npm dependencies (`node:http`, `node:crypto`, `node:sqlite`) |
| Sync storage | SQLite, one file on a Docker volume |
| Fonts | Outfit (self-hosted woff2) |
| Server | nginx (static file server inside Docker) |
| Deployment | Docker + [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy) |

## Getting started

### Run locally (no Docker)

Open `index.html` directly in a browser. Service Worker requires `localhost` or HTTPS — use a local dev server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

### Run with Docker (standalone)

```bash
docker build -t sleepclick .
docker run -p 8080:80 sleepclick
# open http://localhost:8080
```

### Deploy with caddy-docker-proxy

This is the recommended production setup. Caddy handles TLS automatically.

**Prerequisites:** a running `caddy-docker-proxy` container and an external `caddy` Docker network.

```bash
# one-time network setup (skip if already exists)
docker network create caddy

# configure your domain
cp .env.example .env
echo "CADDY_DOMAIN=sleep.yourdomain.com" > .env

# start
docker compose up -d
```

The app will be available at `https://sleep.yourdomain.com` within seconds.
Caddy routes `/` to nginx, `/api/*` to the sync backend and `/admin` to the
admin UI, all on the one domain.

Every route is a Caddy `handle` block — never `handle_path`. The prefix is not
stripped on the way in, so a path means the same thing in `server.js` as it
does in the browser's address bar. Caddy orders `handle` blocks by path
specificity, so the two backend routes win over the frontend's `/*` catch-all
no matter which container Caddy discovers first. Adding a route means copying
a `handle_N` pair with the next index; there is no per-route exception to
remember.

## Watch sync

Skip this section entirely if you only use the web app.

### 1. Issue a token

Open `https://sleep.yourdomain.com/admin`, sign in with `ADMIN_USER` /
`ADMIN_PASSWORD`, add a user and mint a token for the device. **The token is
shown once** — only its hash is stored, so it cannot be recovered afterwards.

The CLI does the same thing when the web UI is unreachable:

```bash
docker compose exec backend node admin.js add-user janka
docker compose exec backend node admin.js add-token janka "Janka's fr935"
docker compose exec backend node admin.js list
docker compose exec backend node admin.js revoke 4
```

Issue one token per device rather than per person, so a lost watch can be
revoked without disturbing the others.

### 2. Build and install the watch app

Requires the Connect IQ SDK and a developer key (`make key` generates one).

```bash
cd watch
make build DEVICE=fr935     # or fr230
make deploy DEVICE=fr935    # copies the .prg to a connected watch
```

`deploy` needs the watch mounted as USB mass storage. The app is a `watch-app`,
so it appears in the **activity list** (press START from the watch face), not
in a separate Connect IQ menu.

### 3. Enter the token

The server URL is already baked in as a default. Only the token is missing —
set it in Garmin Connect under the app's settings.

Sideloaded apps do not always expose their settings there. If the fields are
missing, put the token into `watch/resources/properties/properties.xml` and
rebuild. Keep that out of version control.

### 4. Pull the records into the web app

Open **Statistics → Watch sync**, paste the same token and press *Fetch*.
Imported records carry a `watch_` id prefix, so repeated fetches never
duplicate them.

## Configuration

| Variable | Description | Example |
|---|---|---|
| `CADDY_DOMAIN` | Public domain served by caddy-docker-proxy | `sleep.example.com` |
| `SYNC_TOKEN` | Bootstrap token, 16+ chars. Only used to carry a pre-multi-user database over on first start; day-to-day tokens are minted in the admin UI | `openssl rand -hex 32` |
| `ADMIN_USER` | Username for the admin UI at `/admin` | `admin` |
| `ADMIN_PASSWORD` | Password for the admin UI, 12+ chars. Leave blank to disable the admin entirely | — |

All user preferences (language, theme, day mode, notification opt-in) are stored in `localStorage` on the device. There is no server-side configuration.

## Data & privacy

Sleep records created **in the web app** stay in the browser's `localStorage` and are never uploaded. Exporting produces a plain JSON file that stays on your device.

The **Garmin watch app** is the one exception: it has nowhere else to put a finished session, so it pushes each one to the sync backend, and the web app pulls those records back down. That traffic carries only what the watch measures — start time, end time and wake-up count. No names, no notes, no tags, no device identifiers.

Each token maps to exactly one user, and every query is scoped to that user, so two people sharing one backend cannot see each other's records. Tokens are stored as SHA-256 hashes; a leaked database does not yield usable credentials. Running the backend is optional — without it the PWA behaves exactly as it did before.

## Project structure

```
.
├── index.html          # app shell + all modals
├── app.js              # all application logic
├── i18n.js             # translations (SK / EN)
├── style.css           # design tokens + component styles
├── sw.js               # service worker (cache + notifications)
├── manifest.json       # PWA manifest
├── mock-data.js        # browser-console mock data generator
├── Dockerfile          # nginx static server image
├── nginx.conf          # nginx server block (static files on :80)
├── docker-compose.yml  # caddy-docker-proxy deployment
├── fonts/              # self-hosted Outfit woff2
├── icon*.{svg,png}     # app icons (192, 512, apple-touch-icon)
├── backend/            # sync API + admin UI
│   ├── server.js       #   HTTP routing, session validation
│   ├── db.js           #   schema, migrations, token hashing
│   ├── admin-web.js    #   /admin routes behind basic auth
│   ├── admin.html      #   admin single-page UI
│   └── admin.js        #   CLI equivalent of the admin UI
└── watch/              # Garmin Connect IQ app
    ├── SIMULATOR.md    #   runbook: headless simulator, VNC, loading a .prg
    ├── source/         #   shared Monkey C code
    ├── source-ciq3/    #   Connect IQ 2.4+ platform layer (fr935)
    ├── source-ciq1/    #   Connect IQ 1.x platform layer (fr230)
    ├── resources/      #   strings, settings, icons
    └── tools/          #   libsoup shim the simulator needs on some hosts
```

`source-ciq1` and `source-ciq3` exist because `Application.Storage` and
`Application.Properties` do not exist on Connect IQ 1.x — the compiler accepts
them but the device raises "Symbol Not Found" at runtime. Each directory holds
a `Persistence` and a `Palette` module with matching interfaces; `monkey.jungle`
picks one per device. The 4 bpp fr230 palette has no teal, so the awake state is
green there and the split covers colours too.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
