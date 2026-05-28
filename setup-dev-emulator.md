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

## Option 2: Use Development Firebase Project (Requires Billing)

### 1. Create Default Database (No Billing Upgrade Needed)
- Go to: https://console.firebase.google.com/project/wave-tracker-dev/overview
- Click "Firestore Database"
- Click "Create database"
- **Choose "Start in test mode"**
- **Select location** (same as production)
- **This creates the default database without billing upgrade**

### 2. Get Firebase Config
- Project Settings → General → Your apps → Add app → Web app
- Copy the config values

### 3. Create .env.local
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_dev_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wave-tracker-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=wave-tracker-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=wave-tracker-dev.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_dev_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_dev_app_id
```

## Recommendation: Use Emulator
The emulator is completely free and gives you a local Firebase environment that's completely isolated from production.
