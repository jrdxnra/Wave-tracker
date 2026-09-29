'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { isWebhookRegistrationRow } from '@/lib/registrationSource';
import { useWaveStore } from '@/store/waveStore';
import { findUnmatchedLiftPreferences } from '@/lib/liftFlightAlignment';

type RegistrationStatus = 'Pending' | 'Confirmed' | 'Waitlisted' | 'Needs Reassignment' | 'Cancelled';
type ManageAction = 'auto_allocate' | 'manual_override' | 'waitlist' | 'cancel';
const FLIGHT_DISPLAY_ORDER = ['Squat', 'Bench', 'Deadlift', 'Snatch', 'Clean & Jerk'];

function compareFlightMovements(first: string, second: string): number {
  const firstRank = FLIGHT_DISPLAY_ORDER.indexOf(first);
  const secondRank = FLIGHT_DISPLAY_ORDER.indexOf(second);
  return (firstRank < 0 ? 999 : firstRank) - (secondRank < 0 ? 999 : secondRank);
}

const getAttemptField = (movement: string, attempt: number) => `${movement}__attempt_${attempt}`;

interface PendingSyncState {
  targetStatus: RegistrationStatus;
  expectedWaveTime: string | null;
  startedAtMs: number;
}

interface RegistrationRow {
  id: string;
  name: string;
  entryMode: string;
  registrationStatus: RegistrationStatus;
  confirmedWaveTime: string | null;
  firstPreferenceHour: string;
  firstPreferenceFlexibility: string;
  secondPreferenceHour: string;
  secondPreferenceFlexibility: string;
  portalUrl: string;
  swimComfort: string;
  isFirstTri: boolean;
  groupName: string;
  source: string;
  sourceSheet: string;
  sourceWaitlistId: string;
  triggerSource: string;
  pingGroupOptIn: boolean;
  includeInLeaderboard: boolean;
  olympicLiftsOptIn: boolean;
  updatedAt: string;
  // Lift Event only: raw registration answers, reviewed/assigned manually by staff.
  registrationTemplate: string;
  division: string;
  genderCategory: string;
  bodyWeight: string;
  liftMovementPrs: Record<string, string>;
  squatFirstPreference: string;
  squatSecondPreference: string;
  squatOpenerWeight: string;
  benchFirstPreference: string;
  benchSecondPreference: string;
  benchOpenerWeight: string;
  deadliftFirstPreference: string;
  deadliftSecondPreference: string;
  deadliftOpenerWeight: string;
  olympicLiftingSelection: string;
  liftMovementFlights: Record<string, string>;
}

function getLiftPreferenceRows(row: RegistrationRow): Array<{ movement: string; preference: string; flight: string }> {
  const olympicAnswers = row.olympicLiftingSelection.split(/[,;\n]+/).map((answer) => answer.trim());
  const olympicPreference = (movement: 'Snatch' | 'Clean & Jerk') => olympicAnswers
    .filter((answer) => movement === 'Snatch' ? /snatch/i.test(answer) : /clean\s*(?:&|and)\s*jerk/i.test(answer))
    .map((answer) => answer.match(/\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M/i)?.[0] || answer)
    .join(' / ');
  const preferences: Record<string, string> = {
    Squat: [row.squatFirstPreference, row.squatSecondPreference].filter(Boolean).join(' / '),
    Bench: [row.benchFirstPreference, row.benchSecondPreference].filter(Boolean).join(' / '),
    Deadlift: [row.deadliftFirstPreference, row.deadliftSecondPreference].filter(Boolean).join(' / '),
    Snatch: olympicPreference('Snatch'),
    'Clean & Jerk': olympicPreference('Clean & Jerk'),
  };
  const movements = [...FLIGHT_DISPLAY_ORDER, ...Object.keys(row.liftMovementFlights).filter((movement) => !FLIGHT_DISPLAY_ORDER.includes(movement))];
  return movements
    .filter((movement) => preferences[movement] || row.liftMovementFlights[movement])
    .map((movement) => ({ movement, preference: preferences[movement] || '-', flight: row.liftMovementFlights[movement] || '-' }));
}

interface RegistrationsTabProps {
  eventId: string;
  accent: string;
  onNavigateToWaveTime?: (waveTime: string) => void;
}

function toStatus(value: string | undefined): RegistrationStatus {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'confirmed') return 'Confirmed';
  if (normalized === 'waitlisted') return 'Waitlisted';
  if (normalized === 'needs reassignment' || normalized === 'reassign' || normalized === 'limbo' || normalized === 'unassigned') return 'Needs Reassignment';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
  return 'Pending';
}

function getStatusChipClass(status: RegistrationStatus): string {
  if (status === 'Confirmed') return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  if (status === 'Waitlisted') return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (status === 'Needs Reassignment') return 'bg-violet-100 text-violet-800 border border-violet-200';
  if (status === 'Cancelled') return 'bg-red-100 text-red-800 border border-red-200';
  return 'bg-blue-100 text-blue-800 border border-blue-200';
}

function getBusyStatusLabel(action: ManageAction): string {
  if (action === 'auto_allocate') return 'Auto-assigning';
  if (action === 'manual_override') return 'Assigning';
  if (action === 'waitlist') return 'Waitlisting';
  if (action === 'cancel') return 'Cancelling';
  return 'Updating';
}

function getBusyStatusClass(): string {
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

function StatusSpinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />;
}

function getSwimComfortCode(swimComfort: string): string {
  const value = swimComfort.toLowerCase();
  if (value.includes('novice')) return 'N';
  if (value.includes('intermediate')) return 'I';
  if (value.includes('advanced')) return 'A';
  return '?';
}

function getSwimComfortLabel(swimComfort: string): string {
  const value = swimComfort.toLowerCase();
  if (value.includes('novice')) return 'Novice';
  if (value.includes('intermediate')) return 'Intermediate';
  if (value.includes('advanced')) return 'Advanced';
  return 'Unspecified';
}

function getSwimComfortBadgeClass(swimComfort: string): string {
  const code = getSwimComfortCode(swimComfort);
  if (code === 'N') return 'bg-amber-100 text-amber-700 border border-amber-200';
  if (code === 'I') return 'bg-blue-100 text-blue-700 border border-blue-200';
  if (code === 'A') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

function normalizeEntryMode(rawMode: string, groupName: string): 'single' | 'buddy' | 'group' {
  const mode = (rawMode || '').toLowerCase();
  const group = (groupName || '').toLowerCase().trim();

  if (mode.includes('single') || mode.includes('solo')) return 'single';
  if (mode.includes('buddy') || mode.includes('pair')) return 'buddy';
  if (mode.includes('group') || mode.includes('team')) return 'group';

  if (!group) return 'single';
  if (group.includes(',') || group.includes('&') || group.includes(' and ')) return 'group';
  return 'buddy';
}

function getEntryModeCode(entryMode: string, groupName: string): 'S' | 'B' | 'G' {
  const mode = normalizeEntryMode(entryMode, groupName);
  if (mode === 'group') return 'G';
  if (mode === 'buddy') return 'B';
  return 'S';
}

function getEntryModeLabel(entryMode: string, groupName: string): 'Single/Solo' | 'Buddy' | 'Group' {
  const mode = normalizeEntryMode(entryMode, groupName);
  if (mode === 'group') return 'Group';
  if (mode === 'buddy') return 'Buddy';
  return 'Single/Solo';
}

function getEntryModeBadgeClass(entryMode: string, groupName: string): string {
  const code = getEntryModeCode(entryMode, groupName);
  if (code === 'S') return 'bg-amber-100 text-amber-700 border border-amber-200';
  if (code === 'B') return 'bg-blue-100 text-blue-700 border border-blue-200';
  return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
}

function getCompanionDisplayName(entryMode: string, groupName: string): string {
  const code = getEntryModeCode(entryMode, groupName);
  if (code === 'S') return '';

  const raw = (groupName || '').trim();
  if (!raw) return '';

  const lowered = raw.toLowerCase();
  if (lowered.startsWith('none') || lowered.startsWith('solo')) return '';

  const cleaned = raw.replace(/^(group|buddy|single|solo)\s*[,:-]\s*/i, '').trim();
  return cleaned || '';
}

function summarizePreferenceFlexibility(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  if (lower.includes('no preference')) return 'any slot';
  if (lower.includes('start exactly')) {
    const minuteMatch = raw.match(/:(00|15|30|45)/);
    return minuteMatch ? `exact ${minuteMatch[0]}` : 'exact start';
  }

  const minuteRangeMatch = raw.match(/(\d{1,3})\s*minute/i);
  if (minuteRangeMatch) {
    return `within ${minuteRangeMatch[1]}m`;
  }

  return raw;
}

function buildPreferenceSummary(hour: string, flexibility: string): string {
  const time = (hour || '').trim();
  const flex = summarizePreferenceFlexibility(flexibility);
  if (time && flex) return `${time} • ${flex}`;
  return time || flex || '';
}

function normalizeParticipantName(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function waveIdFromTime(label: string): string {
  return `wave-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function CommunityOptIcon({
  label,
  glyph,
  optedIn,
}: {
  label: string;
  glyph: string;
  optedIn: boolean;
}) {
  return (
    <span className="relative inline-flex group">
      <span
        tabIndex={0}
        aria-label={`${label}: ${optedIn ? 'Opted in' : 'Opted out'}`}
        className={`relative inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold ${
          optedIn
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'bg-rose-100 text-rose-700 border border-rose-200'
        }`}
      >
        {glyph}
        {!optedIn && <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -rotate-12 bg-rose-700" />}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {label}: {optedIn ? 'Yes' : 'No'}
      </span>
    </span>
  );
}

function parseClockToMinutes(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([aApP][mM])$/);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    const meridiem = ampmMatch[3].toUpperCase();

    if (hour === 12) {
      hour = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hour += 12;
    }

    return hour * 60 + minute;
  }

  const hmMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hour = Number(hmMatch[1]);
    const minute = Number(hmMatch[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
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

function buildWaveTimes(startTime: string, totalWaves: number, intervalMinutes: number): string[] {
  const startMinutes = parseClockToMinutes(startTime);
  if (startMinutes === null) return [];
  if (!Number.isFinite(totalWaves) || totalWaves <= 0) return [];
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return [];

  const count = Math.floor(totalWaves);
  const interval = Math.floor(intervalMinutes);
  const times: string[] = [];

  for (let index = 0; index < count; index += 1) {
    times.push(formatMinutesToLabel(startMinutes + index * interval));
  }

  return times;
}

export default function RegistrationsTab({ eventId, accent, onNavigateToWaveTime }: RegistrationsTabProps) {
  const wavesById = useWaveStore((state) => state.waves);
  const isLiftEvent = useWaveStore((state) => state.movementTimingMode === 'lift');
  const olympicLiftMovements = useWaveStore((state) => state.olympicLiftMovements);
  const liftFlights = useWaveStore((state) => state.liftFlights);
  const updateParticipantData = useWaveStore((state) => state.updateParticipantData);
  const saveWavePerformance = useWaveStore((state) => state.saveWavePerformance);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RegistrationStatus>('All');
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [manualWaveSelection, setManualWaveSelection] = useState<Record<string, string>>({});
  const [rowBusyAction, setRowBusyAction] = useState<Record<string, string>>({});
  const [pendingSyncByRow, setPendingSyncByRow] = useState<Record<string, PendingSyncState>>({});
  const [configuredWaveTimes, setConfiguredWaveTimes] = useState<string[]>([]);
  const [configuredCapacity, setConfiguredCapacity] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSearch('');
    setStatusFilter('All');
    setFieldFilters({});
    setRegistrations([]);
    setSelectedRegistrationId(null);
    let db: Firestore;
    try {
      db = getFirestore(getFirebase().app);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to initialize Firebase.';
      setErrorMessage(message);
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    const regsRef = collection(db, 'events', eventId, 'registrations');
    const regsQuery = query(regsRef, orderBy('updatedAt', 'desc'));

    const configRef = doc(db, 'events', eventId, 'config', 'global');

    const unsubRegs = onSnapshot(
      regsQuery,
      (snapshot) => {
        pendingScrollTopRef.current = listScrollRef.current ? listScrollRef.current.scrollTop : null;

        const rows = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: (data.name || '').trim(),
            entryMode: data.entryMode || '',
            registrationStatus: toStatus(data.registrationStatus),
            confirmedWaveTime: data.confirmedWaveTime || null,
            firstPreferenceHour: data.firstPreferenceHour || '',
            firstPreferenceFlexibility: data.firstPreferenceFlexibility || '',
            secondPreferenceHour: data.secondPreferenceHour || '',
            secondPreferenceFlexibility: data.secondPreferenceFlexibility || '',
            portalUrl: data.portalUrl || '',
            swimComfort: data.swimComfort || '',
            isFirstTri: !!data.isFirstTri,
            groupName: data.groupName || '',
            source: data.source || '',
            sourceSheet: data.sourceSheet || '',
            sourceWaitlistId: data.sourceWaitlistId || '',
            triggerSource: data.triggerSource || '',
            pingGroupOptIn: !!data.pingGroupOptIn,
            includeInLeaderboard: data.includeInLeaderboard !== false,
            olympicLiftsOptIn: data.olympicLiftsOptIn === true,
            updatedAt: data.updatedAt || '',
            registrationTemplate: data.registrationTemplate || '',
            division: data.division || '',
            genderCategory: data.genderCategory || data.division || '',
            bodyWeight: data.bodyWeight || '',
            liftMovementPrs: data.liftMovementPrs || {},
            squatFirstPreference: data.squatFirstPreference || '',
            squatSecondPreference: data.squatSecondPreference || '',
            squatOpenerWeight: data.squatOpenerWeight || '',
            benchFirstPreference: data.benchFirstPreference || '',
            benchSecondPreference: data.benchSecondPreference || '',
            benchOpenerWeight: data.benchOpenerWeight || '',
            deadliftFirstPreference: data.deadliftFirstPreference || '',
            deadliftSecondPreference: data.deadliftSecondPreference || '',
            deadliftOpenerWeight: data.deadliftOpenerWeight || '',
            olympicLiftingSelection: data.olympicLiftingSelection || '',
            liftMovementFlights: data.liftMovementFlights || {},
          } as RegistrationRow;
        });

        setRegistrations((prev) => {
          if (prev.length === 0) return rows;

          const previousOrder = new Map(prev.map((item, index) => [item.id, index]));

          const existingRows = rows
            .filter((item) => previousOrder.has(item.id))
            .sort((a, b) => (previousOrder.get(a.id) || 0) - (previousOrder.get(b.id) || 0));

          const newRows = rows
            .filter((item) => !previousOrder.has(item.id))
            .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

          return [...existingRows, ...newRows];
        });
        setIsLoading(false);
      },
      (error) => {
        setErrorMessage(error.message || 'Failed to read registrations.');
        setIsLoading(false);
      }
    );

    const unsubConfig = onSnapshot(
      configRef,
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        const startTime = String(data?.event?.startTime || '');
        const totalWaves = Number(data?.event?.totalWaves);
        const intervalMinutes = Number(data?.timing?.intervalMinutes);
        const maxParticipants = Number(data?.maxParticipants);
        const liftFlights = (data?.liftEvent?.flights || {}) as Record<string, unknown>;
        const liftFlightTimes = Object.values(liftFlights)
          .flatMap((flights) => Array.isArray(flights) ? flights : [])
          .map((flight) => {
            const minutes = parseClockToMinutes(String((flight as Record<string, unknown>).startTime || ''));
            return minutes === null ? null : formatMinutesToLabel(minutes);
          })
          .filter((time): time is string => Boolean(time));

        setConfiguredWaveTimes(
          data?.timing?.movementMode === 'lift' && liftFlightTimes.length > 0
            ? Array.from(new Set(liftFlightTimes)).sort((a, b) => (parseClockToMinutes(a) || 0) - (parseClockToMinutes(b) || 0))
            : buildWaveTimes(startTime, totalWaves, intervalMinutes)
        );
        setConfiguredCapacity(
          Number.isFinite(maxParticipants) && maxParticipants > 0
            ? Math.floor(maxParticipants)
            : null
        );
      },
      () => {
        setConfiguredWaveTimes([]);
        setConfiguredCapacity(null);
      }
    );

    return () => {
      unsubRegs();
      unsubConfig();
    };
  }, [eventId]);

  useEffect(() => {
    if (!listScrollRef.current || pendingScrollTopRef.current === null) return;
    listScrollRef.current.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
  }, [registrations]);

  const sheetRows = useMemo(() => {
    return registrations.filter((row) => {
      // Include webhook-originated rows even when legacy records are missing sourceSheet.
      return isWebhookRegistrationRow(row);
    });
  }, [registrations]);
  const selectedRegistration = sheetRows.find((row) => row.id === selectedRegistrationId);
  const selectedLiftPreferences = selectedRegistration ? getLiftPreferenceRows(selectedRegistration) : [];
  const selectedFlightParticipant = Object.values(wavesById).flatMap((wave) =>
    wave.participants.map((participant) => ({ waveId: wave.id, participant }))
  ).find(({ participant }) => participant.id === selectedRegistrationId);

  const availableFilters = useMemo(() => {
    const definitions: Array<{ key: string; label: string; values: (row: RegistrationRow) => string[] }> = [
      { key: 'division', label: 'Division', values: (row) => row.division ? [row.division] : [] },
      { key: 'swim', label: 'Swim Level', values: (row) => row.swimComfort ? [getSwimComfortLabel(row.swimComfort)] : [] },
      { key: 'entry', label: 'Entry Type', values: (row) => row.entryMode || row.groupName ? [getEntryModeLabel(row.entryMode, row.groupName)] : [] },
      { key: 'flight', label: 'Assigned Flight', values: (row) => Object.entries(row.liftMovementFlights)
        .filter(([, flight]) => Boolean(flight))
        .map(([movement, flight]) => `${movement} · ${flight}`) },
      { key: 'time', label: 'Assigned Time', values: (row) => row.confirmedWaveTime ? [row.confirmedWaveTime] : [] },
    ];
    if (sheetRows.some((row) => row.swimComfort || row.isFirstTri)) {
      definitions.push({ key: 'tri', label: 'First Triathlon', values: (row) => [row.isFirstTri ? 'Yes' : 'No'] });
    }

    return definitions.map((definition) => ({
      ...definition,
      options: Array.from(new Set(sheetRows.flatMap(definition.values))).sort((first, second) =>
        first.localeCompare(second, undefined, { numeric: true })
      ),
    })).filter((definition) => definition.options.length > 0);
  }, [sheetRows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return sheetRows.filter((row) => {
      if (statusFilter !== 'All' && row.registrationStatus !== statusFilter) return false;
      if (availableFilters.some((filter) => fieldFilters[filter.key] && !filter.values(row).includes(fieldFilters[filter.key]))) return false;

      if (!needle) return true;

      const haystack = `${row.name}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [sheetRows, search, statusFilter, availableFilters, fieldFilters]);

  const availableWaveTimes = useMemo(() => {
    const hasPersistedWaves = Object.keys(wavesById).length > 0;
    const fromWaveDocs = Object.values(wavesById)
      .map((wave) => String(wave.startTime || '').trim())
      .map((time) => {
        const minutes = parseClockToMinutes(time);
        return minutes === null ? null : formatMinutesToLabel(minutes);
      })
      .filter((time): time is string => Boolean(time));

    const persistedSubsetOfConfigured =
      fromWaveDocs.length > 0 && fromWaveDocs.every((time) => configuredWaveTimes.includes(time));

    const sourceTimes = hasPersistedWaves
      ? (persistedSubsetOfConfigured && configuredWaveTimes.length > fromWaveDocs.length
        ? [...fromWaveDocs, ...configuredWaveTimes]
        : fromWaveDocs)
      : configuredWaveTimes;
    return Array.from(new Set(sourceTimes)).sort((a, b) => {
      const minutesA = parseClockToMinutes(a);
      const minutesB = parseClockToMinutes(b);
      if (minutesA === null && minutesB === null) return a.localeCompare(b);
      if (minutesA === null) return 1;
      if (minutesB === null) return -1;
      return minutesA - minutesB;
    });
  }, [wavesById, configuredWaveTimes]);

  const duplicateNameSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of sheetRows) {
      const key = normalizeParticipantName(row.name);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const duplicates = new Set<string>();
    counts.forEach((count, key) => {
      if (count > 1) {
        duplicates.add(key);
      }
    });

    return duplicates;
  }, [sheetRows]);

  const waveCounts = useMemo(() => {
    const counts = Object.fromEntries(availableWaveTimes.map((time) => [time, 0])) as Record<string, number>;
    Object.values(wavesById).forEach((wave) => {
      if (isLiftEvent && wave.isOlympicFlight) return;
      const rawTime = String(wave.startTime || '').trim();
      const normalizedTime = parseClockToMinutes(rawTime);
      if (normalizedTime === null) return;
      const label = formatMinutesToLabel(normalizedTime);
      if (counts[label] === undefined) return;
      counts[label] += Array.isArray(wave.participants) ? wave.participants.length : 0;
    });
    return counts;
  }, [availableWaveTimes, wavesById, isLiftEvent]);

  const overCapacityWaveSet = useMemo(() => {
    const set = new Set<string>();
    if (configuredCapacity === null) return set;

    Object.entries(waveCounts).forEach(([time, count]) => {
      if (count > configuredCapacity) {
        set.add(time);
      }
    });

    return set;
  }, [waveCounts, configuredCapacity]);

  // Catches Google Form <-> Settings schedule drift: a lifter's preference that doesn't
  // land on any currently configured flight can never be assigned by staff.
  const unmatchedLiftPreferenceCount = useMemo(() => {
    const liftRows = sheetRows.filter((row) => row.registrationTemplate === 'lift-event');
    if (liftRows.length === 0) return 0;

    return liftRows.reduce((total, row) => {
      const mismatches = findUnmatchedLiftPreferences([
        { movement: 'Squat', firstPreference: row.squatFirstPreference, secondPreference: row.squatSecondPreference },
        { movement: 'Bench', firstPreference: row.benchFirstPreference, secondPreference: row.benchSecondPreference },
        { movement: 'Deadlift', firstPreference: row.deadliftFirstPreference, secondPreference: row.deadliftSecondPreference },
      ], liftFlights);
      return total + mismatches.length;
    }, 0);
  }, [sheetRows, liftFlights]);

  useEffect(() => {
    const pendingRows = Object.keys(pendingSyncByRow);
    if (pendingRows.length === 0) return;

    const intervalId = window.setInterval(() => {
      void useWaveStore.getState().loadAll();
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingSyncByRow, eventId]);

  useEffect(() => {
    setPendingSyncByRow((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [rowId, pending] of Object.entries(prev)) {
        const row = registrations.find((item) => item.id === rowId);
        if (!row) continue;

        const matchesConfirmedRow =
          pending.targetStatus === 'Confirmed' &&
          row.registrationStatus === 'Confirmed' &&
          (!pending.expectedWaveTime || row.confirmedWaveTime === pending.expectedWaveTime);
        const confirmedWave = pending.expectedWaveTime
          ? Object.values(wavesById).find((wave) => wave.startTime === pending.expectedWaveTime)
          : null;
        const participantVisibleInWave = Boolean(
          confirmedWave?.participants?.some((participant) => participant.id === rowId)
        );
        const pendingTooLong = Date.now() - pending.startedAtMs > 12000;
        const matchesConfirmed = matchesConfirmedRow && (participantVisibleInWave || pendingTooLong);
        const matchesOtherStatus = pending.targetStatus !== 'Confirmed' && row.registrationStatus === pending.targetStatus;

        if (matchesConfirmed || matchesOtherStatus) {
          delete next[rowId];
          changed = true;
          setRowBusyAction((busyPrev) => {
            if (!busyPrev[rowId]) return busyPrev;
            const busyNext = { ...busyPrev };
            delete busyNext[rowId];
            return busyNext;
          });
        }
      }

      return changed ? next : prev;
    });
  }, [registrations, wavesById]);

  const setBusy = (rowId: string, label: string | null) => {
    setRowBusyAction((prev) => {
      const next = { ...prev };
      if (label) {
        next[rowId] = label;
      } else {
        delete next[rowId];
      }
      return next;
    });
  };

  const handleOlympicOptInChange = async (row: RegistrationRow, olympicLiftsOptIn: boolean) => {
    setBusy(row.id, 'Updating Oly');

    try {
      const { db } = getFirebase();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'events', eventId, 'registrations', row.id), {
        participantId: row.id,
        olympicLiftsOptIn,
        updatedAt: now,
        source: 'manual-ops',
      }, { merge: true });

      const rosterWaves = Object.values(wavesById).filter((wave) =>
        wave.participants?.some((participant) => participant.id === row.id)
      );
      if (rosterWaves.length > 0) {
        await Promise.all(rosterWaves.map((wave) =>
          setDoc(doc(db, 'events', eventId, 'waves', wave.id, 'participants', row.id), {
            id: row.id,
            olympicLiftsOptIn,
            updatedAt: now,
          }, { merge: true })
        ));
        await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
      }
    } catch (error) {
      console.error('Failed to update Olympic lift opt-in:', error);
      alert('Failed to update Olympic lift opt-in. Please try again.');
    } finally {
      setBusy(row.id, null);
    }
  };

  const handleLiftFlightAssignment = async (
    row: RegistrationRow,
    action: 'assign_lift' | 'sync_lift',
    movement?: string,
    flightLabel?: string
  ) => {
    setBusy(row.id, action === 'sync_lift' ? 'Syncing' : 'Assigning');
    try {
      const response = await fetch('/api/register/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          participant_id: row.id,
          action,
          movement,
          flight_label: flightLabel,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to assign flight');
      await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to assign flight');
    } finally {
      setBusy(row.id, null);
    }
  };

  const handleRegistrationAttemptChange = (movement: string, value: string) => {
    if (!selectedFlightParticipant) return;
    const { waveId, participant } = selectedFlightParticipant;
    updateParticipantData(waveId, participant.id, getAttemptField(movement, 1), value);
    const weights = [1, 2, 3].map((attempt) => {
      const raw = attempt === 1 ? value : participant.waveData?.[getAttemptField(movement, attempt)];
      const parsed = parseFloat(raw || '');
      return Number.isFinite(parsed) ? parsed : 0;
    });
    const best = Math.max(...weights);
    updateParticipantData(waveId, participant.id, movement, best > 0 ? String(best) : '');
  };

  const handleLiftDetailChange = async (
    row: RegistrationRow,
    updates: Partial<Pick<RegistrationRow, 'genderCategory' | 'bodyWeight' | 'liftMovementPrs'>>
  ) => {
    setBusy(row.id, 'Saving');
    try {
      const { db } = getFirebase();
      const updatedAt = new Date().toISOString();
      await setDoc(doc(db, 'events', eventId, 'registrations', row.id), {
        participantId: row.id,
        ...updates,
        updatedAt,
        source: 'manual-ops',
      }, { merge: true });
      await Promise.all(Object.values(wavesById)
        .filter((wave) => wave.participants?.some((participant) => participant.id === row.id))
        .map((wave) => setDoc(doc(db, 'events', eventId, 'waves', wave.id, 'participants', row.id), {
          id: row.id,
          ...updates,
          updatedAt,
        }, { merge: true })));
      await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save participant details');
    } finally {
      setBusy(row.id, null);
    }
  };

  const runManageAction = async (row: RegistrationRow, action: Exclude<ManageAction, 'cancel'>) => {
    const manualWave = manualWaveSelection[row.id] || row.confirmedWaveTime || availableWaveTimes[0] || '';
    setBusy(row.id, action);
    let shouldWaitForSync = false;

    try {
      if (action === 'manual_override' && !manualWave) {
        throw new Error('Manual override requires configured waves in event settings.');
      }

      const res = await fetch('/api/register/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          participant_id: row.id,
          action,
          manual_wave_time: action === 'manual_override' ? manualWave : undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Failed to process action.');
      }

      shouldWaitForSync = true;
      const nextTargetStatus = toStatus(body.registrationStatus);
      setPendingSyncByRow((prev) => ({
        ...prev,
        [row.id]: {
          targetStatus: nextTargetStatus,
          expectedWaveTime: typeof body.assigned_wave === 'string' && body.assigned_wave.trim() ? body.assigned_wave : null,
          startedAtMs: Date.now(),
        },
      }));

      await useWaveStore.getState().loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(message);
    } finally {
      if (!shouldWaitForSync) {
        setBusy(row.id, null);
      }
    }
  };

  const runCancel = async (row: RegistrationRow) => {
    setBusy(row.id, 'cancel');
    let shouldWaitForSync = false;
    try {
      const res = await fetch('/api/register/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          participant_id: row.id,
          reason: 'manual dashboard cancel',
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || 'Failed to cancel registration.');
      }

      setPendingSyncByRow((prev) => ({
        ...prev,
        [row.id]: {
          targetStatus: 'Cancelled',
          expectedWaveTime: null,
          startedAtMs: Date.now(),
        },
      }));
      shouldWaitForSync = true;

      await useWaveStore.getState().loadAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(message);
    } finally {
      if (!shouldWaitForSync) {
        setBusy(row.id, null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Mini {isLiftEvent ? 'Flight' : 'Wave'} Tracker</h3>
        {availableWaveTimes.length === 0 && (
          <p className="text-xs text-gray-500 mb-2">Configure event times in Settings.</p>
        )}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {availableWaveTimes.map((time) => {
            const count = waveCounts[time] || 0;
            const atCapacity = configuredCapacity !== null && count >= configuredCapacity;
            const isOverCapacity = overCapacityWaveSet.has(time);
            return (
              <div
                key={time}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
                  isOverCapacity ? 'border border-yellow-300 bg-yellow-100' : 'border border-gray-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onNavigateToWaveTime?.(time)}
                  className="min-w-0 rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2"
                  style={{ ['--tw-ring-color' as string]: accent }}
                  title={`Open ${time} in ${isLiftEvent ? 'Flights' : 'Waves'} tab`}
                >
                  {time}
                </button>
                <span className={`text-xs font-semibold ${atCapacity ? 'text-red-700' : 'text-gray-900'}`}>
                  {configuredCapacity !== null ? `${count}/${configuredCapacity}` : `${count}/-`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {unmatchedLiftPreferenceCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            ⚠️ {unmatchedLiftPreferenceCount} lift preference{unmatchedLiftPreferenceCount === 1 ? '' : 's'} don&apos;t match any currently configured flight.
          </p>
          <p className="text-xs text-red-700 mt-1">
            This means the Google Form&apos;s time slots and this event&apos;s Settings flights are out of sync for at least one lift.
            Check Settings against the real Form questions before assigning flights.
          </p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
            aria-label="Search registrations by name"
            className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | RegistrationStatus)}
            className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
          >
            <option value="All">All Statuses</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Pending">Pending</option>
            <option value="Waitlisted">Waitlisted</option>
            <option value="Needs Reassignment">Needs Reassignment</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          {availableFilters.map((filter) => (
            <select
              key={filter.key}
              aria-label={`Filter by ${filter.label}`}
              value={fieldFilters[filter.key] || ''}
              onChange={(event) => setFieldFilters((previous) => ({ ...previous, [filter.key]: event.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
            >
              <option value="">{filter.key === 'tri' ? 'First Triathlon: Any' : `All ${filter.label}s`}</option>
              {filter.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ))}

        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isLiftEvent ? 'lg:grid-cols-2' : 'xl:grid-cols-[minmax(0,1fr)_270px]'}`}>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-600">Loading registrations...</div>
          ) : errorMessage ? (
            <div className="p-8 text-center text-red-700">{errorMessage}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No registrations found for this filter.</div>
          ) : (
            <div ref={listScrollRef} className="overflow-x-auto">
              <table className={`min-w-full text-sm ${isLiftEvent ? 'table-fixed' : ''}`}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={`text-left px-3 py-2.5 font-semibold text-gray-700 ${isLiftEvent ? 'w-[28%]' : ''}`}>Participant</th>
                    <th className={`text-left px-3 py-2.5 font-semibold text-gray-700 ${isLiftEvent ? 'w-[22%]' : ''}`}>Status</th>
                    {isLiftEvent ? (
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-700">Assigned Flights</th>
                    ) : (
                      <>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Preferences</th>
                        <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Assigned Wave</th>
                      </>
                    )}
                    {!isLiftEvent && <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const firstPref = buildPreferenceSummary(row.firstPreferenceHour, row.firstPreferenceFlexibility);
                    const secondPref = buildPreferenceSummary(row.secondPreferenceHour, row.secondPreferenceFlexibility);
                    const busyAction = rowBusyAction[row.id] || '';
                    const duplicateName = normalizeParticipantName(row.name);
                    const isDuplicate = !!duplicateName && duplicateNameSet.has(duplicateName);
                    const isOverCapacityAssignment =
                      row.registrationStatus === 'Confirmed' &&
                      !!row.confirmedWaveTime &&
                      overCapacityWaveSet.has(row.confirmedWaveTime);

                    const rowClass = isOverCapacityAssignment
                      ? 'bg-yellow-100 hover:bg-yellow-200'
                      : isDuplicate
                        ? 'bg-violet-100 hover:bg-violet-200'
                        : 'hover:bg-gray-50';

                    return (
                      <tr
                        key={row.id}
                        onClick={isLiftEvent ? () => setSelectedRegistrationId(row.id) : undefined}
                        onKeyDown={isLiftEvent ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedRegistrationId(row.id);
                          }
                        } : undefined}
                        tabIndex={isLiftEvent ? 0 : undefined}
                        aria-selected={isLiftEvent ? selectedRegistrationId === row.id : undefined}
                        className={`border-b border-gray-100 ${isLiftEvent ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500' : ''} ${isLiftEvent && selectedRegistrationId === row.id ? 'bg-blue-50' : rowClass}`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className={`flex items-center gap-1.5 whitespace-nowrap ${row.registrationTemplate === 'lift-event' ? 'min-w-[160px]' : 'min-w-[280px]'}`}>
                            <span className="font-semibold text-gray-900">{row.name || 'Unnamed participant'}</span>

                            {row.registrationTemplate !== 'lift-event' && (
                              <>
                                <span className="relative inline-flex group">
                                  <span
                                    tabIndex={0}
                                    aria-label={`Entry type ${getEntryModeLabel(row.entryMode, row.groupName)}`}
                                    className={`inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold ${getEntryModeBadgeClass(row.entryMode, row.groupName)}`}
                                  >
                                    {getEntryModeCode(row.entryMode, row.groupName)}
                                  </span>
                                  <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                    Entry: {getEntryModeLabel(row.entryMode, row.groupName)}
                                  </span>
                                </span>

                                <CommunityOptIcon label="Ping group" glyph="P" optedIn={row.pingGroupOptIn} />
                                <CommunityOptIcon label="Leaderboard" glyph="🏆" optedIn={row.includeInLeaderboard} />
                              </>
                            )}

                            {row.registrationTemplate !== 'lift-event' && olympicLiftMovements.length > 0 && (
                              <label className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                <input
                                  type="checkbox"
                                  checked={row.olympicLiftsOptIn}
                                  disabled={!!rowBusyAction[row.id]}
                                  onChange={(event) => {
                                    void handleOlympicOptInChange(row, event.target.checked);
                                  }}
                                  className="h-3 w-3 rounded border-amber-300"
                                />
                                Oly
                              </label>
                            )}

                            {row.registrationTemplate !== 'lift-event' && getCompanionDisplayName(row.entryMode, row.groupName) && (
                              <span className="relative inline-flex group">
                                <span
                                  tabIndex={0}
                                  aria-label={`${getEntryModeCode(row.entryMode, row.groupName) === 'G' ? 'Team' : 'Buddy'} ${getCompanionDisplayName(row.entryMode, row.groupName)}`}
                                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 max-w-[120px] truncate"
                                >
                                  {getCompanionDisplayName(row.entryMode, row.groupName)}
                                </span>
                                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                  {getEntryModeCode(row.entryMode, row.groupName) === 'G' ? 'Team' : 'Buddy'}: {getCompanionDisplayName(row.entryMode, row.groupName)}
                                </span>
                              </span>
                            )}

                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle whitespace-nowrap">
                          {rowBusyAction[row.id] ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getBusyStatusClass()}`}>
                              <StatusSpinner />
                              <span>{getBusyStatusLabel(rowBusyAction[row.id] as ManageAction)}</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusChipClass(row.registrationStatus)}`}>
                              {row.registrationStatus}
                            </span>
                          )}
                        </td>
                        {isLiftEvent ? (
                          <td className="min-w-0 px-3 py-2 align-middle text-xs text-gray-700">
                            {row.registrationTemplate === 'lift-event' ? (
                              <div className="flex min-w-0 gap-4 overflow-x-auto whitespace-nowrap leading-5">
                                {Object.entries(row.liftMovementFlights)
                                  .filter(([, flight]) => Boolean(flight))
                                  .sort(([first], [second]) => compareFlightMovements(first, second))
                                  .map(([movement, flight]) => (
                                    <span key={movement} className="shrink-0">
                                      <span className="font-semibold">{movement}:</span> {flight}
                                    </span>
                                  ))}
                                {!Object.values(row.liftMovementFlights).some(Boolean) && <span>-</span>}
                              </div>
                            ) : row.confirmedWaveTime || '-'}
                          </td>
                        ) : (
                          <>
                          <td className="min-w-[240px] px-3 py-2 align-middle text-gray-700">
                            <div className="space-y-0.5 leading-tight">
                              {firstPref ? (
                                <div className="truncate" title={firstPref}>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-1">1st</span>
                                  <span>{firstPref}</span>
                                </div>
                              ) : null}
                              {secondPref ? (
                                <div className="truncate" title={secondPref}>
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-1">2nd</span>
                                  <span>{secondPref}</span>
                                </div>
                              ) : null}
                              {!firstPref && !secondPref ? <span>-</span> : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-gray-700">{row.confirmedWaveTime || '-'}</td>
                          </>
                        )}
                        {row.registrationTemplate !== 'lift-event' && (
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap items-center gap-1 min-w-[300px]">
                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={() => {
                                void runManageAction(row, 'auto_allocate');
                              }}
                              className="inline-flex h-7 items-center rounded-md px-2 text-[10px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ backgroundColor: accent }}
                              title="Auto assign using preferences"
                            >
                              {busyAction === 'auto_allocate' ? '...' : 'Auto'}
                            </button>

                            <div className="inline-flex items-center rounded-md border border-gray-300 bg-white overflow-hidden">
                              <select
                                value={manualWaveSelection[row.id] || row.confirmedWaveTime || availableWaveTimes[0] || ''}
                                onChange={(e) => setManualWaveSelection((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="h-7 w-[74px] min-w-[74px] max-w-[74px] flex-none shrink-0 border-0 px-1 input-focus-brand bg-white text-[10px]"
                                title="Manual Override Wave"
                              >
                                {availableWaveTimes.map((time) => (
                                  <option key={`${row.id}-${time}`} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!!busyAction || availableWaveTimes.length === 0}
                                onClick={() => {
                                  void runManageAction(row, 'manual_override');
                                }}
                                className="inline-flex h-7 items-center border-l border-gray-300 px-2 text-[10px] font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: accent }}
                                title="Set selected wave"
                              >
                                {busyAction === 'manual_override' ? '...' : 'Set'}
                              </button>
                            </div>

                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={() => {
                                void runManageAction(row, 'waitlist');
                              }}
                              className="inline-flex h-7 items-center rounded-md border border-amber-300 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Move to waitlist"
                            >
                              {busyAction === 'waitlist' ? '...' : 'Waitlist'}
                            </button>

                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={() => {
                                void runCancel(row);
                              }}
                              className="inline-flex h-7 items-center rounded-md border border-red-300 bg-red-50 px-2 text-[10px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Cancel registration"
                            >
                              {busyAction === 'cancel' ? '...' : 'X'}
                            </button>
                          </div>
                        </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isLiftEvent && (
          <aside className="min-w-0 self-start rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            {!selectedRegistration ? (
              <div className="flex min-h-[12rem] items-center justify-center text-center text-sm text-gray-400">
                Select a lifter from the list to view and edit their details.
              </div>
            ) : (
            <div>
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedRegistration.name || 'Unnamed participant'}</h3>
                <p className="text-xs text-gray-500">{selectedRegistration.registrationStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRegistrationId(null)}
                aria-label="Close participant details"
                className="text-xl text-gray-500 hover:text-gray-900"
              >
                ×
              </button>
            </div>
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-200 pb-3">
              <p className="text-xs text-gray-600">{Object.values(selectedRegistration.liftMovementFlights).filter(Boolean).length} flights selected</p>
              <button
                type="button"
                onClick={() => void handleLiftFlightAssignment(selectedRegistration, 'sync_lift')}
                disabled={!!rowBusyAction[selectedRegistration.id] || selectedRegistration.registrationStatus === 'Cancelled' || !Object.values(selectedRegistration.liftMovementFlights).some(Boolean)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {rowBusyAction[selectedRegistration.id] === 'Syncing' ? 'Syncing...' : 'Sync Assignment'}
              </button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Gender Category</span>
                <select
                  value={selectedRegistration.genderCategory}
                  onChange={(event) => void handleLiftDetailChange(selectedRegistration, { genderCategory: event.target.value })}
                  disabled={!!rowBusyAction[selectedRegistration.id]}
                  className="input-focus-brand w-full rounded-md border border-gray-300 bg-white p-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select</option>
                  {['Female', 'Male', 'Non-Binary'].map((division) => (
                    <option key={division} value={division}>{division}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0">
                <label htmlFor={`registration-bodyweight-${selectedRegistration.id}`} className="mb-1 block text-xs font-medium text-gray-600">Bodyweight</label>
                <div className="flex items-center gap-3">
                  <input
                    id={`registration-bodyweight-${selectedRegistration.id}`}
                    key={`${selectedRegistration.id}-bodyweight`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={selectedRegistration.bodyWeight}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== selectedRegistration.bodyWeight) void handleLiftDetailChange(selectedRegistration, { bodyWeight: value });
                    }}
                    disabled={!!rowBusyAction[selectedRegistration.id]}
                    className="input-focus-brand min-w-0 flex-1 rounded-md border border-gray-300 p-2 text-sm disabled:opacity-50"
                  />
                  {olympicLiftMovements.length > 0 && (
                    <label className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedRegistration.olympicLiftsOptIn}
                        disabled={!!rowBusyAction[selectedRegistration.id]}
                        onChange={(event) => void handleOlympicOptInChange(selectedRegistration, event.target.checked)}
                      />
                      Oly opt-in
                    </label>
                  )}
                </div>
              </div>
            </div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Flight per Movement</h4>
            <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-5 gap-2 xl:min-w-0">
              {Object.entries(liftFlights)
                .filter(([, flights]) => flights.length > 0)
                .sort(([first], [second]) => compareFlightMovements(first, second))
                .map(([movement, flights]) => {
                  const preference = selectedLiftPreferences.find((entry) => entry.movement === movement)?.preference || '-';
                  const formOpener = movement === 'Squat' ? selectedRegistration.squatOpenerWeight
                    : movement === 'Bench' ? selectedRegistration.benchOpenerWeight
                      : movement === 'Deadlift' ? selectedRegistration.deadliftOpenerWeight : '';
                  const canRecord = !!selectedFlightParticipant &&
                    (!olympicLiftMovements.includes(movement) || selectedRegistration.olympicLiftsOptIn);
                  return (
                  <div key={movement} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="mb-2 min-h-16">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Preferences</span>
                      <p className="text-[11px] leading-tight text-gray-600">{preference}</p>
                    </div>
                    <div className="mb-2 flex min-h-8 items-start gap-1">
                      <span className="text-xs font-semibold leading-tight text-gray-700">{movement}</span>
                      {olympicLiftMovements.includes(movement) && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OLY</span>}
                    </div>
                    <label className="mb-2 block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Flight</span>
                    <select
                      value={selectedRegistration.liftMovementFlights[movement] || ''}
                      onChange={(event) => void handleLiftFlightAssignment(selectedRegistration, 'assign_lift', movement, event.target.value)}
                      disabled={!!rowBusyAction[selectedRegistration.id] || selectedRegistration.registrationStatus === 'Cancelled'}
                      className="input-focus-brand w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs disabled:opacity-50"
                    >
                      <option value="">—</option>
                      {flights.map((flight) => (
                        <option key={flight.id} value={flight.label}>{flight.label}</option>
                      ))}
                    </select>
                    </label>
                    <label className="mb-2 block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">1st Attempt</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={selectedFlightParticipant?.participant.waveData?.[getAttemptField(movement, 1)] ?? formOpener}
                        onChange={(event) => handleRegistrationAttemptChange(movement, event.target.value)}
                        onBlur={() => {
                          if (canRecord && selectedFlightParticipant) {
                            void saveWavePerformance(selectedFlightParticipant.waveId, eventId).catch((error) => {
                              console.error('Failed to save first attempt:', error);
                            });
                          }
                        }}
                        readOnly={!canRecord}
                        aria-label={`${movement} first attempt weight`}
                        className="input-focus-brand w-full rounded border border-gray-300 px-2 py-1 text-sm read-only:bg-gray-50"
                      />
                    </label>
                    <label className="mb-2 block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">PR</span>
                      <input
                        key={`${selectedRegistration.id}-${movement}-pr`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={selectedRegistration.liftMovementPrs[movement] || ''}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value !== (selectedRegistration.liftMovementPrs[movement] || '')) void handleLiftDetailChange(selectedRegistration, {
                            liftMovementPrs: { ...selectedRegistration.liftMovementPrs, [movement]: value },
                          });
                        }}
                        disabled={!!rowBusyAction[selectedRegistration.id]}
                        className="input-focus-brand w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm font-semibold disabled:opacity-50"
                      />
                    </label>
                  </div>
                  );
                })}
            </div>
            </div>
            </div>
            )}
          </aside>
        )}

        {!isLiftEvent && (
          <aside className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-fit">
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Row Key</h4>
              <div className="mt-2 space-y-1 text-[11px] text-gray-700">
                <div>S / B / G = Solo / Buddy / Group</div>
                <div>P = Ping group</div>
                <div>🏆 = Leaderboard</div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
