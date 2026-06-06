// TODO: Future improvement
// - Implement a global Client/User system with unique IDs to track attendance and performance across events.
// - Each participant in a wave should reference a global client ID.
// - This will allow tracking attendance, performance, and improvements across events.
// - For now, leaderboard and participant data are event-scoped and safe from cross-event leakage.
"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FeedbackEntry, Participant, Wave, WAVE_EVENTS } from '@/types';
import { getFirebase } from '@/lib/firebase';
import { collection, collectionGroup, doc, setDoc, writeBatch, serverTimestamp, getDoc, getDocs, deleteDoc, DocumentReference, Firestore } from 'firebase/firestore';
import { secureLogger } from '@/lib/secureLogger';

type BrandTheme = 'orange' | 'blue' | 'emerald' | 'sunset';

interface EventBranding {
  title: string;
  emojiLeft: string;
  emojiRight: string;
  theme: BrandTheme;
  customColor?: string;
  customGradient?: {
    start: string;
    mid: string;
    end: string;
  };
}

interface EventSummary {
  id: string;
  name: string;
}

const DEFAULT_EVENT_ID = 'g-rox';
const DEFAULT_EVENT_NAME = 'G-ROX';

const DEFAULT_BRANDING: EventBranding = {
  title: DEFAULT_EVENT_NAME,
  emojiLeft: '',
  emojiRight: '',
  theme: 'orange',
};

const THEME_PRESETS: Record<BrandTheme, { start: string; mid: string; end: string; accent: string; accentHover: string }> = {
  orange: {
    start: '#ea580c',
    mid: '#f97316',
    end: '#fbbf24',
    accent: '#ea580c',
    accentHover: '#c2410c',
  },
  blue: {
    start: '#1d4ed8',
    mid: '#2563eb',
    end: '#38bdf8',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
  },
  emerald: {
    start: '#047857',
    mid: '#059669',
    end: '#34d399',
    accent: '#059669',
    accentHover: '#047857',
  },
  sunset: {
    start: '#be185d',
    mid: '#db2777',
    end: '#fb7185',
    accent: '#db2777',
    accentHover: '#be185d',
  },
};

function normalizeHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const normalized = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

function adjustHexColor(hex: string, delta: number): string {
  const normalized = normalizeHexColor(hex, '#f97316');
  const value = normalized.slice(1);
  const channel = (start: number) => {
    const component = parseInt(value.slice(start, start + 2), 16);
    return Math.max(0, Math.min(255, component + delta));
  };

  const r = channel(0).toString(16).padStart(2, '0');
  const g = channel(2).toString(16).padStart(2, '0');
  const b = channel(4).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function getThemeColors(branding: EventBranding) {
  const fallback = THEME_PRESETS[branding.theme] || THEME_PRESETS.orange;

  if (branding.customGradient) {
    const start = normalizeHexColor(branding.customGradient.start, fallback.start);
    const mid = normalizeHexColor(branding.customGradient.mid, fallback.mid);
    const end = normalizeHexColor(branding.customGradient.end, fallback.end);
    return {
      start,
      mid,
      end,
      accent: mid,
      accentHover: adjustHexColor(mid, -22),
    };
  }

  if (!branding.customColor) return fallback;

  const accent = normalizeHexColor(branding.customColor, fallback.accent);
  return {
    start: adjustHexColor(accent, -28),
    mid: accent,
    end: adjustHexColor(accent, 42),
    accent,
    accentHover: adjustHexColor(accent, -22),
  };
}

function sanitizeBrandingForFirestore(branding: EventBranding): EventBranding {
  const sanitized: EventBranding = {
    title: branding.title,
    emojiLeft: branding.emojiLeft,
    emojiRight: branding.emojiRight,
    theme: branding.theme,
  };

  if (branding.customColor) {
    sanitized.customColor = branding.customColor;
  }

  if (branding.customGradient) {
    sanitized.customGradient = branding.customGradient;
  }

  return sanitized;
}

function buildDefaultEventConfig(title: string, date = new Date()): FirebaseConfigData {
  return {
    customEvents: WAVE_EVENTS,
    timing: {
      intervalMinutes: 5,
      workMinutes: 3,
      restMinutes: 2,
      movementMode: 'global',
      movementIntervals: {},
    },
    eventNotes: '',
    maxParticipants: 10,
    workoutTimer: {
      workSeconds: 60,
      restSeconds: 30,
    },
    event: {
      startDate: date.toISOString().split('T')[0],
      startTime: '08:00',
      totalWaves: 30,
    },
    accessPasscode: '54321Blastoff!',
    eventClockEnabled: false,
    feedbackEnabled: false,
    branding: {
      title,
      emojiLeft: '',
      emojiRight: '',
      theme: 'blue',
      customColor: '#2563eb',
      customGradient: {
        start: '#1d4ed8',
        mid: '#2563eb',
        end: '#38bdf8',
      },
    },
  };
}

function slugifyEventId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'event';
}

function formatEventNameFromId(eventId: string): string {
  if (eventId === DEFAULT_EVENT_ID) return DEFAULT_EVENT_NAME;
  return eventId
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getEventConfigRef(db: Firestore, eventId: string) {
  return doc(db, 'events', eventId, 'config', 'global');
}

function getEventWavesCollection(db: Firestore, eventId: string) {
  return collection(db, 'events', eventId, 'waves');
}

function getEventActiveWavesCollection(db: Firestore, eventId: string) {
  return collection(db, 'events', eventId, 'activeWaves');
}

function getEventFeedbackCollection(db: Firestore, eventId: string) {
  return collection(db, 'events', eventId, 'feedback');
}

function getEventsIndexRef(db: Firestore) {
  return doc(db, 'config', 'eventsIndex');
}

function getGlobalSettingsRef(db: Firestore) {
  return doc(db, 'config', 'global');
}

async function deleteDocsInBatches(db: Firestore, refs: DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;

  let batch = writeBatch(db);
  let count = 0;

  for (const ref of refs) {
    batch.delete(ref);
    count += 1;

    if (count === 450) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function deleteEventFromFirestore(db: Firestore, eventId: string): Promise<void> {
  const wavesSnap = await getDocs(getEventWavesCollection(db, eventId));
  for (const waveDoc of wavesSnap.docs) {
    const participantsSnap = await getDocs(collection(waveDoc.ref, 'participants'));
    await deleteDocsInBatches(db, participantsSnap.docs.map((docSnap) => docSnap.ref));
  }

  await deleteDocsInBatches(db, wavesSnap.docs.map((docSnap) => docSnap.ref));

  const activeWavesSnap = await getDocs(getEventActiveWavesCollection(db, eventId));
  await deleteDocsInBatches(db, activeWavesSnap.docs.map((docSnap) => docSnap.ref));

  const feedbackSnap = await getDocs(getEventFeedbackCollection(db, eventId));
  await deleteDocsInBatches(db, feedbackSnap.docs.map((docSnap) => docSnap.ref));

  await deleteDoc(getEventConfigRef(db, eventId));
  await deleteDoc(doc(db, 'events', eventId));
}

async function ensureDefaultEventConfigExists(db: Firestore): Promise<void> {
  const defaultConfigRef = getEventConfigRef(db, DEFAULT_EVENT_ID);
  const defaultConfigSnap = await getDoc(defaultConfigRef);
  if (defaultConfigSnap.exists()) return;

  const legacyConfigRef = doc(db, 'config', 'global');
  const legacyConfigSnap = await getDoc(legacyConfigRef);

  if (legacyConfigSnap.exists()) {
    await setDoc(defaultConfigRef, {
      ...legacyConfigSnap.data(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return;
  }

  await setDoc(defaultConfigRef, {
    customEvents: WAVE_EVENTS,
    timing: {
      intervalMinutes: 5,
      workMinutes: 3,
      restMinutes: 2,
      movementMode: 'global',
      movementIntervals: {},
    },
    eventNotes: '',
    maxParticipants: 10,
    workoutTimer: {
      workSeconds: 60,
      restSeconds: 30,
    },
    event: {
      startDate: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      totalWaves: 30,
    },
    accessPasscode: '54321Blastoff!',
    feedbackEnabled: false,
    branding: {
      title: DEFAULT_EVENT_NAME,
      emojiLeft: '',
      emojiRight: '',
      theme: 'orange',
      customGradient: {
        start: '#ea580c',
        mid: '#f97316',
        end: '#fbbf24',
      },
    },
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function migrateLegacyGroxWavesIfMissing(db: Firestore): Promise<void> {
  const eventWavesCol = getEventWavesCollection(db, DEFAULT_EVENT_ID);
  const eventWavesSnap = await getDocs(eventWavesCol);
  const existingEventWaveIds = new Set(eventWavesSnap.docs.map((docSnap) => docSnap.id));

  const legacyWavesCol = collection(db, 'waves');
  const legacyWavesSnap = await getDocs(legacyWavesCol);
  if (legacyWavesSnap.empty) return;

  for (const legacyWaveDoc of legacyWavesSnap.docs) {
    if (existingEventWaveIds.has(legacyWaveDoc.id)) {
      continue;
    }

    const targetWaveRef = doc(eventWavesCol, legacyWaveDoc.id);
    await setDoc(targetWaveRef, legacyWaveDoc.data(), { merge: true });

    const legacyParticipantsSnap = await getDocs(collection(legacyWaveDoc.ref, 'participants'));
    for (const participantDoc of legacyParticipantsSnap.docs) {
      await setDoc(doc(collection(targetWaveRef, 'participants'), participantDoc.id), participantDoc.data(), { merge: true });
    }
  }
}

async function ensureDefaultEventAvailable(db: Firestore): Promise<void> {
  await ensureDefaultEventConfigExists(db);
  await migrateLegacyGroxWavesIfMissing(db);
}

// Firebase data types
interface FirebaseConfigData {
  customEvents?: string[];
  timing?: {
    intervalMinutes?: number;
    workMinutes?: number;
    restMinutes?: number;
    movementMode?: 'global' | 'individual';
    movementIntervals?: Record<string, { workMinutes?: number; restMinutes?: number }>;
  };
  eventNotes?: string;
  maxParticipants?: number;
  workoutTimer?: {
    workSeconds?: number;
    restSeconds?: number;
  };
  event?: {
    startDate?: string;
    startTime?: string;
    totalWaves?: number;
  };
  alertSettings?: WaveStore['alertSettings'];
  accessPasscode?: string;
  passcodeProtectionEnabled?: boolean;
  eventClockEnabled?: boolean;
  feedbackEnabled?: boolean;
  branding?: EventBranding;
}

interface FirebaseEventsIndexData {
  activeEventId?: string;
  events?: EventSummary[];
}

interface FirebaseWaveData {
  name?: string;
  startTime?: string;
  coach?: string;
}

type MovementTimingMode = 'global' | 'individual';
type MovementIntervals = Record<string, { workMinutes: number; restMinutes: number }>;

interface WaveStore {
  activeEventId: string;
  eventsCatalog: EventSummary[];
  eventBranding: EventBranding;
  themeColors: { start: string; mid: string; end: string; accent: string; accentHover: string };
  waves: Record<string, Wave>;
  currentWaveId: string | null;
  eventNotes: string;
  customEvents: string[];
  intervalMinutes: number;
  workMinutes: number;
  restMinutes: number;
  movementTimingMode: MovementTimingMode;
  movementIntervals: MovementIntervals;
  maxParticipants: number;
  workoutTimerWorkSeconds: number;
  workoutTimerRestSeconds: number;
  eventStartDate: string; // Format: "YYYY-MM-DD"
  eventStartTime: string; // Format: "HH:mm" (24-hour)
  totalWaves: number;
  accessPasscode: string; // Passcode for protecting pages
  passcodeProtectionEnabled: boolean;
  eventClockEnabled: boolean;
  feedbackEnabled: boolean;
  // Alert settings are hardcoded - always enabled with beep sound and flash visual
  alertSettings: {
    workRestTransitions: boolean;
    eventStartEnd: boolean;
    soundType: 'beep';
    visualEffect: 'flash';
  };
  lastSavedAt: number | null;
  isDataLoaded: boolean;
  lastFirebaseSync: number | null;
  activeWaves: Set<string>; // Track which waves are being actively edited
  lastUserActivity: number | null; // Track user activity for smart sync
  isUserActive: boolean; // Whether user is currently active
  syncInterval: number; // Dynamic sync interval based on activity

  addWave: (name?: string) => string;
  deleteWave: (waveId: string) => Promise<void>;
  setCurrentWave: (waveId: string) => void;
  updateWave: (waveId: string, updates: Partial<Wave>) => void;

  addParticipant: (waveId: string, name: string) => Promise<void>;
  deleteParticipant: (waveId: string, participantId: string) => Promise<void>;
  updateParticipantData: (waveId: string, participantId: string, field: string, value: string) => void;
  updateParticipantName: (waveId: string, participantId: string, name: string) => void;
  updateParticipantLeaderboardStatus: (waveId: string, participantId: string, includeInLeaderboard: boolean) => Promise<void>;

  setEventNotes: (notes: string) => void;
  saveEventNotes: (notes: string, eventId: string) => Promise<void>;
  updateWaveEvents: (events: string[], eventId: string) => Promise<void>;
  setTimingConfig: (
    intervalMinutes: number,
    workMinutes: number,
    restMinutes: number,
    movementTimingMode: MovementTimingMode,
    movementIntervals: MovementIntervals,
    eventId: string
  ) => Promise<void>;
  setMaxParticipants: (maxParticipants: number, eventId: string) => Promise<void>;
  setWorkoutTimerConfig: (workSeconds: number, restSeconds: number, eventId: string) => Promise<void>;
  setEventConfig: (startDate: string, startTime: string, totalWaves: number, eventId: string) => Promise<void>;
  setAccessPasscode: (passcode: string) => Promise<void>;
  setPasscodeProtectionEnabled: (enabled: boolean) => Promise<void>;
  setEventClockEnabled: (enabled: boolean) => Promise<void>;
  setFeedbackEnabled: (enabled: boolean, eventId: string) => Promise<void>;
  submitFeedback: (rating: number, message: string) => Promise<void>;
  loadFeedbackEntries: (eventId?: string) => Promise<FeedbackEntry[]>;
  createEvent: (name: string) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  setActiveEvent: (eventId: string) => Promise<void>;
  updateEventBranding: (updates: Partial<EventBranding>, eventId: string) => Promise<void>;
  loadEventsCatalog: () => Promise<void>;
  saveAll: () => Promise<void>;
  loadAll: () => Promise<void>;
  loadGlobalConfig: () => Promise<void>;
  invalidateCache: () => void;
  clearCacheAndReload: () => Promise<void>;
  syncWithFirebase: () => Promise<void>;
  syncWithFirebaseNoCooldown: () => Promise<void>;
  fullSyncWithFirebase: () => Promise<void>;
  markWaveAsActive: (waveId: string) => void;
  markWaveAsInactive: (waveId: string) => void;
  forceUpdateAllParticipants: () => Promise<void>;
  setUserActivity: () => void; // Mark user as active
  setSyncInterval: (interval: number) => void; // Set sync interval
  saveWavePerformance: (waveId: string, eventId: string) => Promise<void>;
}

const createInitialWaveData = (events: string[]): Record<string, string> =>
  events.reduce((acc, e) => {
    acc[e] = '';
    return acc;
  }, {} as Record<string, string>);

function normalizeFeedbackEntry(eventId: string, id: string, data: Partial<FeedbackEntry>): FeedbackEntry {
  return {
    id,
    eventId,
    rating: Math.min(5, Math.max(1, Number(data.rating) || 1)),
    message: typeof data.message === 'string' ? data.message : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

function resolveTargetEventId(state: Pick<WaveStore, 'activeEventId' | 'eventsCatalog'>, eventId: string): string {
  const targetEventId = (eventId || '').trim();
  if (!targetEventId) {
    throw new Error('Cannot write event-scoped data without a target event id.');
  }

  const eventExists = state.eventsCatalog.some((event) => event.id === targetEventId);
  if (!eventExists && targetEventId !== state.activeEventId) {
    throw new Error(`Refusing to write event-scoped data for unknown event id: ${targetEventId}`);
  }

  return targetEventId;
}

/** Load all participants from a wave's Firestore subcollection. */
async function loadWaveParticipants(waveRef: DocumentReference): Promise<Participant[]> {
  const participantsCol = collection(waveRef, 'participants');
  const partsSnap = await getDocs(participantsCol);
  return partsSnap.docs.map((d) => d.data() as Participant);
}

export const useWaveStore = create<WaveStore>()(
  persist(
    (set, get) => ({
      activeEventId: DEFAULT_EVENT_ID,
      eventsCatalog: [{ id: DEFAULT_EVENT_ID, name: 'G-ROX' }],
      eventBranding: DEFAULT_BRANDING,
      themeColors: getThemeColors(DEFAULT_BRANDING),
      waves: {},
      currentWaveId: null,
      eventNotes: '',
      customEvents: WAVE_EVENTS,
      intervalMinutes: 5,
      workMinutes: 3,
      restMinutes: 2,
      movementTimingMode: 'global',
      movementIntervals: {},
      maxParticipants: 10,
      workoutTimerWorkSeconds: 60,
      workoutTimerRestSeconds: 30,
      eventStartDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      eventStartTime: '08:00',
      totalWaves: 30,
      accessPasscode: '54321Blastoff!', // Default passcode
      passcodeProtectionEnabled: process.env.NEXT_PUBLIC_ENABLE_PASSCODE_PROTECTION === 'true',
      eventClockEnabled: false,
      feedbackEnabled: false,
      // Alert settings are hardcoded - always enabled with beep sound and flash visual
      alertSettings: {
        workRestTransitions: true,
        eventStartEnd: true,
        soundType: 'beep',
        visualEffect: 'flash'
      },
      lastSavedAt: null,
      isDataLoaded: false,
      lastFirebaseSync: null,
      activeWaves: new Set<string>(),
      lastUserActivity: null,
      isUserActive: false,
      syncInterval: 10000, // Start with 10 seconds, will be optimized based on activity

      addWave: (name?: string) => {
        const id = `wave${Date.now()}`;
        // Find the highest wave number and add 1
        const existingWaves = Object.values(get().waves);
        const waveNumbers = existingWaves.map(wave => {
          const match = wave.name.match(/Wave (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        });
        const maxWaveNumber = waveNumbers.length > 0 ? Math.max(...waveNumbers) : 0;
        const nextWaveNumber = maxWaveNumber + 1;
        
        const wave: Wave = {
          id,
          name: name || `Wave ${nextWaveNumber}`,
          participants: [],
          startTime: '',
          coach: '',
        };
        set((s) => ({ waves: { ...s.waves, [id]: wave }, currentWaveId: id }));
        return id;
      },

      deleteWave: async (waveId) => {
        const waves = { ...get().waves };
        delete waves[waveId];
        const remaining = Object.keys(waves);
        set({ waves, currentWaveId: remaining[0] ?? null });
        
        // Delete from Firebase
        try {
          const { db } = getFirebase();
          const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
          
          // Delete all participants in this wave first
          const participantsSnapshot = await getDocs(collection(waveRef, 'participants'));
          const deletePromises = participantsSnapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          
          // Delete the wave document
          await deleteDoc(waveRef);
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          secureLogger.error('❌ Failed to delete wave from Firebase:', error);
          alert('Failed to delete wave from Firebase. Please try again.');
        }
      },

      setCurrentWave: (waveId) => set({ currentWaveId: waveId }),

      updateWave: (waveId, updates) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        const updatedWave = { ...wave, ...updates };
        set((s) => ({ waves: { ...s.waves, [waveId]: updatedWave } }));
        // Save to Firebase
        try {
          const { db } = getFirebase();
          const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
          setDoc(waveRef, {
            id: updatedWave.id,
            name: updatedWave.name,
            startTime: updatedWave.startTime,
            coach: updatedWave.coach || '',
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (error) {
          secureLogger.error('❌ Failed to update wave in Firebase:', error);
        }
      },

      addParticipant: async (waveId, name) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Check if adding this participant would exceed the limit
        const { maxParticipants } = get();
        if (wave.participants.length >= maxParticipants) {
          alert(`Cannot add more participants. Maximum limit is ${maxParticipants} per wave.`);
          return;
        }
        
        const participant: Participant = {
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          waveData: createInitialWaveData(get().customEvents),
          includeInLeaderboard: true, // Default to checked - must opt out
        };
        
        const updatedWave = { ...wave, participants: [...wave.participants, participant] };
        
        // Update local state immediately
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
          
          // Save wave document
          await setDoc(waveRef, {
            id: waveId,
            name: updatedWave.name,
            startTime: updatedWave.startTime,
            coach: updatedWave.coach || '',
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Save participant to subcollection
          const participantRef = doc(collection(waveRef, 'participants'), participant.id);
          await setDoc(participantRef, {
            id: participant.id,
            name: participant.name,
            waveData: participant.waveData,
            includeInLeaderboard: participant.includeInLeaderboard,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          secureLogger.error('❌ Failed to save participant to Firebase:', error);
          alert('Failed to save participant. Please try again.');
        }
      },

      deleteParticipant: async (waveId, participantId) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Update local state immediately
        const updatedParticipants = wave.participants.filter((p) => p.id !== participantId);
        const updatedWave = { ...wave, participants: updatedParticipants };
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Delete from Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
          const participantRef = doc(collection(waveRef, 'participants'), participantId);
          const regRef = doc(db, 'events', get().activeEventId, 'registrations', participantId);
          const now = new Date().toISOString();
          const participantSnapshot = await getDoc(participantRef);
          const participantData = participantSnapshot.exists() ? (participantSnapshot.data() as Partial<Participant> & { rowNumber?: number | null }) : null;
          const participantName = String(participantData?.name || '').trim() || wave.participants.find((p) => p.id === participantId)?.name || '';
          const participantRowNumber = Number(participantData?.rowNumber || 0) || null;
          
          await deleteDoc(participantRef);

          await setDoc(regRef, {
            participantId,
            registrationStatus: 'Needs Reassignment',
            confirmedWaveTime: null,
            updatedAt: now,
            source: 'manual-ops',
          }, { merge: true });

          const registrationsSnap = await getDocs(collection(db, 'events', get().activeEventId, 'registrations'));
          const matchingRegistrationRefs = registrationsSnap.docs.filter((docSnap) => {
            if (docSnap.id === participantId) return true;
            const data = docSnap.data() as Record<string, unknown>;
            return participantName && String(data.name || '').trim() === participantName;
          });

          await Promise.all(
            matchingRegistrationRefs.map((docSnap) =>
              setDoc(docSnap.ref, {
                participantId: docSnap.id,
                registrationStatus: 'Needs Reassignment',
                confirmedWaveTime: null,
                updatedAt: now,
                source: 'manual-ops',
              }, { merge: true })
            )
          );

          if (participantRowNumber && participantRowNumber > 1) {
            const rowRegistrationId = `row-${participantRowNumber}`;
            await setDoc(doc(db, 'events', get().activeEventId, 'registrations', rowRegistrationId), {
              participantId: rowRegistrationId,
              registrationStatus: 'Needs Reassignment',
              confirmedWaveTime: null,
              updatedAt: now,
              source: 'manual-ops',
            }, { merge: true });
          }
          
          // Also update the wave document metadata
          await setDoc(waveRef, {
            id: waveId,
            name: updatedWave.name,
            startTime: updatedWave.startTime,
            coach: updatedWave.coach || '',
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          console.error('❌ Failed to delete participant from Firebase:', error);
          alert('Failed to delete participant from Firebase. Please try again.');
        }
      },

      updateParticipantData: (waveId, participantId, field, value) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Mark user as active when they're typing
        get().setUserActivity();
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: {
              ...wave,
              participants: wave.participants.map((p) =>
                p.id === participantId ? { ...p, waveData: { ...p.waveData, [field]: value } } : p
              ),
            },
          },
        }));
      },

      updateParticipantName: (waveId, participantId, name) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: {
              ...wave,
              participants: wave.participants.map((p) =>
                p.id === participantId ? { ...p, name } : p
              ),
            },
          },
        }));
      },

      updateParticipantLeaderboardStatus: async (waveId, participantId, includeInLeaderboard) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Update local state immediately
        const updatedParticipants = wave.participants.map((p) =>
          p.id === participantId ? { ...p, includeInLeaderboard } : p
        );
        const updatedWave = { ...wave, participants: updatedParticipants };
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
          const participantRef = doc(collection(waveRef, 'participants'), participantId);
          
          await setDoc(participantRef, {
            includeInLeaderboard,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Don't sync immediately - local state is already updated and Firebase is saved
          // Other users will pick up changes on their next sync interval
        } catch (error) {
          console.error('❌ Failed to update leaderboard status in Firebase:', error);
          alert('Failed to update leaderboard status. Please try again.');
        }
      },

      setEventNotes: (notes) => set({ eventNotes: notes }),

      saveEventNotes: async (notes, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ eventNotes: notes });
        }

        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            eventNotes: notes,
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          await get().syncWithFirebase();
        } catch (error) {
          console.error('❌ Failed to save event notes to Firebase:', error);
          throw error;
        }
      },
      
      setTimingConfig: async (intervalMinutes, workMinutes, restMinutes, movementTimingMode = 'global', movementIntervals = {}, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ intervalMinutes, workMinutes, restMinutes, movementTimingMode, movementIntervals });
        }
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            timing: {
              intervalMinutes,
              workMinutes,
              restMinutes,
              movementMode: movementTimingMode,
              movementIntervals,
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save timing config to Firebase:', error);
        }
      },
      
      setMaxParticipants: async (maxParticipants, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ maxParticipants });
        }
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            maxParticipants,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save max participants to Firebase:', error);
        }
      },

      setWorkoutTimerConfig: async (workSeconds, restSeconds, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ workoutTimerWorkSeconds: workSeconds, workoutTimerRestSeconds: restSeconds });
        }
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            workoutTimer: {
              workSeconds,
              restSeconds
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save workout timer config to Firebase:', error);
        }
      },

      setEventConfig: async (startDate, startTime, totalWaves, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ eventStartDate: startDate, eventStartTime: startTime, totalWaves: totalWaves });
        }
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            event: {
              startDate,
              startTime,
              totalWaves
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save event config to Firebase:', error);
        }
      },

      setAccessPasscode: async (passcode) => {
        set({ accessPasscode: passcode });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = getGlobalSettingsRef(db);
          await setDoc(configRef, {
            accessPasscode: passcode,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save access passcode to Firebase:', error);
        }
      },

      setPasscodeProtectionEnabled: async (enabled) => {
        set({ passcodeProtectionEnabled: enabled });

        try {
          const { db } = getFirebase();
          const configRef = getGlobalSettingsRef(db);
          await setDoc(configRef, {
            passcodeProtectionEnabled: enabled,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save passcode protection setting to Firebase:', error);
        }
      },

      setEventClockEnabled: async (enabled) => {
        set({ eventClockEnabled: enabled });
        if (typeof window !== 'undefined') {
          window.__INSPECT_ENABLED = !enabled;
        }

        try {
          const { db } = getFirebase();
          const configRef = getGlobalSettingsRef(db);
          await setDoc(configRef, {
            eventClockEnabled: enabled,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save event clock setting to Firebase:', error);
        }
      },

      setFeedbackEnabled: async (enabled, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        if (targetEventId === state.activeEventId) {
          set({ feedbackEnabled: enabled });
        }

        try {
          const { db } = getFirebase();
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            feedbackEnabled: enabled,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save feedback setting to Firebase:', error);
        }
      },

      submitFeedback: async (rating, message) => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) return;

        const eventId = get().activeEventId;
        const { db } = getFirebase();
        const feedbackRef = doc(getEventFeedbackCollection(db, eventId));
        const createdAt = new Date().toISOString();

        await setDoc(feedbackRef, {
          rating: Math.min(5, Math.max(1, Math.round(rating))),
          message: trimmedMessage,
          createdAt,
          eventId,
          updatedAt: createdAt,
        }, { merge: true });
      },

      loadFeedbackEntries: async (eventId = get().activeEventId) => {
        try {
          const { db } = getFirebase();
          const feedbackSnap = await getDocs(getEventFeedbackCollection(db, eventId));
          return feedbackSnap.docs
            .map((docSnap) => normalizeFeedbackEntry(eventId, docSnap.id, docSnap.data() as Partial<FeedbackEntry>))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        } catch (error) {
          console.error('❌ Failed to load feedback entries:', error);
          return [];
        }
      },

      loadEventsCatalog: async () => {
        const { db } = getFirebase();
        try {
          const indexRef = getEventsIndexRef(db);
          const indexSnap = await getDoc(indexRef);

          if (!indexSnap.exists()) {
            const initialEvents: EventSummary[] = [{ id: DEFAULT_EVENT_ID, name: DEFAULT_EVENT_NAME }];
            await setDoc(indexRef, {
              events: initialEvents,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            await ensureDefaultEventAvailable(db);
            set({ activeEventId: DEFAULT_EVENT_ID, eventsCatalog: initialEvents });
            return;
          }

          const data = indexSnap.data() as FirebaseEventsIndexData;
          const events = Array.isArray(data.events) && data.events.length > 0 ? [...data.events] : [];
          const knownEventIds = new Set(events.map((event) => event.id));

          // Self-heal: include any event docs that exist in Firestore but are missing from eventsIndex.
          let discoveredMissingEvents = false;
          try {
            const allEventsSnap = await getDocs(collection(db, 'events'));
            for (const eventDoc of allEventsSnap.docs) {
              if (knownEventIds.has(eventDoc.id)) continue;

              let displayName = formatEventNameFromId(eventDoc.id);
              try {
                const configSnap = await getDoc(getEventConfigRef(db, eventDoc.id));
                if (configSnap.exists()) {
                  const configData = configSnap.data() as FirebaseConfigData;
                  const brandingTitle = configData.branding?.title;
                  if (typeof brandingTitle === 'string' && brandingTitle.trim()) {
                    displayName = brandingTitle.trim();
                  }
                }
              } catch {
                // If config is unavailable, keep the ID-derived display name.
              }

              events.push({ id: eventDoc.id, name: displayName });
              knownEventIds.add(eventDoc.id);
              discoveredMissingEvents = true;
            }
          } catch {
            // If discovery fails (rules/network), continue with index data.
          }

          // Also discover events from config docs in case parent /events/{id} docs were never created.
          try {
            const configGroupSnap = await getDocs(collectionGroup(db, 'config'));
            for (const configDoc of configGroupSnap.docs) {
              if (configDoc.id !== 'global') continue;

              const pathSegments = configDoc.ref.path.split('/');
              if (pathSegments.length < 4 || pathSegments[0] !== 'events') continue;

              const eventId = pathSegments[1];
              if (!eventId || knownEventIds.has(eventId)) continue;

              const configData = configDoc.data() as FirebaseConfigData;
              const brandingTitle = configData.branding?.title;
              const displayName = typeof brandingTitle === 'string' && brandingTitle.trim()
                ? brandingTitle.trim()
                : formatEventNameFromId(eventId);

              events.push({ id: eventId, name: displayName });
              knownEventIds.add(eventId);
              discoveredMissingEvents = true;
            }
          } catch {
            // If collection-group discovery fails, continue with what we already have.
          }

          const hasDefaultEvent = events.some((event) => event.id === DEFAULT_EVENT_ID);
          if (!hasDefaultEvent) {
            events.unshift({ id: DEFAULT_EVENT_ID, name: DEFAULT_EVENT_NAME });
          }

          const preferredActiveEventId = get().activeEventId || DEFAULT_EVENT_ID;
          const activeEventId = events.some((event) => event.id === preferredActiveEventId)
            ? preferredActiveEventId
            : DEFAULT_EVENT_ID;

          if (!hasDefaultEvent || discoveredMissingEvents) {
            await setDoc(indexRef, {
              events,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
          }

          await ensureDefaultEventAvailable(db);

          set({ eventsCatalog: events, activeEventId });
        } catch (error) {
          secureLogger.error('❌ Failed to load events catalog:', error);
          set({
            activeEventId: DEFAULT_EVENT_ID,
            eventsCatalog: [{ id: DEFAULT_EVENT_ID, name: DEFAULT_EVENT_NAME }],
          });
        }
      },

      createEvent: async (name) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        const { db } = getFirebase();
        const currentEvents = get().eventsCatalog;
        const baseId = slugifyEventId(trimmedName);
        let candidate = baseId;
        let counter = 1;
        const existing = new Set(currentEvents.map((e) => e.id));
        while (existing.has(candidate)) {
          counter += 1;
          candidate = `${baseId}-${counter}`;
        }

        const newEvent: EventSummary = { id: candidate, name: trimmedName };
        const events = [...currentEvents, newEvent];

        await setDoc(getEventsIndexRef(db), {
          events,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        await setDoc(doc(db, 'events', candidate), {
          id: candidate,
          name: trimmedName,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        await setDoc(getEventConfigRef(db, candidate), {
          ...buildDefaultEventConfig(trimmedName),
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        set({
          eventsCatalog: events,
          activeEventId: candidate,
          waves: {},
          currentWaveId: null,
          isDataLoaded: false,
          feedbackEnabled: false,
          eventClockEnabled: false,
        });

        await get().loadAll();
      },

      deleteEvent: async (eventId) => {
        const trimmedEventId = eventId.trim();
        if (!trimmedEventId || trimmedEventId === DEFAULT_EVENT_ID) return;

        const currentEvents = get().eventsCatalog;
        const targetExists = currentEvents.some((event) => event.id === trimmedEventId);
        if (!targetExists) return;

        const remainingEvents = currentEvents.filter((event) => event.id !== trimmedEventId);
        const fallbackActiveEvent = remainingEvents[0]?.id || DEFAULT_EVENT_ID;
        const nextActiveEventId = get().activeEventId === trimmedEventId ? fallbackActiveEvent : get().activeEventId;

        const { db } = getFirebase();
        await deleteEventFromFirestore(db, trimmedEventId);

        await setDoc(getEventsIndexRef(db), {
          events: remainingEvents,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        if (get().activeEventId === trimmedEventId) {
          set({
            eventsCatalog: remainingEvents,
            activeEventId: nextActiveEventId,
            waves: {},
            currentWaveId: null,
            isDataLoaded: false,
            lastFirebaseSync: null,
            activeWaves: new Set<string>(),
          });
          await get().loadAll();
          return;
        }

        set({ eventsCatalog: remainingEvents });
      },

      setActiveEvent: async (eventId) => {
        const exists = get().eventsCatalog.some((e) => e.id === eventId);
        if (!exists) return;

        // Immediately clear movements so no old ones show during load
        set({ customEvents: [] });

        // Aggressively reset all event-specific state to true empty/defaults
        set({
          activeEventId: eventId,
          waves: {},
          currentWaveId: null,
          isDataLoaded: false,
          lastFirebaseSync: null,
          activeWaves: new Set<string>(),
          // Reset other event-specific state if needed
          eventNotes: '',
          customEvents: WAVE_EVENTS,
          intervalMinutes: 5,
          workMinutes: 3,
          restMinutes: 2,
          movementTimingMode: 'global',
          movementIntervals: {},
          maxParticipants: 10,
          workoutTimerWorkSeconds: 60,
          workoutTimerRestSeconds: 30,
          eventStartDate: new Date().toISOString().split('T')[0],
          eventStartTime: '08:00',
          totalWaves: 30,
          eventBranding: DEFAULT_BRANDING,
          themeColors: getThemeColors(DEFAULT_BRANDING),
        });

        await get().loadAll();
      },

      updateEventBranding: async (updates, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        const current = state.eventBranding;
        const nextBranding: EventBranding = {
          ...current,
          ...updates,
        };
        const brandingForFirestore = sanitizeBrandingForFirestore(nextBranding);

        if (targetEventId === state.activeEventId) {
          set({
            eventBranding: nextBranding,
            themeColors: getThemeColors(nextBranding),
          });
        }

        const { db } = getFirebase();
        await setDoc(getEventConfigRef(db, targetEventId), {
          branding: brandingForFirestore,
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        if (updates.title && updates.title.trim()) {
          const nextEvents = get().eventsCatalog.map((e) =>
            e.id === targetEventId ? { ...e, name: updates.title!.trim() } : e
          );
          set({ eventsCatalog: nextEvents });
          await setDoc(getEventsIndexRef(db), {
            events: nextEvents,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      },

      updateWaveEvents: async (events, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        const canUpdateLocalState = targetEventId === state.activeEventId;
        if (canUpdateLocalState) {
          set({ customEvents: events });
        }
        
        // Update all existing participants to include new events
        const waves = canUpdateLocalState ? get().waves : {};
        const updatedWaves = Object.keys(waves).reduce((acc, waveId) => {
          const wave = waves[waveId];
          const updatedParticipants = wave.participants.map(participant => ({
            ...participant,
            waveData: {
              ...participant.waveData,
              ...createInitialWaveData(events)
            }
          }));
          acc[waveId] = { ...wave, participants: updatedParticipants };
          return acc;
        }, {} as Record<string, Wave>);
        if (canUpdateLocalState) {
          set({ waves: updatedWaves });
        }
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          
          // Save config to Firebase
          const configRef = getEventConfigRef(db, targetEventId);
          await setDoc(configRef, {
            customEvents: events,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          // Update all existing participants in Firebase with new events
          
          for (const [waveId, wave] of Object.entries(updatedWaves)) {
            const waveRef = doc(getEventWavesCollection(db, targetEventId), waveId);
            const participantsCol = collection(waveRef, 'participants');
            
            for (const participant of wave.participants) {
              const participantRef = doc(participantsCol, participant.id);
              await setDoc(participantRef, {
                id: participant.id,
                name: participant.name,
                waveData: participant.waveData,
                includeInLeaderboard: participant.includeInLeaderboard !== false, // Default to true unless explicitly false
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }
          
        } catch (error) {
          console.error('❌ Failed to save custom events to Firebase:', error);
        }
      },

      // Batch save everything to Firestore (single-user)
      saveAll: async () => {
        const { db } = getFirebase();
        const s = get();

        // Save global config
        const configRef = getEventConfigRef(db, s.activeEventId);
        const batch = writeBatch(db);
        batch.set(configRef, {
          customEvents: s.customEvents,
          timing: {
            intervalMinutes: s.intervalMinutes,
            workMinutes: s.workMinutes,
            restMinutes: s.restMinutes,
            movementMode: s.movementTimingMode,
            movementIntervals: s.movementIntervals,
          },
          eventNotes: s.eventNotes,
          maxParticipants: s.maxParticipants,
          eventClockEnabled: s.eventClockEnabled,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Save waves
        const nextWaves: Record<string, Wave> = {};
        for (const wave of Object.values(s.waves)) {
          const filteredParticipants = wave.participants.filter(
            (p) => p.name && p.name.trim().length > 0
          );
          const waveRef = doc(getEventWavesCollection(db, s.activeEventId), wave.id);
          batch.set(waveRef, {
            id: wave.id,
            name: wave.name,
            startTime: wave.startTime,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Reconcile participants: delete any removed participants in Firestore
          try {
            const partsSnap = await getDocs(collection(waveRef, 'participants'));
            const existingIds = new Set(partsSnap.docs.map((d) => d.id));
            const currentIds = new Set(filteredParticipants.map((p) => p.id));
            for (const id of existingIds) {
              if (!currentIds.has(id)) {
                batch.delete(doc(collection(waveRef, 'participants'), id));
              }
            }
          } catch {
            // ignore delete discovery errors
          }

          for (const p of filteredParticipants) {
            const pRef = doc(collection(waveRef, 'participants'), p.id);
            batch.set(pRef, {
              id: p.id,
              name: p.name,
              waveData: p.waveData,
              includeInLeaderboard: p.includeInLeaderboard !== false, // Default to true unless explicitly false
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }

          // Stage local state update to drop emptied participants
          nextWaves[wave.id] = { ...wave, participants: filteredParticipants } as Wave;
        }

        await batch.commit();
        set((curr) => ({ lastSavedAt: Date.now(), waves: { ...curr.waves, ...nextWaves } }));
      },

      // Load global config from Firebase (called when config modal opens)
      loadGlobalConfig: async () => {
        secureLogger.log('🔄 Loading fresh global config from Firebase...');
        const { db } = getFirebase();

        try {
          const cfgRef = getEventConfigRef(db, get().activeEventId);
          const cfgSnap = await getDoc(cfgRef);
          let eventPasscode: string | null = null;
          let legacyEventClockEnabled: boolean | undefined;
          if (cfgSnap.exists()) {
            const data = cfgSnap.data() as FirebaseConfigData;
            secureLogger.log('📋 Loaded config from Firebase:', data);

            if (Array.isArray(data.customEvents)) {
              set({ customEvents: data.customEvents as string[] });
            }
            if (data.timing) {
              const { intervalMinutes, workMinutes, restMinutes, movementMode, movementIntervals } = data.timing;
              const normalizedIntervals = Object.fromEntries(
                Object.entries(movementIntervals || {}).map(([movementName, values]) => [
                  movementName,
                  {
                    workMinutes: Math.max(0, Number(values?.workMinutes) || 0),
                    restMinutes: Math.max(0, Number(values?.restMinutes) || 0),
                  },
                ])
              ) as MovementIntervals;
              set({
                intervalMinutes: Number(intervalMinutes) || 5,
                workMinutes: Number(workMinutes) || 3,
                restMinutes: Number(restMinutes) || 2,
                movementTimingMode: movementMode === 'individual' ? 'individual' : 'global',
                movementIntervals: normalizedIntervals,
              });
            }
            if (typeof data.eventNotes === 'string') {
              set({ eventNotes: data.eventNotes });
            }
            if (typeof data.maxParticipants === 'number') {
              set({ maxParticipants: data.maxParticipants });
            }
            if (data.workoutTimer) {
              const { workSeconds, restSeconds } = data.workoutTimer;
              set({
                workoutTimerWorkSeconds: Number(workSeconds) || 60,
                workoutTimerRestSeconds: Number(restSeconds) || 30,
              });
            }
            if (data.event) {
              const { startDate, startTime, totalWaves } = data.event;
              secureLogger.log('📅 Loaded event config:', { startDate, startTime, totalWaves });
              set({
                eventStartDate: startDate || new Date().toISOString().split('T')[0],
                eventStartTime: startTime || '08:00',
                totalWaves: Number(totalWaves) || 30,
              });
            }
            if (data.alertSettings) {
              set({ alertSettings: data.alertSettings });
            }
            if (typeof data.accessPasscode === 'string') {
              eventPasscode = data.accessPasscode;
            }
            if (typeof data.eventClockEnabled === 'boolean') {
              legacyEventClockEnabled = data.eventClockEnabled;
            }
            if (typeof data.feedbackEnabled === 'boolean') {
              set({ feedbackEnabled: data.feedbackEnabled });
            } else {
              set({ feedbackEnabled: false });
            }
            // Always fully overwrite eventBranding with Firestore data + defaults
            const b = (data.branding || {}) as Partial<EventBranding>;
            const theme = b.theme || DEFAULT_BRANDING.theme;
            const nextBranding: EventBranding = {
              title: typeof b.title === 'string' && b.title.trim() ? b.title : DEFAULT_BRANDING.title,
              emojiLeft: typeof b.emojiLeft === 'string' ? b.emojiLeft : DEFAULT_BRANDING.emojiLeft,
              emojiRight: typeof b.emojiRight === 'string' ? b.emojiRight : DEFAULT_BRANDING.emojiRight,
              theme,
              customColor: b.customColor
                ? normalizeHexColor(b.customColor, THEME_PRESETS[theme].accent)
                : undefined,
              customGradient: b.customGradient
                ? {
                    start: normalizeHexColor(b.customGradient.start, THEME_PRESETS[theme].start),
                    mid: normalizeHexColor(b.customGradient.mid, THEME_PRESETS[theme].mid),
                    end: normalizeHexColor(b.customGradient.end, THEME_PRESETS[theme].end),
                  }
                : undefined,
            };
            set({
              eventBranding: nextBranding,
              themeColors: getThemeColors(nextBranding),
            });
          }

          const sharedRef = getGlobalSettingsRef(db);
          const sharedSnap = await getDoc(sharedRef);
          if (sharedSnap.exists()) {
            const sharedData = sharedSnap.data() as FirebaseConfigData;
            if (typeof sharedData.accessPasscode === 'string') {
              set({ accessPasscode: sharedData.accessPasscode });
            }
            if (typeof sharedData.passcodeProtectionEnabled === 'boolean') {
              set({ passcodeProtectionEnabled: sharedData.passcodeProtectionEnabled });
            }
            if (typeof sharedData.eventClockEnabled === 'boolean') {
              set({ eventClockEnabled: sharedData.eventClockEnabled });
              if (typeof window !== 'undefined') {
                window.__INSPECT_ENABLED = !sharedData.eventClockEnabled;
              }
            } else if (typeof legacyEventClockEnabled === 'boolean') {
              set({ eventClockEnabled: legacyEventClockEnabled });
              if (typeof window !== 'undefined') {
                window.__INSPECT_ENABLED = !legacyEventClockEnabled;
              }
              await setDoc(sharedRef, {
                eventClockEnabled: legacyEventClockEnabled,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          } else if (eventPasscode) {
            // One-time migration path: promote existing event-scoped passcode to global setting.
            await setDoc(sharedRef, {
              accessPasscode: eventPasscode,
              passcodeProtectionEnabled: get().passcodeProtectionEnabled,
              eventClockEnabled: typeof legacyEventClockEnabled === 'boolean' ? legacyEventClockEnabled : get().eventClockEnabled,
              updatedAt: new Date().toISOString(),
            }, { merge: true });
            set({ accessPasscode: eventPasscode });
            if (typeof legacyEventClockEnabled === 'boolean') {
              set({ eventClockEnabled: legacyEventClockEnabled });
              if (typeof window !== 'undefined') {
                window.__INSPECT_ENABLED = !legacyEventClockEnabled;
              }
            }
          } else if (typeof legacyEventClockEnabled === 'boolean') {
            set({ eventClockEnabled: legacyEventClockEnabled });
            if (typeof window !== 'undefined') {
              window.__INSPECT_ENABLED = !legacyEventClockEnabled;
            }
          }
        } catch (e) {
          secureLogger.error('Error loading config:', e);
        }
      },

      // Load data from Firebase on app startup (with caching)
      loadAll: async () => {
        const state = get();
        const FRESHNESS_TTL_MS = 30_000; // 30 seconds
        const age = state.lastFirebaseSync ? Date.now() - state.lastFirebaseSync : Infinity;
        if (state.isDataLoaded && age < FRESHNESS_TTL_MS) {
          secureLogger.log(`⚡ loadAll skipped — data is fresh (${Math.round(age / 1000)}s old)`);
          return;
        }

        secureLogger.log('🔄 Loading fresh data from Firebase...');

        // Ensure active event and event list are loaded first
        await get().loadEventsCatalog();
        
        // Load global config first
        await get().loadGlobalConfig();

        // Load waves
        const { db } = getFirebase();
        try {
          const wavesCol = getEventWavesCollection(db, get().activeEventId);
          const wavesSnap = await getDocs(wavesCol);
          
          secureLogger.log(`🌊 Found ${wavesSnap.docs.length} waves in Firebase`);

          const loadedEntries = await Promise.all(
            wavesSnap.docs.map(async (waveDoc) => {
              const w = waveDoc.data() as FirebaseWaveData;
              secureLogger.log(`🌊 Loading wave ${waveDoc.id}:`, w.name);

              const participants = await loadWaveParticipants(waveDoc.ref);

              secureLogger.log(`👥 Found ${participants.length} participants in wave ${waveDoc.id}`);

              return [
                waveDoc.id,
                {
                  id: waveDoc.id,
                  name: w.name || waveDoc.id,
                  startTime: w.startTime || '',
                  coach: w.coach || '',
                  participants,
                } as Wave,
              ] as const;
            })
          );

          const loaded = Object.fromEntries(loadedEntries) as Record<string, Wave>;
          
          secureLogger.log(`✅ Loaded ${Object.keys(loaded).length} waves total`);
          
          if (Object.keys(loaded).length > 0) {
            const firstId = Object.keys(loaded)[0];
            set({ 
              waves: loaded, 
              currentWaveId: firstId, 
              isDataLoaded: true,
              lastFirebaseSync: Date.now()
            });
            secureLogger.log('✅ Set waves in store, current wave:', firstId);
          } else {
            set({ 
              isDataLoaded: true,
              lastFirebaseSync: Date.now()
            });
            secureLogger.log('✅ No waves found, marked as loaded');
          }
        } catch (e) {
          console.error('Error loading waves:', e);
          set({ 
            isDataLoaded: true,
            lastFirebaseSync: Date.now()
          }); // Mark as loaded even on error to prevent retry loops
        }
      },

      // Invalidate cache to force reload
      invalidateCache: () => {
        console.log('🗑️ Invalidating cache, will reload on next access');
        set({ isDataLoaded: false });
      },

      clearCacheAndReload: async () => {
        console.log('🧹 Clearing cache and forcing fresh data load from Firebase...');
        console.log('📋 Note: Global config (timing, events, dates) always loads from Firebase');
        set({ 
          isDataLoaded: false,
          waves: {},
          currentWaveId: null,
          activeWaves: new Set()
        });
        await get().loadAll();
        console.log('✅ Cache cleared and fresh data loaded from Firebase');
      },

      // Smart sync with Firebase (only syncs active waves)
      syncWithFirebase: async () => {
        const state = get();
        const now = Date.now();
        const activeEventId = state.activeEventId;
        
        // Smart cooldown based on user activity
        const cooldown = state.isUserActive ? 1000 : 5000; // 1s if active, 5s if inactive
        
        if (state.lastFirebaseSync && (now - state.lastFirebaseSync) < cooldown) {
          console.log(`⏰ Skipping sync - too recent (${cooldown}ms cooldown)`);
          return;
        }
        
        console.log(`🔄 Smart sync: checking for globally active waves...`);
        const { db } = getFirebase();
        
        // Load active waves from Firebase (global active status)
        let globalActiveWaves = new Set<string>();
        try {
          const activeWavesCol = getEventActiveWavesCollection(db, activeEventId);
          const activeWavesSnap = await getDocs(activeWavesCol);
          if (get().activeEventId !== activeEventId) {
            console.log('⏭️ Skipping sync - active event changed during fetch');
            return;
          }
          globalActiveWaves = new Set(
            activeWavesSnap.docs
              .map((docSnap) => docSnap.id)
              .filter((waveId) => typeof waveId === 'string' && waveId.length > 0)
          );
          console.log(`🌐 Found ${globalActiveWaves.size} globally active waves:`, Array.from(globalActiveWaves));
        } catch (error) {
          console.error('❌ Failed to load active waves from Firebase:', error);
        }
        
        // Only sync if there are globally active waves
        if (globalActiveWaves.size === 0) {
          console.log('⏰ Skipping sync - no globally active waves to monitor');
          set({ lastFirebaseSync: now });
          return;
        }
        
        console.log(`🔄 Smart sync: checking ${globalActiveWaves.size} globally active waves for multi-user updates...`);
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Only sync waves that are globally active (being edited by other users)
          for (const waveId of globalActiveWaves) {
            try {
              if (get().activeEventId !== activeEventId) {
                console.log('⏭️ Skipping wave sync - active event changed');
                return;
              }

              const waveRef = doc(getEventWavesCollection(db, activeEventId), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as FirebaseWaveData;
              
              // Load participants from subcollection
              const participants = await loadWaveParticipants(waveRef);
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                coach: w.coach || '',
                participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated active wave ${waveId} from Firebase`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({ 
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Smart sync complete - changes detected in active waves');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Smart sync complete - no changes in active waves');
          }
          
        } catch (error) {
          console.error('❌ Smart sync failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Smart sync with Firebase (no cooldown - for immediate updates)
      syncWithFirebaseNoCooldown: async () => {
        const state = get();
        const now = Date.now();
        const activeEventId = state.activeEventId;
        
        console.log(`🔄 Smart sync (no cooldown): checking for globally active waves...`);
        const { db } = getFirebase();
        
        // Load active waves from Firebase (global active status)
        let globalActiveWaves = new Set<string>();
        try {
          const activeWavesCol = getEventActiveWavesCollection(db, activeEventId);
          const activeWavesSnap = await getDocs(activeWavesCol);
          if (get().activeEventId !== activeEventId) {
            console.log('⏭️ Skipping no-cooldown sync - active event changed during fetch');
            return;
          }
          globalActiveWaves = new Set(
            activeWavesSnap.docs
              .map((docSnap) => docSnap.id)
              .filter((waveId) => typeof waveId === 'string' && waveId.length > 0)
          );
          console.log(`🌐 Found ${globalActiveWaves.size} globally active waves:`, Array.from(globalActiveWaves));
        } catch (error) {
          console.error('❌ Failed to load active waves from Firebase:', error);
        }
        
        // Only sync if there are globally active waves
        if (globalActiveWaves.size === 0) {
          console.log('⏰ Skipping sync - no globally active waves to monitor');
          set({ lastFirebaseSync: now });
          return;
        }
        
        console.log(`🔄 Smart sync (no cooldown): checking ${globalActiveWaves.size} globally active waves for multi-user updates...`);
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Only sync waves that are globally active (being edited by other users)
          for (const waveId of globalActiveWaves) {
            try {
              if (get().activeEventId !== activeEventId) {
                console.log('⏭️ Skipping wave sync - active event changed');
                return;
              }

              const waveRef = doc(getEventWavesCollection(db, activeEventId), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as FirebaseWaveData;
              
              // Load participants from subcollection
              const participants = await loadWaveParticipants(waveRef);
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                coach: w.coach || '',
                participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated wave ${waveId} from Firebase (no cooldown sync)`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({ 
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Smart sync (no cooldown) complete - changes detected in active waves');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Smart sync (no cooldown) complete - no changes in active waves');
          }
          
        } catch (error) {
          console.error('❌ Smart sync (no cooldown) failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Full sync with Firebase (syncs ALL waves, not just active ones)
      fullSyncWithFirebase: async () => {
        const state = get();
        const now = Date.now();
        
        console.log('🔄 Full sync: checking ALL waves for updates...');
        const { db } = getFirebase();
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Sync ALL waves, not just active ones
          for (const waveId of Object.keys(state.waves)) {
            try {
              const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as FirebaseWaveData;
              
              // Load participants from subcollection
              const participants = await loadWaveParticipants(waveRef);
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                coach: w.coach || '',
                participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated wave ${waveId} from Firebase (full sync)`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Full sync complete - changes detected');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Full sync complete - no changes detected');
          }
          
        } catch (error) {
          console.error('❌ Full sync failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Mark wave as active (being edited by this user) - GLOBAL in Firebase
      markWaveAsActive: async (waveId: string) => {
        const state = get();
        const newActiveWaves = new Set(state.activeWaves);
        newActiveWaves.add(waveId);
        set({ activeWaves: newActiveWaves });
        console.log(`📝 Marked wave ${waveId} as active (${newActiveWaves.size} total active waves)`);
        
        // Mark user as active when they start editing
        get().setUserActivity();
        
        // Save active status to Firebase so other users can see it
        try {
          const { db } = getFirebase();
          const activeRef = doc(getEventActiveWavesCollection(db, get().activeEventId), waveId);
          await setDoc(activeRef, {
            waveId,
            activeAt: new Date().toISOString(),
            userId: 'user-' + Date.now() // Simple user ID for now
          }, { merge: true });
          console.log(`🌐 Saved active status to Firebase for wave ${waveId}`);
          
          // Immediately trigger sync for other users to see this wave is active
          setTimeout(() => {
            get().syncWithFirebaseNoCooldown();
          }, 100); // Small delay to ensure Firebase write completes
        } catch (error) {
          console.error('❌ Failed to save active status to Firebase:', error);
        }
      },

      // Mark wave as inactive (no longer being edited) - GLOBAL in Firebase
      markWaveAsInactive: async (waveId: string) => {
        const state = get();
        const newActiveWaves = new Set(state.activeWaves);
        newActiveWaves.delete(waveId);
        set({ activeWaves: newActiveWaves });
        console.log(`📝 Marked wave ${waveId} as inactive (${newActiveWaves.size} total active waves)`);
        
        // Remove active status from Firebase
        try {
          const { db } = getFirebase();
          const activeRef = doc(getEventActiveWavesCollection(db, get().activeEventId), waveId);
          await deleteDoc(activeRef);
          console.log(`🌐 Removed active status from Firebase for wave ${waveId}`);
        } catch (error) {
          console.error('❌ Failed to remove active status from Firebase:', error);
        }
      },

      // Force update all participants with current custom events
      forceUpdateAllParticipants: async () => {
        console.log('🔄 Force updating all participants with current custom events...');
        const { db } = getFirebase();
        const state = get();
        
        try {
          for (const [waveId, wave] of Object.entries(state.waves)) {
            console.log(`🌊 Force updating wave ${waveId} with ${wave.participants.length} participants`);
            const waveRef = doc(getEventWavesCollection(db, get().activeEventId), waveId);
            const participantsCol = collection(waveRef, 'participants');
            
            for (const participant of wave.participants) {
              // Ensure participant has all current custom events
              const updatedWaveData = {
                ...participant.waveData,
                ...createInitialWaveData(state.customEvents)
              };
              
              console.log(`👤 Force updating participant ${participant.id} (${participant.name})`);
              const participantRef = doc(participantsCol, participant.id);
              await setDoc(participantRef, {
                id: participant.id,
                name: participant.name,
                waveData: updatedWaveData,
                includeInLeaderboard: participant.includeInLeaderboard !== false, // Default to true unless explicitly false
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
            console.log(`✅ Force updated ${wave.participants.length} participants in wave ${waveId}`);
          }
          console.log('✅ All participants force updated with current custom events');
        } catch (error) {
          console.error('❌ Failed to force update participants:', error);
        }
      },

      saveWavePerformance: async (waveId, eventId) => {
        const state = get();
        const targetEventId = resolveTargetEventId(state, eventId);
        const currentWave = state.waves[waveId];
        if (!currentWave) {
          throw new Error(`Cannot save wave performance for unknown wave: ${waveId}`);
        }

        const { db } = getFirebase();
        const waveRef = doc(getEventWavesCollection(db, targetEventId), waveId);

        await setDoc(waveRef, {
          id: currentWave.id,
          name: currentWave.name,
          startTime: currentWave.startTime,
          coach: currentWave.coach || '',
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        const participantsCol = collection(waveRef, 'participants');
        for (const participant of currentWave.participants) {
          if (!participant.id || !participant.name) {
            console.error('❌ Invalid participant data:', participant);
            continue;
          }

          const participantRef = doc(participantsCol, participant.id);
          await setDoc(participantRef, {
            id: participant.id,
            name: participant.name,
            waveData: participant.waveData,
            includeInLeaderboard: participant.includeInLeaderboard !== false,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }

        await get().syncWithFirebase();
      },

      // Mark user as active (for smart sync optimization)
      setUserActivity: () => {
        const now = Date.now();
        set({ 
          lastUserActivity: now,
          isUserActive: true 
        });
        
        // Reset user activity after 30 seconds of inactivity
        setTimeout(() => {
          const state = get();
          if (state.lastUserActivity && (Date.now() - state.lastUserActivity) > 30000) {
            set({ isUserActive: false });
            console.log('👤 User marked as inactive, reducing sync frequency');
          }
        }, 30000);
      },

      // Set sync interval (for dynamic optimization)
      setSyncInterval: (interval: number) => {
        set({ syncInterval: interval });
        console.log(`⏱️ Sync interval updated to ${interval}ms`);
      },


    }),
    {
      name: 'exos-wave-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        activeEventId: s.activeEventId,
        eventsCatalog: s.eventsCatalog,
        eventBranding: s.eventBranding,
        themeColors: s.themeColors,
        // Only cache wave data and UI state - NOT global config
        waves: s.waves,
        currentWaveId: s.currentWaveId,
        isDataLoaded: s.isDataLoaded,
        lastFirebaseSync: s.lastFirebaseSync,
        // Global config (customEvents, timing, eventStartDate, etc.) always loads from Firebase
      }),
      onRehydrateStorage: () => (state) => {
        // Ensure all required fields have default values (will be overwritten by Firebase load)
        if (state) {
          if (!state.activeEventId) {
            state.activeEventId = DEFAULT_EVENT_ID;
          }
          if (!state.eventsCatalog || state.eventsCatalog.length === 0) {
            state.eventsCatalog = [{ id: DEFAULT_EVENT_ID, name: 'G-ROX' }];
          }
          if (!state.eventBranding) {
            state.eventBranding = DEFAULT_BRANDING;
          }
          if (!state.themeColors) {
            state.themeColors = THEME_PRESETS[state.eventBranding.theme || DEFAULT_BRANDING.theme];
          }
          // Set defaults for global config that will be loaded from Firebase
          // This prevents crashes while Firebase is loading
          if (!state.customEvents) {
            state.customEvents = WAVE_EVENTS;
          }
          if (!state.intervalMinutes) {
            state.intervalMinutes = 5;
          }
          if (!state.workMinutes) {
            state.workMinutes = 3;
          }
          if (!state.restMinutes) {
            state.restMinutes = 2;
          }
          if (!state.movementTimingMode) {
            state.movementTimingMode = 'global';
          }
          if (!state.movementIntervals) {
            state.movementIntervals = {};
          }
          if (!state.maxParticipants) {
            state.maxParticipants = 10;
          }
          if (!state.workoutTimerWorkSeconds) {
            state.workoutTimerWorkSeconds = 60;
          }
          if (!state.workoutTimerRestSeconds) {
            state.workoutTimerRestSeconds = 30;
          }
          if (!state.eventStartDate) {
            state.eventStartDate = new Date().toISOString().split('T')[0];
          }
          if (!state.eventStartTime) {
            state.eventStartTime = '08:00';
          }
          if (!state.totalWaves) {
            state.totalWaves = 30;
          }
          if (typeof state.eventClockEnabled !== 'boolean') {
            state.eventClockEnabled = false;
          }
          if (typeof state.feedbackEnabled !== 'boolean') {
            state.feedbackEnabled = false;
          }
          if (!state.eventNotes) {
            state.eventNotes = '';
          }
          if (!state.accessPasscode) {
            state.accessPasscode = '54321Blastoff!';
          }
          if (typeof state.passcodeProtectionEnabled !== 'boolean') {
            state.passcodeProtectionEnabled = process.env.NEXT_PUBLIC_ENABLE_PASSCODE_PROTECTION === 'true';
          }
          if (!state.alertSettings) {
            state.alertSettings = {
              workRestTransitions: true,
              eventStartEnd: true,
              soundType: 'beep',
              visualEffect: 'flash'
            };
          }
          
          secureLogger.log('✅ Store rehydrated with defaults - will load fresh global config from Firebase');
        }
      },
    }
  )
);