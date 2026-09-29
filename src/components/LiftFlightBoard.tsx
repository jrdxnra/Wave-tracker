'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';
import LiftPrintDashboard from './LiftPrintDashboard';

interface FlightParticipant {
  id: string;
  name: string;
  waveData: Record<string, string>;
  includeInLeaderboard?: boolean;
  entryMode?: string;
  groupName?: string;
  pingGroupOptIn?: boolean;
  olympicLiftsOptIn?: boolean;
  olympicSessionStart?: string;
  powerliftingEntry?: boolean;
  firstPreferenceHour?: string;
  firstPreferenceFlexibility?: string;
  secondPreferenceHour?: string;
  secondPreferenceFlexibility?: string;
  bodyWeight?: string;
  genderCategory?: string;
  rackHeight?: string;
  liftMovementFlights?: Record<string, string>;
  liftMovementRackHeights?: Record<string, string>;
  liftMovementPrs?: Record<string, string>;
}

interface FlightWave {
  id: string;
  name: string;
  participants: FlightParticipant[];
  startTime: string;
  coach?: string;
  isOlympicFlight?: boolean;
}

interface ParticipantMeta {
  entryMode: string;
  groupName: string;
  pingGroupOptIn: boolean;
  includeInLeaderboard: boolean;
  olympicLiftsOptIn: boolean;
  olympicSessionStart: string;
  powerliftingEntry: boolean;
  bodyWeight: string;
  genderCategory: string;
  firstPreferenceHour: string;
  firstPreferenceFlexibility: string;
  secondPreferenceHour: string;
  secondPreferenceFlexibility: string;
  liftMovementFlights: Record<string, string>;
  liftMovementRackHeights: Record<string, string>;
  liftMovementPrs: Record<string, string>;
  liftMovementOpenerWeights: Record<string, string>;
  olympicLiftingSelection: string;
}

const emptyMeta: ParticipantMeta = {
  entryMode: '',
  groupName: '',
  pingGroupOptIn: false,
  includeInLeaderboard: true,
  olympicLiftsOptIn: false,
  olympicSessionStart: '',
  powerliftingEntry: false,
  bodyWeight: '',
  genderCategory: '',
  firstPreferenceHour: '',
  firstPreferenceFlexibility: '',
  secondPreferenceHour: '',
  secondPreferenceFlexibility: '',
  liftMovementFlights: {},
  liftMovementRackHeights: {},
  liftMovementPrs: {},
  liftMovementOpenerWeights: {},
  olympicLiftingSelection: '',
};

// Lift Event registration answers are collected per-lift under fixed field names,
// not per the coach's configured movement names, so map them explicitly here.
const LIFT_EVENT_RACK_HEIGHT_FIELDS_BY_MOVEMENT: Record<string, string> = {
  Squat: 'squatRackHeight',
  Bench: 'benchRackHeight',
};
const LIFT_EVENT_OPENER_WEIGHT_FIELDS_BY_MOVEMENT: Record<string, string> = {
  Squat: 'squatOpenerWeight',
  Bench: 'benchOpenerWeight',
  Deadlift: 'deadliftOpenerWeight',
};

function buildLiftEventRackHeights(regData: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(LIFT_EVENT_RACK_HEIGHT_FIELDS_BY_MOVEMENT).forEach(([movement, field]) => {
    const value = String(regData[field] || '').trim();
    if (value) result[movement] = value;
  });
  return result;
}

function buildLiftEventOpenerWeights(regData: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  Object.entries(LIFT_EVENT_OPENER_WEIGHT_FIELDS_BY_MOVEMENT).forEach(([movement, field]) => {
    const value = String(regData[field] || '').trim();
    if (value) result[movement] = value;
  });
  return result;
}

const RACK_HEIGHT_OPTIONS = Array.from({ length: 8 }, (_, i) => String(i + 7));

const getAttemptField = (event: string, attemptNumber: number) => `${event}__attempt_${attemptNumber}`;

interface LiftFlightBoardProps {
  waveIds: string[];
  waves: Record<string, FlightWave>;
  onAddFlight: () => void;
}

function getPreferenceSummary(hour: string, flexibility: string): string {
  const cleanHour = String(hour || '').trim();
  const cleanFlex = String(flexibility || '').trim();
  if (cleanHour && cleanFlex) return `${cleanHour} / ${cleanFlex}`;
  return cleanHour || cleanFlex;
}

function timeInMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || (match[3] && (hour < 1 || hour > 12))) return null;
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}

function activeOlympicSessions(startTime: string, olympicMovements: string[], flights: Record<string, { label: string; startTime: string; endTime: string }[]>) {
  const selectedTime = timeInMinutes(startTime);
  if (selectedTime === null) return [];
  const sessions = new Map<string, { label: string; startTime: string; endTime: string; movements: string[] }>();
  olympicMovements.forEach((movement) => {
    (flights[movement] || []).forEach((flight) => {
      const start = timeInMinutes(flight.startTime);
      const end = timeInMinutes(flight.endTime);
      if (start === null || end === null || selectedTime !== start) return;
      const key = `${start}-${end}`;
      const session = sessions.get(key);
      if (session) session.movements.push(movement);
      else sessions.set(key, { label: flight.label, startTime: flight.startTime, endTime: flight.endTime, movements: [movement] });
    });
  });
  return [...sessions.values()].map((session) => ({
    ...session,
    movements: session.movements.sort((first, second) => Number(second === 'Snatch') - Number(first === 'Snatch')),
  }));
}

export default function LiftFlightBoard({ waveIds, waves, onAddFlight }: LiftFlightBoardProps) {
  const {
    deleteWave,
    addWave,
    addParticipant,
    deleteParticipant,
    updateWave,
    themeColors,
    activeEventId,
    maxParticipants,
    customEvents,
    olympicLiftMovements,
    rackMovements,
    liftFlights,
    updateParticipantData,
    saveWavePerformance,
  } = useWaveStore();

  const accent = themeColors.accent;

  const [filterId, setFilterId] = useState<'all' | string>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [participantMeta, setParticipantMeta] = useState<Record<string, ParticipantMeta>>({});
  const [savingAssignments, setSavingAssignments] = useState<Record<string, boolean>>({});
  const [newParticipantName, setNewParticipantName] = useState('');
  const [timeDraft, setTimeDraft] = useState('');
  const [addFlightChoice, setAddFlightChoice] = useState('');

  const activeFlight = filterId !== 'all' ? waves[filterId] : null;
  const olympicSessions = activeFlight?.isOlympicFlight ? activeOlympicSessions(activeFlight.startTime, olympicLiftMovements, liftFlights) : [];
  const olympicSessionOptions = Array.from(new Map(olympicLiftMovements.flatMap((movement) =>
    (liftFlights[movement] || []).map((flight) => [flight.startTime, flight] as const)
  )).values()).sort((first, second) => (timeInMinutes(first.startTime) || 0) - (timeInMinutes(second.startTime) || 0));
  const participantRosterKey = waveIds
    .flatMap((id) => (waves[id]?.participants || []).map((participant) => `${id}:${participant.id}`))
    .join('|');

  useEffect(() => {
    const s = (activeFlight?.startTime || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = m[2];
      const mer = (m[3] || 'AM').toUpperCase();
      let hour24 = h;
      if (mer === 'PM' && h !== 12) hour24 = h + 12;
      else if (mer === 'AM' && h === 12) hour24 = 0;
      setTimeDraft(`${String(hour24).padStart(2, '0')}:${min}`);
    } else {
      setTimeDraft('');
    }
  }, [activeFlight?.startTime]);

  useEffect(() => {
    let cancelled = false;

    const loadMeta = async () => {
      const allParticipants = waveIds.flatMap((id) => (waves[id]?.participants || []));
      if (!activeEventId || allParticipants.length === 0) {
        setParticipantMeta({});
        return;
      }

      const { db } = getFirebase();
      const entries = await Promise.all(
        allParticipants.map(async (participant) => {
          const fallback: ParticipantMeta = {
            entryMode: String(participant.entryMode || ''),
            groupName: String(participant.groupName || ''),
            pingGroupOptIn: participant.pingGroupOptIn === true,
            includeInLeaderboard: participant.includeInLeaderboard !== false,
            olympicLiftsOptIn: participant.olympicLiftsOptIn === true,
            olympicSessionStart: String(participant.olympicSessionStart || ''),
            powerliftingEntry: participant.powerliftingEntry === true,
            bodyWeight: String(participant.bodyWeight || ''),
            genderCategory: String(participant.genderCategory || ''),
            firstPreferenceHour: String(participant.firstPreferenceHour || ''),
            firstPreferenceFlexibility: String(participant.firstPreferenceFlexibility || ''),
            secondPreferenceHour: String(participant.secondPreferenceHour || ''),
            secondPreferenceFlexibility: String(participant.secondPreferenceFlexibility || ''),
            liftMovementFlights: { ...(participant.liftMovementFlights || {}) },
            liftMovementRackHeights: { ...(participant.liftMovementRackHeights || {}) },
            liftMovementPrs: { ...(participant.liftMovementPrs || {}) },
            liftMovementOpenerWeights: {},
            olympicLiftingSelection: '',
          };

          if (participant.id.startsWith('p-')) {
            return [participant.id, fallback] as const;
          }

          try {
            const regRef = doc(db, 'events', activeEventId, 'registrations', participant.id);
            const regSnap = await getDoc(regRef);
            if (!regSnap.exists()) return [participant.id, fallback] as const;

            const regData = regSnap.data() as Partial<ParticipantMeta>;
            return [
              participant.id,
              {
                entryMode: String(regData.entryMode || fallback.entryMode),
                groupName: String(regData.groupName || fallback.groupName),
                pingGroupOptIn: regData.pingGroupOptIn === undefined ? fallback.pingGroupOptIn : !!regData.pingGroupOptIn,
                includeInLeaderboard: regData.includeInLeaderboard === undefined ? fallback.includeInLeaderboard : regData.includeInLeaderboard !== false,
                olympicLiftsOptIn: regData.olympicLiftsOptIn === undefined ? fallback.olympicLiftsOptIn : !!regData.olympicLiftsOptIn,
                olympicSessionStart: String(regData.olympicSessionStart || fallback.olympicSessionStart),
                powerliftingEntry: regData.powerliftingEntry === undefined ? fallback.powerliftingEntry : regData.powerliftingEntry === true,
                bodyWeight: String(regData.bodyWeight || fallback.bodyWeight),
                genderCategory: String(regData.genderCategory || fallback.genderCategory),
                firstPreferenceHour: String(regData.firstPreferenceHour || fallback.firstPreferenceHour),
                firstPreferenceFlexibility: String(regData.firstPreferenceFlexibility || fallback.firstPreferenceFlexibility),
                secondPreferenceHour: String(regData.secondPreferenceHour || fallback.secondPreferenceHour),
                secondPreferenceFlexibility: String(regData.secondPreferenceFlexibility || fallback.secondPreferenceFlexibility),
                liftMovementFlights: { ...fallback.liftMovementFlights, ...(regData.liftMovementFlights || {}) },
                liftMovementRackHeights: {
                  ...fallback.liftMovementRackHeights,
                  ...buildLiftEventRackHeights(regData as Record<string, unknown>),
                  ...(regData.liftMovementRackHeights || {}),
                },
                liftMovementPrs: { ...fallback.liftMovementPrs, ...(regData.liftMovementPrs || {}) },
                liftMovementOpenerWeights: buildLiftEventOpenerWeights(regData as Record<string, unknown>),
                olympicLiftingSelection: String((regData as Record<string, unknown>).olympicLiftingSelection || ''),
              },
            ] as const;
          } catch {
            return [participant.id, fallback] as const;
          }
        })
      );

      if (cancelled) return;
      setParticipantMeta(Object.fromEntries(entries));
    };

    void loadMeta();

    return () => {
      cancelled = true;
    };
  }, [activeEventId, participantRosterKey]);

  const rows = useMemo(() => {
    const list: Array<{ waveId: string; waveName: string; participant: FlightParticipant }> = [];
    waveIds.forEach((id) => {
      const wave = waves[id];
      if (!wave) return;
      wave.participants.forEach((participant) => list.push({ waveId: id, waveName: wave.name, participant }));
    });
    return list;
  }, [waveIds, waves]);

  const powerFlights = activeFlight && !activeFlight.isOlympicFlight ? customEvents
    .filter((movement) => !olympicLiftMovements.includes(movement))
    .flatMap((movement) => (liftFlights[movement] || [])
      .filter((flight) => timeInMinutes(flight.startTime) === timeInMinutes(activeFlight.startTime))
      .map((flight) => ({ movement, label: flight.label }))) : [];
  const powerRowsForFlight = (movement: string, label: string) => rows.filter(({ participant }) =>
    (participantMeta[participant.id]?.liftMovementFlights?.[movement] ?? participant.liftMovementFlights?.[movement]) === label
  );
  const olympicRows = (session: (typeof olympicSessions)[number]) => rows.filter(({ participant, waveId }) => {
    const meta = participantMeta[participant.id];
    if (!(meta?.olympicLiftsOptIn ?? participant.olympicLiftsOptIn === true)) return false;
    const selectedSession = meta?.olympicSessionStart || participant.olympicSessionStart;
    if (selectedSession) return timeInMinutes(selectedSession) === timeInMinutes(session.startTime);
    const assignments = meta?.liftMovementFlights || participant.liftMovementFlights || {};
    const assignedMovements = olympicLiftMovements.filter((movement) => assignments[movement]);
    if (assignedMovements.length) return session.movements.some((movement) =>
      (liftFlights[movement] || []).some((flight) => flight.label === assignments[movement]
        && timeInMinutes(flight.startTime) === timeInMinutes(session.startTime)
        && timeInMinutes(flight.endTime) === timeInMinutes(session.endTime))
    );
    const selection = meta?.olympicLiftingSelection || '';
    if (!selection) return timeInMinutes(waves[waveId]?.startTime || '') === timeInMinutes(session.startTime);
    return selection.split(/[,;\n]+/).some((answer) => {
      const match = answer.trim().match(/^(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
      return match && timeInMinutes(match[1]) === timeInMinutes(session.startTime)
        && timeInMinutes(match[2]) === timeInMinutes(session.endTime);
    });
  }).filter((entry, index, matches) => matches.findIndex((candidate) => candidate.participant.id === entry.participant.id) === index);
  const printEntries = activeFlight && (powerFlights.length > 0 || olympicSessions.length > 0)
    ? [
        ...powerFlights.flatMap(({ movement, label }) => powerRowsForFlight(movement, label)),
        ...olympicSessions.flatMap((session) => olympicRows(session)),
      ]
    : rows.filter((entry) => entry.waveId === activeFlight?.id);
  const printParticipants = Array.from(new Map(printEntries.map(({ participant }) => [
    participant.id,
    { ...participant, ...(participantMeta[participant.id] || {}) },
  ])).values());

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const [waveId, participantId] = selectedKey.split('::');
    const wave = waves[waveId];
    const participant = wave?.participants.find((p) => p.id === participantId);
    if (!wave || !participant) return null;
    return { waveId, wave, participant };
  }, [selectedKey, waves]);

  const handleLiftParticipantFieldChange = async (
    waveId: string,
    participantId: string,
    updates: Partial<Pick<ParticipantMeta, 'bodyWeight' | 'genderCategory' | 'olympicLiftsOptIn' | 'olympicSessionStart' | 'powerliftingEntry' | 'liftMovementFlights' | 'liftMovementRackHeights' | 'liftMovementPrs'>>
  ) => {
    setParticipantMeta((prev) => ({
      ...prev,
      [participantId]: { ...(prev[participantId] || emptyMeta), ...updates },
    }));
    // Keep the store copy in sync, otherwise store-level participant saves overwrite these fields with stale values.
    useWaveStore.setState((state) => {
      const wave = state.waves[waveId];
      if (!wave) return {};
      return {
        waves: {
          ...state.waves,
          [waveId]: {
            ...wave,
            participants: wave.participants.map((p) => (p.id === participantId ? { ...p, ...updates } : p)),
          },
        },
      };
    });

    try {
      const { db } = getFirebase();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'events', activeEventId, 'waves', waveId, 'participants', participantId), {
        id: participantId,
        ...updates,
        updatedAt: now,
      }, { merge: true });

      if (!participantId.startsWith('p-')) {
        await setDoc(doc(db, 'events', activeEventId, 'registrations', participantId), {
          participantId,
          ...updates,
          updatedAt: now,
          source: 'manual-ops',
        }, { merge: true });
      }

    } catch (error) {
      console.error('Failed to update lift participant field:', error);
      alert('Failed to update participant lift details. Please try again.');
    }
  };

  const handleAttemptChange = (waveId: string, participant: FlightParticipant, event: string, attemptNumber: number, value: string) => {
    const field = getAttemptField(event, attemptNumber);
    updateParticipantData(waveId, participant.id, field, value);

    const attemptValues = [1, 2, 3].map((currentAttempt) => {
      const raw = currentAttempt === attemptNumber ? value : (participant.waveData || {})[getAttemptField(event, currentAttempt)];
      const parsed = parseFloat(raw || '');
      return Number.isFinite(parsed) ? parsed : 0;
    });
    const bestAttempt = Math.max(...attemptValues);
    updateParticipantData(waveId, participant.id, event, bestAttempt > 0 ? String(bestAttempt) : '');
  };

  const handleAttemptBlur = async (waveId: string) => {
    try {
      await saveWavePerformance(waveId, activeEventId);
    } catch (error) {
      console.error('Failed to save attempt weight:', error);
    }
  };

  const handleMovementFlightChange = (participantId: string, movementName: string, flightLabel: string) => {
    setParticipantMeta((prev) => {
      const current = prev[participantId] || emptyMeta;
      return {
        ...prev,
        [participantId]: {
          ...current,
          liftMovementFlights: { ...current.liftMovementFlights, [movementName]: flightLabel },
        },
      };
    });
  };

  const applySavedAssignment = (participantId: string, result: {
    liftMovementFlights: Record<string, string>;
    olympicSessionStart: string;
    olympicLiftsOptIn: boolean;
    powerliftingEntry: boolean;
  }) => {
    setParticipantMeta((prev) => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] || emptyMeta),
        liftMovementFlights: result.liftMovementFlights,
        olympicSessionStart: result.olympicSessionStart,
        olympicLiftsOptIn: result.olympicLiftsOptIn,
        powerliftingEntry: result.powerliftingEntry,
      },
    }));
  };

  const handleMovementFlightCommit = async (waveId: string, participantId: string, movementName: string, flightLabel: string) => {
    const participant = waves[waveId]?.participants.find((entry) => entry.id === participantId);
    if (!participant) return;
    const liftMovementFlights = {
      ...(participant.liftMovementFlights || {}),
      ...(participantMeta[participantId]?.liftMovementFlights || {}),
      [movementName]: flightLabel,
    };
    if (!participantId.startsWith('p-')) {
      if (savingAssignments[participantId]) return;
      setSavingAssignments((prev) => ({ ...prev, [participantId]: true }));
      try {
        const response = await fetch('/api/register/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: activeEventId,
            participant_id: participantId,
            action: 'assign_lift',
            movement: movementName,
            flight_label: flightLabel,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to update flight');
        applySavedAssignment(participantId, result);
        await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
      } catch (error) {
        setParticipantMeta((prev) => ({
          ...prev,
          [participantId]: {
            ...(prev[participantId] || emptyMeta),
            liftMovementFlights: participantMeta[participantId]?.liftMovementFlights || participant.liftMovementFlights || {},
          },
        }));
        alert(error instanceof Error ? error.message : 'Failed to update flight');
      } finally {
        setSavingAssignments((prev) => ({ ...prev, [participantId]: false }));
      }
      return;
    }

    const powerMovements = customEvents.filter((movement) => !olympicLiftMovements.includes(movement));
    for (const movement of powerMovements) {
      const label = liftMovementFlights[movement];
      if (!label || label === participant.liftMovementFlights?.[movement]) continue;
      const assigned = powerRowsForFlight(movement, label)
        .filter((entry) => entry.participant.id !== participantId).length;
      if (assigned >= maxParticipants) {
        setParticipantMeta((prev) => ({
          ...prev,
          [participantId]: { ...(prev[participantId] || emptyMeta), liftMovementFlights: participant.liftMovementFlights || {} },
        }));
        alert(`${movement} ${label} is full (${maxParticipants} lifters).`);
        return;
      }
    }
    await handleLiftParticipantFieldChange(waveId, participantId, {
      liftMovementFlights,
      powerliftingEntry: powerMovements.some((movement) => liftMovementFlights[movement]) || participant.powerliftingEntry === true,
    });
  };

  const handleOlympicSessionChange = async (waveId: string, participantId: string, startTime: string) => {
    const participant = waves[waveId]?.participants.find((entry) => entry.id === participantId);
    if (!participant) return;
    const current = participantMeta[participantId] || emptyMeta;
    const nextFlights = { ...(participant.liftMovementFlights || {}), ...(current.liftMovementFlights || {}) };
    olympicLiftMovements.forEach((movement) => {
      if (!nextFlights[movement]) return;
      nextFlights[movement] = (liftFlights[movement] || []).find((flight) => flight.startTime === startTime)?.label || '';
    });

    if (participantId.startsWith('p-')) {
      await handleLiftParticipantFieldChange(waveId, participantId, { olympicSessionStart: startTime, liftMovementFlights: nextFlights });
      return;
    }

    if (savingAssignments[participantId]) return;
    setSavingAssignments((prev) => ({ ...prev, [participantId]: true }));
    setParticipantMeta((prev) => ({
      ...prev,
      [participantId]: { ...(prev[participantId] || emptyMeta), olympicSessionStart: startTime, liftMovementFlights: nextFlights },
    }));
    try {
      const response = await fetch('/api/register/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: activeEventId,
          participant_id: participantId,
          action: 'assign_olympic_session',
          olympic_session_start: startTime,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to update Olympic session');
      applySavedAssignment(participantId, result);
      await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
    } catch (error) {
      setParticipantMeta((prev) => ({ ...prev, [participantId]: current }));
      alert(error instanceof Error ? error.message : 'Failed to update Olympic session');
    } finally {
      setSavingAssignments((prev) => ({ ...prev, [participantId]: false }));
    }
  };

  const handleRackHeightChange = async (waveId: string, participantId: string, movementName: string, rackHeight: string) => {
    setParticipantMeta((prev) => {
      const current = prev[participantId] || emptyMeta;
      return {
        ...prev,
        [participantId]: {
          ...current,
          liftMovementRackHeights: { ...current.liftMovementRackHeights, [movementName]: rackHeight },
        },
      };
    });

    const meta = participantMeta[participantId];
    const participant = waves[waveId]?.participants.find((entry) => entry.id === participantId);
    const next = {
      ...(participant?.liftMovementRackHeights || {}),
      ...(meta?.liftMovementRackHeights || {}),
      [movementName]: rackHeight,
    };
    await handleLiftParticipantFieldChange(waveId, participantId, { liftMovementRackHeights: next });
  };

  const handleAddParticipant = async () => {
    if (!activeFlight || !newParticipantName.trim()) return;
    try {
      await addParticipant(activeFlight.id, newParticipantName.trim(), {
        olympicOnly: activeFlight.isOlympicFlight === true,
        olympicSessionStart: activeFlight.isOlympicFlight ? olympicSessions[0]?.startTime : undefined,
      });
      setNewParticipantName('');
    } catch (error) {
      console.error('Failed to add participant:', error);
    }
  };

  const handleTimeChange = (value: string) => {
    setTimeDraft(value);
    if (!activeFlight || !value.includes(':')) return;
    const [hStr, mStr] = value.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    if (isNaN(hours) || isNaN(minutes)) return;
    let displayHours = hours;
    let period: 'AM' | 'PM' = 'AM';
    if (hours === 0) { displayHours = 12; period = 'AM'; }
    else if (hours < 12) { displayHours = hours; period = 'AM'; }
    else if (hours === 12) { displayHours = 12; period = 'PM'; }
    else { displayHours = hours - 12; period = 'PM'; }
    updateWave(activeFlight.id, { startTime: `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}` });
  };

  // Settings already knows each configured flight's movement, time, and whether it's Olympic —
  // reuse that instead of asking staff to redundantly re-enter it after creating a blank card.
  const formatFlightTime = (value: string) => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '';
    const hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return `${displayHours}:${minutes} ${period}`;
  };

  const configuredFlightOptions = customEvents.flatMap((movement) =>
    (liftFlights[movement] || []).map((flight) => ({
      key: `${movement}::${flight.id}`,
      movement,
      flight,
      isOlympic: olympicLiftMovements.includes(movement),
    }))
  );

  const handleAddConfiguredFlight = () => {
    const option = configuredFlightOptions.find((candidate) => candidate.key === addFlightChoice);
    if (!option) {
      onAddFlight();
      return;
    }

    const newId = addWave(`${option.movement} ${option.flight.label}`);
    updateWave(newId, {
      startTime: formatFlightTime(option.flight.startTime),
      isOlympicFlight: option.isOlympic,
    });
    setFilterId(newId);
  };

  const renderRoster = (entries: typeof rows, showWaveName = false) => entries.length === 0 ? (
    <p className="px-4 py-6 text-center text-sm text-gray-500">No lifters assigned yet.</p>
  ) : entries.map(({ waveId, waveName, participant }) => {
    const key = `${waveId}::${participant.id}`;
    const meta = participantMeta[participant.id];
    const isSelected = selectedKey === key;
    const olympicLiftsOptIn = meta?.olympicLiftsOptIn ?? participant.olympicLiftsOptIn === true;
    return (
      <button
        key={key}
        onClick={() => setSelectedKey(key)}
        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 border-b border-gray-100 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-gray-900 text-sm">{participant.name}</span>
          {showWaveName && (
            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
              {waveName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {olympicLiftsOptIn && <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold">Oly</span>}
        </div>
      </button>
    );
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filterId === 'all' ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            style={filterId === 'all' ? { backgroundColor: accent } : undefined}
          >
            All Flights
          </button>
          {waveIds.map((id) => (
            <button
              key={id}
              onClick={() => setFilterId(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filterId === id ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              style={filterId === id ? { backgroundColor: accent } : undefined}
            >
              {waves[id]?.name || id}
              {waves[id]?.isOlympicFlight && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OLY</span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <button
            onClick={onAddFlight}
            className="rounded-md px-3 py-1.5 text-xs font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            + Blank Flight
          </button>
          <select
            value={addFlightChoice}
            onChange={(e) => setAddFlightChoice(e.target.value)}
            className="input-focus-brand w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs sm:w-auto"
            aria-label="Choose a configured movement flight to create"
          >
            <option value="">Choose movement + flight…</option>
            {configuredFlightOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.movement} · {option.flight.label} · {formatFlightTime(option.flight.startTime)}
                {option.isOlympic ? ' (OLY)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddConfiguredFlight}
            disabled={!addFlightChoice}
            className="rounded-md px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            + Add Flight
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        {activeFlight && (
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Start Time</label>
              <input
                type="time"
                value={timeDraft}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="input-focus-brand p-1.5 border border-gray-300 rounded-md text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Category</label>
              <button
                type="button"
                onClick={() => updateWave(activeFlight.id, { isOlympicFlight: !activeFlight.isOlympicFlight })}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold border ${activeFlight.isOlympicFlight ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-300 text-gray-600'}`}
                title="Toggle whether this Flight card is an Olympic lifting session (disambiguates from Powerlifting flights at the same start time)"
              >
                {activeFlight.isOlympicFlight ? 'OLY Session' : 'Powerlifting'}
              </button>
            </div>
            <div className="flex-[1_1_260px] min-w-[220px]">
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Add Lifter</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
                  className="input-focus-brand flex-1 p-1.5 border border-gray-300 rounded-md text-xs"
                />
                <button
                  onClick={handleAddParticipant}
                  className="shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-md text-[11px] font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  Add
                </button>
              </div>
            </div>
            <div className="shrink-0 whitespace-nowrap">
              <LiftPrintDashboard
              wave={{
                ...activeFlight,
                participants: printParticipants,
              }}
              />
            </div>
            <button
              onClick={async () => {
                try {
                  await deleteWave(activeFlight.id);
                  setFilterId('all');
                } catch (error) {
                  console.error('Failed to delete wave:', error);
                }
              }}
              className="shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[11px] font-semibold text-white btn-destructive rounded-md"
            >
              Delete Flight
            </button>
          </div>
        )}

        <div className="max-h-[36rem] overflow-y-auto">
          {filterId === 'all' ? renderRoster(rows, true) : (
            <>
              {powerFlights.map(({ movement, label }) => {
                const lifters = powerRowsForFlight(movement, label);
                return (
                  <section key={`${movement}-${label}`}>
                    <div className="flex items-center justify-between gap-2 bg-gray-50 border-y border-gray-200 px-4 py-2.5">
                      <h3 className="text-sm font-bold text-gray-800">{movement} · {label}</h3>
                      <span className="text-xs font-semibold text-gray-600">{lifters.length} assigned / {maxParticipants}</span>
                    </div>
                    {renderRoster(lifters)}
                  </section>
                );
              })}
              {olympicSessions.map((session) => {
                const lifters = olympicRows(session);
                return (
                  <section key={`${session.startTime}-${session.endTime}`}>
                    <div className="flex items-center justify-between gap-2 bg-amber-50 border-y border-amber-200 px-4 py-2.5">
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">Olympic · {session.label} <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OLY</span></h3>
                        <p className="text-xs text-amber-800">{session.movements.join(' + ')} · {formatFlightTime(session.startTime)}–{formatFlightTime(session.endTime)}</p>
                      </div>
                      <span className="text-xs font-semibold text-amber-800 whitespace-nowrap">{lifters.length} · open</span>
                    </div>
                    {renderRoster(lifters)}
                  </section>
                );
              })}
              {activeFlight && (powerFlights.length > 0 || olympicSessions.length > 0) && (() => {
                const assigned = new Set([
                  ...powerFlights.flatMap(({ movement, label }) => powerRowsForFlight(movement, label)),
                  ...olympicSessions.flatMap((session) => olympicRows(session)),
                ].map((entry) => entry.participant.id));
                const pending = rows.filter((entry) => entry.waveId === activeFlight.id && !assigned.has(entry.participant.id));
                return pending.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between gap-2 bg-gray-50 border-y border-gray-200 px-4 py-2.5">
                      <h3 className="text-sm font-bold text-gray-800">Needs movement / session assignment</h3>
                      <span className="text-xs text-gray-600">{pending.length}</span>
                    </div>
                    {renderRoster(pending)}
                  </section>
                );
              })()}
              {powerFlights.length === 0 && olympicSessions.length === 0 && renderRoster(rows.filter((entry) => entry.waveId === filterId))}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm py-10">
            Select a lifter from the list to view and edit their details.
          </div>
        ) : (
          (() => {
            const meta = participantMeta[selected.participant.id];
            const firstPref = getPreferenceSummary(meta?.firstPreferenceHour || '', meta?.firstPreferenceFlexibility || '');
            const secondPref = getPreferenceSummary(meta?.secondPreferenceHour || '', meta?.secondPreferenceFlexibility || '');
            const bodyWeight = meta?.bodyWeight ?? selected.participant.bodyWeight ?? '';
            const genderCategory = meta?.genderCategory ?? selected.participant.genderCategory ?? '';
            const olympicLiftsOptIn = meta?.olympicLiftsOptIn ?? selected.participant.olympicLiftsOptIn === true;
            const olympicSessionStart = meta?.olympicSessionStart ?? selected.participant.olympicSessionStart ?? '';
            const isManualParticipant = selected.participant.id.startsWith('p-');

            return (
              <div>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selected.participant.name}</h3>
                    <p className="text-xs text-gray-500">{activeFlight?.name || selected.wave.name}</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await deleteParticipant(selected.waveId, selected.participant.id);
                        setSelectedKey(null);
                      } catch (error) {
                        console.error('Failed to delete participant:', error);
                      }
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-white btn-destructive rounded-md"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {isManualParticipant && <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Gender Category</span>
                    <select
                      value={genderCategory}
                      onChange={(e) => {
                        void handleLiftParticipantFieldChange(selected.waveId, selected.participant.id, { genderCategory: e.target.value });
                      }}
                      className="input-focus-brand w-full p-2 border border-gray-300 rounded-md bg-white text-sm"
                    >
                      <option value="">Select</option>
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Non-Binary">Non-Binary</option>
                    </select>
                  </label>}
                  <div className="min-w-0">
                    <label htmlFor={`flight-bodyweight-${selected.participant.id}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
                      Bodyweight
                      <span className="group relative inline-grid h-4 w-4 cursor-help place-items-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-500" tabIndex={0} aria-label="Bodyweight is collected for leaderboard scoring calculations">
                        i
                        <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-52 rounded-md bg-gray-900 px-2 py-1.5 text-left text-[11px] font-medium normal-case text-white shadow-lg group-hover:block group-focus:block">
                          Bodyweight is collected for leaderboard scoring calculations.
                        </span>
                      </span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id={`flight-bodyweight-${selected.participant.id}`}
                        type="text"
                        inputMode="decimal"
                        value={bodyWeight}
                        onChange={(e) => {
                          const nextBodyWeight = e.target.value;
                          setParticipantMeta((prev) => ({
                            ...prev,
                            [selected.participant.id]: { ...(prev[selected.participant.id] || emptyMeta), bodyWeight: nextBodyWeight },
                          }));
                        }}
                        onBlur={(e) => {
                          void handleLiftParticipantFieldChange(selected.waveId, selected.participant.id, { bodyWeight: e.target.value.trim() });
                        }}
                        className="input-focus-brand min-w-0 flex-1 rounded-md border border-gray-300 p-2 text-sm"
                      />
                      <label className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={olympicLiftsOptIn}
                          onChange={(e) => {
                            void handleLiftParticipantFieldChange(selected.waveId, selected.participant.id, { olympicLiftsOptIn: e.target.checked });
                          }}
                          className="h-4 w-4 rounded border-amber-300"
                        />
                        Oly opt-in
                      </label>
                    </div>
                  </div>
                </div>

                {olympicLiftsOptIn && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-600">
                      Olympic session
                      <select
                        value={olympicSessionStart}
                        disabled={!!savingAssignments[selected.participant.id]}
                        onChange={(e) => {
                          void handleOlympicSessionChange(selected.waveId, selected.participant.id, e.target.value);
                        }}
                        className="input-focus-brand mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
                      >
                        <option value="">Select a session</option>
                        {olympicSessionOptions.map((session) => (
                          <option key={session.startTime} value={session.startTime}>
                            {formatFlightTime(session.startTime)}–{formatFlightTime(session.endTime)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {isManualParticipant && <div className="space-y-1 text-sm text-gray-600 mb-4">
                  {meta?.groupName && <p>Group: <span className="font-medium text-gray-800">{meta.groupName}</span></p>}
                  {firstPref && <p>1st preference: <span className="font-medium text-gray-800">{firstPref}</span></p>}
                  {secondPref && <p>2nd preference: <span className="font-medium text-gray-800">{secondPref}</span></p>}
                </div>}

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Flight per Movement</h4>
                  <p className="text-[11px] text-gray-500 mb-2">A lifter&apos;s flight can differ movement to movement based on timing.</p>
                  <div className="grid grid-cols-5 gap-2">
                    {customEvents.map((event) => {
                      const movementFlightOptions = liftFlights[event] || [];
                      const currentFlightLabel = meta?.liftMovementFlights?.[event] ?? selected.participant.liftMovementFlights?.[event] ?? '';
                      const requiresOlympicOptIn = olympicLiftMovements.includes(event);
                      const canEditMovement = !requiresOlympicOptIn || olympicLiftsOptIn;
                      const waveData = selected.participant.waveData || {};
                      const usesRack = rackMovements.includes(event);
                      const currentRackHeight = meta?.liftMovementRackHeights?.[event] ?? selected.participant.liftMovementRackHeights?.[event] ?? '';
                      const currentPr = meta?.liftMovementPrs?.[event] ?? selected.participant.liftMovementPrs?.[event] ?? '';
                      return (
                        <div key={event} className="rounded-md border border-slate-200 bg-white p-2">
                          <div className="mb-2 flex min-h-8 items-start gap-1">
                            <span className="text-xs font-semibold leading-tight text-gray-700">{event}</span>
                            {requiresOlympicOptIn && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OLY</span>
                            )}
                          </div>

                          <label className="mb-2 block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Flight</span>
                            {movementFlightOptions.length > 0 ? (
                              <select
                                value={currentFlightLabel}
                                disabled={!!savingAssignments[selected.participant.id]}
                                onChange={(e) => {
                                  handleMovementFlightChange(selected.participant.id, event, e.target.value);
                                  void handleMovementFlightCommit(selected.waveId, selected.participant.id, event, e.target.value);
                                }}
                                className="input-focus-brand w-full p-1.5 border border-gray-300 rounded-md text-xs bg-white"
                              >
                                <option value="">—</option>
                                {movementFlightOptions.map((flight) => (
                                  <option key={flight.id} value={flight.label}>{flight.label}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={currentFlightLabel}
                                onChange={(e) => handleMovementFlightChange(selected.participant.id, event, e.target.value)}
                                onBlur={() => {
                                  void handleMovementFlightCommit(selected.waveId, selected.participant.id, event, currentFlightLabel);
                                }}
                                placeholder="Flight"
                                className="input-focus-brand w-full p-1.5 border border-gray-300 rounded-md text-xs"
                              />
                            )}
                          </label>

                          <label className="mb-2 block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">1st Attempt</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={waveData[getAttemptField(event, 1)] || meta?.liftMovementOpenerWeights?.[event] || ''}
                              onChange={(e) => handleAttemptChange(selected.waveId, selected.participant, event, 1, e.target.value)}
                              onBlur={() => handleAttemptBlur(selected.waveId)}
                              disabled={!canEditMovement}
                              className="input-focus-brand w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                              placeholder={canEditMovement ? 'Weight' : 'N/A'}
                              aria-label={`${event} first attempt weight`}
                            />
                          </label>

                          {isManualParticipant && <label className="mb-2 block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">PR</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={currentPr}
                              onChange={(e) => {
                                const nextPr = e.target.value;
                                setParticipantMeta((prev) => ({
                                  ...prev,
                                  [selected.participant.id]: {
                                    ...(prev[selected.participant.id] || emptyMeta),
                                    liftMovementPrs: { ...((prev[selected.participant.id] || emptyMeta).liftMovementPrs || {}), [event]: nextPr },
                                  },
                                }));
                              }}
                              onBlur={(e) => {
                                const next = { ...(meta?.liftMovementPrs || {}), [event]: e.target.value.trim() };
                                void handleLiftParticipantFieldChange(selected.waveId, selected.participant.id, { liftMovementPrs: next });
                              }}
                              disabled={!canEditMovement}
                              placeholder={canEditMovement ? 'PR' : 'N/A'}
                              aria-label={`${event} personal record`}
                              className="input-focus-brand w-full px-2 py-1 border border-amber-300 bg-amber-50 rounded text-sm font-semibold disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                            />
                          </label>}

                          {usesRack && (
                            <label className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Rack</span>
                              <select
                                value={currentRackHeight}
                                onChange={(e) => void handleRackHeightChange(selected.waveId, selected.participant.id, event, e.target.value)}
                                disabled={!canEditMovement}
                                className="input-focus-brand w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                                aria-label={`${event} rack height`}
                              >
                                <option value="">Height</option>
                                {currentRackHeight && !RACK_HEIGHT_OPTIONS.includes(currentRackHeight) && (
                                  <option value={currentRackHeight}>{currentRackHeight}</option>
                                )}
                                {RACK_HEIGHT_OPTIONS.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>
      </div>
    </div>
  );
}
