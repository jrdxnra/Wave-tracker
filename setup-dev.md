# Development Environment Setup

## To prevent local development from affecting the live site:

### 1. Create Development Firebase Project
- Go to: https://console.firebase.google.com/project/wave-tracker-dev/overview
- Enable Firestore Database
- Set up Firestore rules (copy from production)

### 2. Get Development Firebase Config
- In the Firebase console, go to Project Settings → General
- Scroll down to "Your apps" section
- Click "Add app" → Web app
- Copy the config values

### 3. Create .env.local file
Create a file called `.env.local` in the project root with:

```
# Development Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_dev_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wave-tracker-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=wave-tracker-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=wave-tracker-dev.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_dev_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_dev_app_id
```

### 4. Test Development Environment
- Run `npm run dev`
- Check browser console for Firebase connection
- Verify it connects to wave-tracker-dev project

### 5. Deploy to Production
- Use `firebase deploy` (uses production project)
- Local development uses development project

## Current Status:
- ✅ Development Firebase project created: wave-tracker-dev
- ✅ Environment variables configured in code
- ⏳ Need to enable Firestore in development project
- ⏳ Need to create .env.local file with dev config
