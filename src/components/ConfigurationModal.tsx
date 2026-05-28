'use client';

import { useState, useEffect } from 'react';
import { useWaveStore } from '@/store/waveStore';
import PasscodeProtection from '@/components/PasscodeProtection';

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearCache?: () => void;
}

export default function ConfigurationModal({ isOpen, onClose, onClearCache }: ConfigurationModalProps) {
  const { 
    customEvents, updateWaveEvents, intervalMinutes, workMinutes, restMinutes, maxParticipants, 
    workoutTimerWorkSeconds, workoutTimerRestSeconds, eventStartDate, eventStartTime, totalWaves, accessPasscode,
    setTimingConfig, setMaxParticipants, setWorkoutTimerConfig, setEventConfig, setAccessPasscode,
    loadGlobalConfig
  } = useWaveStore();
  
  const [events, setEvents] = useState<string[]>(customEvents);
  const [newEvent, setNewEvent] = useState('');
  const [interval, setInterval] = useState<number>(intervalMinutes);
  const [work, setWork] = useState<number>(workMinutes);
  const [rest, setRest] = useState<number>(restMinutes);
  const [maxParticipantsLocal, setMaxParticipantsLocal] = useState<number>(maxParticipants);
  const [timerWorkSeconds, setTimerWorkSeconds] = useState<number>(workoutTimerWorkSeconds);
  const [timerRestSeconds, setTimerRestSeconds] = useState<number>(workoutTimerRestSeconds);
  const [startDate, setStartDate] = useState<string>(eventStartDate);
  const [startTime, setStartTime] = useState<string>(eventStartTime);
  const [waves, setWaves] = useState<number>(totalWaves);
  const [passcode, setPasscode] = useState<string>(accessPasscode);

  // Load fresh config from Firebase when modal opens and sync local state
  useEffect(() => {
    if (isOpen) {
      // Load fresh config from Firebase to ensure we have latest values
      loadGlobalConfig().then(() => {
        console.log('📋 Loaded fresh config, syncing ConfigurationModal with store values:', { eventStartDate, eventStartTime, totalWaves });
      });
    }
  }, [isOpen, loadGlobalConfig, eventStartDate, eventStartTime, totalWaves]);

  // Sync local state whenever store values change
  useEffect(() => {
    setEvents(customEvents);
    setInterval(intervalMinutes);
    setWork(workMinutes);
    setRest(restMinutes);
    setMaxParticipantsLocal(maxParticipants);
    setTimerWorkSeconds(workoutTimerWorkSeconds);
    setTimerRestSeconds(workoutTimerRestSeconds);
    setStartDate(eventStartDate);
    setStartTime(eventStartTime);
    setWaves(totalWaves);
    setPasscode(accessPasscode);
  }, [customEvents, intervalMinutes, workMinutes, restMinutes, maxParticipants, workoutTimerWorkSeconds, workoutTimerRestSeconds, eventStartDate, eventStartTime, totalWaves, accessPasscode]);

  const handleSave = async () => {
    // Close modal IMMEDIATELY for better UX
    onClose();
    
    // Do all saves in background
    (async () => {
      try {
        // Check if events actually changed
        const eventsChanged = JSON.stringify(events) !== JSON.stringify(customEvents);
        
        // Only update events and participants if events actually changed
        if (eventsChanged) {
          await updateWaveEvents(events);
        }
        
        await setTimingConfig(Math.max(1, Math.round(interval)), Math.max(0, Math.round(work)), Math.max(0, Math.round(rest)));
        await setMaxParticipants(maxParticipantsLocal);
        await setWorkoutTimerConfig(Math.max(1, Math.round(timerWorkSeconds)), Math.max(1, Math.round(timerRestSeconds)));
        await setEventConfig(startDate, startTime, Math.max(1, Math.round(waves)));
        await setAccessPasscode(passcode);
        // Alert settings are now hardcoded - no need to save them
      } catch (error) {
        console.error('❌ Failed to save configuration:', error);
        alert('Failed to save configuration. Please try again.');
      }
    })();
  };

  const handleAddEvent = () => {
    if (newEvent.trim() && !events.includes(newEvent.trim())) {
      setEvents([...events, newEvent.trim()]);
      setNewEvent('');
    }
  };

  const handleRemoveEvent = (index: number) => {
    setEvents(events.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newEvents = [...events];
      [newEvents[index], newEvents[index - 1]] = [newEvents[index - 1], newEvents[index]];
      setEvents(newEvents);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < events.length - 1) {
      const newEvents = [...events];
      [newEvents[index], newEvents[index + 1]] = [newEvents[index + 1], newEvents[index]];
      setEvents(newEvents);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex !== dropIndex) {
      const newEvents = [...events];
      const [draggedItem] = newEvents.splice(dragIndex, 1);
      newEvents.splice(dropIndex, 0, draggedItem);
      setEvents(newEvents);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <PasscodeProtection requiredPasscode={accessPasscode}>
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
          {/* Header - Fixed */}
          <div className="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-2xl font-semibold text-gray-900">Movement Configuration</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Tips moved to the top (condensed) */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Tips</h4>
            <ul className="text-[13px] text-blue-700 space-y-1 list-disc pl-5">
              <li>Changes will apply to all waves and participants</li>
              <li><strong>Wave Start Interval:</strong> Time between each wave starting (e.g., Wave 1 at 8:00, Wave 2 at 8:10)</li>
              <li><strong>Work + Rest:</strong> Duration of each movement station. Movement times on performance/print sheets are calculated using Work + Rest.</li>
            </ul>
          </div>

          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wave Start Interval (min)</label>
              <input type="number" min={1} value={interval} onChange={(e) => setInterval(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work (min)</label>
              <input type="number" min={0} value={work} onChange={(e) => setWork(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rest / Transition (min)</label>
              <input type="number" min={0} value={rest} onChange={(e) => setRest(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants</label>
              <select
                value={maxParticipantsLocal}
                onChange={(e) => setMaxParticipantsLocal(parseInt(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
              >
                <option value={5}>5</option>
                <option value={6}>6</option>
                <option value={7}>7</option>
                <option value={8}>8</option>
                <option value={9}>9</option>
                <option value={10}>10</option>
                <option value={11}>11</option>
                <option value={12}>12</option>
                <option value={13}>13</option>
                <option value={14}>14</option>
                <option value={15}>15</option>
              </select>
            </div>
          </div>

          {/* Event Clock Settings */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Event Clock Settings</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
              <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Tips</h4>
              <p className="text-[13px] text-blue-700">Configure the universal event clock that all coaches use to stay synchronized. The clock uses the Interval, Work, and Rest times above to calculate work/rest periods.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Start Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Start Time</label>
                <input 
                  type="time" 
                  value={startTime} 
                  onChange={(e) => setStartTime(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Waves</label>
                <input 
                  type="number" 
                  min={1} 
                  value={waves} 
                  onChange={(e) => setWaves(parseInt(e.target.value || '1', 10))} 
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
            </div>
          </div>

          {/* Add New Movement */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Add New Movement</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
              <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Tips</h4>
              <ul className="text-[13px] text-blue-700 space-y-1 list-disc pl-5">
                <li>When you add a new movement, a blank cell is created for that movement for every participant so you can fill it later. Existing values in other movements are not changed.</li>
                <li>Add hyphens (-) in movement names to control text wrapping in print</li>
                <li>Example: &quot;BURPEE-BROAD JUMPS&quot; will wrap at the hyphen</li>
              </ul>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                placeholder="Enter movement name..."
                className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={handleAddEvent}
                disabled={!newEvent.trim() || events.includes(newEvent.trim())}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>


          {/* Current Movements with local tips */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Current Movements</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
              <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Tips</h4>
              <ul className="text-[13px] text-blue-700 space-y-1 list-disc pl-5">
                <li>Drag and drop movements to reorder them</li>
                <li>Use the arrow buttons for precise reordering</li>
              </ul>
            </div>
            <div className="space-y-2">
              {events.map((event, index) => (
                <div
                  key={index}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-move"
                >
                  <span className="flex-1 text-gray-900">{event}</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === events.length - 1}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => handleRemoveEvent(index)}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Settings */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">🔒 Security Settings</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
              <h4 className="text-[11px] font-semibold text-yellow-900 mb-1 uppercase tracking-wide">Important</h4>
              <p className="text-[13px] text-yellow-700">This passcode protects the Wave Tracker and Performance pages. The Leaderboard remains public. Share this passcode only with authorized staff.</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Passcode</label>
                <input 
                  type="text" 
                  value={passcode} 
                  onChange={(e) => setPasscode(e.target.value)} 
                  placeholder="Enter passcode"
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500" 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Fixed at Bottom */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 p-4 sm:p-6 border-t border-gray-200 flex-shrink-0 bg-gray-50">
          {/* Left side - Clear Cache */}
          {onClearCache && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Clear cache and reload fresh data from Firebase? This will fix sync issues.')) {
                  onClose(); // Close modal first
                  onClearCache();
                }
              }}
              className="px-4 py-2 sm:px-6 sm:py-3 text-gray-700 border-2 border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
            >
              🔄 Clear Cache
            </button>
          )}
          
          {/* Right side - Cancel & Save */}
          <div className="flex gap-2 sm:gap-3 sm:ml-auto">
            <button
              type="button"
              onClick={() => {
                onClose();
              }}
              className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-gray-700 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  handleSave();
                } catch (error) {
                  console.error('❌ Error calling handleSave:', error);
                }
              }}
              className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 bg-orange-600 text-white border-2 border-orange-600 rounded-lg hover:bg-orange-700 transition-all active:scale-95 font-semibold"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
      </PasscodeProtection>
    </div>
  );
}
