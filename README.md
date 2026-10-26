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
- Sessions belong to the **Saints account**, and there are two ways to be signed in. Both see the account's one list of sessions, on any device:
  - **From the Saints console** (the proxy tab, in the console or an about:blank tab): the console (`script.js` in `viztrrx/work-service`) posts the signed-in user and token to this page, and every `/sessions` request carries it (`X-GPA-Session`).
  - **On the bare link** (https://frontend.viztrrx.workers.dev opened on its own): `saints://home` shows a sign-in form for the same Saints name and PIN. The PIN is turned into the console's verifier in the browser (it never leaves the device) and checked by the Saints Worker's `/auth/proxy-login`, with the console's lockouts and allowed-users list. Accounts without a school student number are asked for it first, as the console asks. The Saints Worker hands back a **proxy-only token**: it doesn't take the name's one console sign-in, so the console stays signed in, and every other Saints route refuses it. The page passes it to `POST /sessions/auth`, which keeps it in an `HttpOnly; Secure; SameSite=Strict` cookie for `/sessions` only, so no script on this origin (proxied sites run here) can read it. **Sign out** saves the active session, clears this browser's sign-ins and ends the token.
  - The Worker asks the Saints Worker's `/auth/proxy-me` which account a token belongs to (or `/auth/me`, if the Saints Worker is older). A request only ever sees that account's sessions.
- **A session comes first.** Signed in either way, Saints Search only opens sites inside a session: the first site asks you to name a new session (or resume a saved one) and opens once it's active. Not signed in, it browses as before.
- **Each session is labelled** with its name, Active or Paused, when it was created and last used, and the sites it has sign-ins for. **Pause** saves the active session and takes its sign-ins out of this browser until you resume it; nothing is cleared if the save fails.
- **Checking the sign-in:** `/sessions` asks the Saints Worker (`/auth/proxy-me` on donnajbe.viztrrx.workers.dev; the page signs in at the `authUrl` in `public/config.js`). Both Workers are on the same workers.dev subdomain, where Cloudflare refuses Worker-to-Worker fetches (error 1042) unless the caller has the `global_fetch_strictly_public` compatibility flag, so both `wrangler.jsonc` and `wrangler.beta.jsonc` set it. When a sign-in is refused, the message says why (expired, signed in somewhere else); when the Saints Worker can't be reached, it says that instead.
- **Resume** closes every tab, loads that session's cookies and storage, and the sites you open next are signed in. The active session is saved again every 30 seconds while something has changed, when you go back to `saints://home`, and when the tab is hidden.
- When a different account signs in on the same device, the last person's sign-ins are cleared from the browser. They stay saved in that person's session.
- `public/sw.js` also keeps the cookie jar across service worker restarts. Scramjet 1.1 didn't, so proxied sign-ins used to vanish when the browser stopped an idle worker.

Storage: saved sessions hold sign-in cookies, so the `SESSIONS` binding (`wrangler.jsonc` and `wrangler.beta.jsonc`) points at a **private** R2 bucket, **`saints-proxy-sessions`**. Objects are written under `proxy-sessions/<sha256(account)>/<id>.json` (`proxy-sessions-beta/` for the beta). Limits: 20 sessions per account, 5 MB per session. Set the optional `AUTH_BASE` variable to point the sign-in check at another Worker.

Sessions used to be saved in `donnajbe-eaglercraft-client`, the donnajbe Worker's bucket, which has public access. That bucket is bound as `SESSIONS_LEGACY`: the first time an account uses saved sessions, its old ones are copied to the private bucket and deleted from the public one. Create the private bucket once, before deploying (keep it private: don't turn on public access or a custom domain):

```sh
npx wrangler r2 bucket create saints-proxy-sessions
```

## YouTube (via Invidious)

youtube.com's own site is a heavy web-components app that doesn't render through the proxy — the results feed stays blank. So YouTube is opened through **Invidious**, a light, server-rendered YouTube frontend that renders and plays through the proxy. The Invidious server fetches the video from YouTube itself, so YouTube sees the instance's IP, not this backend's.

- `public/youtube.js` maps `youtube.com` / `youtu.be` / `m.youtube.com` URLs (watch, shorts, search, channels, playlists, home) to the configured instance. `index.js` applies it in `openUrl` and `navigateFrame`, so typed addresses, the YouTube app tile and in-app navigation all go through it.
- The instance is the **"YouTube via"** field on `saints://home` (stored in `localStorage` as `sj-yt-instance`). Default is `yewtu.be`; leave it blank to use youtube.com directly.
- **Public instances go down often** (YouTube blocks them). When YouTube stops loading, pick a working instance from the [Invidious list](https://docs.invidious.io/instances/) (or self-host one) and paste it in that field. Self-hosting is the most reliable option.

## Blocked pages

`public/blocked.js` lists what the proxy won't show (AI sites; signing in with Google goes through). `public/index.js` shows a notice in the page area instead, and `public/sw.js` refuses the requests, so links, redirects, pop-ups and scripts can't get around it:

- **AI sites and providers** (ChatGPT, Gemini, Claude, Copilot, Perplexity and many more, plus AI features such as Google's AI Mode). The page is removed and the notice says: *"This AI is unsafe and inaccurate. Please go back to using the AI in the Saints Service interface."* In the console, **Use Saints Service AI** opens Ask AI.

## Speed

- **The backend stays awake.** A cron trigger (`wrangler.jsonc`, every 10 minutes) calls the backend's `/health` (`src/index.js`), so Render's free plan never puts it to sleep and nobody waits for it to wake. The address is read from `wispUrl` in `public/config.js`, so moving the backend only means changing that line. Each ping is logged under **Workers & Pages → frontend → Logs**.
- **Transports.** Pages go through libcurl (`/libcurl/`), the transport proven on iPhone Safari. A browser that can't set libcurl up uses Epoxy (`/epoxy/`, `@mercuryworkshop/epoxy-transport` 2.1.29) instead and keeps it on that device (`sj-transport` in localStorage). When a page fails with a connection error (for example Epoxy's "tls handshake eof" or libcurl's "error code 52"), it's retried once with the other transport before the error is shown.
- **One connection per visit.** The backend check, Scramjet, the service worker and the transport are set up once, when Saints Search finishes loading (with one small request to the backend's `/health` to start the TLS engine). Every site opened after that uses the same connection.
- **Backend region.** For Florida, the backend should be in Render's **Virginia** region. Render can't move a service, so create a new one there, then set its address in `public/config.js`.

## Spotify (Scramjet 2, production)

Spotify only works through Scramjet 2, so production (`frontend`) opens Spotify's sites with Scramjet 2 and every other site with Scramjet 1.1, as before:

- `public/spotify.js` lists Spotify's domains (`spotify.com` and its subdomains, `spotify.link`, `spoti.fi`, `spotify.app.link`, and Spotify's CDNs).
- `pnpm build` also copies Scramjet 2 to `/s2/` (`/s2/scram/`, `/s2/controller/`, `/s2/libcurl/`, `/s2/epoxy/`). The page at `/s2/` (`public/s2/`) runs it with its own service worker, scoped to `/s2/`, so it never touches Scramjet 1.1's `/sw.js`.
- A Spotify address (typed, the Spotify tile, or a link from another site) opens in a tab framing `/s2/`; any other address opens on Scramjet 1.1. Links inside a Spotify tab stay on Scramjet 2, so its sign-in pages keep the same cookies.
- Saved sessions cover both engines: a session stores Scramjet 1.1's cookie jar (`cookies`), Scramjet 2's (`cookies2`, read and written in IndexedDB `__scramjet_controller` by `public/sessions.js`) and proxied sites' localStorage, which both engines keep as `<host>@<key>`. Sessions saved before this have no `cookies2` and resume with Spotify signed out.

The beta build (`SCRAMJET_ENGINE=2`) is Scramjet 2 throughout and has no `/s2/`.

## Scramjet 2 beta (`frontend-beta`)

The same site can be built on **Scramjet 2** (`@mercuryworkshop/scramjet` 2.0.67-alpha.2), the next version of the proxy engine, with many site fixes since 1.1. It runs as a second Worker, **`https://frontend-beta.viztrrx.workers.dev`**, so it can be compared with production before switching. Production is untouched.

- **Build:** `pnpm build:beta` (`SCRAMJET_ENGINE=2`). `scripts/build.mjs` then ships Scramjet 2, its controller, `libcurl-transport` 2 and `epoxy-transport` 3 (installed under the aliases `scramjet2`, `scramjet-controller2`, `libcurl-transport2`, `epoxy-transport3`), uses `public/sw2.js` as `/sw.js`, and loads `public/engine2.js` in place of Scramjet 1.1 and BareMux. `version.json` says `"engine": 2`.
- **How it differs:** Scramjet 2 fetches and rewrites in the page, and the transport (libcurl or Epoxy) runs in the page too; there's no BareMux SharedWorker. `public/engine2.js` gives `index.js` the same controller, frame and BareMux functions it uses with 1.1, blocks `blocked.js` sites and reports navigation status from Scramjet 2's hooks. Scramjet 2 saves its cookie jar itself, so `sw2.js` is small: it routes requests to the page and answers saved-session requests from the jar in IndexedDB.
- **Sessions:** the beta Worker keeps saved sessions under `proxy-sessions-beta/` (`SESSIONS_PREFIX` in `wrangler.beta.jsonc`), apart from production's.
- **Checked:** the Site check runs against both Workers, so their tables can be compared on each run's summary page.

### Set up the beta Worker (once)

In Cloudflare: **Workers & Pages → Create → Import a repository → `viztrrx/frontend`**, then:

| Setting | Value |
| --- | --- |
| Worker name | `frontend-beta` |
| Production branch | `main` |
| Build command | `pnpm build:beta` |
| Deploy command | `npx wrangler deploy --config wrangler.beta.jsonc` |

Every push to `main` then deploys both Workers. To move production to Scramjet 2 later, change the production Worker's build command to `pnpm build:beta` (the Worker name stays `frontend`, set by `wrangler.jsonc`).

## Site check (which sites work, and how fast)

`.github/workflows/site-check.yml` opens about 30 popular sites (`site-check/sites.json`) through the live proxy in headless Chrome every 6 hours, and records for each one whether it showed content, how long that took, and a screenshot.

- **Results:** each run's summary page under **Actions → Site check**, the `site-report-*` artifact (results and screenshots), and the **`site-reports`** branch: `reports/<target>/summary.md` is the latest run, and `history.csv` is every run, for trends.
- **Targets:** `production` (`https://frontend.viztrrx.workers.dev`) and `beta` (`https://frontend-beta.viztrrx.workers.dev`, or the `BETA_URL` repository variable). A target that isn't deployed is skipped.
- **On demand:** **Actions → Site check → Run workflow**. Fill in "only" (for example `youtube,spotify`) to check just those sites; partial runs aren't saved to `site-reports`.
- ✅ shows content (and the expected text, and a playing video for video pages); ⚠️ loaded, but the expected text is missing (consent page, captcha) or the site answered HTTP 4xx/5xx; ❌ error, Scramjet's error page, or nothing after 45 s; ⛔ blocked on purpose (`public/blocked.js`).
- **Run it yourself:** `npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium`, then `PLAYWRIGHT_PATH=/tmp/pw/node_modules/playwright/index.mjs node site-check/run.mjs --url https://frontend.viztrrx.workers.dev`. `--only`, `--transport libcurl|epoxy`, `--timeout` and `--previous` are described at the top of `site-check/run.mjs`.

To test another site, add it to `site-check/sites.json`: `name`, `url`, `expect` (text that only shows when the real page loaded, or `""`), and `"media": true` for pages whose video should start.

## Games (`saints://games`)

The **Games** button on `saints://home` (or typing `saints://games`) opens the games library. A game plays in the page area under the toolbar, at `saints://games/<slug>`, like a site in a tab: Back returns to the library, Reload restarts the game, Home goes to `saints://home`. The three online games (LittleBigSnake, Paper.io at paperio.site, ZombsRoyale.io) open their real site through the proxy instead.

- `public/games/` holds the game files, taken from `static/src/gs/` in [viztrrx/incog-frontend](https://github.com/viztrrx/incog-frontend) (the Incognito games): `public/<game>/`, `ruffle/` (Flash emulator for the Flash games) and `thumbnails/`.
- `public/games/games.json` is the list (title, thumbnail, and `path`, or `url` for online games, or `frame` for a game another site serves), built from Incognito's `gs.json` plus four games it didn't list (BreakLock, Flappy 2048, Hextris, Microsoft Flight Simulator).
- **Eaglercraft** (Minecraft 1.8, in place of Incognito's Minecraft Classic) is the same game frame the Saints console's Eaglercraft tab uses: `https://donnajbe.viztrrx.workers.dev/eagler/?autoPack=1`, with the console's frame permissions and its messages (loading, started, errors; pause and focus). The donnajbe Worker sends `Cross-Origin-Resource-Policy: cross-origin` and `Cross-Origin-Embedder-Policy: require-corp` on that frame so this isolated page can show it.
- The Unity files that incog-frontend kept in Git LFS (Duck Life 1–4, Slope, Drift Hunters) weren't in its LFS storage, so they came from [titaniumnetwork-dev/Incognito-old](https://github.com/titaniumnetwork-dev/Incognito-old), checked against the SHA-256 in each LFS pointer. They're stored as normal files here.
- Cloudflare serves static files up to 25 MiB. The two bigger files are stored as `<file>.part0`, `.part1`, … and `src/index.js` streams them back as one file (`src/game-parts.js` lists them with their size and SHA-256).
