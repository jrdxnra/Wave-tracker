import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  collection,
  getDocs,
  query,
  where,
  limit,
  doc,
  setDoc,
} from 'firebase/firestore';

const DEFAULT_EVENT_ID = 'super-sprint-registration-2026-test';

interface AckPayload {
  event_id?: string;
  secret?: string;
  ack_ids?: string[];
}

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

function isAuthorized(secret: string | null): boolean {
  const configured = process.env.GOOGLE_SHEET_PULL_SYNC_SECRET || process.env.GOOGLE_SHEET_REVERSE_WEBHOOK_SECRET || '';
  if (!configured) return true;
  return secret === configured;
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get('secret');
    if (!isAuthorized(secret)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = normalizeEventId(req.nextUrl.searchParams.get('event_id') || undefined);
    const db = getServerDb();

    const q = query(
      collection(db, 'events', eventId, 'cancellationQueue'),
      where('status', '==', 'pending'),
      limit(100)
    );

    const snap = await getDocs(q);
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        row_number: data.rowNumber || null,
        reason: data.reason || '',
        created_at: data.createdAt || null,
      };
    });

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AckPayload;
    if (!isAuthorized(body.secret || null)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const eventId = normalizeEventId(body.event_id);
    const ackIds = Array.isArray(body.ack_ids) ? body.ack_ids.filter(Boolean) : [];

    const db = getServerDb();
    const now = new Date().toISOString();

    await Promise.all(
      ackIds.map((id) =>
        setDoc(
          doc(db, 'events', eventId, 'cancellationQueue', id),
          {
            status: 'processed',
            processedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      )
    );

    return NextResponse.json({ ok: true, processed: ackIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
