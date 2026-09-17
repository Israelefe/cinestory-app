# Moving the client and admin to Cloudflare

The API stays on Render. Only the two frontends move, from Vercel to Cloudflare.

The apps are plain Vite + React SPAs, so the port is small: one Vercel function became a
small Worker script, one rewrite rule became a route handler, and the COOP header carried
straight over. Two `server/` changes came with it, both of which the edge depends on.

> **Workers, not Pages.** Cloudflare's dashboard now steers new projects to Workers with
> static assets, and the Pages flow these files were first written against is no longer
> offered in every account. The config here is the Workers shape: a `main` script plus an
> `[assets]` block. `_headers` and `_redirects` are still honoured from the asset
> directory, and `not_found_handling = "single-page-application"` reproduces the Pages SPA
> fallback, so nothing is lost by being on Workers.

## What was added

**Client**

| File | Purpose |
| --- | --- |
| `client/worker/index.js` | Router. Only `/api/*` and `/d/*` reach it |
| `client/worker/apiProxy.js` | Reverse-proxies `/api/*` to Render |
| `client/worker/deliveryShell.js` | Link-preview shell for `/d/:publicId` |
| `client/public/_headers` | The `Cross-Origin-Opener-Policy` header Vercel set on `/(.*)` |
| `client/wrangler.toml` | Project config: `main`, `[assets]`, `run_worker_first` |
| `client/scripts/verify-share-meta.mjs` | Tests the link-preview rewriting against the real `index.html` |

**Admin**

| File | Purpose |
| --- | --- |
| `admin/wrangler.toml` | Assets-only config — no Worker script, since the admin has no dynamic routes |

**Server**

| File | Purpose |
| --- | --- |
| `server/src/middleware/clientIp.middleware.js` | Resolves `req.ip` to the real visitor (see [below](#rate-limiting-and-reqip)) |
| `server/scripts/verify-client-ip.mjs` | Tests that resolution, including the spoofing cases |
| `server/server.js` | Mounts the middleware; allows `*.pages.dev` / `*.workers.dev` origins so preview deploys can log in |

## Dashboard setup

Two separate Workers, both connected to this repo.

### `veylo-client`

| Setting | Value |
| --- | --- |
| Root directory | `client` |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` (the default — leave it) |

Environment variables:

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | Leave **unset**. The production fallback is `/api`, which routes through the Worker. Setting it to the Render URL directly makes every request cross-origin and breaks the auth cookies. |
| `VITE_APP_URL` | `https://veylo.com.ng` |
| `VITE_TURNSTILE_SITE_KEY` | From the Turnstile dashboard |
| `VITE_GOOGLE_CLIENT_ID` | Must list the production origin as an authorised JS origin |
| `VEYLO_EDGE_KEY` | Same value as Render's — see [Rate limiting](#rate-limiting-and-reqip) |
| `VEYLO_API_ORIGIN` | `https://veylo-api-ptk3.onrender.com` |
| `VEYLO_WEB_ORIGIN` | `https://veylo.com.ng` |

`VEYLO_*` variables are read at **request time** from `env`, not inlined at build time like
the `VITE_*` ones. Changing them needs no rebuild.

### `veylo-admin`

| Setting | Value |
| --- | --- |
| Root directory | `admin` |
| Build command | `npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| `VITE_API_URL` | Whatever the Vercel admin project uses today. The admin has no `/api` proxy — `admin/vercel.json` never had one — so it talks to Render directly, as before. |

Both `wrangler.toml` files pin a `name`. Change it if you create the projects under
different names, or the deploy will target the wrong Worker.

## How routes resolve

`assets.run_worker_first = ["/api", "/api/*", "/d/*"]` sends only those paths to the
Worker. Everything else is served by the asset layer, so a page view or an image costs no
Worker invocation at all.

| Route | Handled by |
| --- | --- |
| `/api/*` | `worker/index.js` → `worker/apiProxy.js` → `https://veylo-api-ptk3.onrender.com/api/*` |
| `/d/:publicId` | `worker/index.js` → `worker/deliveryShell.js` → `index.html` with the delivery's OG tags swapped in |
| everything else | Static assets, falling back to `index.html` via `not_found_handling = "single-page-application"` |

The SPA fallback is a config value now, not a `_redirects` file, so there is no catch-all
rule that could shadow the Worker's routes. If you ever need to add redirects, put a
`_redirects` file in `client/public/` and it will be honoured from `dist`.

## Verifying before you cut over

Everything below runs against the `*.workers.dev` URL, so DNS is untouched until you are
happy.

- [ ] `node scripts/verify-share-meta.mjs` — 20 checks over the OG rewriting. Runs in plain Node, no Cloudflare account needed.
- [ ] `npm run verify:client-ip` in `server/` — 8 checks over client IP resolution, including the spoofing cases.
- [ ] Deep link: open `/dashboard` directly and reload. It must render the app, not 404.
- [ ] Proxy: `curl -i <worker-url>/api/health` returns the API's health JSON, not HTML.
- [ ] Link preview: open a real `/d/<publicId>`, **view source**, and confirm `og:title`, `og:description`, `og:image` and `og:url` are the delivery's, not Veylo's defaults.
- [ ] Auth cookies: sign in, reload. `withCredentials: true` only works because `/api/*` is same-origin — if the session drops, check that `Set-Cookie` survived the proxy intact (the handler returns the upstream response untouched precisely so repeated `Set-Cookie` headers are not collapsed).
- [ ] Downloads: request a photo download and confirm the browser still receives the 3xx to the signed Cloudinary URL (the proxy sets `redirect: 'manual'` for this).
- [ ] Google sign-in: the popup must complete. `public/_headers` carries the COOP value, and the `/d/:publicId` route sets it too so it applies on delivery links.
- [ ] Sign in from the `*.workers.dev` URL itself. That origin is only permitted because of the `workers.dev` rule in `isAllowedOrigin`; without it, preview deploys fail CORS at login with a 403.

Local development with the Worker wired up exactly as production:

```bash
cd client && npm run build && npx wrangler dev
```

## Domain and DNS

Keep the existing hostnames. If `veylo.com.ng` is already on Cloudflare DNS, adding a
custom domain is a CNAME and nothing else changes — Google OAuth authorised origins, and
Render's `CLIENT_URL`, `ADMIN_URL` and `ALLOWED_ORIGINS`, all stay valid. Moving DNS from
elsewhere means changing nameservers, which is the only slow part.

Because the hostnames don't change, no server-side configuration needs touching.

## Things worth knowing

**Worker invocations are now the metered thing.** Static hosting is free and unmetered, and
because `run_worker_first` is scoped to two route patterns, page views and image loads cost
no invocation. Only `/api/*` and `/d/*` do — the free plan is 100k/day, $5/mo for 10M.
Uploads never touch the Worker: they go straight from the browser to `api.cloudinary.com`
(`client/src/utils/storageUpload.js:16`).

**`/d/:publicId` responses are edge-cached for 300s** via the Cache API, standing in for the
`s-maxage` the original Vercel function asked for (Cloudflare doesn't apply `s-maxage` to a
Worker response on its own). Cached per public ID, and the body is identical for every
visitor — the PIN token lives in `sessionStorage` on the client, so nothing user-specific is
cached.

### Rate limiting and `req.ip`

`server/server.js` sets `trust proxy: 1`, which makes express resolve `req.ip` to the
**rightmost** `X-Forwarded-For` entry — the hop that just connected to the app. Measured,
not assumed:

| `X-Forwarded-For` | `req.ip` resolves to |
| --- | --- |
| `203.0.113.9` | `203.0.113.9` |
| `203.0.113.9, 198.51.100.7` | `198.51.100.7` ← rightmost |
| `9.9.9.9, 203.0.113.9, 198.51.100.7` | `198.51.100.7` |

In the `visitor -> Cloudflare -> Render -> app` chain the rightmost entry is Cloudflare's
egress IP, so every visitor collapsed into one `express-rate-limit` bucket. Beyond rate
limiting, the same wrong address was handed to the Turnstile check
(`src/controllers/auth.controller.js`) and written into every session's audit record
(`src/utils/auth.js`).

This was already true on Vercel — identical two-hop shape — so the move didn't cause it,
but the port is where it surfaced.

**The fix, now in place.** `worker/apiProxy.js` sends `X-Veylo-Client-IP` (taken from
Cloudflare's own `cf-connecting-ip`) alongside `X-Veylo-Edge-Key`, and
`server/src/middleware/clientIp.middleware.js` rewrites `X-Forwarded-For` to that single
trusted value when the secret matches. Two properties are load-bearing:

- **The secret is what makes the header trustworthy.** The Render origin is publicly
  reachable, and `isAllowedOrigin` returns `true` for a request with no `Origin` header
  (`server.js`), so a bare `CF-Connecting-IP` lookup would be forgeable just by skipping
  the edge and rotating the header. Guessing a secret is not.
- **It is inert until enabled**, so either side may deploy first. With `VEYLO_EDGE_KEY`
  unset on the server, behaviour is byte-for-byte what it was before.

**To enable it:** Render generates `VEYLO_EDGE_KEY` (declared in `render.yaml`). Copy the
generated value into both Workers' environment variables as `VEYLO_EDGE_KEY`.

The limits this restores, tightest first:

| Limiter | Limit | Guards |
| --- | --- | --- |
| `publicAccessLimit` | 80 / 15 min | Opening a delivery, PIN unlock, **and public portfolio views** |
| `publicMediaLimit` | 700 / hour | Likes, single photo download, download-all |
| `authAttemptLimit` | 30 / 15 min | Sign-in attempts |

A wedding's worth of guests opening one link in a quarter-hour is precisely the load that
exhausts `publicAccessLimit`. It stays at 80, but from now on it means 80 *per guest*
rather than 80 for the whole platform.

## Cleanup

**Done — the client's Vercel files are gone.** `client/vercel.json` and
`client/api/delivery-share.js` were deleted once `veylo.com.ng` was confirmed to be serving
the Worker (identical responses and ETags to the `*.workers.dev` URL, and `max-age=300` on
`/d/*`, which is the Worker's value — the old Vercel function used `s-maxage`).

**Still pending, deliberately.** These depend on the admin moving, and deleting them early
would break the admin while it is still live on Vercel:

| Item | Remove when |
| --- | --- |
| `admin/vercel.json` | The admin is deployed to Cloudflare and verified. It is the SPA catch-all — without it, a hard refresh on any admin route 404s. |
| The `*.vercel.app` branch in `isAllowedOrigin` (`server/server.js`) | Same point. It predates this port and exists so Vercel preview deployments can authenticate; the admin still needs it. |

After the admin is ported:

```bash
git rm admin/vercel.json
```

Then drop the `*.vercel.app` branch. Keep the `*.workers.dev` / `*.pages.dev` rules for as
long as you want preview deploys to work, and remove them when you no longer do.

`render.yaml` needs no change beyond the `VEYLO_EDGE_KEY` already declared there.