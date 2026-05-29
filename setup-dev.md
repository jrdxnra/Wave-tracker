# Local Development Setup

## Current Firebase Setup

- Firebase project: `wave-tracker-exos`
- Firebase web app: `Wave-tracker`
- Hosting site: `wavetracker`
- Public URL: https://wavetracker.web.app

## 1. Create .env.local

Copy `env.example` to `.env.local` in the project root.

## 2. Start the app

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## 3. Firebase config behavior

- The app reads Firebase config from `.env.local`.
- The repo no longer hardcodes Firebase config in source.
- Changing the Hosting site URL did not require a new Firebase web app config.
- The official Firebase SDK config still uses `wave-tracker-exos.firebaseapp.com` as `authDomain`, so built-in Firebase Auth email links may continue to show that domain even though the public site URL is `wavetracker.web.app`.

## 4. Deploy

```bash
npm run deploy
```

That deploys Hosting to project `wave-tracker-exos` and site `wavetracker`.
