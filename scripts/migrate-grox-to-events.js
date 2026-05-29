// Migration script: Move G-ROX data from legacy root collections to /events/g-rox/
// Usage: node scripts/migrate-grox-to-events.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore();

async function migrateWaves() {
  const srcCol = db.collection('waves');
  const destCol = db.collection('events').doc('g-rox').collection('waves');
  const wavesSnap = await srcCol.get();
  for (const waveDoc of wavesSnap.docs) {
    const waveData = waveDoc.data();
    await destCol.doc(waveDoc.id).set(waveData);
    // Copy participants subcollection
    const participantsSnap = await waveDoc.ref.collection('participants').get();
    for (const partDoc of participantsSnap.docs) {
      await destCol.doc(waveDoc.id).collection('participants').doc(partDoc.id).set(partDoc.data());
    }
    console.log(`Migrated wave ${waveDoc.id}`);
  }
}

async function migrateConfig() {
  const srcDoc = db.collection('config').doc('global');
  const destDoc = db.collection('events').doc('g-rox').collection('config').doc('global');
  const configSnap = await srcDoc.get();
  if (configSnap.exists) {
    await destDoc.set(configSnap.data());
    console.log('Migrated config/global');
  }
}

async function main() {
  await migrateWaves();
  await migrateConfig();
  console.log('Migration complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
