const { initializeFirestore, collection, getDocs } = require('firebase/firestore');
const { initializeApp } = require('firebase/app');

const firebaseConfig = {
  apiKey: "AIzaSyA5DE63qijpREwgRYnqn4e062EmZuZzN4M",
  authDomain: "wave-tracker-exos.firebaseapp.com",
  projectId: "wave-tracker-exos",
  storageBucket: "wave-tracker-exos.firebasestorage.app",
  messagingSenderId: "436013164154",
  appId: "1:436013164154:web:6173d409da8f196ae53dc3"
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

async function checkData() {
  console.log('🔍 Checking Firebase data...\n');
  
  try {
    const wavesCol = collection(db, 'waves');
    const wavesSnap = await getDocs(wavesCol);
    
    console.log(`📊 Total waves in Firebase: ${wavesSnap.docs.length}\n`);
    
    for (const waveDoc of wavesSnap.docs) {
      const data = waveDoc.data();
      const partsCol = collection(waveDoc.ref, 'participants');
      const partsSnap = await getDocs(partsCol);
      
      console.log(`Wave ID: ${waveDoc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Start Time: ${data.startTime || 'Not set'}`);
      console.log(`  Participants: ${partsSnap.docs.length}`);
      console.log('');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkData();
