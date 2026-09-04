# Changelog

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Changed
- All developer-facing text is English: comments, build script output, the
  gitleaks config and the security workflow's step names.
- The admin UI at `/admin` is in English. It had no translation mechanism, so
  its Slovak was hardcoded rather than localized; the operator-facing tool now
  matches the rest of the developer surface.
- Still Slovak, deliberately: the SK/EN strings in `i18n.js`, the markup in
  `index.html`, the PWA name in `manifest.json`, and the watch's on-screen
  labels. That is product content for a Slovak-speaking user, not developer
  text.

### Removed
- `watch/bin/sim` and `watch/bin/build-stub`. They patched the system libsoup
  libraries at hardcoded byte offsets to work around the libsoup2/libsoup3
  conflict — an approach superseded by the `LD_PRELOAD` shim in
  `watch/tools/soupfix.c`, which needs no binary patching. `bin/sim` had also
  been broken since the build started emitting per-device filenames: it still
  looked for `build/SleepClick.prg`. Use `make sim` and
  [`watch/SIMULATOR.md`](watch/SIMULATOR.md) instead.

---

## [1.3.1] — 2026-09-04

### Fixed
- **Two unhandled exceptions in the watch app.** `Storage.setValue` throws once
  the object store is full, and `makeWebRequest` throws
  `InvalidOptionsException` / `SymbolNotAllowedException`. Neither was caught,
  so either would end the app with an Unhandled Exception — the first while
  saving a just-recorded sleep. Both are caught and logged now. This costs
  336 bytes of bytecode out of ~100 kB.
- **Strict type checking did not pass.** `Persistence.writeValue` handed an
  `Object` to a parameter typed `Storage.ValueType`, so `monkeyc -l 3` failed
  on both devices. Narrowed in the platform layer. Every build now compiles at
  level 3 so this cannot silently regress.
- **`make sim` never worked.** It compiled for a device id of `<device>sim`,
  which the compiler has always rejected. The target now builds and pushes
  through `monkeydo`.
- **Launcher icon was 24×24** against the 40×40 both devices ask for, warned
  about on every build. Rendered from the PWA's `icon.svg`, so watch and phone
  carry the same icon. Costs nothing in the `.prg`: the compiler scaled the
  small icon to 40×40 anyway, it just looked soft.

### Changed
- Watch code follows the Monkey C coding conventions: one class per file
  (`SyncSession` moved out of `SyncManager.mc`), the underscore prefix reserved
  for private class members, `//!` doc comments with `@param`/`@return`, and
  the `<resources>` schema root on every resource file rather than only
  `drawables.xml`. None of this changes the compiled output.
- Removed `SessionStorage.getAll()`, which nothing called.

### Added
- `make check` builds every supported device with warnings and strict type
  checking in one command.
- [`watch/SIMULATOR.md`](watch/SIMULATOR.md) — runbook for the headless
  Connect IQ simulator: Xvfb, VNC, loading a `.prg`, and the failure modes that
  waste an afternoon (keyboard input silently does nothing without a window
  manager; `monkeydo` exit codes report success on a dropped connection).
- `watch/tools/soupfix.c` — the libsoup2/libsoup3 shim some hosts need to start
  the simulator, previously kept only in a scratch directory.

### Documentation
- The watch setup section put "enter the token" after "build and install",
  which meant building twice. Reordered, and it now documents the `.token`
  build step instead of hand-editing `properties.xml` — advice that invited
  committing a secret.

---

## [1.3.0] — 2026-09-04

### Added
- **Build-time sync token for the watch.** Garmin Connect only exposes app
  settings for store-installed apps, so a sideloaded build had no way to
  receive a token. `make build` now reads `watch/.token` and substitutes it
  into `properties.xml`, restoring the file afterwards even when `monkeyc`
  fails — the secret never reaches a tracked file. `watch/.token` and
  `*.xml.bak` are gitignored, and `make token-help` prints the procedure.
  Building without a token still succeeds and says so, instead of producing a
  watch that silently never syncs.

### Changed
- **Every Caddy route is now a `handle` block, never `handle_path`.** `/api`
  stripped its prefix while `/admin` kept it, so the backend saw a different
  kind of path depending on the route. That asymmetry had already caused one
  routing bug. Caddy now strips nothing and `server.js` matches
  `/api/sessions` — the same path the browser and the watch ask for. Public
  URLs are unchanged.
- `/health` stays unrouted by Caddy, reachable only from inside the Docker
  network for the container healthcheck.

### Notes
- Merging the nginx and backend containers into one was considered and
  rejected: it would save ~8 MiB of RAM while coupling frontend and backend
  deploy cadences, replacing a proven static file server with hand-written
  path handling, and putting the PWA and the API in one crash domain.

---

## [1.2.0] — 2026-09-02

### Added
- **Garmin Connect IQ watch app** (`watch/`) for Forerunner 935 and 230 — start
  and stop a sleep session from the wrist, count wake-ups, live timer with a
  moon/sun state icon. Sessions stay on the watch until the server confirms
  them, so nothing is lost while out of range.
- **Sync backend** (`backend/`) — Node 24 with no npm dependencies, storing
  sessions in SQLite. `POST /api/sessions` takes a batch from the watch,
  `GET /api/sessions` serves them back to the PWA.
- **Multi-user tokens** — each token maps to one user and every query is scoped
  to that user, so several families can share one deployment. Tokens are stored
  as SHA-256 hashes and can be revoked per device.
- **Admin UI** at `/admin` behind basic auth: add users, mint tokens, revoke
  them. `backend/admin.js` is the CLI equivalent.
- **Watch sync card** in the PWA statistics tab — pulls watch records and merges
  them by a `watch_` id prefix, so re-fetching cannot duplicate entries.

### Fixed
- Service worker cached every same-origin `GET`, including `/api/sessions`,
  which could hide the watch's newest sessions behind a stale copy. The API is
  now excluded from the cache and `CACHE_NAME` moved to `v13`.
- `make deploy` looked only in `/run/media/$USER`, so it reported "watch not
  connected" on Ubuntu, where udisks2 mounts to `/media/$USER`. It now checks
  both, verifies `GARMIN/APPS` exists and calls `sync` before finishing.

### Changed
- The watch project moved into this repository as `watch/`; it previously lived
  outside version control and had no secret scanning.
- CodeQL static analysis workflow (`.github/workflows/codeql.yml`, JavaScript),
  running on every push/PR to `main` and weekly on a schedule.
- README badges: CodeQL status and latest GitHub release version.

Tests/Codecov/Snyk badges weren't added: there's no test suite (no coverage
data to report) and no dependency manifest (nothing for Snyk's dependency
scan to check — this is a plain vanilla JS/HTML/CSS PWA with zero third-party
packages).

---

## [1.1.0] — 2026-08-04

### Changed
- Replaced Caddy static server inside the Docker image with `nginx:alpine`
- Added `nginx.conf` server block; removed `Caddyfile`
- Fixed healthcheck URL from `localhost` to `127.0.0.1` (Alpine wget resolves `localhost` via IPv6)

---

## [1.0.0] — 2026-06-22

Initial public release.

### Core tracking
- SLEEP / AWAKE one-tap buttons with live elapsed timer
- Wake window timer (time since last sleep ended)
- Mid-session wake-up counter
- Minimum session threshold (30 s) to prevent accidental taps
- Manual entry modal with datetime-local inputs for past sessions
- Edit record modal — correct start/end time, tags, wake-up count, note

### Sleep data model
- Sessions stored as JSON in `localStorage` (`sleepLogs`)
- Each record: `id`, `startTime` (ISO 8601), `endTime`, `wakeUps`, `tags[]`, `note`
- Active session persisted across page reloads via `activeSleepStart` / `activeWakeUps` keys
- Cross-midnight session splitting at the configured day boundary (`splitSessionAtBoundaries`)
- Idempotent migration (`migrateLogSplits`) applied on startup and on day-mode change

### Day modes
- **Baby day (20:00 → 20:00)** — overnight sleep grouped with the following morning's date
- **Midnight (00:00 → 00:00)** — standard calendar day
- Toggle persisted to `localStorage`; switching re-migrates existing records

### Statistics
- Last-day summary: night sleep, day naps, total, longest stretch
- **Night fragmentation card**: segment count, longest night stretch, average awake gap between segments, night total
- `getDaySummary()` computes all metrics from raw session array

### Visualization
- Mini 24h timeline on today card (SVG, colour-coded night vs day)
- 7-day chart: one row per baby day, clickable to open day detail
- **Day detail modal**: full-width 24h timeline with start-time / duration labels inside blocks, axis ticks every 2h, wake-gap labels, per-session list with wake-window separators
- Axis tick generation via `getAxisTimes(stepHours)` respecting `dayStartHour`

### Session tags
Tags: `easy`, `crying`, `nursing`, `pacifier`, `stroller`, `sick`  
Rendered with emoji + translated label in history and day detail.

### Push notifications
- Lock-screen notification shown when sleep starts (Service Worker `showNotification`)
- Updates every 60 s with elapsed time
- `requireInteraction: true` keeps notification visible on Android
- "Woke up ⏹" action button triggers `STOP_SLEEP` message to app via `postMessage` / `?action=stop` URL param
- Per-device enable/disable toggle persisted as `sleepclick_notif`
- Graceful handling of `denied` permission state

### PWA & offline
- Service Worker (`sw.js`) with cache-first strategy, background network revalidation
- All assets pre-cached including self-hosted Outfit woff2 fonts
- App installable on iOS (apple-touch-icon 180 px, 167 px) and Android (icon 192 px, 512 px)
- Cache versioned (`sleepclick-cache-v12`); old caches purged on SW activate

### Internationalisation (i18n)
- Full SK / EN translation via `i18n.js` (`TRANSLATIONS` object, `t(key)` helper)
- `applyI18n()` walks `[data-i18n]`, `[data-i18n-placeholder]`, `[data-i18n-title]` attributes
- Language toggle (SK / EN) in header, preference stored as `sleepclick_lang`
- `formatDate()` uses matching locale (`sk-SK` / `en-GB`)
- All toasts, confirmations, notification strings, tag labels, day names, and tooltips translated

### Data management
- **Export** — downloads `sleepclick_YYYY-MM-DD.json`
- **Import** — validates structure and record formats before replacing data
- **Mock data** — generates 14 days of realistic fragmented baby sleep (built into app UI)
- **Clear all** — wipes localStorage with confirmation dialog
- History sorted newest-to-oldest within each day

### UI / UX
- Dark / light theme with CSS custom properties, persisted to `localStorage`
- Fullscreen save modal for half-awake usability (large tag buttons, stepper for wake-up count)
- Confirmation dialogs for destructive actions (discard, delete, clear, import, mock)
- Toast notifications (success / error / info) with auto-dismiss
- Bottom tab navigation (Tracking / Statistics)
- `safe-area-inset` support for iOS notch / home indicator

### Deployment
- Caddy 2 Alpine Docker image (static file server)
- `docker-compose.yml` for [caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy) with automatic HTTPS
- Domain configured via `CADDY_DOMAIN` environment variable
- `HEALTHCHECK` in Dockerfile (`wget` on port 80)
- gzip + zstd compression via Caddy encode directive
