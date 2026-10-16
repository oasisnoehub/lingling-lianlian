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

### Key Paths
- The built frontend is located by probing for `dist/index.html` around
  `__dirname` and `process.cwd()`, so any build layout works (the image runs
  from `/app/dist/server`)
- Database: `data/posts.db` (SQLite WAL mode)
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
| `GET /api/health` | Unauthenticated liveness probe (Docker HEALTHCHECK) |

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
