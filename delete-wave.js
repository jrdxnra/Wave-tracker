const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, deleteDoc } = require("firebase/firestore");
require("dotenv").config({ path: ".env.local" });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const eventsSnap = await getDocs(collection(db, "events"));
  const candidates = [];
  for (const eventDoc of eventsSnap.docs) {
    const globalSnap = await getDocs(collection(db, "events", eventDoc.id, "config", "global"));
    let hasMatchingSchedule = false;
    globalSnap.forEach(sDoc => {
      const d = sDoc.data();
      if (d.numWaves === 17 && d.startTime === "8:00 AM" && d.intervalMinutes === 15) hasMatchingSchedule = true;
    });
    if (hasMatchingSchedule) {
      const wavesSnap = await getDocs(collection(db, "events", eventDoc.id, "waves"));
      wavesSnap.forEach(wDoc => {
        if (wDoc.id === "wave-12-00-pm" || wDoc.data().startTime === "12:00 PM") {
          candidates.push(wDoc.ref.path);
        }
      });
    }
  }
  if (candidates.length === 1) {
    await deleteDoc(doc(db, candidates[0]));
    console.log("Deleted: " + candidates[0]);
  } else if (candidates.length > 1) {
    console.log("Multiple candidates found. No deletion occurred:");
    candidates.forEach(c => console.log(" - " + c));
  } else {
    console.log("No matching event/wave found.");
  }
}
run().catch(console.error);
