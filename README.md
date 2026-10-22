# Frontend (viztrrx/frontend) — Scramjet on Cloudflare Workers

This is the frontend-only deployment of the Scramjet demo, based on [MercuryWorkshop/Scramjet-App](https://github.com/MercuryWorkshop/Scramjet-App). The project retains its upstream credits and AGPL license in `public/credits.html` and `LICENSE`.

The networking/Wisp backend is maintained in [viztrrx/scramjet-backend](https://github.com/viztrrx/scramjet-backend); it is not hosted inside this Cloudflare Worker.

## Repository rename and Cloudflare Worker identity

- GitHub repository: **`viztrrx/frontend`** (formerly `viztrrx/scramjet-frontend`)
- Default/production branch: **`main`**
- Cloudflare **Worker name: `frontend`**, matching `wrangler.jsonc` (`"name": "frontend"`)
- npm package name: **`frontend`**

The GitHub repository name and Worker name are separate. Cloudflare Workers Builds requires the *existing Cloudflare Worker selected in the dashboard* to have the same name as `wrangler.jsonc`. If the existing Worker is still named `scramjet-frontend`, you must connect the **`frontend` Worker** (or rename/recreate your Worker) to use this configuration. Renaming a GitHub repository does **not** automatically rename a Cloudflare Worker or update its Git integration.

In the Cloudflare dashboard, go to **Workers & Pages → frontend → Settings → Builds** and confirm the connected Git repository is **`viztrrx/frontend`** on **`main`**. If it still points at the old repository, use **Manage** to update/reconnect the Git integration. You cannot change that Git connection with repository files.

## Build

Use **Node.js 22** (Node.js 20+ is supported by the project) and **pnpm 10.18.3**.

```sh
pnpm install --frozen-lockfile
pnpm build
```

The build creates `dist/` containing the public app and the dependency-provided `/scram/`, `/libcurl/`, and `/baremux/` assets. `wrangler.jsonc` deploys `src/index.js` and serves those assets through the `ASSETS` binding. Neither `dist/` nor `node_modules/` should be committed.

## Cloudflare Workers Builds settings

| Setting | Value |
| --- | --- |
| Git repository | `viztrrx/frontend` |
| Production branch | `main` |
| Root directory | `./` (repository root) |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Worker name | `frontend` |
| Static asset directory | `./dist` (already specified in `wrangler.jsonc`) |

Cloudflare normally installs dependencies before running the build command. If your configured build environment skips that step, use `pnpm install --frozen-lockfile && pnpm build` as the build command instead. Do not set `public/` as the output directory: `dist/` is populated by the build script.

The GitHub Actions workflow performs frontend regression tests, builds the assets, and runs `wrangler deploy --dry-run` to catch configuration and packaging failures without publishing a Worker.

## Connect the separate backend

The Wisp WebSocket URL is configured in `public/config.js`, currently pointing at the Render backend. For a different backend, set `_CONFIG.wispUrl` to its actual HTTPS/WSS endpoint, then rebuild and redeploy the frontend.

```js
let _CONFIG = { wispUrl: "wss://YOUR-BACKEND-DOMAIN/wisp/" };
```

Renaming this GitHub repository should not change the service worker routes or the Wisp backend URL. Verify browser connectivity after deploying; passing a build or dry run does not establish that the backend or proxied websites are reachable.

Original upstream: https://github.com/MercuryWorkshop/Scramjet-App
