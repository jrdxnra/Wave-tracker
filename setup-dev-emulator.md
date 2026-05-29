# Development Environment with Firebase Emulator (FREE)

## Option 1: Use Firebase Emulator (Recommended - No Billing Required)

### 1. Start the Emulator
```bash
firebase emulators:start
```

### 2. The emulator will run on:
- **Firestore**: http://localhost:8080
- **Emulator UI**: http://localhost:4000
- **Your app**: http://localhost:3000

### 3. Your local development will use the emulator instead of any Firebase project

## Option 2: Use The Existing Firebase Project

### 1. Create .env.local

Copy the current Firebase web app values into `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyA5DE63qijpREwgRYnqn4e062EmZuZzN4M
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wave-tracker-exos.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=wave-tracker-exos
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=wave-tracker-exos.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=436013164154
NEXT_PUBLIC_FIREBASE_APP_ID=1:436013164154:web:6173d409da8f196ae53dc3
```

### 2. Start the app

```bash
npm run dev
```

### 3. Deploy target

Production Hosting now publishes to `https://wavetracker.web.app`.

## Recommendation: Use Emulator
The emulator is completely free and gives you a local Firebase environment that's completely isolated from production.
