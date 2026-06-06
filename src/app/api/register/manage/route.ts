import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  deleteDoc,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';

type RegistrationStatus = 'Pending' | 'Confirmed' | 'Waitlisted' | 'Cancelled';

type ManageAction = 'auto_allocate' | 'manual_override' | 'waitlist';

interface ManagePayload {
  event_id?: string;
  participant_id?: string;
  action?: ManageAction;
  manual_wave_time?: string;
}

const DEFAULT_EVENT_ID = 'super-sprint-registration-2026-test';

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

function parseTimeToMinutes(label: string): number | null {
  const raw = String(label).trim();
  if (!raw) return null;

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([aApP][mM])$/);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3].toUpperCase();
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

    if (hour === 12) {
      hour = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  return null;
}

function formatMinutesToLabel(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${meridiem}`;
}

function normalizeWaveTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const minutes = parseTimeToMinutes(raw);
  if (minutes === null) return null;
  return formatMinutesToLabel(minutes);
}

function extractTimeMentions(raw: string | undefined): number[] {
  if (!raw) return [];
  const matches = String(raw).match(/\d{1,2}:\d{2}\s*[aApP][mM]/g) || [];
  return matches
    .map(parseTimeToMinutes)
    .filter((value): value is number => value !== null);
}

function extractBlockStartTimes(raw: string | undefined): number[] {
  const all = extractTimeMentions(raw);
  if (all.length <= 1) return all;

  if ((raw || '').includes('-')) {
    return [all[0]];
  }

  return all;
}

function extractExactMinutePreference(...rawValues: Array<string | undefined>): number | null {
  for (const raw of rawValues) {
    if (!raw) continue;
    const match = String(raw).match(/:(00|15|30|45)/);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function applyMinutePreference(baseMinutes: number, preferredMinute: number | null): number {
  if (preferredMinute === null) return baseMinutes;
  const hour = Math.floor(baseMinutes / 60);
  return hour * 60 + preferredMinute;
}

function parseFlexMinutes(raw: string | undefined): number {
  if (!raw) return 0;
  const match = String(raw).match(/(\d{1,3})/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(120, value));
}

function expandCandidates(
  baseMinutes: number[],
  flexMinutes: number,
  allWaveMinutes: number[]
): number[] {
  if (baseMinutes.length === 0) return [];

  const normalizedFlex = Math.floor(flexMinutes / 15) * 15;
  const ordered = [...baseMinutes].sort((a, b) => a - b);
  const candidates: number[] = [];

  for (const base of ordered) {
    if (normalizedFlex <= 0) {
      if (allWaveMinutes.includes(base)) candidates.push(base);
      continue;
    }

    for (let delta = 0; delta <= normalizedFlex; delta += 15) {
      const low = base - delta;
      const high = base + delta;
      if (allWaveMinutes.includes(low)) candidates.push(low);
      if (delta !== 0 && allWaveMinutes.includes(high)) candidates.push(high);
    }
  }

  return Array.from(new Set(candidates));
}

function buildCandidateWaveTimes(regData: Record<string, unknown>, allWaveTimes: string[]): string[] {
  const allWaveMinutes = allWaveTimes
    .map(parseTimeToMinutes)
    .filter((value): value is number => value !== null);

  const firstHour = String(regData.firstPreferenceHour || '');
  const secondHour = String(regData.secondPreferenceHour || '');
  const firstFlexText = String(regData.firstPreferenceFlexibility || '');
  const secondFlexText = String(regData.secondPreferenceFlexibility || '');

  const firstTimes = extractBlockStartTimes(firstHour);
  const secondTimes = extractBlockStartTimes(secondHour);

  const firstFlex = parseFlexMinutes(firstFlexText);
  const secondFlex = parseFlexMinutes(secondFlexText);

  const firstMinutePreference = extractExactMinutePreference(firstFlexText, firstHour);
  const secondMinutePreference = extractExactMinutePreference(secondFlexText, secondHour);

  const firstStrictBases = firstTimes.map((time) => applyMinutePreference(time, firstMinutePreference));
  const secondStrictBases = secondTimes.map((time) => applyMinutePreference(time, secondMinutePreference));

  const firstCandidates = expandCandidates(firstStrictBases, firstFlex, allWaveMinutes).map(formatMinutesToLabel);
  const secondCandidates = expandCandidates(secondStrictBases, secondFlex, allWaveMinutes).map(formatMinutesToLabel);

  return Array.from(new Set([...firstCandidates, ...secondCandidates, ...allWaveTimes]));
}

function waveIdFromTime(label: string): string {
  return `wave-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

async function findWaveByStartTime(
  db: Firestore,
  eventId: string,
  startTime: string
): Promise<QueryDocumentSnapshot<DocumentData> | null> {
  const wavesCol = collection(db, 'events', eventId, 'waves');
  const q = query(wavesCol, where('startTime', '==', startTime), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0];
}

async function getOrCreateWaveId(db: Firestore, eventId: string, startTime: string): Promise<string> {
  const existing = await findWaveByStartTime(db, eventId, startTime);
  if (existing) return existing.id;

  const waveId = waveIdFromTime(startTime);
  await setDoc(doc(db, 'events', eventId, 'waves', waveId), {
    id: waveId,
    name: `Wave ${startTime}`,
    startTime,
    coach: '',
    updatedAt: new Date().toISOString(),
    createdBy: 'manual-ops',
  }, { merge: true });
  return waveId;
}

async function countWaveParticipantsByTime(db: Firestore, eventId: string, startTime: string): Promise<number> {
  const existing = await findWaveByStartTime(db, eventId, startTime);
  if (!existing) return 0;

  const participantsSnap = await getDocs(collection(existing.ref, 'participants'));
  return participantsSnap.size;
}

function buildWaveTimes(startMinutes: number, totalWaves: number, intervalMinutes: number): string[] {
  const times: string[] = [];
  for (let index = 0; index < totalWaves; index += 1) {
    times.push(formatMinutesToLabel(startMinutes + index * intervalMinutes));
  }
  return times;
}

async function getEventWaveConfig(db: Firestore, eventId: string): Promise<{ waveCapacityLimit: number; waveTimes: string[] }> {
  const configRef = doc(db, 'events', eventId, 'config', 'global');
  const configSnap = await getDoc(configRef);
  if (!configSnap.exists()) {
    throw new Error(`Missing event config: events/${eventId}/config/global`);
  }

  const data = configSnap.data();

  const rawCapacity = Number(data.maxParticipants);
  if (!Number.isFinite(rawCapacity)) {
    throw new Error(`Missing or invalid maxParticipants in events/${eventId}/config/global`);
  }

  const waveCapacityLimit = Math.floor(rawCapacity);
  if (waveCapacityLimit < 1) {
    throw new Error(`maxParticipants must be >= 1 in events/${eventId}/config/global`);
  }

  const startTime = String(data?.event?.startTime || '').trim();
  const totalWavesRaw = Number(data?.event?.totalWaves);
  const intervalRaw = Number(data?.timing?.intervalMinutes);

  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) {
    throw new Error(`Missing or invalid event.startTime in events/${eventId}/config/global`);
  }

  const totalWaves = Math.floor(totalWavesRaw);
  if (!Number.isFinite(totalWaves) || totalWaves < 1) {
    throw new Error(`Missing or invalid event.totalWaves in events/${eventId}/config/global`);
  }

  const intervalMinutes = Math.floor(intervalRaw);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    throw new Error(`Missing or invalid timing.intervalMinutes in events/${eventId}/config/global`);
  }

  const waveTimes = buildWaveTimes(startMinutes, totalWaves, intervalMinutes);

  return { waveCapacityLimit, waveTimes };
}

async function chooseAutoWaveTime(
  db: Firestore,
  eventId: string,
  regData: Record<string, unknown>,
  waveCapacityLimit: number,
  waveTimes: string[]
): Promise<string | null> {
  const queue = buildCandidateWaveTimes(regData, waveTimes);

  for (const timeLabel of queue) {
    const count = await countWaveParticipantsByTime(db, eventId, timeLabel);
    if (count < waveCapacityLimit) {
      return timeLabel;
    }
  }

  return null;
}

async function removeParticipantFromAllWaves(
  db: Firestore,
  eventId: string,
  participantId: string,
  keepWaveId: string | null
): Promise<void> {
  const wavesSnap = await getDocs(collection(db, 'events', eventId, 'waves'));
  const deletes: Promise<void>[] = [];

  for (const waveDoc of wavesSnap.docs) {
    if (keepWaveId && waveDoc.id === keepWaveId) continue;
    deletes.push(deleteDoc(doc(db, 'events', eventId, 'waves', waveDoc.id, 'participants', participantId)));
  }

  await Promise.all(deletes);
}

async function assignParticipantToWave(args: {
  db: Firestore;
  eventId: string;
  participantId: string;
  waveTime: string;
  regData: Record<string, unknown>;
  now: string;
}) {
  const linkedWaveId = await getOrCreateWaveId(args.db, args.eventId, args.waveTime);
  await removeParticipantFromAllWaves(args.db, args.eventId, args.participantId, linkedWaveId);

  await setDoc(doc(args.db, 'events', args.eventId, 'waves', linkedWaveId, 'participants', args.participantId), {
    id: args.participantId,
    name: String(args.regData.name || '').trim() || args.participantId,
    waveData: {},
    includeInLeaderboard: args.regData.includeInLeaderboard !== false,
    registrationStatus: 'Confirmed',
    updatedAt: args.now,
    source: 'manual-ops',
  }, { merge: true });

  return linkedWaveId;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as ManagePayload;
    const action = payload.action;
    if (!action) {
      return NextResponse.json({ ok: false, error: 'Action is required' }, { status: 400 });
    }

    const eventId = normalizeEventId(payload.event_id);
    const participantId = payload.participant_id
      ? String(payload.participant_id).trim()
      : '';

    if (!participantId) {
      return NextResponse.json({ ok: false, error: 'participant_id is required' }, { status: 400 });
    }

    const db = getServerDb();
    const now = new Date().toISOString();
    const regRef = doc(db, 'events', eventId, 'registrations', participantId);
    const regSnap = await getDoc(regRef);

    if (!regSnap.exists()) {
      return NextResponse.json({ ok: false, error: 'Registration not found' }, { status: 404 });
    }

    const regData = regSnap.data() as Record<string, unknown>;
    const portalUrl = String(regData.portalUrl || `/portal/${participantId}?event=${eventId}`);

    let status: RegistrationStatus = 'Pending';
    let assignedWave: string | null = null;
    let linkedWaveId: string | null = null;

    const { waveCapacityLimit, waveTimes } = await getEventWaveConfig(db, eventId);

    if (action === 'auto_allocate') {
      const choice = await chooseAutoWaveTime(db, eventId, regData, waveCapacityLimit, waveTimes);

      if (choice) {
        status = 'Confirmed';
        assignedWave = choice;
        linkedWaveId = await assignParticipantToWave({
          db,
          eventId,
          participantId,
          waveTime: choice,
          regData,
          now,
        });
      } else {
        status = 'Waitlisted';
        assignedWave = null;
        await removeParticipantFromAllWaves(db, eventId, participantId, null);
      }
    } else if (action === 'manual_override') {
      const manualWave = normalizeWaveTime(payload.manual_wave_time);
      if (!manualWave) {
        return NextResponse.json({ ok: false, error: 'manual_wave_time is required for manual_override' }, { status: 400 });
      }

      if (!waveTimes.includes(manualWave)) {
        return NextResponse.json({ ok: false, error: 'manual_wave_time is not valid for this event configuration' }, { status: 400 });
      }

      status = 'Confirmed';
      assignedWave = manualWave;
      linkedWaveId = await assignParticipantToWave({
        db,
        eventId,
        participantId,
        waveTime: manualWave,
        regData,
        now,
      });
    } else if (action === 'waitlist') {
      status = 'Waitlisted';
      assignedWave = null;
      await removeParticipantFromAllWaves(db, eventId, participantId, null);
    }

    await setDoc(regRef, {
      participantId,
      registrationStatus: status,
      confirmedWaveTime: assignedWave,
      portalUrl,
      updatedAt: now,
      source: 'manual-ops',
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      eventId,
      participantId,
      action,
      registrationStatus: status,
      assigned_wave: assignedWave,
      linkedWaveId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
