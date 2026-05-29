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
  };
}

export default function WaveQuickViewCard({ wave }: WaveQuickViewCardProps) {
  const { deleteWave, addParticipant, deleteParticipant, maxParticipants, updateWave, updateParticipantLeaderboardStatus, themeColors } = useWaveStore();
  const accent = themeColors.accent;
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


  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200" style={{ borderLeft: `6px solid ${accent}` }}>
      <div className="flex justify-between items-start mb-4">
        {isEditingName ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleNameKeyPress}
            className="text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-orange-500 focus:outline-none focus:border-orange-600"
            autoFocus
          />
        ) : (
          <h3 
            className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-orange-600 transition-colors"
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time:</label>
        <div className="flex gap-2 items-center">
          <input
            type="time"
            value={timeHM}
            onChange={(e) => {
              const v = e.target.value;
              console.log('🔍 WaveCard: Time picker changed to:', v);
              setTimeHM(v);
              
              // Only process if we have a valid time format
              if (!v || !v.includes(':')) return;
              
              // Convert 24h to 12h format with AM/PM
              const timeParts = v.split(':');
              const hours = parseInt(timeParts[0], 10);
              const minutes = parseInt(timeParts[1], 10);
              
              console.log('🔍 WaveCard: Parsed 24h time - hours:', hours, 'minutes:', minutes);
              
              // Validate the parsed values
              if (isNaN(hours) || isNaN(minutes)) return;
              
              let displayHours = hours;
              let period: 'AM' | 'PM' = 'AM';
              
              if (hours === 0) {
                displayHours = 12;
                period = 'AM';
                console.log('🔍 WaveCard: Midnight case - 12 AM');
              } else if (hours < 12) {
                displayHours = hours;
                period = 'AM';
                console.log('🔍 WaveCard: Morning case -', displayHours, 'AM');
              } else if (hours === 12) {
                displayHours = 12;
                period = 'PM';
                console.log('🔍 WaveCard: Noon case - 12 PM');
              } else {
                displayHours = hours - 12;
                period = 'PM';
                console.log('🔍 WaveCard: Afternoon case -', displayHours, 'PM');
              }
              
              const stored = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
              console.log('🔍 WaveCard: Saving to Firebase:', stored);
              updateWave(wave.id, { startTime: stored });
            }}
            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
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
            <div key={`${wave.id}-${participant.id}-${index}`} className="space-y-1">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-900 font-medium">
                  {participant.name}
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
              <div className="flex items-center ml-4">
                <input
                  type="checkbox"
                  id={`leaderboard-${wave.id}-${participant.id}`}
                  checked={participant.includeInLeaderboard !== false}
                  onChange={async (e) => {
                    try {
                      await updateParticipantLeaderboardStatus(wave.id, participant.id, e.target.checked);
                    } catch (error) {
                      console.error('Failed to update leaderboard status:', error);
                    }
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                />
                <label 
                  htmlFor={`leaderboard-${wave.id}-${participant.id}`}
                  className="ml-2 text-xs text-gray-600 cursor-pointer"
                >
                  Include in leaderboard
                </label>
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
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
