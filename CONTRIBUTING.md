# Contributing to SleepClick

Thank you for your interest in contributing. SleepClick is a small, self-contained PWA with no build step — changes are immediately visible in the browser.

## Getting started

```bash
git clone https://github.com/kozliatko/SleepClick.git
cd SleepClick

# serve locally (Service Worker requires localhost or HTTPS)
npx serve .
# open http://localhost:3000
```

No package manager, no bundler, no compilation. Edit files and reload.

## Project layout

| File | Responsibility |
|---|---|
| `index.html` | App shell, all modal markup, `data-i18n` attributes |
| `app.js` | All application logic (state, rendering, events) |
| `i18n.js` | Translation strings and helpers (`t()`, `applyI18n()`, `setLang()`) |
| `style.css` | Design tokens (CSS custom properties) + component styles |
| `sw.js` | Service Worker: cache strategy + notification click handling |
| `nginx.conf` | nginx server block (static file serving on :80) |

## How to add a feature

1. **Logic** goes in `app.js`.
2. **New UI text** gets a key in both `sk` and `en` objects in `i18n.js`, then referenced via `t('key')` in JS or `data-i18n="key"` in HTML.
3. **New styles** go in `style.css` using existing CSS custom property tokens (`--ac-primary`, `--bg-card`, etc.).
4. **After any change** to cached assets, bump `CACHE_NAME` in `sw.js` (e.g. `v12` → `v13`).

## Adding a translation key

```js
// i18n.js — add to both language objects:
sk: {
  my_new_key: 'Slovenský text',
},
en: {
  my_new_key: 'English text',
},
```

Use it in JS:
```js
showToast(t('my_new_key'), 'success');
```

Or in HTML (static labels):
```html
<span data-i18n="my_new_key"></span>
```

For `title` attributes:
```html
<button data-i18n-title="my_new_key">...</button>
```

For `placeholder` attributes:
```html
<input data-i18n-placeholder="my_new_key">
```

## Data model

A sleep record:
```js
{
  id: 'sleep_<timestamp>_<random>',
  startTime: '2026-06-15T21:30:00.000Z',  // ISO 8601
  endTime:   '2026-06-16T06:15:00.000Z',
  wakeUps:   2,
  tags:      ['nursing', 'pacifier'],
  note:      'Fell asleep while nursing'
}
```

All records live in `localStorage.sleepLogs` (JSON array).

## Day boundary logic

`dayStartHour` (0 or 20) controls the 24h window. A session that crosses the boundary is split into fragments by `splitSessionAtBoundaries()`. `groupByBabyDay()` uses this to build the per-day map used by all renderers.

If you change anything related to session grouping, test both day modes.

## Style guide

- Vanilla JS only — no frameworks, no TypeScript.
- No comments explaining what the code does. A short comment is acceptable only for a non-obvious invariant.
- Keep functions small and named after what they do.
- Use existing CSS tokens; do not introduce new hard-coded colour values.
- All user-visible strings must go through `t()`. No hard-coded text in JS or HTML.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes.
3. Test in both SK and EN, dark and light theme, both day modes.
4. Bump the Service Worker cache version in `sw.js`.
5. Open a PR with a clear description of what changed and why.

## Reporting a bug

Open an issue and include:
- What you expected to happen
- What actually happened
- Browser + OS + whether it's installed as PWA
- Reproduction steps (a mock data import JSON is helpful)

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
