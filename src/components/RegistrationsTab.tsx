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
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';

type RegistrationStatus = 'Pending' | 'Confirmed' | 'Waitlisted' | 'Needs Reassignment' | 'Cancelled';
type ManageAction = 'auto_allocate' | 'manual_override' | 'waitlist' | 'cancel';

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
  triggerSource: string;
  updatedAt: string;
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
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [pendingCancellationCount, setPendingCancellationCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RegistrationStatus>('All');
  const [swimFilter, setSwimFilter] = useState<'All' | 'N' | 'I' | 'A'>('All');
  const [firstTriFilter, setFirstTriFilter] = useState<'All' | 'Yes' | 'No'>('All');
  const [entryModeFilter, setEntryModeFilter] = useState<'All' | 'S' | 'B' | 'G'>('All');
  const [manualWaveSelection, setManualWaveSelection] = useState<Record<string, string>>({});
  const [rowBusyAction, setRowBusyAction] = useState<Record<string, string>>({});
  const [pendingSyncByRow, setPendingSyncByRow] = useState<Record<string, PendingSyncState>>({});
  const [configuredWaveTimes, setConfiguredWaveTimes] = useState<string[]>([]);
  const [configuredCapacity, setConfiguredCapacity] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
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

    const queueRef = collection(db, 'events', eventId, 'cancellationQueue');
    const queueQuery = query(queueRef, where('status', '==', 'pending'));
    const configRef = doc(db, 'events', eventId, 'config', 'global');

    let haveRegs = false;
    let haveQueue = false;

    const markLoadedIfReady = () => {
      if (haveRegs && haveQueue) {
        setIsLoading(false);
      }
    };

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
            triggerSource: data.triggerSource || '',
            updatedAt: data.updatedAt || '',
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
        haveRegs = true;
        markLoadedIfReady();
      },
      (error) => {
        setErrorMessage(error.message || 'Failed to read registrations.');
        setIsLoading(false);
      }
    );

    const unsubQueue = onSnapshot(
      queueQuery,
      (snapshot) => {
        setPendingCancellationCount(snapshot.size);
        haveQueue = true;
        markLoadedIfReady();
      },
      (error) => {
        setErrorMessage(error.message || 'Failed to read cancellation queue.');
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

        setConfiguredWaveTimes(buildWaveTimes(startTime, totalWaves, intervalMinutes));
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
      unsubQueue();
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
      // Strict source-of-truth view: rows must come from form webhook payloads
      // and include a real source sheet label from Apps Script.
      return !!row.sourceSheet.trim();
    });
  }, [registrations]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return sheetRows.filter((row) => {
      if (statusFilter !== 'All' && row.registrationStatus !== statusFilter) return false;

      const swimCode = getSwimComfortCode(row.swimComfort);
      if (swimFilter !== 'All' && swimCode !== swimFilter) return false;

      if (firstTriFilter === 'Yes' && !row.isFirstTri) return false;
      if (firstTriFilter === 'No' && row.isFirstTri) return false;

      const entryCode = getEntryModeCode(row.entryMode, row.groupName);
      if (entryModeFilter !== 'All' && entryCode !== entryModeFilter) return false;

      if (!needle) return true;

      const haystack = `${row.name}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [sheetRows, search, statusFilter, swimFilter, firstTriFilter, entryModeFilter]);

  const confirmedCount = sheetRows.filter((row) => row.registrationStatus === 'Confirmed').length;
  const waitlistedCount = sheetRows.filter((row) => row.registrationStatus === 'Waitlisted').length;

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
    const counts = Object.fromEntries(configuredWaveTimes.map((time) => [time, 0])) as Record<string, number>;
    Object.values(wavesById).forEach((wave) => {
      const time = String(wave.startTime || '').trim();
      if (!time || counts[time] === undefined) return;
      counts[time] += Array.isArray(wave.participants) ? wave.participants.length : 0;
    });
    return counts;
  }, [configuredWaveTimes, wavesById]);

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

  const runManageAction = async (row: RegistrationRow, action: Exclude<ManageAction, 'cancel'>) => {
    const manualWave = manualWaveSelection[row.id] || row.confirmedWaveTime || configuredWaveTimes[0] || '';
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{sheetRows.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Confirmed</p>
          <p className="text-2xl font-bold mt-1" style={{ color: accent }}>{confirmedCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Waitlisted</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{waitlistedCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Pending Queue</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{pendingCancellationCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name..."
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

          <select
            value={swimFilter}
            onChange={(e) => setSwimFilter(e.target.value as 'All' | 'N' | 'I' | 'A')}
            className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
          >
            <option value="All">All Swim Levels</option>
            <option value="N">Novice</option>
            <option value="I">Intermediate</option>
            <option value="A">Advanced</option>
          </select>

          <select
            value={firstTriFilter}
            onChange={(e) => setFirstTriFilter(e.target.value as 'All' | 'Yes' | 'No')}
            className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
          >
            <option value="All">All Experiences</option>
            <option value="Yes">Yes ★</option>
            <option value="No">No</option>
          </select>

          <select
            value={entryModeFilter}
            onChange={(e) => setEntryModeFilter(e.target.value as 'All' | 'S' | 'B' | 'G')}
            className="w-full h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
          >
            <option value="All">All Group Sizes</option>
            <option value="S">Single/Solo</option>
            <option value="B">Buddy</option>
            <option value="G">Group</option>
          </select>

        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_270px] gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-600">Loading registrations...</div>
          ) : errorMessage ? (
            <div className="p-8 text-center text-red-700">{errorMessage}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No registrations found for this filter.</div>
          ) : (
            <div ref={listScrollRef} className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Participant</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Status</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Assigned Wave</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Preferences</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-700">Actions</th>
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
                        className={`border-b border-gray-100 ${rowClass}`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-1.5 whitespace-nowrap min-w-[280px]">
                            <span className="font-semibold text-gray-900">{row.name || 'Unnamed participant'}</span>

                            {row.swimComfort && (
                              <span className="relative inline-flex group">
                                <span
                                  tabIndex={0}
                                  aria-label={`Swim level ${getSwimComfortLabel(row.swimComfort)}`}
                                  className={`inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold ${getSwimComfortBadgeClass(row.swimComfort)}`}
                                >
                                  {getSwimComfortCode(row.swimComfort)}
                                </span>
                                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                  Swim: {getSwimComfortLabel(row.swimComfort)} ({getSwimComfortCode(row.swimComfort)})
                                </span>
                              </span>
                            )}

                            {row.isFirstTri && (
                              <span className="relative inline-flex group">
                                <span
                                  tabIndex={0}
                                  aria-label="First triathlon"
                                  className="inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200"
                                >
                                  ★
                                </span>
                                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                  First triathlon
                                </span>
                              </span>
                            )}

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

                            {getCompanionDisplayName(row.entryMode, row.groupName) && (
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
                        <td className="px-3 py-2 align-middle text-gray-700 whitespace-nowrap">{row.confirmedWaveTime || '-'}</td>
                        <td className="px-3 py-2 align-middle text-gray-700 min-w-[240px]">
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
                                value={manualWaveSelection[row.id] || row.confirmedWaveTime || configuredWaveTimes[0] || ''}
                                onChange={(e) => setManualWaveSelection((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                className="h-7 w-[74px] min-w-[74px] max-w-[74px] flex-none shrink-0 border-0 px-1 input-focus-brand bg-white text-[10px]"
                                title="Manual Override Wave"
                              >
                                {configuredWaveTimes.map((time) => (
                                  <option key={`${row.id}-${time}`} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!!busyAction || configuredWaveTimes.length === 0}
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 h-fit">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Mini Wave Tracker</h3>
          <p className="text-xs text-gray-500 mb-3">Create or sync wave docs from Event Config.</p>
          {configuredWaveTimes.length === 0 && (
            <p className="text-xs text-gray-500 mb-2">Configure start time, interval, and total waves in Event Settings.</p>
          )}
          <div className="space-y-1.5">
            {configuredWaveTimes.map((time) => {
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
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => onNavigateToWaveTime?.(time)}
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                      style={{
                        ['--tw-ring-color' as string]: accent,
                      }}
                      title={`Open ${time} in Waves tab`}
                    >
                      {time}
                    </button>
                  </div>
                  <span className={`text-xs font-semibold ${atCapacity ? 'text-red-700' : 'text-gray-900'}`}>
                    {configuredCapacity !== null ? `${count}/${configuredCapacity}` : `${count}/-`}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
