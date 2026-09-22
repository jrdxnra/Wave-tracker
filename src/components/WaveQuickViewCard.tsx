'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { useWaveStore } from '@/store/waveStore';
import PrintDashboard from './PrintDashboard';

interface WaveQuickViewCardProps {
  wave: {
    id: string;
    name: string;
    participants: Array<{
      id: string;
      name: string;
      waveData: Record<string, string>;
      includeInLeaderboard?: boolean;
      swimComfort?: string;
      isFirstTri?: boolean;
      entryMode?: string;
      groupName?: string;
      pingGroupOptIn?: boolean;
      olympicLiftsOptIn?: boolean;
      firstPreferenceHour?: string;
      firstPreferenceFlexibility?: string;
      secondPreferenceHour?: string;
      secondPreferenceFlexibility?: string;
      bodyWeight?: string;
    }>;
    startTime: string;
    coach?: string;
  };
}

function waveIdFromTime(label: string): string {
  return `wave-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

interface ParticipantMeta {
  swimComfort: string;
  isFirstTri: boolean;
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
}

export default function WaveQuickViewCard({ wave }: WaveQuickViewCardProps) {
  const { deleteWave, addParticipant, deleteParticipant, maxParticipants, updateWave, themeColors, activeEventId, movementTimingMode, liftFlights, olympicLiftMovements, olympicLiftsEnabled, customEvents, updateParticipantData, saveWavePerformance, loadAll } = useWaveStore();
  const isLiftTemplate = movementTimingMode === 'lift' || Object.keys(liftFlights || {}).length > 0 || olympicLiftMovements.length > 0 || !!olympicLiftsEnabled;
  const scopeLabel = isLiftTemplate ? 'Flight' : 'Wave';
  const accent = themeColors.accent;
  const accentHover = themeColors.accentHover;
  const [newName, setNewName] = useState('');
  const [timeHM, setTimeHM] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(wave.name);
  const [participantMeta, setParticipantMeta] = useState<Record<string, ParticipantMeta>>({});

  const getSwimComfortCode = (swimComfort: string): string => {
    const value = String(swimComfort || '').toLowerCase();
    if (value.includes('novice')) return 'N';
    if (value.includes('intermediate')) return 'I';
    if (value.includes('advanced')) return 'A';
    return '?';
  };

  const getSwimComfortBadgeClass = (swimComfort: string): string => {
    const code = getSwimComfortCode(swimComfort);
    if (code === 'N') return 'bg-amber-100 text-amber-700 border border-amber-200';
    if (code === 'I') return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (code === 'A') return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    return 'bg-slate-100 text-slate-700 border border-slate-200';
  };

  const getEntryModeLabel = (entryMode: string, groupName: string): string => {
    const value = `${entryMode} ${groupName}`.toLowerCase();
    if (value.includes('group') || value.includes('team')) return 'Group';
    if (value.includes('buddy') || value.includes('pair')) return 'Buddy';
    return 'Single';
  };

  const getPreferenceSummary = (hour: string, flexibility: string): string => {
    const cleanHour = String(hour || '').trim();
    const cleanFlex = String(flexibility || '').trim();
    if (cleanHour && cleanFlex) return `${cleanHour} / ${cleanFlex}`;
    return cleanHour || cleanFlex;
  };

  useEffect(() => {
    // Initialize from stored startTime like "8:10 AM" or "08:10"
    const s = (wave.startTime || '').trim();
    console.log('🔍 WaveCard: Initializing time picker from wave.startTime:', s);
    const m = s.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = m[2];
      let mer: 'AM' | 'PM' = 'AM';
      if (m[3]) {
        mer = m[3].toUpperCase() as 'AM' | 'PM';
      } else {
        // If no AM/PM specified, assume it's already in 12-hour format
        mer = 'AM';
      }
      
      // Convert 12-hour to 24-hour for the time picker
      let hour24 = h;
      if (mer === 'PM' && h !== 12) {
        hour24 = h + 12;
      } else if (mer === 'AM' && h === 12) {
        hour24 = 0;
      }
      
      const hh24 = String(hour24).padStart(2, '0');
      console.log('🔍 WaveCard: Setting time picker to:', hh24 + ':' + min, '(from', h + ':' + min, mer + ')');
      setTimeHM(`${hh24}:${min}`);
    } else {
      setTimeHM('');
    }
  }, [wave.startTime]);

  // Sync editingName when wave.name changes
  useEffect(() => {
    setEditingName(wave.name);
  }, [wave.name]);

  useEffect(() => {
    let cancelled = false;

    const loadParticipantMeta = async () => {
      if (!activeEventId || wave.participants.length === 0) {
        setParticipantMeta({});
        return;
      }

      const { db } = getFirebase();
      const entries = await Promise.all(
        wave.participants.map(async (participant) => {
          const fallback = {
            swimComfort: String(participant.swimComfort || ''),
            isFirstTri: !!participant.isFirstTri,
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
          };

          if (participant.id.startsWith('p-')) {
            return [participant.id, fallback] as const;
          }

          try {
            const regRef = doc(db, 'events', activeEventId, 'registrations', participant.id);
            const regSnap = await getDoc(regRef);
            if (!regSnap.exists()) {
              return [participant.id, fallback] as const;
            }

            const regData = regSnap.data() as Partial<ParticipantMeta>;
            return [
              participant.id,
              {
                swimComfort: String(regData.swimComfort || fallback.swimComfort),
                isFirstTri: regData.isFirstTri === undefined ? fallback.isFirstTri : !!regData.isFirstTri,
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

    void loadParticipantMeta();

    return () => {
      cancelled = true;
    };
  }, [activeEventId, wave.participants]);

  const handleAddParticipant = async () => {
    if (newName.trim()) {
      try {
        await addParticipant(wave.id, newName.trim());
        setNewName('');
      } catch (error) {
        console.error('Failed to add participant:', error);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddParticipant();
    }
  };

  const handleLiftParticipantFieldChange = async (participantId: string, updates: Partial<Pick<ParticipantMeta, 'bodyWeight' | 'olympicLiftsOptIn'>>) => {
    setParticipantMeta((prev) => ({
      ...prev,
      [participantId]: {
        ...(prev[participantId] || {
          swimComfort: '',
          isFirstTri: false,
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
        }),
        ...updates,
      },
    }));

    try {
      const { db } = getFirebase();
      const now = new Date().toISOString();
      await setDoc(doc(db, 'events', activeEventId, 'waves', wave.id, 'participants', participantId), {
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

  const handleNameEdit = () => {
    setIsEditingName(true);
    setEditingName(wave.name);
  };

  const handleNameSave = () => {
    if (editingName.trim() && editingName.trim() !== wave.name) {
      updateWave(wave.id, { name: editingName.trim() });
    }
    setIsEditingName(false);
  };

  const handleNameCancel = () => {
    setEditingName(wave.name);
    setIsEditingName(false);
  };

  const handleNameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  const isManualWaveEntry = (participantId: string) => participantId.startsWith('p-');


  return (
    <div
      id={wave.startTime ? waveIdFromTime(wave.startTime) : `wave-card-${wave.id}`}
      className="bg-white p-6 rounded-lg shadow-lg border border-gray-200"
      style={{
        borderLeft: `6px solid ${accent}`,
        ['--wave-accent' as string]: accent,
        ['--wave-accent-hover' as string]: accentHover,
      }}
    >
      <div className="flex justify-between items-start mb-4">
        {isEditingName ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleNameKeyPress}
            className="input-focus-brand text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-[var(--wave-accent)]"
            autoFocus
          />
        ) : (
          <h3 
            className="text-xl font-semibold text-gray-900 cursor-pointer transition-colors hover:text-[var(--wave-accent-hover)]"
            onClick={handleNameEdit}
            title={`Click to edit ${scopeLabel.toLowerCase()} name`}
          >
            {wave.name}
          </h3>
        )}
        <div className="flex gap-2">
          <PrintDashboard wave={wave} />
          <button
            onClick={async () => {
              try {
                await deleteWave(wave.id);
              } catch (error) {
                console.error('Failed to delete wave:', error);
              }
            }}
            className="px-3 py-1 text-sm font-semibold text-white btn-destructive rounded-md"
            title={`Delete ${scopeLabel.toLowerCase()}`}
          >
            <span className="hidden lg:inline">Delete {scopeLabel}</span>
            <span className="lg:hidden">Delete</span>
          </button>
        </div>
      </div>


      <div className="mb-4">
        <div className="flex items-center gap-8">
          {/* Start Time Block (left) */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time:</label>
            <input
              type="time"
              value={timeHM}
              onChange={(e) => {
                const v = e.target.value;
                setTimeHM(v);
                if (!v || !v.includes(':')) return;
                const timeParts = v.split(':');
                const hours = parseInt(timeParts[0], 10);
                const minutes = parseInt(timeParts[1], 10);
                if (isNaN(hours) || isNaN(minutes)) return;
                let displayHours = hours;
                let period: 'AM' | 'PM' = 'AM';
                if (hours === 0) {
                  displayHours = 12;
                  period = 'AM';
                } else if (hours < 12) {
                  displayHours = hours;
                  period = 'AM';
                } else if (hours === 12) {
                  displayHours = 12;
                  period = 'PM';
                } else {
                  displayHours = hours - 12;
                  period = 'PM';
                }
                const stored = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
                updateWave(wave.id, { startTime: stored });
              }}
              className="input-focus-brand p-2 border border-gray-300 rounded-md"
            />
          </div>
          {/* Coach Block (right) */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Coach:</label>
            <input
              type="text"
              value={wave.coach || ''}
              onChange={e => updateWave(wave.id, { coach: e.target.value })}
              placeholder="Enter coach's name"
              className="input-focus-brand p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold" style={{ color: accent }}>
          Total Participants: {wave.participants.length}
          {wave.participants.length > maxParticipants && ` (Over limit of ${maxParticipants})`}
        </p>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Participants:</h4>
        {isLiftTemplate ? (
          <div className="space-y-2 overflow-y-auto max-h-[36rem]">
            {wave.participants.map((participant, index) => {
              const meta = participantMeta[participant.id];
              const bodyWeight = meta?.bodyWeight ?? participant.bodyWeight ?? '';
              const olympicLiftsOptIn = meta?.olympicLiftsOptIn ?? participant.olympicLiftsOptIn === true;

              return (
                <div key={`${wave.id}-${participant.id}-${index}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-gray-900">{participant.name}</span>
                    {isManualWaveEntry(participant.id) && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800">
                        *
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {bodyWeight && (
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                        BW {bodyWeight}
                      </span>
                    )}
                    <label className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${olympicLiftsOptIn ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-gray-600'}`}>
                      <input
                        type="checkbox"
                        checked={olympicLiftsOptIn}
                        onChange={(event) => {
                          void handleLiftParticipantFieldChange(participant.id, { olympicLiftsOptIn: event.target.checked });
                        }}
                        className="h-3 w-3 rounded border-amber-300"
                      />
                      Oly
                    </label>
                    <button
                      onClick={async () => {
                        try {
                          await deleteParticipant(wave.id, participant.id);
                        } catch (error) {
                          console.error('Failed to delete participant:', error);
                        }
                      }}
                      className="text-gray-600 hover:text-gray-800 text-xl leading-none px-1"
                      title="Remove participant"
                      aria-label="Remove participant"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto max-h-40">
            {wave.participants.map((participant, index) => (
              <div key={`${wave.id}-${participant.id}-${index}`} className="flex justify-between items-center text-sm">
                <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                  {participant.name}
                  {(() => {
                    const meta = participantMeta[participant.id];
                    const swimComfort = String(meta?.swimComfort || participant.swimComfort || '');
                    const firstTri = meta?.isFirstTri ?? !!participant.isFirstTri;
                    return (
                      <>
                        {swimComfort && (
                          <span
                            className={`inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold ${getSwimComfortBadgeClass(swimComfort)}`}
                            title={`Swim level: ${swimComfort}`}
                            aria-label={`Swim level ${swimComfort}`}
                          >
                            {getSwimComfortCode(swimComfort)}
                          </span>
                        )}
                        {firstTri && (
                          <span
                            className="inline-flex items-center justify-center h-5 min-w-5 rounded-full px-1 text-[10px] font-bold bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200"
                            title="First triathlon"
                            aria-label="First triathlon"
                          >
                            ★
                          </span>
                        )}
                      </>
                    );
                  })()}
                </span>
                <button
                  onClick={async () => {
                    try {
                      await deleteParticipant(wave.id, participant.id);
                    } catch (error) {
                      console.error('Failed to delete participant:', error);
                    }
                  }}
                  className="text-gray-600 hover:text-gray-800 text-xl leading-none px-2"
                  title="Remove participant"
                  aria-label="Remove participant"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="input-focus-brand w-full p-2 border border-gray-300 rounded-md"
        />
        <button
          onClick={handleAddParticipant}
          className="w-full font-bold py-2 px-4 rounded-md transition duration-300"
          style={{ backgroundColor: accent, color: '#fff' }}
        >
          Add to {wave.name}
        </button>
      </div>
    </div>
  );
}
