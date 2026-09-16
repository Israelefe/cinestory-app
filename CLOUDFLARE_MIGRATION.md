# Moving the client and admin to Cloudflare Pages

The API stays on Render. Only the two frontends move, from Vercel to Cloudflare Pages.

The apps are plain Vite + React SPAs, so the port is small: one Vercel function was
rewritten as a Pages Function, one rewrite rule became a proxy Function, and a header
became a `_headers` file.

Two small `server/` changes came with it, both of which the edge depends on: a
`*.pages.dev` CORS allowance so preview deploys can authenticate, and a client-IP fix so
the API stops resolving every visitor to Cloudflare's egress IP. See
[Rate limiting and `req.ip`](#rate-limiting-and-reqip).

## What was added

**Client**

| File | Purpose |
| --- | --- |
| `client/functions/api/[[path]].js` | Reverse-proxies `/api/*` to Render (replaces the `rewrites` entry in `vercel.json`) |
| `client/functions/d/[publicId].js` | Link-preview shell for `/d/:publicId` (port of `client/api/delivery-share.js`) |
| `client/public/_headers` | The `Cross-Origin-Opener-Policy` header Vercel set on `/(.*)` |
| `client/wrangler.toml` | Pages project config + local dev |
| `client/scripts/verify-share-meta.mjs` | Tests the link-preview rewriting against the real `index.html` |

**Admin**

| File | Purpose |
| --- | --- |
| `admin/wrangler.toml` | Pages project config + local dev |

**Server**

| File | Purpose |
| --- | --- |
| `server/src/middleware/clientIp.middleware.js` | Resolves `req.ip` to the real visitor for edge traffic (see [below](#rate-limiting-and-reqip)) |
| `server/scripts/verify-client-ip.mjs` | Tests that resolution, including the spoofing cases |
| `server/server.js` | Mounts the middleware; allows `*.pages.dev` origins so preview deploys can log in |

The Vercel configs (`client/vercel.json`, `client/api/`, `admin/vercel.json`) are
deliberately left in place so the current deployment keeps serving during cutover.
Delete them once Cloudflare is verified — see [Cleanup](#cleanup).

## Dashboard setup

Two separate Pages projects, both connected to this repo.

### `veylo-client`

| Setting | Value |
| --- | --- |
| Root directory | `client` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

Environment variables:

| Variable | Notes |
| --- | --- |
| `VITE_API_URL` | Leave **unset** in production. The production fallback is `/api`, which routes through the proxy Function. Setting it to the Render URL directly would make every request cross-origin and break the auth cookies. |
| `VITE_APP_URL` | `https://veylo.com.ng` |
| `VITE_TURNSTILE_SITE_KEY` | From the Turnstile dashboard |
| `VITE_GOOGLE_CLIENT_ID` | Must list the production origin as an authorised JS origin |
| `VEYLO_API_ORIGIN` | `https://veylo-api-ptk3.onrender.com` (read by the Functions) |
| `VEYLO_WEB_ORIGIN` | `https://veylo.com.ng` (read by the Functions) |

`VEYLO_*` variables are read at **request time** via `context.env`, not inlined at build
time like the `VITE_*` ones. Changing them needs no rebuild.

### `veylo-admin`

| Setting | Value |
| --- | --- |
| Root directory | `admin` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| `VITE_API_URL` | Leave unset for the deployed admin if it is served from the same origin; otherwise the Render URL, and update `ALLOWED_ORIGINS` on Render to match. |

Both `wrangler.toml` files pin a `name`. Change it if you create the projects under
different names, or `wrangler pages deploy` will target the wrong project.

## How routes resolve

| Route | Handled by |
| --- | --- |
| `/api/*` | `functions/api/[[path]].js` → `https://veylo-api-ptk3.onrender.com/api/*` |
| `/d/:publicId` | `functions/d/[publicId].js` → `index.html` with the delivery's OG tags swapped in |
| everything else | Static assets in `dist`, falling back to `index.html` for unmatched paths |

There is intentionally **no `_redirects` file**. SPA fallback is the documented Pages
default — "Pages' default single-page application behavior matches all incoming paths to
the root (`/`)" — and it applies here because the project has no top-level `404.html`. So
there is nothing to configure, and a `/* /index.html 200` catch-all would buy nothing
while risking a shadow over the Functions. Don't add one.

## Verifying before you cut over

Everything below runs against `*.pages.dev`, so DNS is untouched until you are happy.

```bash
cd client && npm run build && npx wrangler pages dev
```

- [ ] `node scripts/verify-share-meta.mjs` — 20 checks over the OG rewriting. Runs in plain Node, no Cloudflare account needed.
- [ ] Deep link: open `/dashboard` directly and reload. It must render the app, not 404.
- [ ] Proxy: `curl -i localhost:8788/api/health` returns the API's health JSON, not HTML.
- [ ] Link preview: open a real `/d/<publicId>` in the dev server, **view source**, and confirm `og:title`, `og:description`, `og:image` and `og:url` are the delivery's, not Veylo's defaults.
- [ ] Auth cookies: sign in, reload. `withCredentials: true` only works because `/api/*` is same-origin — if the session drops, check that `Set-Cookie` survived the proxy intact (the function returns the upstream response untouched precisely so repeated `Set-Cookie` headers are not collapsed).
- [ ] Downloads: request a photo download and confirm the browser still receives the 3xx to the signed Cloudinary URL (the proxy sets `redirect: 'manual'` for this).
- [ ] Google sign-in: the popup must complete. `_headers` carries the COOP value it needs, and the `/d/:publicId` function sets it too so it applies on delivery links.
- [ ] Sign in from the `*.pages.dev` URL itself. That origin is only permitted because of the `pages.dev` rule added to `isAllowedOrigin`; without it, preview deploys pass CORS on nothing and login fails with a 403.

## Domain and DNS

Keep the existing hostnames. If `veylo.com.ng` is already on Cloudflare DNS, adding a
Pages custom domain is a CNAME and nothing else changes — Google OAuth authorised
origins, and Render's `CLIENT_URL`, `ADMIN_URL` and `ALLOWED_ORIGINS`, all stay valid.
Moving DNS from elsewhere means changing nameservers, which is the only slow part.

Because the hostnames don't change, no server-side configuration needs touching.

## Things worth knowing

**Every API call is now a Function invocation.** The static hosting is unmetered, but
`/api/*` requests pass through `functions/api/[[path]].js`, so they count against the
Workers/Pages request allowance (100k/day on the free plan, $5/mo for 10M on paid). Worth
checking against real API volume if the app polls. Uploads are unaffected — they go
straight from the browser to `api.cloudinary.com` (`client/src/utils/storageUpload.js:16`),
never through the proxy, so the 25 MiB Pages request-body limit doesn't come into play.

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

**The fix, now in place.** `functions/api/[[path]].js` sends `X-Veylo-Client-IP` (taken
from Cloudflare's own `cf-connecting-ip`) alongside `X-Veylo-Edge-Key`, and
`server/src/middleware/clientIp.middleware.js` rewrites `X-Forwarded-For` to that single
trusted value when the secret matches. Two properties are load-bearing:

- **The secret is what makes the header trustworthy.** The Render origin is publicly
  reachable, and `isAllowedOrigin` returns `true` for a request with no `Origin` header
  (`server.js`), so a bare `CF-Connecting-IP` lookup would be forgeable just by skipping
  the edge and rotating the header. Guessing a secret is not.
- **It is inert until enabled**, so either side may deploy first. With `VEYLO_EDGE_KEY`
  unset on the server, behaviour is byte-for-byte what it was before.

**To enable it:** Render generates `VEYLO_EDGE_KEY` (declared in `render.yaml`). Copy the
generated value into both Pages projects' environment variables as `VEYLO_EDGE_KEY`.

The limits this restores, tightest first:

| Limiter | Limit | Guards |
| --- | --- | --- |
| `publicAccessLimit` | 80 / 15 min | Opening a delivery, PIN unlock, **and public portfolio views** |
| `publicMediaLimit` | 700 / hour | Likes, single photo download, download-all |
| `authAttemptLimit` | 30 / 15 min | Sign-in attempts |

A wedding's worth of guests opening one link in a quarter-hour is precisely the load that
exhausts `publicAccessLimit`. It stays at 80, but from now on it means 80 *per guest*
rather than 80 for the whole platform.

`node scripts/verify-client-ip.mjs` covers the chain — including that a forged secret and
a spoofed `X-Forwarded-For` both fail to win.

**`/d/:publicId` responses are edge-cached for 300s** via the Cache API, standing in for
the `s-maxage` the Vercel function asked for (Cloudflare doesn't apply `s-maxage` to a
Function response on its own). Cached per public ID, and the body is identical for every
visitor — the PIN token lives in `sessionStorage` on the client, so nothing user-specific
is cached.

## Cleanup

Once the Cloudflare deployment is verified:

```bash
git rm client/vercel.json client/api/delivery-share.js admin/vercel.json
```

Then drop the now-dead `*.vercel.app` branch from `isAllowedOrigin` in `server/server.js`.
Leave the `*.pages.dev` rule in place for as long as you want preview deploys to work, and
remove it when you no longer do.

`render.yaml` needs no change beyond the `VEYLO_EDGE_KEY` already declared there.