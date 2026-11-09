# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A two-person timeline sharing app where Lingling and Lianlian can post moments, view a shared timeline, upload images/videos, and select emotions. Password-protected entry with separate timelines per person.

Passwords are checked by the server, which issues an HMAC-signed bearer token
(30 day lifetime). Every write is authorised from that token, never from the
request body, and a post can only be edited or deleted by its author.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (port 5173, proxies API to :3456)
npm run server       # Start Express server with hot-reload (tsx watch)

# Build (vite first: its emptyOutDir would otherwise delete dist/server)
npm run build

# Production
node dist/server/index.js   # Run compiled server

# Checks
npm run typecheck    # tsc --noEmit on both tsconfigs
npm run smoke        # End-to-end test against the production build
npm run verify       # typecheck + build + smoke
```

## Architecture

### Frontend (React + TypeScript + Vite)
- `src/App.tsx` - React Router with routes: `/` (HomePage) and `/timeline/:personId`
- `src/pages/HomePage.tsx` - Landing page with person selection and password modal
- `src/pages/TimelinePage.tsx` - Timeline view with post input and feed
- `src/components/Timeline.tsx` - Timeline feed with edit/delete functionality
- `src/components/PostInput.tsx` - Input form with emotion selector and media upload
- `src/components/GiftBox.tsx` - Lingling's gift box: the wrapping comes off one
  layer per day and the note with the countdown slides out of the box. The
  server owns the calendar (`progress`, 0..1) and the client owns the picture
  (`TEAR_SPOTS` in `GiftBoxArt`), so the number of tears stays a fact about
  the painting. Only the owner of a box may tear it; the other person may
  tap it to read the countdown
- `src/components/GiftBoxArt.tsx` - The box drawing, as separate layers (body,
  ribbon, lid, wrapping paper, note) so the tear is real movement. The
  wrapping paper comes in two prints: plain (`gift-closed.webp`), the painting
  as it was painted, and sun (`gift-closed-sun.webp`), the same painting with
  the moon and the stars painted out and a golden sun and white clouds painted
  in their place, turned to the pink of the lianlian theme; the sun print is
  Lianlian's box
- `src/api/client.ts` - API client for all backend calls

### Backend (Express + better-sqlite3)
- `server/index.ts` - Main Express server; serves frontend static files in production (`NODE_ENV=production`)
- `server/db.ts` - SQLite database setup with `persons` and `posts` tables
- `server/auth.ts` - Token issue/verify, `requireAuth` middleware, rate limiter
- `server/backup.ts` - Scheduled backup of the DB and uploads; see docs/RESTORE.md
- `server/routes/auth.ts` - `POST /api/auth/login`, `GET /api/auth/me`
- `server/routes/posts.ts` - CRUD endpoints for posts
- `server/routes/persons.ts` - Person data endpoints
- `server/routes/upload.ts` - Image/video upload via multer
- `server/routes/location.ts` - Amap GPS->GCJ02 conversion + reverse geocoding
- `server/routes/gift.ts` - Reading and tearing the gift box
- `server/gift.ts` - How much wrapping is off: the work is done in cycles, one
  per gift date, so the paper is torn the same amount for both people and on
  every device, and a new cycle starts the day after a gift date passes
- `server/dates.ts` - Asia/Shanghai civil-date helpers (a mirror of
  `src/utils/countdown.ts`; the two trees cannot share a module)

### Key Paths
- The built frontend is located by probing for `dist/index.html` around
  `__dirname` and `process.cwd()`, so any build layout works (the image runs
  from `/app/dist/server`)
- Database: `data/posts.db` (SQLite WAL mode)
- Gift progress lives in the same database: `gift_progress` holds the day of
  the first tear and `gift_opens` one row per day the wrapping was torn, so
  the box is the same for both people and on every device
- The gift date lives in two places that cannot share a module: the `GIFTS`
  table in `server/gift.ts`, and the same month and day in
  `src/config/personDates.ts`. A second box is a second entry in both: an id
  in `GIFTS` and a `giftId` in `PERSON_DATES` that names it
- Each box has an owner: the person whose gift it is. Only the owner may tear
  the wrapping (the server refuses with 403), and the owner is the `owner`
  field of the `GIFTS` entry; everybody may read the box and its countdown
- Uploads: `uploads/` directory (served at `/uploads`)
- Frontend build: `dist/` (Vite output)

### API Endpoints
All except `/api/auth/*` require an `Authorization: Bearer <token>` header.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Exchange personId + password for a token |
| `GET /api/auth/me` | The person the current token belongs to |
| `GET /api/timeline` | All posts with author info |
| `GET /api/persons` | All persons |
| `POST /api/posts` | Create post (`author_id` comes from the token) |
| `PUT /api/posts/:id` | Update own post |
| `DELETE /api/posts/:id` | Delete own post (also removes its files) |
| `POST /api/upload/image` | Upload image (MIME-whitelisted) |
| `POST /api/upload/video` | Upload video (MIME-whitelisted) |
| `GET /api/location/reverse` | Amap reverse geocoding |
| `GET /api/gift/:giftId` | State of a gift box (how much wrapping is off) |
| `POST /api/gift/:giftId/open` | Tear the wrapping; one tear per day, and only by the box's owner |
| `GET /api/health` | Unauthenticated liveness probe (Docker HEALTHCHECK) |

### Uploading pictures
The upload runs in two phases, and the user must be able to see both.

- **Compressing** happens in the browser (`browser-image-compression`, target
  1MB / 1920px). The preview appears at once and the button says `压缩中`.
- **Uploading** starts only when the compression is done, then the button shows
  the percentage.
- The compressor runs in a worker whose source the library downloads at
  runtime. It is served from our own origin (`?url` import, `libURL` option)
  because the default is a CDN that is slow or blocked from China.
- The page's CSP must allow the worker: `worker-src 'self' blob:`. Without it
  the browser blocks the worker and the library quietly compresses on the main
  thread instead, which freezes the page on a large picture.
- A picture that cannot be compressed is uploaded as it is, but only up to
  8MB; above that the upload is refused with a message rather than crawling
  up the line.
- HEIC becomes JPEG during the compression, which only works in a browser that
  can decode HEIC (Safari). Elsewhere the original file goes up unchanged.
- The server caps pictures at 20MB and videos at 100MB.

### Required environment variables
See `.env.example`. `AUTH_SECRET`, `PERSON_A_PASSWORD` and
`PERSON_B_PASSWORD` are required — the server refuses logins when a password is
unset rather than falling back to a hard-coded default.

## Deployment

See `SOP-DEPLOY.md` for detailed Docker deployment instructions.

Key points:
- Multi-stage Dockerfile builds frontend (Vite) and compiles server (tsc) separately
- Production server serves `dist/` as static files
- Traefik proxy routes `linglian.oasisnoe.com.cn` to container port 3456
- Uses `frappe_network` and `traefik_public` Docker networks

## Reverse proxy, DNS and certificates

Traefik v2.10 runs on the origin host (39.108.89.255) in `/appdata/traefik/`:
`docker-compose.yml`, `traefik.yml` (static: entrypoints, providers, ACME resolver)
and `dyn.yml` (dynamic: routers, services, middlewares, TLS certificates). The
dashboard/API is on host port 8082.

### Cloudflare and the DNS layout
- `linglian.oasisnoe.com.cn` is **DNS only (grey cloud)**: the browser talks
  straight to 39.108.89.255. Cloudflare is not in the data path for it.
- Every other hostname stays **proxied (orange cloud)** and is served through
  Cloudflare. This was a deliberate decision, not an oversight.
- Why grey cloud for the app people actually use: Cloudflare is an anycast
  network, so a client is handed to the *nearest* Cloudflare edge POP, and the
  free plan has no mainland-China POP. Chinese traffic therefore lands on
  Hong Kong / Tokyo / San Jose / Los Angeles and every request makes a round
  trip out of the country and back. Measured on this app: TTFB 1.2-5.8s
  through Cloudflare vs 0.24s direct, and a 1MB upload 3.40s vs 0.39s.
- A POP ("point of presence") is one of Cloudflare's edge data centres. The
  routing to it is BGP-based anycast and **cannot be pinned to a region**;
  Argo only improves edge-to-origin, never client-to-edge. A mainland CDN
  would need ICP filing, and Cloudflare China Network is Enterprise-only. So
  "route to the nearest node" is not a setting that exists -- grey cloud is
  the only lever.
- The trade-off of grey cloud: no DDoS protection, no WAF, no CDN cache, and
  the origin IP is public. For this app the cache was worthless anyway (the
  timeline is password protected and per-user).

### Certificates
- Certificates are issued and renewed by **Traefik's built-in ACME**:
  `certificatesResolvers.letsencrypt` in `traefik.yml`, HTTP-01 on the `http`
  entrypoint, storage `/certs/acme.json`. The `lingling-https@file` router
  references it with `certResolver: letsencrypt` and `priority: 100`.
- Do not reintroduce an acme.sh webroot setup here; that one was removed.
- A statically installed certificate in `tls.certificates` will win over the
  resolver and stop ACME from ever being triggered -- that is why the linglian
  certificate is *not* also listed there.
- `stores.default.defaultCertificate` is a global fallback: it is presented
  for **any** SNI, including hostnames whose certificate it does not cover.
  Certs without an explicit `stores: [default]` are not used for name
  matching. Use a `certResolver` when a hostname needs its own certificate.
- A router carrying `tls: {}` cannot be attached to a non-TLS entrypoint, so
  the http-to-https redirect for a host needs a *separate* router without
  `tls` (see `lingling-http`).

### Operating rules for Traefik
- **Never send SIGHUP.** In Traefik v2 it is a *shutdown* signal; the
  container exits. Use `docker restart` or `docker-compose up -d --force-recreate`.
- **Editing `dyn.yml` does not hot reload.** The file provider is configured
  with `--providers.file.filename` (using `--providers.file.directory` against
  a file means it never watches at all), and even then an upload that
  replaces the file breaks the watch. Always finish with:
  `cd /appdata/traefik && docker-compose up -d --force-recreate`.
- A `file://` load-balancer URL returns 500 in v2.10. To expose a local
  directory, serve it with a plain HTTP server and point the service at it.
- Routers from the docker provider and from `dyn.yml` both exist for the same
  hosts; the file router wins on the higher `priority`.

## Diagnosing slow requests

Measure before changing anything, and split the time into its parts -- client
to edge, edge to origin, and client-side work:

```bash
dig +short linglian.oasisnoe.com.cn A     # is a Cloudflare IP in the way?
curl -so /dev/null -w 'ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
  https://linglian.oasisnoe.com.cn/api/health
```

Compare the same hostname under grey and orange cloud rather than comparing
two different hostnames. Two traps worth remembering: a certificate whose SAN
does not match the hostname makes `curl` report a TLS error that looks like a
connectivity failure, and `tcpdump` is what settles who is at fault when a
Cloudflare-proxied host returns 525.

Two known client-side costs of uploading a photo (not yet changed):
`browser-image-compression` takes roughly 0.6-0.8s on a 4032x3024 JPEG before
any network transfer, with no progress shown meanwhile, and if compression
throws, the code falls back to uploading the *original* file -- up to the
server's 100MB limit, which is what an iPhone HEIC photo hits.

