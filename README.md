# Scramjet frontend — Cloudflare Workers

This repository is the **frontend-only** split of [MercuryWorkshop/Scramjet-App](https://github.com/MercuryWorkshop/Scramjet-App). Original project credits and AGPL license are preserved in `LICENSE` and `public/credits.html`.

The Node.js/Wisp networking backend is maintained separately in [viztrrx/scramjet-backend](https://github.com/viztrrx/scramjet-backend).

## Build

Requires Node.js 20+, pnpm (packageManager: pnpm@10.18.3), and access to Scramjet's declared npm/release dependencies.

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build copies the demo UI from `public/` and dependency-provided frontend assets into `dist/` at their original routes: `/scram/`, `/libcurl/`, and `/baremux/`.

## Link the two deployments

After deploying the separate backend to Railway, edit `public/config.js`:

```js
let _CONFIG = { wispUrl: "wss://YOUR-RAILWAY-DOMAIN/wisp/" };
```

The backend address is intentionally blank until one exists. The frontend will show a configuration message instead of trying to use a nonexistent same-origin Wisp service.

## Cloudflare Workers

A separate Worker, named `scramjet-frontend`, serves the static assets. Connect this GitHub repo using the Cloudflare Workers Builds UI. Use root `./`, build command `pnpm install --frozen-lockfile && pnpm build`, and deploy command `npx wrangler deploy`. No backend server runs in this Worker.

The original frontend and service worker logic are otherwise retained. Check frontend/transport behavior in a deployed browser after linking a backend; that has not been tested live here.

Original upstream: https://github.com/MercuryWorkshop/Scramjet-App
