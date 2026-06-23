const { initializeApp, getApps, getApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
} = require('firebase/firestore');

const DEFAULT_EVENT_ID = 'super-sprint';

function getArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA5DE63qijpREwgRYnqn4e062EmZuZzN4M',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'wave-tracker-exos.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'wave-tracker-exos',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'wave-tracker-exos.firebasestorage.app',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '436013164154',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:436013164154:web:6173d409da8f196ae53dc3',
  };
}

function isClearlyMalformedName(name) {
  if (!name) return true;

  const value = String(name).trim();
  if (!value) return true;

  // Shifted paste signature observed in this incident.
  if (/\b1899\b/.test(value)) return true;
  if (/\bGMT[+-]\d{4}\b/i.test(value) && /^(sun|mon|tue|wed|thu|fri|sat)\b/i.test(value)) return true;

  return false;
}

function isMalformedRegistration(registration) {
  const name = registration.name;
  return isClearlyMalformedName(name);
}

async function main() {
  const eventId = getArgValue('--event') || DEFAULT_EVENT_ID;
  const apply = hasFlag('--apply');

  const app = getApps().length ? getApp() : initializeApp(getFirebaseConfig());
  const db = getFirestore(app);

  const registrationsRef = collection(db, 'events', eventId, 'registrations');
  const registrationsSnap = await getDocs(registrationsRef);

  const bad = registrationsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .filter(isMalformedRegistration);

  console.log(`Scanned registrations: ${registrationsSnap.size}`);
  console.log(`Malformed candidates: ${bad.length}`);

  if (bad.length > 0) {
    console.log('Candidates:');
    for (const item of bad) {
      console.log(`- ${item.id} | row=${item.rowNumber || 'n/a'} | name=${JSON.stringify(item.name || '')}`);
    }
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to delete these records.');
    return;
  }

  const wavesSnap = await getDocs(collection(db, 'events', eventId, 'waves'));
  const waveIds = wavesSnap.docs.map((d) => d.id);

  let deletedRegistrations = 0;
  let deletedCancellations = 0;
  let deletedWaveParticipants = 0;

  for (const item of bad) {
    const participantId = item.id;

    for (const waveId of waveIds) {
      await deleteDoc(doc(db, 'events', eventId, 'waves', waveId, 'participants', participantId));
      deletedWaveParticipants += 1;
    }

    await deleteDoc(doc(db, 'events', eventId, 'cancellationQueue', participantId));
    deletedCancellations += 1;

    await deleteDoc(doc(db, 'events', eventId, 'registrations', participantId));
    deletedRegistrations += 1;
  }

  console.log('Cleanup complete:');
  console.log(`- Deleted registrations: ${deletedRegistrations}`);
  console.log(`- Deleted cancellationQueue docs: ${deletedCancellations}`);
  console.log(`- Delete attempts for wave participants: ${deletedWaveParticipants}`);
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
