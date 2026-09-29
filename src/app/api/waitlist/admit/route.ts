import { NextRequest, NextResponse } from 'next/server';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, writeBatch } from 'firebase/firestore';

interface AdmitPayload {
  event_id?: string;
  waitlist_id?: string;
  lift_movement_flights?: Record<string, string>;
  gender_category?: string;
  body_weight?: string;
  olympic_lifts_opt_in?: boolean;
  lift_movement_prs?: Record<string, string>;
}

function timeMinutes(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null;
  return (match[3] ? hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0) : hour) * 60 + minute;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as AdmitPayload;
    const eventId = String(payload.event_id || '').trim();
    const waitlistId = String(payload.waitlist_id || '').trim();
    const assignments = payload.lift_movement_flights;
    if (!/^[a-z0-9-]+$/.test(eventId) || !waitlistId || waitlistId.includes('/') || !assignments ||
      typeof assignments !== 'object' || Array.isArray(assignments)) {
      return NextResponse.json({ ok: false, error: 'Event, waitlist entry, and flight choices are required' }, { status: 400 });
    }

    const config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    if (Object.values(config).some((value) => !value)) throw new Error('Missing Firebase configuration');
    const db = getFirestore(getApps().length ? getApp() : initializeApp(config));
    const waitlistRef = doc(db, 'events', eventId, 'waitlist', waitlistId);
    const [configSnap, waitlistSnap, waveSnap] = await Promise.all([
      getDoc(doc(db, 'events', eventId, 'config', 'global')),
      getDoc(waitlistRef),
      getDocs(collection(db, 'events', eventId, 'waves')),
    ]);
    if (!waitlistSnap.exists()) return NextResponse.json({ ok: false, error: 'Waitlist entry not found' }, { status: 404 });
    const waitlist = waitlistSnap.data();
    if ((waitlist.status || 'Waiting') !== 'Waiting') {
      return NextResponse.json({ ok: false, error: 'Only waiting entries can be admitted' }, { status: 409 });
    }
    const name = String(waitlist.name || '').trim();
    if (!name) return NextResponse.json({ ok: false, error: 'Waitlist entry needs a name' }, { status: 400 });
    const eventConfig = configSnap.data();
    if (eventConfig?.timing?.movementMode !== 'lift') {
      return NextResponse.json({ ok: false, error: 'This event needs a lift flight schedule' }, { status: 400 });
    }

    const configured = (eventConfig.liftEvent?.flights || {}) as Record<string, Array<{ label: string; startTime: string; endTime: string }>>;
    const olympicMovements = (eventConfig.liftEvent?.olympicLiftMovements || []) as string[];
    const selected = Object.entries(assignments).filter(([, label]) => Boolean(label)).map(([movement, label]) => ({
      movement, flight: (configured[movement] || []).find((option) => option.label === label),
    }));
    if (!selected.length || selected.some(({ flight }) => !flight)) {
      return NextResponse.json({ ok: false, error: 'Select only currently configured flights before admitting' }, { status: 400 });
    }
    const olympicFlights = selected.filter(({ movement }) => olympicMovements.includes(movement));
    if (new Set(olympicFlights.map(({ flight }) => `${flight?.startTime}-${flight?.endTime}`)).size > 1) {
      return NextResponse.json({ ok: false, error: 'Olympic lifts must share one session' }, { status: 400 });
    }
    const powerFlights = selected.filter(({ movement }) => !olympicMovements.includes(movement));
    const capacity = Number(eventConfig.maxParticipants);
    if (powerFlights.length && (!Number.isFinite(capacity) || capacity < 1)) {
      return NextResponse.json({ ok: false, error: 'Configure Powerlifting capacity first' }, { status: 400 });
    }
    const rosterSnaps = await Promise.all(waveSnap.docs.map((wave) => getDocs(collection(wave.ref, 'participants'))));
    const participantId = `waitlist-${waitlistId}`;
    const registrationRef = doc(db, 'events', eventId, 'registrations', participantId);
    const existingRegistration = await getDoc(registrationRef);
    if (existingRegistration.exists() && existingRegistration.data().sourceWaitlistId !== waitlistId) {
      return NextResponse.json({ ok: false, error: 'A different registration already uses this ID' }, { status: 409 });
    }
    for (const { movement, flight } of powerFlights) {
      const assigned = new Set(rosterSnaps.flatMap((snap) => snap.docs)
        .filter((entry) => entry.id !== participantId && entry.data().liftMovementFlights?.[movement] === flight?.label)
        .map((entry) => entry.id));
      if (assigned.size >= capacity) {
        return NextResponse.json({ ok: false, error: `${movement} ${flight?.label} is full` }, { status: 409 });
      }
    }

    const anchorOptions = powerFlights.length ? powerFlights : selected;
    const anchor = [...anchorOptions].sort((first, second) =>
      (timeMinutes(first.flight?.startTime || '') ?? 0) - (timeMinutes(second.flight?.startTime || '') ?? 0)
    )[0];
    const anchorTime = timeMinutes(anchor.flight?.startTime || '');
    const targetWave = waveSnap.docs.find((wave) =>
      (wave.data().isOlympicFlight === true) === (powerFlights.length === 0) &&
      timeMinutes(String(wave.data().startTime || '')) === anchorTime
    );
    if (!targetWave) {
      return NextResponse.json({ ok: false, error: 'Create the configured flight pills before admitting' }, { status: 409 });
    }
    const previousParticipant = rosterSnaps.flatMap((snap) => snap.docs).find((entry) => entry.id === participantId)?.data();
    const now = new Date().toISOString();
    const olympicSessionStart = olympicFlights[0]?.flight?.startTime || '';
    const genderCategory = String(payload.gender_category ?? waitlist.genderCategory ?? waitlist.division ?? '').trim();
    const bodyWeight = String(payload.body_weight ?? waitlist.bodyWeight ?? '').trim();
    const rawPrs = payload.lift_movement_prs && typeof payload.lift_movement_prs === 'object' && !Array.isArray(payload.lift_movement_prs)
      ? payload.lift_movement_prs : (waitlist.liftMovementPrs || {}) as Record<string, string>;
    const liftMovementPrs = Object.fromEntries(Object.entries(rawPrs)
      .filter(([movement]) => Boolean(configured[movement]))
      .map(([movement, value]) => [movement, String(value || '').trim()]));
    const olympicLiftsOptIn = olympicFlights.length > 0 || payload.olympic_lifts_opt_in === true;
    const rosterData = {
      id: participantId,
      name,
      waveData: previousParticipant?.waveData || {},
      liftMovementFlights: assignments,
      olympicLiftsOptIn,
      olympicSessionStart,
      powerliftingEntry: powerFlights.length > 0,
      genderCategory,
      bodyWeight,
      liftMovementRackHeights: waitlist.liftMovementRackHeights || {},
      liftMovementPrs,
      includeInLeaderboard: true,
      updatedAt: now,
    };
    const batch = writeBatch(db);
    batch.set(registrationRef, {
      ...waitlist,
      ...rosterData,
      participantId,
      registrationTemplate: 'lift-event',
      registrationStatus: 'Confirmed',
      confirmedWaveTime: null,
      sourceWaitlistId: waitlistId,
      source: 'waitlist-admission',
      triggerSource: 'waitlist_admission',
      sourceSheet: String(waitlist.sourceSheet || ''),
    }, { merge: true });
    batch.set(doc(targetWave.ref, 'participants', participantId), rosterData, { merge: true });
    waveSnap.docs.forEach((wave, index) => {
      if (wave.id === targetWave.id) return;
      if (rosterSnaps[index].docs.some((entry) => entry.id === participantId)) {
        batch.delete(doc(wave.ref, 'participants', participantId));
      }
    });
    batch.set(waitlistRef, {
      status: 'Admitted', registrationId: participantId, admittedAt: now, updatedAt: now,
      genderCategory, bodyWeight, olympicLiftsOptIn, liftMovementPrs,
    }, { merge: true });
    await batch.commit();

    return NextResponse.json({ ok: true, participantId, linkedWaveId: targetWave.id });
  } catch (error) {
    console.error('Failed to admit waitlist entry:', error);
    return NextResponse.json({ ok: false, error: 'Failed to admit waitlist entry' }, { status: 500 });
  }
}