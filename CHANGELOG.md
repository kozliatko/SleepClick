# Changelog

All notable changes to this project are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
