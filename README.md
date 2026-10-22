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

## Blocked pages

`public/blocked.js` lists what the proxy won't show. `public/index.js` shows a notice in the page area instead, and `public/sw.js` refuses the requests, so links, redirects, pop-ups and scripts can't get around it:

- **AI sites and providers** (ChatGPT, Gemini, Claude, Copilot, Perplexity and many more, plus AI features such as Google's AI Mode). The page is removed and the notice says: *"This AI is unsafe and inaccurate. Please go back to using the AI in the Saints Service interface."* In the console, **Use Saints Service AI** opens Ask AI.
- **Signing in with Google**: only the sign-in steps on `accounts.google.com` (sign-in and account-chooser pages, the consent screens behind "Sign in with Google" on any site, the Google sign-in buttons and One Tap, and sign-up). YouTube, Search, Maps, Docs and Google's other sites keep working for people who aren't signed in, including the background account checks they make. The notice covers the site and says: *"This proxy doesn't support signing in with Google. Please go back and sign in a different way."* **Go back** reloads the site's own page so people can use another sign-in option.

## Speed

- **The backend stays awake.** A cron trigger (`wrangler.jsonc`, every 10 minutes) calls the backend's `/health` (`src/index.js`), so Render's free plan never puts it to sleep and nobody waits for it to wake. The address is read from `wispUrl` in `public/config.js`, so moving the backend only means changing that line. Each ping is logged under **Workers & Pages → frontend → Logs**.
- **Transports.** Pages go through libcurl (`/libcurl/`), the transport proven on iPhone Safari. A browser that can't set libcurl up uses Epoxy (`/epoxy/`, `@mercuryworkshop/epoxy-transport` 2.1.28) instead and keeps it on that device (`sj-transport` in localStorage). When a page fails with a connection error (for example Epoxy's "tls handshake eof" or libcurl's "error code 52"), it's retried once with the other transport before the error is shown.
- **One connection per visit.** The backend check, Scramjet, the service worker and the transport are set up once, when Saints Search finishes loading (with one small request to the backend's `/health` to start the TLS engine). Every site opened after that uses the same connection.
- **Backend region.** For Florida, the backend should be in Render's **Virginia** region. Render can't move a service, so create a new one there, then set its address in `public/config.js`.

## Games (`saints://games`)

The **Games** button on `saints://home` (or typing `saints://games`) opens the games library. A game plays in the page area under the toolbar, at `saints://games/<slug>`, like a site in a tab: Back returns to the library, Reload restarts the game, Home goes to `saints://home`. The five online games (1v1.LOL, Justfall.LOL, LittleBigSnake, Paper.io, ZombsRoyale.io) open their real site through the proxy instead.

- `public/games/` holds the game files, taken from `static/src/gs/` in [viztrrx/incog-frontend](https://github.com/viztrrx/incog-frontend) (the Incognito games): `public/<game>/`, `ruffle/` (Flash emulator for the Flash games) and `thumbnails/`.
- `public/games/games.json` is the list (title, thumbnail, and `path` or, for online games, `url`), built from Incognito's `gs.json` plus four games it didn't list (BreakLock, Flappy 2048, Hextris, Microsoft Flight Simulator).
- The Unity files that incog-frontend kept in Git LFS (Duck Life 1–4, Slope, Drift Hunters) weren't in its LFS storage, so they came from [titaniumnetwork-dev/Incognito-old](https://github.com/titaniumnetwork-dev/Incognito-old), checked against the SHA-256 in each LFS pointer. They're stored as normal files here.
- Cloudflare serves static files up to 25 MiB. The two bigger files are stored as `<file>.part0`, `.part1`, … and `src/index.js` streams them back as one file (`src/game-parts.js` lists them with their size and SHA-256).
