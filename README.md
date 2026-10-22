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

## Saved sessions (stay signed in)

The **Your sessions** list on `saints://home` keeps people signed in to sites they use through the proxy, the way Rammerhead's session IDs do, without anyone typing an ID or password:

- A session is a snapshot of Scramjet's cookie jar plus each proxied site's localStorage. The page code is in `public/sessions.js` and the Worker API in `src/sessions.js`.
- Sessions belong to the **Saints account**. The Saints console (`script.js` in `viztrrx/work-service`) posts the signed-in user and token to this page. Every `/sessions` request carries that token, and the Worker asks `https://donnajbe.viztrrx.workers.dev/auth/me` which account it belongs to. A request only ever sees that account's sessions.
- **Resume** closes every tab, loads that session's cookies and storage, and the sites you open next are signed in. The active session is saved again every 30 seconds while something has changed, when you go back to `saints://home`, and when the tab is hidden.
- When a different account signs in on the same device, the last person's sign-ins are cleared from the browser. They stay saved in that person's session.
- `public/sw.js` also keeps the cookie jar across service worker restarts. Scramjet 1.1 didn't, so proxied sign-ins used to vanish when the browser stopped an idle worker.

Storage: the `SESSIONS` binding in `wrangler.jsonc` points at the R2 bucket **`donnajbe-eaglercraft-client`**, the same bucket the donnajbe Worker uses (R2 buckets belong to the Cloudflare account, so both Workers can bind it). Objects are written under `proxy-sessions/<sha256(account)>/<id>.json`, apart from `chat-media/`, `eaglercraft-client/` and `music/`. Limits: 20 sessions per account, 5 MB per session. Set the optional `AUTH_BASE` variable to point the sign-in check at another Worker.

> The bucket has **public access enabled**. Session objects hold sign-in cookies, and anyone who learns an object's full key can download it through the public URL. The keys contain a random 128-bit ID and are never shown to anyone but their owner, but a private bucket is safer. To use one, create it and change `bucket_name` above.
