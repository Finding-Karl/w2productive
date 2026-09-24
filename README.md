# Focus Extension (working name)

Chrome MV3 extension built with WXT + React + TypeScript.

## Setup

```sh
npm install        # needs npm 11+ (npm 10.9 crashes resolving vitest's peer deps)
npm run dev        # dev server + HMR (does not open a browser; see below)
```

First run: chrome://extensions → Developer mode → Load unpacked → `.output/chrome-mv3-dev`.
Keep `npm run dev` running; it hot-reloads the extension. For a production build,
`npm run build` and load `.output/chrome-mv3` instead.

## Scripts

- `npm run dev` / `build` / `zip`
- `npm test` — Vitest (pure logic in `src/core`)
- `npm run compile` — typecheck

## Layout

```
entrypoints/
  background.ts    service worker — chrome API glue only, no in-memory state
  popup/           toolbar popup
  options/         settings (opens in a tab)
  dashboard/       stats + heatmap (unlisted page)
  blocked/         DNR redirect target (web-accessible)
src/
  core/            pure, tested business logic (no chrome.* imports)
  storage/         typed, versioned chrome.storage items
  ui/              shared styles/components
```

## Backend (optional)

Sync and Google sign-in use Supabase. Setup: [docs/supabase-setup.md](docs/supabase-setup.md).
Without a `.env`, the extension runs fully local.
