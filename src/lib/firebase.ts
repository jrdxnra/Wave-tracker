import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// Production Firebase config - only used when deployed
const firebaseConfig = {
  apiKey: 'AIzaSyA5DE63qijpREwgRYnqn4e062EmZuZzN4M',
  authDomain: 'wave-tracker-exos.firebaseapp.com',
  projectId: 'wave-tracker-exos',
  storageBucket: 'wave-tracker-exos.firebasestorage.app',
  messagingSenderId: '436013164154',
  appId: '1:436013164154:web:6173d409da8f196ae53dc3',
};

let app: FirebaseApp;
let db: Firestore;

export function getFirebase() {
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return { app, db };
}