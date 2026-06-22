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

interface RegistrationPayload {
  event_id?: string;
  source_sheet?: string;
  trigger_source?: string;
  row_number?: number;
  timestamp?: string;
  name?: string;
  first_preference_hour?: string;
  first_preference_flexibility?: string;
  second_preference_hour?: string;
  second_preference_flexibility?: string;
  swim_comfort?: string;
  entry_mode?: string;
  group_name?: string;
  is_first_tri?: boolean;
  ping_group_opt_in?: boolean;
  how_heard?: string;
  is_first_gfit?: boolean;
  volunteer_opt_in?: boolean;
  comments?: string;
  registration_status?: string;
  confirmed_wave_time?: string | null;
  chat_link?: string;
  calendar_invite_sent?: boolean;
  include_in_leaderboard?: boolean;
  volunteer_role?: string;
  internal_notes?: string;
  portal_url?: string;
}

type RegistrationStatus = 'Pending' | 'Confirmed' | 'Waitlisted' | 'Cancelled';
type ProcessingMode = 'auto_allocation' | 'manual_update';

const DEFAULT_EVENT_ID = 'super-sprint';
const DEFAULT_EVENT_NAME = 'Super Sprint';
const DEFAULT_WAVE_TIMES = buildDefaultWaveTimes();

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

function normalizeStatus(raw: string | undefined): RegistrationStatus {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'confirmed') return 'Confirmed';
  if (value === 'waitlisted') return 'Waitlisted';
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled';
  return 'Pending';
}

function normalizeWaveTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const minutes = parseTimeToMinutes(trimmed);
  return minutes === null ? trimmed : formatMinutesToLabel(minutes);
}

function normalizeEntryMode(rawEntryMode: string | undefined, rawGroupName: string | undefined): string {
  const explicit = (rawEntryMode || '').trim();
  if (explicit) return explicit;

  const group = (rawGroupName || '').trim();
  if (!group) return '';

  const firstToken = group.split(',')[0]?.trim().toLowerCase() || '';
  if (firstToken === 'single' || firstToken === 'solo') return 'Single';
  if (firstToken === 'buddy') return 'Buddy';
  if (firstToken === 'group') return 'Group';
  return '';
}

function normalizeGroupName(rawGroupName: string | undefined, rawEntryMode: string | undefined): string {
  const group = (rawGroupName || '').trim();
  if (!group) return '';

  const explicit = (rawEntryMode || '').trim();
  if (explicit) return group;

  const parts = group.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return group;

  const firstToken = parts[0].toLowerCase();
  if (firstToken === 'single' || firstToken === 'solo' || firstToken === 'buddy' || firstToken === 'group') {
    return parts.slice(1).join(', ');
  }

  return group;
}

type ParticipantIdentitySource = 'portal_url' | 'row_number';

function parseParticipantIdFromPortalUrl(portalUrl: string | undefined): string {
  const raw = String(portalUrl || '').trim();
  if (!raw) return '';
  const match = raw.match(/(?:^|[/?&])(?:portal\/)?(row-\d+)(?:[/?&]|$)/i);
  if (!match) return '';
  return match[1].toLowerCase();
}

function buildParticipantIdentity(payload: RegistrationPayload): { participantId: string; source: ParticipantIdentitySource | '' } {
  const fromPortal = parseParticipantIdFromPortalUrl(payload.portal_url);
  if (fromPortal) {
    return {
      participantId: fromPortal,
      source: 'portal_url',
    };
  }

  const rowNumber = Number(payload.row_number || 0);
  if (Number.isFinite(rowNumber) && rowNumber > 1) {
    return {
      participantId: `row-${Math.floor(rowNumber)}`,
      source: 'row_number',
    };
  }

  return {
    participantId: '',
    source: '',
  };
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

function buildDefaultWaveTimes(): string[] {
  const start = 8 * 60; // 8:00 AM
  const end = 12 * 60; // 12:00 PM
  const times: string[] = [];
  for (let minutes = start; minutes <= end; minutes += 15) {
    times.push(formatMinutesToLabel(minutes));
  }
  return times;
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

  // If the form answer contains an hour range like "9:00 AM - 10:00 AM",
  // prioritize the first value as the intended block start.
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

  const deduped = Array.from(new Set(candidates));
  return deduped;
}

function buildCandidateWaveTimes(payload: RegistrationPayload, allWaveTimes: string[]): string[] {
  const allWaveMinutes = allWaveTimes
    .map(parseTimeToMinutes)
    .filter((value): value is number => value !== null);

  const firstTimes = extractBlockStartTimes(payload.first_preference_hour);
  const secondTimes = extractBlockStartTimes(payload.second_preference_hour);

  const firstFlex = parseFlexMinutes(payload.first_preference_flexibility);
  const secondFlex = parseFlexMinutes(payload.second_preference_flexibility);

  const firstMinutePreference = extractExactMinutePreference(
    payload.first_preference_flexibility,
    payload.first_preference_hour
  );
  const secondMinutePreference = extractExactMinutePreference(
    payload.second_preference_flexibility,
    payload.second_preference_hour
  );

  const firstStrictBases = firstTimes.map((time) => applyMinutePreference(time, firstMinutePreference));
  const secondStrictBases = secondTimes.map((time) => applyMinutePreference(time, secondMinutePreference));

  const firstCandidates = expandCandidates(firstStrictBases, firstFlex, allWaveMinutes).map(formatMinutesToLabel);
  const secondCandidates = expandCandidates(secondStrictBases, secondFlex, allWaveMinutes).map(formatMinutesToLabel);

  return Array.from(new Set([...firstCandidates, ...secondCandidates, ...allWaveTimes]));
}

function buildWaveTimes(startMinutes: number, totalWaves: number, intervalMinutes: number): string[] {
  const times: string[] = [];
  for (let index = 0; index < totalWaves; index += 1) {
    times.push(formatMinutesToLabel(startMinutes + index * intervalMinutes));
  }
  return times;
}

function sortUniqueWaveTimes(rawTimes: Array<string | undefined>): string[] {
  return Array.from(new Set(
    rawTimes
      .map((value) => normalizeWaveTime(value) || '')
      .filter(Boolean)
  )).sort((a, b) => {
    const minutesA = parseTimeToMinutes(a);
    const minutesB = parseTimeToMinutes(b);
    if (minutesA === null && minutesB === null) return a.localeCompare(b);
    if (minutesA === null) return 1;
    if (minutesB === null) return -1;
    return minutesA - minutesB;
  });
}

async function ensureEventVisible(db: Firestore, eventId: string, eventName: string) {
  const indexRef = doc(db, 'config', 'eventsIndex');
  const indexSnap = await getDoc(indexRef);
  const existing = indexSnap.exists() ? (indexSnap.data().events || []) : [];
  const hasEvent = Array.isArray(existing) && existing.some((entry: { id?: string }) => entry.id === eventId);

  if (!hasEvent) {
    await setDoc(indexRef, {
      events: [...existing, { id: eventId, name: eventName }],
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  await setDoc(doc(db, 'events', eventId), {
    id: eventId,
    name: eventName,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  const configRef = doc(db, 'events', eventId, 'config', 'global');
  const configSnap = await getDoc(configRef);
  const configData = configSnap.exists() ? (configSnap.data() as Record<string, unknown>) : null;
  const branding = configData?.branding as Record<string, unknown> | undefined;
  const existingTitle = typeof branding?.title === 'string' ? branding.title.trim() : '';
  const looksLikeResponseSheetTitle = /^form responses?\b/i.test(existingTitle) || /\(responses\)/i.test(existingTitle);

  // Never allow source sheet labels to become dashboard branding titles.
  // Also auto-heal legacy bad values like "Form Responses 1".
  if (!existingTitle || looksLikeResponseSheetTitle) {
    await setDoc(configRef, {
      branding: { title: eventName },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
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
    createdBy: 'google-form-webhook',
  }, { merge: true });
  return waveId;
}

async function countWaveParticipantsByTime(db: Firestore, eventId: string, startTime: string): Promise<number> {
  const existing = await findWaveByStartTime(db, eventId, startTime);
  if (!existing) return 0;

  const participantsSnap = await getDocs(collection(existing.ref, 'participants'));
  return participantsSnap.size;
}

async function getWaveCapacityLimit(db: Firestore, eventId: string): Promise<number> {
  const configRef = doc(db, 'events', eventId, 'config', 'global');
  const configSnap = await getDoc(configRef);
  if (!configSnap.exists()) {
    throw new Error(`Missing event config for capacity: events/${eventId}/config/global`);
  }

  const raw = Number(configSnap.data().maxParticipants);
  if (!Number.isFinite(raw)) {
    throw new Error(`Missing or invalid maxParticipants in events/${eventId}/config/global`);
  }

  const normalized = Math.floor(raw);
  if (normalized < 1) {
    throw new Error(`maxParticipants must be >= 1 in events/${eventId}/config/global`);
  }
  return normalized;
}

async function getEventWaveTimes(db: Firestore, eventId: string): Promise<string[]> {
  const wavesSnap = await getDocs(collection(db, 'events', eventId, 'waves'));
  const persistedWaveTimes = sortUniqueWaveTimes(
    wavesSnap.docs.map((docSnap) => String(docSnap.data().startTime || ''))
  );
  if (persistedWaveTimes.length > 0) {
    return persistedWaveTimes;
  }

  const configRef = doc(db, 'events', eventId, 'config', 'global');
  const configSnap = await getDoc(configRef);
  if (!configSnap.exists()) {
    return DEFAULT_WAVE_TIMES;
  }

  const data = configSnap.data() as Record<string, unknown>;
  const event = (data.event || {}) as Record<string, unknown>;
  const timing = (data.timing || {}) as Record<string, unknown>;

  const startTime = String(event.startTime || '').trim();
  const startMinutes = parseTimeToMinutes(startTime);
  const totalWaves = Math.floor(Number(event.totalWaves));
  const intervalMinutes = Math.floor(Number(event.waveStartIntervalMinutes ?? timing.intervalMinutes));

  if (startMinutes === null || !Number.isFinite(totalWaves) || totalWaves < 1 || !Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    return DEFAULT_WAVE_TIMES;
  }

  return sortUniqueWaveTimes(buildWaveTimes(startMinutes, totalWaves, intervalMinutes));
}

async function chooseAutoWaveTime(
  db: Firestore,
  eventId: string,
  payload: RegistrationPayload,
  waveCapacityLimit: number,
  waveTimes: string[]
): Promise<string | null> {
  const queue = buildCandidateWaveTimes(payload, waveTimes);

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

async function removeLegacyRegistrationsByRowNumber(
  db: Firestore,
  eventId: string,
  rowNumber: number,
  activeParticipantId: string
): Promise<void> {
  const regsCol = collection(db, 'events', eventId, 'registrations');
  const legacyQuery = query(regsCol, where('rowNumber', '==', rowNumber));
  const snap = await getDocs(legacyQuery);

  const legacyIds = snap.docs
    .map((docSnap) => docSnap.id)
    .filter((id) => id !== activeParticipantId);

  if (legacyIds.length === 0) return;

  for (const legacyId of legacyIds) {
    await removeParticipantFromAllWaves(db, eventId, legacyId, null);
    await Promise.all([
      deleteDoc(doc(db, 'events', eventId, 'cancellationQueue', legacyId)),
      deleteDoc(doc(db, 'events', eventId, 'registrations', legacyId)),
    ]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const expectedSecret = process.env.GOOGLE_WEBHOOK_SECRET;
    if (isProduction && expectedSecret) {
      const headerSecret = req.headers.get('x-webhook-secret') || '';
      if (headerSecret !== expectedSecret) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook' }, { status: 401 });
      }
    }

    const payload = (await req.json()) as RegistrationPayload;
    const identity = buildParticipantIdentity(payload);
    const participantId = identity.participantId;
    if (!participantId) {
      return NextResponse.json({ ok: false, error: 'row_number or portal_url row token is required' }, { status: 400 });
    }

    const db = getServerDb();
    const eventId = normalizeEventId(payload.event_id);
    const eventName = DEFAULT_EVENT_NAME;
    const rowNumber = Number(payload.row_number || 0);
    const waveCapacityLimit = await getWaveCapacityLimit(db, eventId);
    const waveTimes = await getEventWaveTimes(db, eventId);
    const triggerSource = (payload.trigger_source || '').trim();
    const normalizedEntryMode = normalizeEntryMode(payload.entry_mode, payload.group_name);
    const normalizedGroupName = normalizeGroupName(payload.group_name, payload.entry_mode);
    const now = new Date().toISOString();
    const portalUrl = payload.portal_url || `/portal/${participantId}?event=${eventId}`;
    const includeInLeaderboard = payload.include_in_leaderboard !== false;
    const pingGroupOptIn = !!payload.ping_group_opt_in;

    await ensureEventVisible(db, eventId, eventName);
    if (identity.source === 'row_number') {
      await removeLegacyRegistrationsByRowNumber(db, eventId, rowNumber, participantId);
    }

    const regRef = doc(db, 'events', eventId, 'registrations', participantId);
    const regSnap = await getDoc(regRef);
    const existingReg = regSnap.exists() ? (regSnap.data() as Record<string, unknown>) : null;

    let finalStatus: RegistrationStatus = normalizeStatus(payload.registration_status);
    let finalWaveTime: string | null = normalizeWaveTime(payload.confirmed_wave_time);
    let mode: ProcessingMode = 'manual_update';

    // Fully automated path: every new form submit is auto-allocated if capacity exists.
    if (triggerSource === 'form_submit') {
      mode = 'auto_allocation';
      if (finalStatus !== 'Cancelled') {
        const assigned = await chooseAutoWaveTime(db, eventId, payload, waveCapacityLimit, waveTimes);
        if (assigned) {
          finalStatus = 'Confirmed';
          finalWaveTime = assigned;
        } else {
          finalStatus = 'Waitlisted';
          finalWaveTime = null;
        }
      }
    }

    // Safety for replay/import paths: do not wipe existing assignments/status
    // when time-driven or bulk sync replays rows.
    if ((triggerSource === 'time_driven_sync' || triggerSource === 'bulk_backfill') && existingReg) {
      const existingStatus = normalizeStatus(String(existingReg.registrationStatus || ''));
      const existingWaveTime = normalizeWaveTime(String(existingReg.confirmedWaveTime || ''));
      finalStatus = existingStatus;
      finalWaveTime = existingWaveTime;
    }

    await setDoc(regRef, {
      participantId,
      name: (payload.name || '').trim(),
      registrationStatus: finalStatus,
      confirmedWaveTime: finalWaveTime,
      sourceSheet: payload.source_sheet || '',
      triggerSource,
      rowNumber: payload.row_number || null,
      timestamp: payload.timestamp || null,
      firstPreferenceHour: payload.first_preference_hour || '',
      firstPreferenceFlexibility: payload.first_preference_flexibility || '',
      secondPreferenceHour: payload.second_preference_hour || '',
      secondPreferenceFlexibility: payload.second_preference_flexibility || '',
      swimComfort: payload.swim_comfort || '',
      entryMode: normalizedEntryMode,
      groupName: normalizedGroupName,
      isFirstTri: !!payload.is_first_tri,
      pingGroupOptIn: !!payload.ping_group_opt_in,
      howHeard: payload.how_heard || '',
      isFirstGfit: !!payload.is_first_gfit,
      volunteerOptIn: !!payload.volunteer_opt_in,
      comments: payload.comments || '',
      chatLink: payload.chat_link || '',
      calendarInviteSent: !!payload.calendar_invite_sent,
      includeInLeaderboard,
      volunteerRole: payload.volunteer_role || '',
      internalNotes: payload.internal_notes || '',
      portalUrl,
      participantIdSource: identity.source || null,
      updatedAt: now,
      source: 'google-form-webhook',
    }, { merge: true });

    let linkedWaveId: string | null = null;

    if (finalStatus === 'Confirmed' && finalWaveTime) {
      linkedWaveId = await getOrCreateWaveId(db, eventId, finalWaveTime);
      await removeParticipantFromAllWaves(db, eventId, participantId, linkedWaveId);

      await setDoc(doc(db, 'events', eventId, 'waves', linkedWaveId, 'participants', participantId), {
        id: participantId,
        name: (payload.name || '').trim() || participantId,
        rowNumber: payload.row_number || null,
        waveData: {},
        includeInLeaderboard,
        pingGroupOptIn,
        swimComfort: payload.swim_comfort || '',
        isFirstTri: !!payload.is_first_tri,
        registrationStatus: finalStatus,
        updatedAt: now,
        source: 'google-form-webhook',
      }, { merge: true });
    } else {
      await removeParticipantFromAllWaves(db, eventId, participantId, null);
    }

    return NextResponse.json({
      ok: true,
      status: 'success',
      mode,
      eventId,
      participantId,
      registrationStatus: finalStatus,
      registration_status: finalStatus,
      assigned_wave: finalWaveTime,
      portal_url: portalUrl,
      wave_capacity_limit: waveCapacityLimit,
      linkedWaveId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
