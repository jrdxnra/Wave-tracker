const { initializeFirestore, collection, getDocs } = require('firebase/firestore');
const { initializeApp } = require('firebase/app');

const firebaseConfig = {
  apiKey: "AIzaSyBE-YcNr2OcqOIl7z56xyJXE9WU_fv0PYM",
  authDomain: "wave-tracker-exos.firebaseapp.com",
  projectId: "wave-tracker-exos",
  storageBucket: "wave-tracker-exos.firebasestorage.app",
  messagingSenderId: "502899068851",
  appId: "1:502899068851:web:cf49296aed67d18c2c5e83"
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
