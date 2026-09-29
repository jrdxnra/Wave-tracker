'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';

interface WaitlistEntry {
  id: string;
  name: string;
  status: string;
  division: string;
  firstPreference: string;
  secondPreference: string;
  assignedFlight: string;
  sourceSheet: string;
  registrationId: string;
  squatFirstPreference: string;
  squatSecondPreference: string;
  benchFirstPreference: string;
  benchSecondPreference: string;
  deadliftFirstPreference: string;
  deadliftSecondPreference: string;
  olympicLiftingSelection: string;
  squatOpenerWeight: string;
  benchOpenerWeight: string;
  deadliftOpenerWeight: string;
  liftMovementFlights: Record<string, string>;
  bodyWeight: string;
  olympicLiftsOptIn: boolean;
  liftMovementPrs: Record<string, string>;
}

interface WaitlistDraftDetails {
  genderCategory: string;
  bodyWeight: string;
  olympicLiftsOptIn: boolean;
  liftMovementPrs: Record<string, string>;
}

const FLIGHT_ORDER = ['Squat', 'Bench', 'Deadlift', 'Snatch', 'Clean & Jerk'];

function preferenceFor(entry: WaitlistEntry, movement: string): string {
  const preferences: Record<string, string[]> = {
    Squat: [entry.squatFirstPreference, entry.squatSecondPreference],
    Bench: [entry.benchFirstPreference, entry.benchSecondPreference],
    Deadlift: [entry.deadliftFirstPreference, entry.deadliftSecondPreference],
  };
  if (preferences[movement]) return preferences[movement].filter(Boolean).join(' / ') || '—';
  const options = entry.olympicLiftingSelection.split(/[,;\n]+/).map((answer) => answer.trim());
  return options.filter((answer) => movement === 'Snatch' ? /snatch/i.test(answer) : /clean\s*(?:&|and)\s*jerk/i.test(answer)).join(' / ') || '—';
}

export default function WaitlistTab({ eventId }: { eventId: string }) {
  const waves = useWaveStore((state) => state.waves);
  const liftFlights = useWaveStore((state) => state.liftFlights);
  const olympicLiftMovements = useWaveStore((state) => state.olympicLiftMovements);
  const maxParticipants = useWaveStore((state) => state.maxParticipants);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [divisionFilter, setDivisionFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftFlights, setDraftFlights] = useState<Record<string, Record<string, string>>>({});
  const [draftDetails, setDraftDetails] = useState<Record<string, WaitlistDraftDetails>>({});
  const [admittingId, setAdmittingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setEntries([]);
    setSelectedId(null);
    setDraftFlights({});
    setDraftDetails({});
    setAdmittingId(null);
    setSearch('');
    setStatusFilter('All');
    setDivisionFilter('All');
    setLoading(true);
    setError('');
    const { db } = getFirebase();
    const waitlistQuery = query(collection(db, 'events', eventId, 'waitlist'), orderBy('updatedAt', 'desc'));
    return onSnapshot(waitlistQuery, (snapshot) => {
      setEntries(snapshot.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          name: String(data.name || ''),
          status: String(data.status || 'Waiting'),
          division: String(data.division || ''),
          firstPreference: String(data.firstPreference || ''),
          secondPreference: String(data.secondPreference || ''),
          assignedFlight: String(data.assignedFlight || ''),
          sourceSheet: String(data.sourceSheet || ''),
          registrationId: String(data.registrationId || ''),
          squatFirstPreference: String(data.squatFirstPreference || ''),
          squatSecondPreference: String(data.squatSecondPreference || ''),
          benchFirstPreference: String(data.benchFirstPreference || ''),
          benchSecondPreference: String(data.benchSecondPreference || ''),
          deadliftFirstPreference: String(data.deadliftFirstPreference || ''),
          deadliftSecondPreference: String(data.deadliftSecondPreference || ''),
          olympicLiftingSelection: String(data.olympicLiftingSelection || ''),
          squatOpenerWeight: String(data.squatOpenerWeight || ''),
          benchOpenerWeight: String(data.benchOpenerWeight || ''),
          deadliftOpenerWeight: String(data.deadliftOpenerWeight || ''),
          liftMovementFlights: data.liftMovementFlights || {},
          bodyWeight: String(data.bodyWeight || ''),
          olympicLiftsOptIn: data.olympicLiftsOptIn === true,
          liftMovementPrs: data.liftMovementPrs || {},
        };
      }));
      setLoading(false);
    }, (snapshotError) => {
      setError(snapshotError.message);
      setLoading(false);
    });
  }, [eventId]);

  const statuses = Array.from(new Set(entries.map((entry) => entry.status)));
  const divisions = Array.from(new Set(entries.map((entry) => entry.division).filter(Boolean))).sort();
  const filtered = entries.filter((entry) =>
    (statusFilter === 'All' || entry.status === statusFilter) &&
    (divisionFilter === 'All' || entry.division === divisionFilter) &&
    entry.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selected = entries.find((entry) => entry.id === selectedId);
  const selectedFlights = selected ? draftFlights[selected.id] || selected.liftMovementFlights : {};
  const selectedDetails: WaitlistDraftDetails = selected ? draftDetails[selected.id] || {
    genderCategory: selected.division,
    bodyWeight: selected.bodyWeight,
    olympicLiftsOptIn: selected.olympicLiftsOptIn,
    liftMovementPrs: selected.liftMovementPrs,
  } : { genderCategory: '', bodyWeight: '', olympicLiftsOptIn: false, liftMovementPrs: {} };

  const changeDraftDetails = (entry: WaitlistEntry, changes: Partial<WaitlistDraftDetails>) => {
    setDraftDetails((previous) => ({
      ...previous,
      [entry.id]: { ...(previous[entry.id] || {
        genderCategory: entry.division, bodyWeight: entry.bodyWeight,
        olympicLiftsOptIn: entry.olympicLiftsOptIn, liftMovementPrs: entry.liftMovementPrs,
      }), ...changes },
    }));
  };

  const handleAdmit = async (entry: WaitlistEntry) => {
    setAdmittingId(entry.id);
    try {
      const response = await fetch('/api/waitlist/admit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId, waitlist_id: entry.id, lift_movement_flights: selectedFlights,
          gender_category: selectedDetails.genderCategory, body_weight: selectedDetails.bodyWeight,
          olympic_lifts_opt_in: selectedDetails.olympicLiftsOptIn, lift_movement_prs: selectedDetails.liftMovementPrs,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Failed to admit from waitlist');
      await useWaveStore.getState().loadAll({ preserveActiveEvent: true, force: true });
    } catch (admitError) {
      alert(admitError instanceof Error ? admitError.message : 'Failed to admit from waitlist');
    } finally {
      setAdmittingId(null);
    }
  };
  const flightSlots = Object.entries(liftFlights).flatMap(([movement, flights]) =>
    flights.map((flight) => ({ movement, flight, isOlympic: olympicLiftMovements.includes(movement) }))
  );
  const roster = Array.from(new Map(Object.values(waves).flatMap((wave) =>
    wave.participants.map((participant) => [participant.id, participant] as const)
  )).values());

  return (
    <div className="space-y-4">
      {flightSlots.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Mini Flight Tracker</h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
            {flightSlots.map(({ movement, flight, isOlympic }) => {
              const count = roster.filter((participant) => participant.liftMovementFlights?.[movement] === flight.label).length;
              return (
                <div key={`${movement}-${flight.id}`} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-700">{movement} · {flight.label}</span>
                    <span className="block text-[11px] text-gray-500">{flight.startTime}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${!isOlympic && count >= maxParticipants ? 'text-red-700' : 'text-gray-900'}`}>
                    {isOlympic ? `${count} · open` : `${count}/${maxParticipants}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
        <input
          aria-label="Search waitlist by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name..."
          className="w-full sm:max-w-xs h-10 px-3 border border-gray-300 rounded-md input-focus-brand"
        />
        <select
          aria-label="Filter waitlist by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-full sm:max-w-xs h-10 px-3 border border-gray-300 rounded-md input-focus-brand bg-white"
        >
          <option value="All">All Statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        {divisions.length > 0 && (
          <select
            aria-label="Filter waitlist by division"
            value={divisionFilter}
            onChange={(event) => setDivisionFilter(event.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 input-focus-brand sm:max-w-xs"
          >
            <option value="All">All Divisions</option>
            {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="min-w-0 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-gray-600">Loading waitlist...</p>
        ) : error ? (
          <p className="p-8 text-red-700">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-gray-600">No waitlist entries found.</p>
        ) : (
          <table className="min-w-full table-fixed text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Participant', 'Status', 'Division'].map((heading) => (
                  <th key={heading} scope="col" className="text-left px-3 py-2.5 font-semibold text-gray-700">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  tabIndex={0}
                  aria-selected={selectedId === entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(entry.id);
                    }
                  }}
                  className={`cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${selectedId === entry.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="break-words px-3 py-3 font-medium text-gray-900">{entry.name || 'Unnamed participant'}</td>
                  <td className="px-3 py-3"><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{entry.status}</span></td>
                  <td className="break-words px-3 py-3 text-gray-700">{entry.division || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <aside className="min-w-0 self-start rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {!selected ? (
          <p className="py-12 text-center text-sm text-gray-400">Select a person to view waitlist details.</p>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-2">
              <div><h3 className="text-lg font-bold text-gray-900">{selected.name || 'Unnamed participant'}</h3><p className="text-xs text-gray-500">{selected.status}</p></div>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close waitlist details" className="text-xl text-gray-500 hover:text-gray-900">×</button>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-700">Gender Category
                <select
                  value={selectedDetails.genderCategory}
                  onChange={(event) => changeDraftDetails(selected, { genderCategory: event.target.value })}
                  disabled={selected.status !== 'Waiting'}
                  className="input-focus-brand mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm disabled:opacity-50"
                >
                  <option value="">Select</option>
                  {['Female', 'Male', 'Non-Binary'].map((division) => <option key={division} value={division}>{division}</option>)}
                </select>
              </label>
              <div className="min-w-0">
                <label htmlFor={`waitlist-bodyweight-${selected.id}`} className="mb-1 block text-xs font-medium text-gray-700">Bodyweight</label>
                <div className="flex items-center gap-3">
                  <input
                    id={`waitlist-bodyweight-${selected.id}`}
                    type="text"
                    inputMode="decimal"
                    value={selectedDetails.bodyWeight}
                    onChange={(event) => changeDraftDetails(selected, { bodyWeight: event.target.value })}
                    disabled={selected.status !== 'Waiting'}
                    className="input-focus-brand min-w-0 flex-1 rounded-md border border-gray-300 p-2 text-sm disabled:opacity-50"
                  />
                  {olympicLiftMovements.length > 0 && <label className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={selectedDetails.olympicLiftsOptIn}
                      onChange={(event) => changeDraftDetails(selected, { olympicLiftsOptIn: event.target.checked })}
                      disabled={selected.status !== 'Waiting'}
                    />
                    Oly opt-in
                  </label>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {selected.sourceSheet && <p><span className="font-semibold">Source:</span> {selected.sourceSheet}</p>}
              {selected.firstPreference && <p><span className="font-semibold">First preference:</span> {selected.firstPreference}</p>}
              {selected.secondPreference && <p><span className="font-semibold">Second preference:</span> {selected.secondPreference}</p>}
            </div>
            {flightSlots.length > 0 && (
              <>
                <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Flight per Movement</h4>
                <div className="overflow-x-auto">
                  <div className="grid min-w-[560px] grid-cols-5 gap-2 xl:min-w-0">
                    {Object.entries(liftFlights)
                      .filter(([, flights]) => flights.length > 0)
                      .sort(([first], [second]) => {
                        const firstRank = FLIGHT_ORDER.indexOf(first);
                        const secondRank = FLIGHT_ORDER.indexOf(second);
                        return (firstRank < 0 ? 99 : firstRank) - (secondRank < 0 ? 99 : secondRank);
                      })
                      .map(([movement, flights]) => {
                        const formOpener = movement === 'Squat' ? selected.squatOpenerWeight
                          : movement === 'Bench' ? selected.benchOpenerWeight
                            : movement === 'Deadlift' ? selected.deadliftOpenerWeight : '';
                        return (
                        <div key={movement} className="rounded-md border border-slate-200 bg-white p-2">
                          <div className="mb-2 min-h-16">
                            <span className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Preferences</span>
                            <p className="text-[11px] leading-tight text-gray-600">{preferenceFor(selected, movement)}</p>
                          </div>
                          <div className="mb-2 min-h-8 text-xs font-semibold text-gray-700">{movement}</div>
                          <label className="block text-[10px] font-semibold uppercase text-gray-400">
                            Flight
                            <select
                              value={selectedFlights[movement] || ''}
                              onChange={(event) => setDraftFlights((previous) => ({
                                ...previous,
                                [selected.id]: { ...selectedFlights, [movement]: event.target.value },
                              }))}
                              disabled={selected.status !== 'Waiting'}
                              className="input-focus-brand mt-1 w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs font-normal text-gray-800 disabled:opacity-50"
                            >
                              <option value="">—</option>
                              {flights.map((flight) => <option key={flight.id} value={flight.label}>{flight.label}</option>)}
                            </select>
                          </label>
                          <label className="mt-2 block text-[10px] font-semibold uppercase text-gray-400">
                            Form opener
                            <input type="text" readOnly value={formOpener} className="mt-1 w-full rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm font-normal text-gray-800" />
                          </label>
                          <label className="mt-2 block text-[10px] font-semibold uppercase text-gray-400">
                            PR
                            <input
                              type="text"
                              inputMode="decimal"
                              value={selectedDetails.liftMovementPrs[movement] || ''}
                              onChange={(event) => changeDraftDetails(selected, {
                                liftMovementPrs: { ...selectedDetails.liftMovementPrs, [movement]: event.target.value },
                              })}
                              disabled={selected.status !== 'Waiting'}
                              className="input-focus-brand mt-1 w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm font-normal text-gray-800 disabled:opacity-50"
                            />
                          </label>
                        </div>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
            {selected.status === 'Waiting' ? (
              <div className="mt-5 flex justify-end border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => void handleAdmit(selected)}
                  disabled={!!admittingId || !Object.values(selectedFlights).some(Boolean)}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {admittingId === selected.id ? 'Admitting...' : 'Admit to Flights'}
                </button>
              </div>
            ) : selected.registrationId ? (
              <p className="mt-5 border-t border-gray-200 pt-4 text-sm font-medium text-emerald-800">Admitted to registrations</p>
            ) : null}
          </>
        )}
      </aside>
      </div>
    </div>
  );
}