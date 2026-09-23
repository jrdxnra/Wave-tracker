'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';
import PrintDashboard from './PrintDashboard';

interface FlightParticipant {
  id: string;
  name: string;
  waveData: Record<string, string>;
  includeInLeaderboard?: boolean;
  entryMode?: string;
  groupName?: string;
  pingGroupOptIn?: boolean;
  olympicLiftsOptIn?: boolean;
  firstPreferenceHour?: string;
  firstPreferenceFlexibility?: string;
  secondPreferenceHour?: string;
  secondPreferenceFlexibility?: string;
  bodyWeight?: string;
  rackHeight?: string;
  liftMovementFlights?: Record<string, string>;
  liftMovementRackHeights?: Record<string, string>;
}

interface FlightWave {
  id: string;
  name: string;
  participants: FlightParticipant[];
  startTime: string;
  coach?: string;
}

interface ParticipantMeta {
  entryMode: string;
  groupName: string;
  pingGroupOptIn: boolean;
  includeInLeaderboard: boolean;
  olympicLiftsOptIn: boolean;
  bodyWeight: string;
  firstPreferenceHour: string;
  firstPreferenceFlexibility: string;
  secondPreferenceHour: string;
  secondPreferenceFlexibility: string;
  liftMovementFlights: Record<string, string>;
  liftMovementRackHeights: Record<string, string>;
}

const emptyMeta: ParticipantMeta = {
  entryMode: '',
  groupName: '',
  pingGroupOptIn: false,
  includeInLeaderboard: true,
  olympicLiftsOptIn: false,
  bodyWeight: '',
  firstPreferenceHour: '',
  firstPreferenceFlexibility: '',
  secondPreferenceHour: '',
  secondPreferenceFlexibility: '',
  liftMovementFlights: {},
  liftMovementRackHeights: {},
};

const RACK_HEIGHT_OPTIONS = Array.from({ length: 8 }, (_, i) => String(i + 7));

const getAttemptField = (event: string, attemptNumber: number) => `${event}__attempt_${attemptNumber}`;

interface LiftFlightBoardProps {
  waveIds: string[];
  waves: Record<string, FlightWave>;
  onAddFlight: () => void;
}

function getEntryModeLabel(entryMode: string, groupName: string): string {
  const value = `${entryMode} ${groupName}`.toLowerCase();
  if (value.includes('group') || value.includes('team')) return 'Group';
  if (value.includes('buddy') || value.includes('pair')) return 'Buddy';
  return 'Single';
}

function getPreferenceSummary(hour: string, flexibility: string): string {
  const cleanHour = String(hour || '').trim();
  const cleanFlex = String(flexibility || '').trim();
  if (cleanHour && cleanFlex) return `${cleanHour} / ${cleanFlex}`;
  return cleanHour || cleanFlex;
}

export default function LiftFlightBoard({ waveIds, waves, onAddFlight }: LiftFlightBoardProps) {
  const {
    deleteWave,
    addParticipant,
    deleteParticipant,
    updateWave,
    themeColors,
    activeEventId,
    maxParticipants,
    loadAll,
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
  const [newParticipantName, setNewParticipantName] = useState('');
  const [coachDraft, setCoachDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState('');

  const activeFlight = filterId !== 'all' ? waves[filterId] : null;

  useEffect(() => {
    setCoachDraft(activeFlight?.coach || '');
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
  }, [activeFlight?.coach, activeFlight?.startTime]);

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
            bodyWeight: String(participant.bodyWeight || ''),
            firstPreferenceHour: String(participant.firstPreferenceHour || ''),
            firstPreferenceFlexibility: String(participant.firstPreferenceFlexibility || ''),
            secondPreferenceHour: String(participant.secondPreferenceHour || ''),
            secondPreferenceFlexibility: String(participant.secondPreferenceFlexibility || ''),
            liftMovementFlights: { ...(participant.liftMovementFlights || {}) },
            liftMovementRackHeights: { ...(participant.liftMovementRackHeights || {}) },
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
                bodyWeight: String(regData.bodyWeight || fallback.bodyWeight),
                firstPreferenceHour: String(regData.firstPreferenceHour || fallback.firstPreferenceHour),
                firstPreferenceFlexibility: String(regData.firstPreferenceFlexibility || fallback.firstPreferenceFlexibility),
                secondPreferenceHour: String(regData.secondPreferenceHour || fallback.secondPreferenceHour),
                secondPreferenceFlexibility: String(regData.secondPreferenceFlexibility || fallback.secondPreferenceFlexibility),
                liftMovementFlights: { ...fallback.liftMovementFlights, ...(regData.liftMovementFlights || {}) },
                liftMovementRackHeights: { ...fallback.liftMovementRackHeights, ...(regData.liftMovementRackHeights || {}) },
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
  }, [activeEventId, waveIds, waves]);

  const rows = useMemo(() => {
    const idsToShow = filterId === 'all' ? waveIds : [filterId];
    const list: Array<{ waveId: string; waveName: string; participant: FlightParticipant }> = [];
    idsToShow.forEach((id) => {
      const wave = waves[id];
      if (!wave) return;
      wave.participants.forEach((participant) => list.push({ waveId: id, waveName: wave.name, participant }));
    });
    return list;
  }, [filterId, waveIds, waves]);

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
    updates: Partial<Pick<ParticipantMeta, 'bodyWeight' | 'olympicLiftsOptIn' | 'liftMovementFlights' | 'liftMovementRackHeights'>>
  ) => {
    setParticipantMeta((prev) => ({
      ...prev,
      [participantId]: { ...(prev[participantId] || emptyMeta), ...updates },
    }));

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

      await loadAll({ preserveActiveEvent: true, force: true });
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

  const handleMovementFlightCommit = async (waveId: string, participantId: string, liftMovementFlights: Record<string, string>) => {
    await handleLiftParticipantFieldChange(waveId, participantId, { liftMovementFlights });
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
    const next = { ...(meta?.liftMovementRackHeights || {}), [movementName]: rackHeight };
    await handleLiftParticipantFieldChange(waveId, participantId, { liftMovementRackHeights: next });
  };

  const handleAddParticipant = async () => {
    if (!activeFlight || !newParticipantName.trim()) return;
    try {
      await addParticipant(activeFlight.id, newParticipantName.trim());
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-2">
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
            </button>
          ))}
          <button
            onClick={onAddFlight}
            className="ml-auto px-3 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            + Add Flight
          </button>
        </div>

        {activeFlight && (
          <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
              <input
                type="time"
                value={timeDraft}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="input-focus-brand p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Coach</label>
              <input
                type="text"
                value={coachDraft}
                onChange={(e) => setCoachDraft(e.target.value)}
                onBlur={() => updateWave(activeFlight.id, { coach: coachDraft })}
                placeholder="Coach name"
                className="input-focus-brand p-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">Add Lifter</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
                  className="input-focus-brand flex-1 p-2 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={handleAddParticipant}
                  className="px-3 py-2 rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  Add
                </button>
              </div>
            </div>
            <PrintDashboard wave={activeFlight} />
            <button
              onClick={async () => {
                try {
                  await deleteWave(activeFlight.id);
                  setFilterId('all');
                } catch (error) {
                  console.error('Failed to delete wave:', error);
                }
              }}
              className="px-3 py-2 text-xs font-semibold text-white btn-destructive rounded-md"
            >
              Delete Flight
            </button>
          </div>
        )}

        <div className="max-h-[36rem] overflow-y-auto divide-y divide-gray-100">
          {rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 px-4">
              {filterId === 'all' ? 'No lifters registered yet.' : 'No lifters in this flight yet.'}
            </p>
          ) : (
            rows.map(({ waveId, waveName, participant }) => {
              const key = `${waveId}::${participant.id}`;
              const meta = participantMeta[participant.id];
              const isSelected = selectedKey === key;
              const olympicLiftsOptIn = meta?.olympicLiftsOptIn ?? participant.olympicLiftsOptIn === true;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-gray-900 text-sm">{participant.name}</span>
                    {filterId === 'all' && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                        {waveName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {olympicLiftsOptIn && (
                      <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold">Oly</span>
                    )}
                    <span className="text-[10px] font-semibold text-gray-400">BW {meta?.bodyWeight || participant.bodyWeight || '—'}</span>
                  </div>
                </button>
              );
            })
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
            const entryLabel = getEntryModeLabel(meta?.entryMode || selected.participant.entryMode || '', meta?.groupName || selected.participant.groupName || '');
            const firstPref = getPreferenceSummary(meta?.firstPreferenceHour || '', meta?.firstPreferenceFlexibility || '');
            const secondPref = getPreferenceSummary(meta?.secondPreferenceHour || '', meta?.secondPreferenceFlexibility || '');
            const bodyWeight = meta?.bodyWeight ?? selected.participant.bodyWeight ?? '';
            const olympicLiftsOptIn = meta?.olympicLiftsOptIn ?? selected.participant.olympicLiftsOptIn === true;
            const includeInLeaderboard = meta?.includeInLeaderboard ?? selected.participant.includeInLeaderboard !== false;

            return (
              <div>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selected.participant.name}</h3>
                    <p className="text-xs text-gray-500">{selected.wave.name}</p>
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

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">Bodyweight</span>
                    <input
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
                      className="input-focus-brand w-full p-2 border border-gray-300 rounded-md text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={olympicLiftsOptIn}
                      onChange={(e) => {
                        void handleLiftParticipantFieldChange(selected.waveId, selected.participant.id, { olympicLiftsOptIn: e.target.checked });
                      }}
                      className="h-4 w-4 rounded border-amber-300"
                    />
                    <span className="text-sm font-medium text-gray-700">Olympic lifts opt-in</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-gray-600 mb-4">
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">{entryLabel}</span>
                  <span className={`rounded-full px-2 py-0.5 ${meta?.pingGroupOptIn ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                    Ping {meta?.pingGroupOptIn ? 'Y' : 'N'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${includeInLeaderboard ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                    LB {includeInLeaderboard ? 'Y' : 'N'}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-gray-600 mb-4">
                  {meta?.groupName && <p>Group: <span className="font-medium text-gray-800">{meta.groupName}</span></p>}
                  {firstPref && <p>1st preference: <span className="font-medium text-gray-800">{firstPref}</span></p>}
                  {secondPref && <p>2nd preference: <span className="font-medium text-gray-800">{secondPref}</span></p>}
                </div>

                <div className="mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Flight per Movement</h4>
                  <p className="text-[11px] text-gray-500 mb-2">A lifter's flight can differ movement to movement based on timing.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {customEvents.map((event) => {
                      const movementFlightOptions = liftFlights[event] || [];
                      const currentFlightLabel = meta?.liftMovementFlights?.[event] ?? selected.participant.liftMovementFlights?.[event] ?? '';
                      const usesRack = rackMovements.includes(event);
                      return (
                        <label key={event} className="block">
                          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-600 mb-1">
                            {event}
                            {usesRack && <span className="rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-1 py-0 text-[9px] font-bold">RACK</span>}
                          </span>
                          {movementFlightOptions.length > 0 ? (
                            <select
                              value={currentFlightLabel}
                              onChange={(e) => {
                                handleMovementFlightChange(selected.participant.id, event, e.target.value);
                                const next = { ...(meta?.liftMovementFlights || {}), [event]: e.target.value };
                                void handleMovementFlightCommit(selected.waveId, selected.participant.id, next);
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
                                const next = { ...(meta?.liftMovementFlights || {}), [event]: currentFlightLabel };
                                void handleMovementFlightCommit(selected.waveId, selected.participant.id, next);
                              }}
                              placeholder="Flight"
                              className="input-focus-brand w-full p-1.5 border border-gray-300 rounded-md text-xs"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Attempt Weights</h4>
                  <div className="space-y-3">
                    {customEvents.map((event) => {
                      const requiresOlympicOptIn = olympicLiftMovements.includes(event);
                      const canEditMovement = !requiresOlympicOptIn || olympicLiftsOptIn;
                      const waveData = selected.participant.waveData || {};
                      const usesRack = rackMovements.includes(event);
                      const currentRackHeight = meta?.liftMovementRackHeights?.[event] ?? selected.participant.liftMovementRackHeights?.[event] ?? '';
                      return (
                        <div key={event}>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs font-semibold text-gray-700">{event}</span>
                            {requiresOlympicOptIn && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OLY</span>
                            )}
                          </div>
                          <div className={`grid gap-1 ${usesRack ? 'grid-cols-4' : 'grid-cols-3'}`}>
                            {[1, 2, 3].map((attemptNumber) => (
                              <input
                                key={`${event}-${attemptNumber}`}
                                type="text"
                                inputMode="decimal"
                                value={waveData[getAttemptField(event, attemptNumber)] || ''}
                                onChange={(e) => handleAttemptChange(selected.waveId, selected.participant, event, attemptNumber, e.target.value)}
                                onBlur={() => handleAttemptBlur(selected.waveId)}
                                disabled={!canEditMovement}
                                className="input-focus-brand w-full px-2 py-1 border border-gray-300 rounded text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                                placeholder={canEditMovement ? `A${attemptNumber}` : 'N/A'}
                                aria-label={`${event} attempt ${attemptNumber} weight`}
                              />
                            ))}
                            {usesRack && (
                              <select
                                value={currentRackHeight}
                                onChange={(e) => void handleRackHeightChange(selected.waveId, selected.participant.id, event, e.target.value)}
                                className="input-focus-brand w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                                aria-label={`${event} rack height`}
                              >
                                <option value="">Height</option>
                                {RACK_HEIGHT_OPTIONS.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          {canEditMovement && waveData[event] && (
                            <div className="text-[10px] font-medium text-gray-400 mt-0.5">Best: {waveData[event]}</div>
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
  );
}
