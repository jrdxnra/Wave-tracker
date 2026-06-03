'use client';

import { useRef, useState } from 'react';
import { useWaveStore } from '@/store/waveStore';

interface PerformanceTableProps {
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

export default function PerformanceTable({ wave }: PerformanceTableProps) {
  const {
    activeEventId,
    customEvents,
    workMinutes,
    restMinutes,
    movementTimingMode,
    movementIntervals,
    updateParticipantData,
    saveWavePerformance,
  } = useWaveStore();

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Store the last typed value for each field
  const lastTypedValues = useRef<Record<string, string>>({});

  const calculateMovementTimes = () => {
    if (!wave.startTime) return [];
    
    const parseStart = (startStr: string) => {
      try {
        console.log('🔍 parseStart input:', startStr);
        if (!startStr) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const s = startStr.trim();
        let hours = 8, minutes = 0;
        
        // Match time with AM/PM (case insensitive)
        const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
        const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
        
        console.log('🔍 ampmMatch:', ampmMatch);
        console.log('🔍 hmMatch:', hmMatch);
        
        if (ampmMatch) {
          hours = parseInt(ampmMatch[1]);
          minutes = parseInt(ampmMatch[2]);
          const period = ampmMatch[3].toLowerCase();
          
          console.log('🔍 Matched AM/PM - hours:', hours, 'minutes:', minutes, 'period:', period);
          
          // Convert 12-hour to 24-hour format
          if (period === 'pm' && hours !== 12) {
            hours += 12;
            console.log('🔍 PM conversion (not 12): hours now =', hours);
          } else if (period === 'am' && hours === 12) {
            hours = 0;
            console.log('🔍 AM conversion (12): hours now =', hours);
          } else {
            console.log('🔍 No conversion needed - hours stays =', hours);
          }
        } else if (hmMatch) {
          hours = parseInt(hmMatch[1]);
          minutes = parseInt(hmMatch[2]);
          console.log('🔍 Matched plain time - hours:', hours, 'minutes:', minutes);
        }
        
        const result = new Date(today.getTime() + hours * 3600000 + minutes * 60000);
        console.log('🔍 parseStart result:', result.toString(), '(hours in result:', result.getHours(), ')');
        return result;
      } catch (err) {
        console.error('❌ parseStart error:', err);
        return null;
      }
    };
    
    const startDate = parseStart(wave.startTime) || new Date();
    const movementDurations = customEvents.map((movementName) => {
      const individual = movementIntervals[movementName];
      const nextWork = movementTimingMode === 'individual'
        ? Math.max(0, Number(individual?.workMinutes) || workMinutes)
        : workMinutes;
      const nextRest = movementTimingMode === 'individual'
        ? Math.max(0, Number(individual?.restMinutes) || restMinutes)
        : restMinutes;
      return {
        workMinutes: nextWork,
        restMinutes: nextRest,
      };
    });

    let elapsedMinutes = 0;
    return movementDurations.map((duration) => {
      const t = new Date(startDate.getTime() + elapsedMinutes * 60000);
      elapsedMinutes += duration.workMinutes + duration.restMinutes;
      return {
        startLabel: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        ...duration,
      };
    });
  };

  const movementTimes = calculateMovementTimes();

  const handleDataChange = (participantId: string, field: string, value: string) => {
    const key = `${wave.id}-${participantId}-${field}`;
    lastTypedValues.current[key] = value;
    updateParticipantData(wave.id, participantId, field, value);
  };

  const handleSaveWave = async () => {
    setSaveState('saving');

    try {
      // Apply any pending updates from lastTypedValues
      Object.keys(lastTypedValues.current).forEach(key => {
        const [waveId, participantId, field] = key.split('-');
        if (waveId === wave.id) {
          const value = lastTypedValues.current[key];
          if (value !== undefined) {
            updateParticipantData(waveId, participantId, field, value);
          }
        }
      });
      
      // Clear the pending values
      lastTypedValues.current = {};
      
      // Small delay to ensure state updates are applied
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await saveWavePerformance(wave.id, activeEventId);
      
      // Show success state
      setSaveState('saved');
      setLastSaved(new Date());
      
      // Reset to idle after 2 seconds
      setTimeout(() => {
        setSaveState('idle');
      }, 2000);
      
    } catch (error) {
      console.error('❌ Failed to save wave:', error);
      setSaveState('idle');
      alert('Failed to save wave. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          {wave.name} Performance Data
        </h3>
        <p className="text-sm text-gray-600">
          Start Time: {wave.startTime}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            {/* Movement times row */}
            {movementTimes.length > 0 && (
              <tr className="bg-blue-50">
                <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800 border-b border-gray-200">
                  <div className="flex flex-col items-center">
                    {movementTimingMode !== 'individual' ? (
                      <>
                        <div>Timing: every {workMinutes + restMinutes} min</div>
                        <div>Work {workMinutes}/ Rest {restMinutes}</div>
                      </>
                    ) : null}
                  </div>
                </th>
                {movementTimes.map((timing, idx) => (
                  <th key={idx} className="px-4 py-2 text-center text-xs font-semibold text-blue-800 border-b border-gray-200">
                    <div>{timing.startLabel}</div>
                    {movementTimingMode === 'individual' && (
                      <div className="text-[10px] font-medium text-blue-700">
                        W{timing.workMinutes}/R{timing.restMinutes}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            )}
            {/* Movement names row */}
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                Participant
              </th>
              {customEvents.map((event) => (
                <th key={event} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  {event}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {wave.participants.map((participant, index) => (
              <tr key={`${wave.id}-${participant.id}-${index}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900 text-sm">
                      {participant.name || 'Unnamed Participant'}
                    </div>
                  </div>
                </td>
                {customEvents.map((event, eventIndex) => (
                  <td key={event} className="px-4 py-3 whitespace-nowrap">
                    <input
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="next"
                      value={(participant.waveData || {})[event] || ''}
                      onChange={(e) => handleDataChange(participant.id, event, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          e.stopPropagation();
                          // Move down to same column, next row
                          const currentRow = index;
                          const nextRow = currentRow + 1;
                          if (nextRow < wave.participants.length) {
                            const nextInput = document.querySelector(
                              `input[data-participant-index="${nextRow}"][data-event-index="${eventIndex}"]`
                            ) as HTMLInputElement;
                            if (nextInput) {
                              nextInput.focus();
                              nextInput.select();
                            }
                          } else {
                            // At last row, blur to dismiss keyboard
                            (e.target as HTMLInputElement).blur();
                          }
                        }
                      }}
                      data-participant-index={index}
                      data-event-index={eventIndex}
                      className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder=""
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save Button */}
      <div className="mt-2 flex flex-col items-center space-y-1">
        {lastSaved && (
          <p className="text-xs text-gray-500">
            Last saved: {lastSaved.toLocaleTimeString()}
          </p>
        )}
        <button
          onClick={handleSaveWave}
          disabled={saveState === 'saving'}
          className={`btn-secondary text-white font-bold py-2 px-4 rounded-md transition duration-300 flex items-center gap-2 ${
            saveState === 'saving' ? 'opacity-75 cursor-not-allowed' : ''
          }`}
          title="Save wave to Firebase"
        >
          {saveState === 'saving' && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          )}
          {saveState === 'saved' && (
            <span className="text-green-200">✓</span>
          )}
          <span className="hidden lg:inline">
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save Wave'}
          </span>
          <span className="lg:hidden">
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save'}
          </span>
        </button>
      </div>
    </div>
  );
}
