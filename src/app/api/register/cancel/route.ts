import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  deleteDoc,
} from 'firebase/firestore';

interface CancelPayload {
  event_id?: string;
  participant_id?: string;
  reason?: string;
}

const DEFAULT_EVENT_ID = 'super-sprint';

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

function normalizeEventId(raw: string | undefined): string {
  const value = (raw || '').toLowerCase().trim();
  const normalized = value
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || DEFAULT_EVENT_ID;
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getServerDb(): Firestore {
  if (cachedDb) return cachedDb;

  const config = getFirebaseConfig();
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase env values for API route: ${missing.join(', ')}`);
  }

  cachedApp = getApps().length > 0 ? getApp() : initializeApp(config);
  cachedDb = getFirestore(cachedApp);
  return cachedDb;
}

async function removeParticipantFromAllWaves(
  db: Firestore,
  eventId: string,
  participantId: string
): Promise<void> {
  const wavesSnap = await getDocs(collection(db, 'events', eventId, 'waves'));
  const deletes: Promise<void>[] = [];

  for (const waveDoc of wavesSnap.docs) {
    deletes.push(deleteDoc(doc(db, 'events', eventId, 'waves', waveDoc.id, 'participants', participantId)));
  }

  await Promise.all(deletes);
}

async function syncCancellationToSheet(args: {
  eventId: string;
  rowNumber: number | null;
}) {
  if ((process.env.GOOGLE_SHEET_SYNC_MODE || '').toLowerCase() === 'pull') {
    return { attempted: false, ok: false, reason: 'pull_mode_enabled' };
  }

  const url = process.env.GOOGLE_SHEET_REVERSE_WEBHOOK_URL;
  if (!url) {
    return { attempted: false, ok: false, reason: 'missing_reverse_webhook_url' };
  }

  const secret = process.env.GOOGLE_SHEET_REVERSE_WEBHOOK_SECRET || '';

  const body = {
    action: 'cancel_registration',
    event_id: args.eventId,
    row_number: args.rowNumber,
    secret,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return {
    attempted: true,
    ok: res.ok,
    status: res.status,
    body: text,
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as CancelPayload;
    const participantId = payload.participant_id
      ? String(payload.participant_id).trim()
      : '';

    if (!participantId) {
      return NextResponse.json({ ok: false, error: 'participant_id is required' }, { status: 400 });
    }

    const eventId = normalizeEventId(payload.event_id);
    const now = new Date().toISOString();

    const db = getServerDb();
    const regRef = doc(db, 'events', eventId, 'registrations', participantId);
    const regSnap = await getDoc(regRef);

    const rowNumber = regSnap.exists() ? Number(regSnap.data().rowNumber || 0) || null : null;

    await setDoc(regRef, {
      participantId,
      registrationStatus: 'Cancelled',
      confirmedWaveTime: null,
      cancellationReason: payload.reason || '',
      updatedAt: now,
      source: 'portal-cancel',
    }, { merge: true });

    await removeParticipantFromAllWaves(db, eventId, participantId);

    await setDoc(doc(db, 'events', eventId, 'cancellationQueue', participantId), {
      participantId,
      rowNumber,
      status: 'pending',
      reason: payload.reason || '',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    const sheetSync = await syncCancellationToSheet({
      eventId,
      rowNumber,
    });

    return NextResponse.json({
      ok: true,
      eventId,
      participantId,
      registrationStatus: 'Cancelled',
      sheetSync,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
