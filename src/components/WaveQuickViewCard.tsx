'use client';

import { useEffect, useState } from 'react';
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
    }>;
    startTime: string;
    coach?: string;
  };
}

function waveIdFromTime(label: string): string {
  return `wave-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export default function WaveQuickViewCard({ wave }: WaveQuickViewCardProps) {
  const { deleteWave, addParticipant, deleteParticipant, maxParticipants, updateWave, themeColors } = useWaveStore();
  const accent = themeColors.accent;
  const accentHover = themeColors.accentHover;
  const [newName, setNewName] = useState('');
  const [timeHM, setTimeHM] = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(wave.name);

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
            title="Click to edit wave name"
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
            title="Delete wave"
          >
            <span className="hidden lg:inline">Delete Wave</span>
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
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {wave.participants.map((participant, index) => (
            <div key={`${wave.id}-${participant.id}-${index}`}>
              <div className="flex justify-between items-center text-sm">
                <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                  {participant.name}
                  {isManualWaveEntry(participant.id) && (
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800"
                      title="Manual wave entry (not from registration form)"
                      aria-label="Manual wave entry"
                    >
                      *
                    </span>
                  )}
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
            </div>
          ))}
        </div>
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
