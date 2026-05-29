# Wave Tracker Deployment Guide

## Current Setup

- Firebase project: `wave-tracker-exos`
- Hosting site ID: `wavetracker`
- Public URL: https://wavetracker.web.app
- Alternate Firebase URL: https://wavetracker.firebaseapp.com

## Dev-First Deploy Process

Default deploy now targets DEV preview, not production live.

### 1) Deploy to Dev Preview (Default)

```bash
npm run deploy
```

or

```bash
npm run deploy:dev
```

This deploys to Firebase Hosting preview channel `dev` with an expiration window and does not touch production live hosting.

### 2) Promote to Production (Explicit Gate)

```bash
ALLOW_PROD_DEPLOY=YES npm run deploy:prod
```

Production deploy is blocked unless `ALLOW_PROD_DEPLOY=YES` is set.

## Legacy / Equivalent Direct Command

From the repo root, run:

```bash
firebase deploy --only hosting --project wave-tracker-exos
```

That command deploys directly to production live hosting in `wave-tracker-exos`.

## Equivalent Direct Command

```bash
firebase deploy --only hosting --project wave-tracker-exos
```

## Local Development

```bash
npm run dev
```

The local app runs at `http://localhost:3000` and uses Firebase config from `.env.local`.

## Required Local Env File

If `.env.local` does not exist yet, copy `env.example` to `.env.local`.

## Notes

- The Firebase web app remains `wave-tracker-exos`.
- The Hosting URL was shortened to `wavetracker.web.app`.
- Linking Hosting to the web app does not require any new `initializeApp(...)` code changes.
- Firebase Auth still uses the project auth domain `wave-tracker-exos.firebaseapp.com` for built-in auth handlers and sender identity. That domain is tied to the Firebase project, not the Hosting site URL.
