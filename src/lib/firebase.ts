import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredKeys: (keyof typeof firebaseConfig)[] = [
  'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId',
];

function validateFirebaseConfig() {
  const missing = requiredKeys.filter((k) => !firebaseConfig[k]);
  if (missing.length > 0) {
    const vars = missing.map((k) => `NEXT_PUBLIC_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
    throw new Error(
      `Missing required Firebase environment variables: ${vars.join(', ')}. ` +
      'Copy env.example to .env.local and fill in your Firebase project values.'
    );
  }
}

let app: FirebaseApp;
let db: Firestore;

function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android/.test(ua);
  return isSafari;
}

export function getFirebase() {
  if (!app) {
    validateFirebaseConfig();
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
    try {
      const safari = isSafariBrowser();
      db = initializeFirestore(app, safari
        ? {
            // Safari can intermittently hang with default transport settings.
            experimentalForceLongPolling: true,
          }
        : {
            experimentalAutoDetectLongPolling: true,
          }
      );
    } catch {
      db = getFirestore(app);
    }
  }
  return { app, db };
}