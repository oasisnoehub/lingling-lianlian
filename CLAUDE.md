# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A two-person timeline sharing app where Lingling and Lianlian can post moments, view a shared timeline, upload images/videos, and select emotions. Password-protected entry with separate timelines per person.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server (port 5173, proxies API to :3456)
npm run server       # Start Express server with hot-reload (tsx watch)

# Build
npm run build        # Compile server (tsc -p tsconfig.server.json) + build frontend (vite build)

# Production
node dist/server/index.js   # Run compiled server
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
- `server/routes/posts.ts` - CRUD endpoints for posts
- `server/routes/persons.ts` - Person data endpoints
- `server/routes/upload.ts` - Image/video upload via multer

### Key Paths
- `rootDir = join(__dirname, '..', '..')` - Server runs from `dist/server/`, so root is `/app`
- Database: `data/posts.db` (SQLite WAL mode)
- Uploads: `uploads/` directory (served at `/uploads`)
- Frontend build: `dist/` (Vite output)

### API Endpoints
- `GET /api/timeline` - Get all posts with author info
- `GET /api/persons` - Get all persons
- `POST /api/posts` - Create post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/upload/image` - Upload image
- `POST /api/upload/video` - Upload video

## Deployment

See `SOP-DEPLOY.md` for detailed Docker deployment instructions.

Key points:
- Multi-stage Dockerfile builds frontend (Vite) and compiles server (tsc) separately
- Production server serves `dist/` as static files
- Traefik proxy routes `linglian.oasisnoe.com.cn` to container port 3456
- Uses `frappe_network` and `traefik_public` Docker networks
