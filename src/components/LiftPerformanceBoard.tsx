'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';
import type { Participant, Wave } from '@/types';

interface RosterEntry {
  waveId: string;
  participant: Participant;
}

const getAttemptField = (movement: string, attemptNumber: number) => `${movement}__attempt_${attemptNumber}`;
const getAttemptStatusField = (movement: string, attemptNumber: number) => `${getAttemptField(movement, attemptNumber)}_status`;

type AttemptStatus = 'pending' | 'good' | 'miss';

const RACK_HEIGHT_OPTIONS = Array.from({ length: 8 }, (_, i) => String(i + 7));

function platformLabel(index: number): string {
  return `Platform ${String.fromCharCode(65 + index)}`;
}

export default function LiftPerformanceBoard() {
  const {
    waves,
    activeEventId,
    customEvents,
    liftFlights,
    olympicLiftMovements,
    rackMovements,
    rackCount,
    platformCount,
    rackHeightSettings,
    setRackHeightSetting,
    themeColors,
    updateParticipantData,
    saveWavePerformance,
    loadAll,
  } = useWaveStore();

  const accent = themeColors.accent;

  const categories = useMemo(() => {
    const olympic = customEvents.filter((m) => olympicLiftMovements.includes(m));
    const powerlifting = customEvents.filter((m) => !olympicLiftMovements.includes(m));
    const result: Record<string, string[]> = {};
    if (powerlifting.length > 0) result.Powerlifting = powerlifting;
    if (olympic.length > 0) result.Olympic = olympic;
    return result;
  }, [customEvents, olympicLiftMovements]);

  const [category, setCategory] = useState<string>('');
  const [movement, setMovement] = useState<string>('');
  const [flightLabel, setFlightLabel] = useState<string>('');
  const [rackKey, setRackKey] = useState<string>('');

  useEffect(() => {
    const categoryNames = Object.keys(categories);
    if (categoryNames.length === 0) return;
    if (!category || !categoryNames.includes(category)) {
      setCategory(categoryNames[0]);
    }
  }, [categories, category]);

  useEffect(() => {
    const movementsForCategory = categories[category] || [];
    if (movementsForCategory.length === 0) return;
    if (!movement || !movementsForCategory.includes(movement)) {
      setMovement(movementsForCategory[0]);
    }
  }, [categories, category, movement]);

  const movementUsesRack = rackMovements.includes(movement);
  const movementIsPlatform = olympicLiftMovements.includes(movement);

  const flightsForMovement = liftFlights[movement] || [];

  useEffect(() => {
    if (flightsForMovement.length === 0) {
      setFlightLabel('');
      return;
    }
    if (!flightLabel || !flightsForMovement.some((f) => f.label === flightLabel)) {
      setFlightLabel(flightsForMovement[0].label);
    }
  }, [flightsForMovement, flightLabel]);

  const rackKeys = useMemo(() => {
    if (movementUsesRack) return Array.from({ length: Math.max(1, rackCount) }, (_, i) => `Rack ${i + 1}`);
    if (movementIsPlatform) return Array.from({ length: Math.max(1, platformCount) }, (_, i) => platformLabel(i));
    return [];
  }, [movementUsesRack, movementIsPlatform, rackCount, platformCount]);

  useEffect(() => {
    if (rackKeys.length === 0) {
      setRackKey('');
      return;
    }
    if (!rackKey || !rackKeys.includes(rackKey)) {
      setRackKey(rackKeys[0]);
    }
  }, [rackKeys, rackKey]);

  const roster: RosterEntry[] = useMemo(() => {
    if (!movement || !flightLabel) return [];
    const entries: RosterEntry[] = [];
    Object.entries(waves as Record<string, Wave>).forEach(([waveId, wave]) => {
      wave.participants.forEach((participant) => {
        const assignedFlight = participant.liftMovementFlights?.[movement] || '';
        if (assignedFlight !== flightLabel) return;
        if (movementIsPlatform && participant.olympicLiftsOptIn !== true) return;
        entries.push({ waveId, participant });
      });
    });
    return entries;
  }, [waves, movement, flightLabel, movementIsPlatform]);

  const unassigned = roster.filter((entry) => !entry.participant.liftMovementRacks?.[movement]);
  const assignedToSelectedRack = roster.filter((entry) => entry.participant.liftMovementRacks?.[movement] === rackKey);

  const handleAssignRack = async (entry: RosterEntry, nextRackKey: string) => {
    if (!nextRackKey) return;
    const nextRacks = { ...(entry.participant.liftMovementRacks || {}), [movement]: nextRackKey };
    try {
      const { db } = getFirebase();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'events', activeEventId, 'waves', entry.waveId, 'participants', entry.participant.id), {
        id: entry.participant.id,
        liftMovementRacks: nextRacks,
        updatedAt: now,
      }, { merge: true });

      if (!entry.participant.id.startsWith('p-')) {
        await setDoc(doc(db, 'events', activeEventId, 'registrations', entry.participant.id), {
          participantId: entry.participant.id,
          liftMovementRacks: nextRacks,
          updatedAt: now,
          source: 'manual-ops',
        }, { merge: true });
      }

      await loadAll({ preserveActiveEvent: true, force: true });
    } catch (error) {
      console.error('Failed to assign rack:', error);
      alert('Failed to assign rack. Please try again.');
    }
  };

  const handleRackHeightChange = async (entry: RosterEntry, rackHeight: string) => {
    const nextHeights = { ...(entry.participant.liftMovementRackHeights || {}), [movement]: rackHeight };
    try {
      const { db } = getFirebase();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'events', activeEventId, 'waves', entry.waveId, 'participants', entry.participant.id), {
        id: entry.participant.id,
        liftMovementRackHeights: nextHeights,
        updatedAt: now,
      }, { merge: true });

      if (!entry.participant.id.startsWith('p-')) {
        await setDoc(doc(db, 'events', activeEventId, 'registrations', entry.participant.id), {
          participantId: entry.participant.id,
          liftMovementRackHeights: nextHeights,
          updatedAt: now,
          source: 'manual-ops',
        }, { merge: true });
      }

      await loadAll({ preserveActiveEvent: true, force: true });
    } catch (error) {
      console.error('Failed to update rack height:', error);
      alert('Failed to update rack height. Please try again.');
    }
  };

  const handleAttemptChange = (entry: RosterEntry, attemptNumber: number, value: string) => {
    const field = getAttemptField(movement, attemptNumber);
    updateParticipantData(entry.waveId, entry.participant.id, field, value);

    const waveData = entry.participant.waveData || {};
    const attemptValues = [1, 2, 3].map((n) => {
      const raw = n === attemptNumber ? value : waveData[getAttemptField(movement, n)];
      const parsed = parseFloat(raw || '');
      return Number.isFinite(parsed) ? parsed : 0;
    });
    const best = Math.max(...attemptValues);
    updateParticipantData(entry.waveId, entry.participant.id, movement, best > 0 ? String(best) : '');
  };

  const handleAttemptStatusChange = (entry: RosterEntry, attemptNumber: number, status: AttemptStatus) => {
    const field = getAttemptStatusField(movement, attemptNumber);
    const waveData = entry.participant.waveData || {};
    const current = waveData[field] as AttemptStatus | undefined;
    updateParticipantData(entry.waveId, entry.participant.id, field, current === status ? 'pending' : status);
  };

  const handleAttemptBlur = async (waveId: string) => {
    try {
      await saveWavePerformance(waveId, activeEventId);
    } catch (error) {
      console.error('Failed to save attempt:', error);
    }
  };

  if (Object.keys(categories).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center text-gray-500">
        No movements configured yet. Add movements and flights in Settings first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Category</span>
            <div className="flex flex-wrap gap-2">
              {Object.keys(categories).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${category === cat ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                  style={category === cat ? { backgroundColor: accent } : undefined}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-l border-gray-200 pl-6">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Movement</span>
            <div className="flex flex-wrap gap-2">
              {(categories[category] || []).map((m) => {
                const tag = rackMovements.includes(m) ? 'RACK' : olympicLiftMovements.includes(m) ? 'PLATFORM' : 'FLOOR';
                return (
                  <button
                    key={m}
                    onClick={() => setMovement(m)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${movement === m ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    style={movement === m ? { backgroundColor: accent } : undefined}
                  >
                    {m} <span className="ml-1 text-[9px] font-bold opacity-80">{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-l border-gray-200 pl-6">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Flight</span>
            <div className="flex flex-wrap gap-2">
              {flightsForMovement.length === 0 ? (
                <span className="text-xs text-gray-400">No flights configured</span>
              ) : (
                flightsForMovement.map((flight) => (
                  <button
                    key={flight.id}
                    onClick={() => setFlightLabel(flight.label)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${flightLabel === flight.label ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                    style={flightLabel === flight.label ? { backgroundColor: accent } : undefined}
                  >
                    {flight.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {rackKeys.length > 0 && (
            <div className="flex flex-col gap-2 border-l border-gray-200 pl-6">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{movementIsPlatform ? 'Platform' : 'Rack'}</span>
              <div className="flex flex-wrap gap-2">
                {rackKeys.map((key) => {
                  const height = rackHeightSettings[movement]?.[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setRackKey(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${rackKey === key ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                      style={rackKey === key ? { backgroundColor: accent } : undefined}
                    >
                      {key}{height ? ` (${height})` : ''}
                    </button>
                  );
                })}
              </div>
              {movementUsesRack && (
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-[10px] font-semibold text-gray-500">Set height:</span>
                  {rackKeys.map((key) => (
                    <label key={key} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                      {key}
                      <select
                        value={rackHeightSettings[movement]?.[key] || ''}
                        onChange={(e) => void setRackHeightSetting(movement, key, e.target.value, activeEventId)}
                        className="h-6 rounded border border-gray-300 bg-white px-1 text-[11px] font-semibold text-gray-700"
                      >
                        <option value="">—</option>
                        {RACK_HEIGHT_OPTIONS.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!movement || !flightLabel ? (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center text-gray-500">
          Select a movement and flight to view lifters.
        </div>
      ) : rackKeys.length > 0 ? (
        <>
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              Checked in — {movement} · {flightLabel} ({unassigned.length} awaiting {movementIsPlatform ? 'platform' : 'rack'})
            </h4>
            {unassigned.length === 0 ? (
              <p className="text-xs text-gray-500">Everyone checked in for this flight has been assigned.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {unassigned.map((entry) => (
                  <div key={entry.participant.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="text-sm font-semibold text-gray-900">{entry.participant.name}</span>
                    <div className="flex items-center gap-1.5">
                      {movementUsesRack && (
                        <select
                          value={entry.participant.liftMovementRackHeights?.[movement] || ''}
                          onChange={(e) => void handleRackHeightChange(entry, e.target.value)}
                          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700"
                          title="Rack height"
                        >
                          <option value="">Height</option>
                          {RACK_HEIGHT_OPTIONS.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      )}
                      <select
                        defaultValue=""
                        onChange={(e) => void handleAssignRack(entry, e.target.value)}
                        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700"
                      >
                        <option value="" disabled>Choose {movementIsPlatform ? 'platform' : 'rack'}…</option>
                        {rackKeys.map((key) => {
                          const height = rackHeightSettings[movement]?.[key];
                          return (
                            <option key={key} value={key}>{key}{height ? ` (${height})` : ''}</option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              {rackKey}{rackHeightSettings[movement]?.[rackKey] ? ` (${rackHeightSettings[movement]?.[rackKey]})` : ''} — live view
            </h4>
            {assignedToSelectedRack.length === 0 ? (
              <p className="text-xs text-gray-500">No lifters assigned to {rackKey} yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignedToSelectedRack.map((entry) => (
                  <LifterAttemptCard
                    key={entry.participant.id}
                    entry={entry}
                    movement={movement}
                    rackKeys={rackKeys}
                    isPlatform={movementIsPlatform}
                    showRackHeight={movementUsesRack}
                    onAssign={handleAssignRack}
                    onAttemptChange={handleAttemptChange}
                    onAttemptStatusChange={handleAttemptStatusChange}
                    onAttemptBlur={handleAttemptBlur}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{movement} · {flightLabel} — open list</h4>
          {roster.length === 0 ? (
            <p className="text-xs text-gray-500">No lifters checked in for this flight yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roster.map((entry) => (
                <LifterAttemptCard
                  key={entry.participant.id}
                  entry={entry}
                  movement={movement}
                  rackKeys={[]}
                  isPlatform={false}
                  showRackHeight={false}
                  onAssign={handleAssignRack}
                  onAttemptChange={handleAttemptChange}
                  onAttemptStatusChange={handleAttemptStatusChange}
                  onAttemptBlur={handleAttemptBlur}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LifterAttemptCard({
  entry,
  movement,
  rackKeys,
  isPlatform,
  showRackHeight,
  onAssign,
  onAttemptChange,
  onAttemptStatusChange,
  onAttemptBlur,
}: {
  entry: RosterEntry;
  movement: string;
  rackKeys: string[];
  isPlatform: boolean;
  showRackHeight: boolean;
  onAssign: (entry: RosterEntry, rackKey: string) => Promise<void>;
  onAttemptChange: (entry: RosterEntry, attemptNumber: number, value: string) => void;
  onAttemptStatusChange: (entry: RosterEntry, attemptNumber: number, status: AttemptStatus) => void;
  onAttemptBlur: (waveId: string) => Promise<void>;
}) {
  const waveData = entry.participant.waveData || {};
  const currentRack = entry.participant.liftMovementRacks?.[movement] || '';
  const currentRackHeight = entry.participant.liftMovementRackHeights?.[movement] || '';

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold text-gray-900 truncate">{entry.participant.name}</span>
          {showRackHeight && currentRackHeight && (
            <span className="shrink-0 rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold">
              H{currentRackHeight}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {rackKeys.length > 0 && (
            <select
              value={currentRack}
              onChange={(e) => void onAssign(entry, e.target.value)}
              className="h-7 rounded-md border border-gray-300 bg-white px-1.5 text-[11px] font-semibold text-gray-700"
            >
              {rackKeys.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((attemptNumber) => {
          const field = getAttemptField(movement, attemptNumber);
          const statusField = getAttemptStatusField(movement, attemptNumber);
          const status = (waveData[statusField] as AttemptStatus | undefined) || 'pending';
          return (
            <div key={attemptNumber} className="rounded-md border border-gray-300 bg-white p-1.5 text-center">
              <span className="block text-[9px] font-bold uppercase text-gray-400 mb-1">
                {attemptNumber === 1 ? 'Opener' : attemptNumber === 2 ? '2nd' : '3rd'}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={waveData[field] || ''}
                onChange={(e) => onAttemptChange(entry, attemptNumber, e.target.value)}
                onBlur={() => void onAttemptBlur(entry.waveId)}
                className="w-full mb-1 rounded border border-gray-300 px-1 py-0.5 text-center text-xs font-semibold input-focus-brand"
                placeholder={isPlatform && entry.participant.olympicLiftsOptIn !== true ? 'N/A' : '—'}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    onAttemptStatusChange(entry, attemptNumber, 'good');
                    void onAttemptBlur(entry.waveId);
                  }}
                  className={`flex-1 rounded text-[9px] font-bold py-0.5 border ${status === 'good' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                >
                  Hit
                </button>
                <button
                  onClick={() => {
                    onAttemptStatusChange(entry, attemptNumber, 'miss');
                    void onAttemptBlur(entry.waveId);
                  }}
                  className={`flex-1 rounded text-[9px] font-bold py-0.5 border ${status === 'miss' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                >
                  Miss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
