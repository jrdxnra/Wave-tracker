'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useWaveStore } from '@/store/waveStore';
import PasscodeProtection from '@/components/PasscodeProtection';

type BrandTheme = 'orange' | 'blue' | 'emerald' | 'sunset';
const CREATE_NEW_EVENT_OPTION = '__create_new_event__';
const DEFAULT_EVENT_ID = 'g-rox';

type GradientPreset = {
  name: string;
  start: string;
  mid: string;
  end: string;
};

const THEME_GRADIENT_PRESETS: Record<BrandTheme, { start: string; mid: string; end: string }> = {
  orange: { start: '#ea580c', mid: '#f97316', end: '#fbbf24' },
  blue: { start: '#1d4ed8', mid: '#2563eb', end: '#38bdf8' },
  emerald: { start: '#047857', mid: '#059669', end: '#34d399' },
  sunset: { start: '#be185d', mid: '#db2777', end: '#fb7185' },
};

const QUICK_GRADIENT_PRESETS: GradientPreset[] = [
  { name: 'Green', start: '#065f46', mid: '#10b981', end: '#34d399' },
  { name: 'Red', start: '#991b1b', mid: '#dc2626', end: '#f87171' },
  { name: 'Purple', start: '#4c1d95', mid: '#7c3aed', end: '#c084fc' },
  { name: 'Blue', start: '#1e3a8a', mid: '#2563eb', end: '#38bdf8' },
  { name: 'Sunset', start: '#be123c', mid: '#f97316', end: '#facc15' },
  { name: 'Rainbow', start: '#ef4444', mid: '#22c55e', end: '#3b82f6' },
  { name: 'Aurora', start: '#0f766e', mid: '#7c3aed', end: '#ec4899' },
  { name: 'Fire Ice', start: '#ef4444', mid: '#f59e0b', end: '#38bdf8' },
];

function normalizeHexColor(color: string, fallback: string): string {
  const normalized = color.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function getDefaultGradient(theme: BrandTheme) {
  return THEME_GRADIENT_PRESETS[theme] || THEME_GRADIENT_PRESETS.orange;
}

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearCache?: () => void;
  initialTab?: 'movement' | 'event';
}

export default function ConfigurationModal({ isOpen, onClose, onClearCache, initialTab = 'movement' }: ConfigurationModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { 
    customEvents, updateWaveEvents, intervalMinutes, workMinutes, restMinutes, maxParticipants, 
    workoutTimerWorkSeconds, workoutTimerRestSeconds, eventStartDate, eventStartTime, totalWaves, accessPasscode,
    setTimingConfig, setMaxParticipants, setWorkoutTimerConfig, setEventConfig, setAccessPasscode,
    loadGlobalConfig, eventBranding, eventClockEnabled, setEventClockEnabled, themeColors,
    eventsCatalog, activeEventId, loadEventsCatalog, createEvent, deleteEvent, setActiveEvent, updateEventBranding
  } = useWaveStore();
  
  const [activeTab, setActiveTab] = useState<'movement' | 'event' | 'security'>(initialTab);
  const [selectedEventId, setSelectedEventId] = useState<string>(activeEventId);
  const isCreatingNewEvent = selectedEventId === CREATE_NEW_EVENT_OPTION;

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

  const [newEventName, setNewEventName] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState<string>(eventStartDate);
  const [newEventStartTime, setNewEventStartTime] = useState<string>(eventStartTime);
  const [newEventTotalWaves, setNewEventTotalWaves] = useState<number>(totalWaves);
  const [brandTitle, setBrandTitle] = useState<string>(eventBranding.title);
  const [brandEmojiLeft, setBrandEmojiLeft] = useState<string>(eventBranding.emojiLeft);
  const [brandEmojiRight, setBrandEmojiRight] = useState<string>(eventBranding.emojiRight);
  const [gradientStart, setGradientStart] = useState<string>(
    eventBranding.customGradient?.start || getDefaultGradient(eventBranding.theme).start
  );
  const [gradientMid, setGradientMid] = useState<string>(
    eventBranding.customGradient?.mid || getDefaultGradient(eventBranding.theme).mid
  );
  const [gradientEnd, setGradientEnd] = useState<string>(
    eventBranding.customGradient?.end || getDefaultGradient(eventBranding.theme).end
  );
  const [openEmojiPicker, setOpenEmojiPicker] = useState<'left' | 'right' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [isAddButtonHover, setIsAddButtonHover] = useState(false);
  const [isEventSelectFocused, setIsEventSelectFocused] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // Load fresh config from Firebase when modal opens and sync local state
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      loadEventsCatalog();
      loadGlobalConfig();
    }
  }, [isOpen, initialTab, loadGlobalConfig, loadEventsCatalog]);

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

  useEffect(() => {
    if (!isOpen) return;
    setSelectedEventId(activeEventId);
    setBrandTitle(eventBranding.title);
    setBrandEmojiLeft(eventBranding.emojiLeft);
    setBrandEmojiRight(eventBranding.emojiRight);
    const fallbackGradient = getDefaultGradient(eventBranding.theme);
    setGradientStart(eventBranding.customGradient?.start || fallbackGradient.start);
    setGradientMid(eventBranding.customGradient?.mid || fallbackGradient.mid);
    setGradientEnd(eventBranding.customGradient?.end || fallbackGradient.end);
    setNewEventStartDate(eventStartDate);
    setNewEventStartTime(eventStartTime);
    setNewEventTotalWaves(totalWaves);
    setNewEventName('');
    setOpenEmojiPicker(null);
  }, [isOpen, activeEventId, eventBranding]);

  useEffect(() => {
    if (!isCreatingNewEvent) return;

    const defaultGradient = getDefaultGradient(eventBranding.theme);
    setBrandTitle('');
    setBrandEmojiLeft('');
    setBrandEmojiRight('');
    setGradientStart(defaultGradient.start);
    setGradientMid(defaultGradient.mid);
    setGradientEnd(defaultGradient.end);
    setNewEventName('');
  }, [isCreatingNewEvent, eventBranding.theme]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (!brandTitle.trim()) {
        alert('Brand Title is required before saving.');
        return;
      }

      if (isCreatingNewEvent) {
        const createdEventName = newEventName.trim() || brandTitle.trim();
        await createEvent(createdEventName);

        const createdEventId = useWaveStore.getState().activeEventId;
        if (createdEventId) {
          await setEventConfig(
            newEventStartDate || startDate,
            newEventStartTime || startTime,
            Math.max(1, Math.round(newEventTotalWaves || waves || 1))
          );
          await updateEventBranding({
            title: brandTitle.trim(),
            emojiLeft: brandEmojiLeft.trim(),
            emojiRight: brandEmojiRight.trim(),
            customGradient: {
              start: normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start),
              mid: normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid),
              end: normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end),
            },
          });
          setSelectedEventId(createdEventId);
        }

        await setAccessPasscode(passcode.trim());

        onClose();
        return;
      }

      const eventsChanged = JSON.stringify(events) !== JSON.stringify(customEvents);
      if (eventsChanged) {
        await updateWaveEvents(events);
      }

      await setTimingConfig(Math.max(1, Math.round(interval)), Math.max(0, Math.round(work)), Math.max(0, Math.round(rest)));
      await setMaxParticipants(maxParticipantsLocal);
      await setWorkoutTimerConfig(Math.max(1, Math.round(timerWorkSeconds)), Math.max(1, Math.round(timerRestSeconds)));
      await setEventConfig(startDate, startTime, Math.max(1, Math.round(waves)));
      await setAccessPasscode(passcode);

      await updateEventBranding({
        title: brandTitle.trim(),
        emojiLeft: brandEmojiLeft.trim(),
        emojiRight: brandEmojiRight.trim(),
        customGradient: {
          start: normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start),
          mid: normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid),
          end: normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end),
        },
      });

      onClose();
    } catch (error) {
      console.error('❌ Failed to save configuration:', error);
      alert('Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSelectedEvent = async () => {
    if (isCreatingNewEvent) {
      alert('Select an existing event before deleting.');
      return;
    }

    if (selectedEventId === DEFAULT_EVENT_ID) {
      alert('The default event cannot be deleted.');
      return;
    }

    const selectedEvent = eventsCatalog.find((event) => event.id === selectedEventId);
    const eventLabel = selectedEvent?.name || selectedEventId;
    const confirmed = confirm(`Delete "${eventLabel}" and all of its data? This cannot be undone.`);
    if (!confirmed) return;

    setIsDeletingEvent(true);
    try {
      await deleteEvent(selectedEventId);
      const nextActiveEventId = useWaveStore.getState().activeEventId;
      setSelectedEventId(nextActiveEventId);
      if (pathname !== '/') {
        router.push('/');
      }
    } catch (error) {
      console.error('❌ Failed to delete event:', error);
      alert('Failed to delete event. Please try again.');
    } finally {
      setIsDeletingEvent(false);
    }
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

  const handleEmojiPick = (emojiData: EmojiClickData) => {
    if (openEmojiPicker === 'left') {
      setBrandEmojiLeft(emojiData.emoji);
    }
    if (openEmojiPicker === 'right') {
      setBrandEmojiRight(emojiData.emoji);
    }
    setOpenEmojiPicker(null);
  };

  const applyGradientPreset = (preset: GradientPreset) => {
    setGradientStart(preset.start);
    setGradientMid(preset.mid);
    setGradientEnd(preset.end);
  };

  const renderGradientPresetPicker = () => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Quick Theme Presets</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK_GRADIENT_PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => applyGradientPreset(preset)}
            className="group rounded-md border border-gray-200 overflow-hidden text-left hover:border-gray-300 transition-colors"
            title={`Apply ${preset.name} theme`}
          >
            <div
              className="h-7 w-full"
              style={{
                background: `linear-gradient(90deg, ${preset.start}, ${preset.mid}, ${preset.end})`,
              }}
            />
            <div className="px-2 py-1 text-xs font-medium text-gray-700 group-hover:text-gray-900">
              {preset.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );


  // Close modal on outside click
  const modalRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!emojiPickerRef.current) return;
      if (!emojiPickerRef.current.contains(event.target as Node)) {
        setOpenEmojiPicker(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  let tabContent: JSX.Element | null = null;
  if (activeTab === 'security') {
    tabContent = (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Site Access Control</h3>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
            <h4 className="text-[11px] font-semibold text-yellow-900 mb-1 uppercase tracking-wide">Shared Setting</h4>
            <p className="text-[13px] text-yellow-700">This passcode is global for the entire site and is not tied to the selected event.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Passcode</label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Danger Zone</h3>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700 mb-3">Delete the currently selected event and all associated data.</p>
            <button
              type="button"
              onClick={() => {
                void handleDeleteSelectedEvent();
              }}
              disabled={isDeletingEvent || isCreatingNewEvent || selectedEventId === DEFAULT_EVENT_ID}
              className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeletingEvent ? 'Deleting Event...' : 'Delete Event'}
            </button>
          </div>
        </div>
      </div>
    );
  } else if (activeTab === 'movement') {
    tabContent = (
      <>
        {/* Tips moved to the top (condensed) */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
          <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Tips</h4>
          <ul className="text-[13px] text-blue-700 space-y-1 list-disc pl-5">
            <li>Changes will apply to all waves and participants</li>
            <li><strong>Wave Start Interval:</strong> Time between each wave starting (e.g., Wave 1 at 8:00, Wave 2 at 8:10)</li>
            <li><strong>Work + Rest:</strong> Duration of each movement station. Movement times on performance/print sheets are calculated using Work + Rest.</li>
          </ul>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Edit Current Event</h3>
          <p className="text-sm text-gray-600">This section controls the active event schedule and wave movement setup.</p>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wave Start Interval (min)</label>
            <input type="number" min={1} value={interval} onChange={(e) => setInterval(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Work (min)</label>
            <input type="number" min={0} value={work} onChange={(e) => setWork(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rest / Transition (min)</label>
            <input type="number" min={0} value={rest} onChange={(e) => setRest(parseInt(e.target.value || '0', 10))} className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants</label>
            <select
              value={maxParticipantsLocal}
              onChange={(e) => setMaxParticipantsLocal(parseInt(e.target.value))}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] bg-white"
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
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-lg font-medium text-gray-900">Event Clock Settings</h3>
            <button
              type="button"
              onClick={() => {
                void setEventClockEnabled(!eventClockEnabled);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                eventClockEnabled
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {eventClockEnabled ? 'Disable Clock' : 'Enable Clock'}
            </button>
          </div>
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
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Start Time</label>
              <input 
                type="time" 
                value={startTime} 
                onChange={(e) => setStartTime(e.target.value)} 
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Waves</label>
              <input 
                type="number" 
                min={1} 
                value={waves} 
                onChange={(e) => setWaves(parseInt(e.target.value || '1', 10))} 
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]" 
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
              className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
            />
            <button
              onClick={handleAddEvent}
              disabled={!newEvent.trim() || events.includes(newEvent.trim())}
              onMouseEnter={() => setIsAddButtonHover(true)}
              onMouseLeave={() => setIsAddButtonHover(false)}
              className="px-4 py-2 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: isAddButtonHover ? themeColors.accentHover : themeColors.accent,
              }}
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

      </>
    );
  } else if (isCreatingNewEvent) {
    tabContent = (
      <div className="space-y-6" ref={emojiPickerRef}>
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Create New Event</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
            <h4 className="text-[11px] font-semibold text-blue-900 mb-1 uppercase tracking-wide">Important</h4>
            <p className="text-[13px] text-blue-700">Create a new event with the current app template. Required fields below must be filled before the event is created.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="Event name"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input
                  type="date"
                  value={newEventStartDate}
                  onChange={(e) => setNewEventStartDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                <input
                  type="time"
                  value={newEventStartTime}
                  onChange={(e) => setNewEventStartTime(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Waves *</label>
                <input
                  type="number"
                  min={1}
                  value={newEventTotalWaves}
                  onChange={(e) => setNewEventTotalWaves(parseInt(e.target.value || '1', 10))}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Branding</h3>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Title *</label>
              <input
                type="text"
                value={brandTitle}
                onChange={(e) => setBrandTitle(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme Gradient Colors</label>
              {renderGradientPresetPicker()}
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="color"
                  value={normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start)}
                  onChange={(e) => setGradientStart(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient start color"
                />
                <input
                  type="color"
                  value={normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid)}
                  onChange={(e) => setGradientMid(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient middle color"
                />
                <input
                  type="color"
                  value={normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end)}
                  onChange={(e) => setGradientEnd(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient end color"
                />
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Left Emoji</label>
              <input
                type="text"
                value={brandEmojiLeft}
                onChange={(e) => setBrandEmojiLeft(e.target.value)}
                onFocus={() => setOpenEmojiPicker('left')}
                onClick={() => setOpenEmojiPicker('left')}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
              {openEmojiPicker === 'left' && (
                <div className="absolute z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
                  <EmojiPicker
                    onEmojiClick={handleEmojiPick}
                    searchPlaceHolder="Search emoji"
                    width="100%"
                    height={320}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Right Emoji</label>
              <input
                type="text"
                value={brandEmojiRight}
                onChange={(e) => setBrandEmojiRight(e.target.value)}
                onFocus={() => setOpenEmojiPicker('right')}
                onClick={() => setOpenEmojiPicker('right')}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
              {openEmojiPicker === 'right' && (
                <div className="absolute right-0 sm:right-auto z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
                  <EmojiPicker
                    onEmojiClick={handleEmojiPick}
                    searchPlaceHolder="Search emoji"
                    width="100%"
                    height={320}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    tabContent = (
      <div className="space-y-6" ref={emojiPickerRef}>
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Branding</h3>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Title *</label>
              <input
                type="text"
                value={brandTitle}
                onChange={(e) => setBrandTitle(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme Gradient Colors</label>
              {renderGradientPresetPicker()}
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="color"
                  value={normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start)}
                  onChange={(e) => setGradientStart(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient start color"
                />
                <input
                  type="color"
                  value={normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid)}
                  onChange={(e) => setGradientMid(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient middle color"
                />
                <input
                  type="color"
                  value={normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end)}
                  onChange={(e) => setGradientEnd(e.target.value)}
                  className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                  aria-label="Choose gradient end color"
                />
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Left Emoji</label>
              <input
                type="text"
                value={brandEmojiLeft}
                onChange={(e) => setBrandEmojiLeft(e.target.value)}
                onFocus={() => setOpenEmojiPicker('left')}
                onClick={() => setOpenEmojiPicker('left')}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
              {openEmojiPicker === 'left' && (
                <div className="absolute z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
                  <EmojiPicker
                    onEmojiClick={handleEmojiPick}
                    searchPlaceHolder="Search emoji"
                    width="100%"
                    height={320}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Right Emoji</label>
              <input
                type="text"
                value={brandEmojiRight}
                onChange={(e) => setBrandEmojiRight(e.target.value)}
                onFocus={() => setOpenEmojiPicker('right')}
                onClick={() => setOpenEmojiPicker('right')}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
              {openEmojiPicker === 'right' && (
                <div className="absolute right-0 sm:right-auto z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
                  <EmojiPicker
                    onEmojiClick={handleEmojiPick}
                    searchPlaceHolder="Search emoji"
                    width="100%"
                    height={320}
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <PasscodeProtection requiredPasscode={accessPasscode}>
        <div ref={modalRef} className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8 flex flex-col max-h-[90vh]">
          {/* Header - Fixed */}
          <div
            className="p-4 sm:p-6 pb-0 flex-shrink-0 bg-white"
            style={{ ['--accent-color' as string]: themeColors.accent }}
          >
            <div className="flex justify-between items-center gap-3 pb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <h2 className="text-2xl font-semibold text-gray-900">Configuration</h2>
                <select
                  value={selectedEventId}
                  onChange={async (e) => {
                    const nextEventId = e.target.value;
                    setSelectedEventId(nextEventId);
                    if (nextEventId === CREATE_NEW_EVENT_OPTION) {
                      setActiveTab('event');
                      return;
                    }
                    if (nextEventId === activeEventId) return;

                    await setActiveEvent(nextEventId);
                    if (pathname !== '/') {
                      router.push('/');
                    }
                  }}
                  onFocus={() => setIsEventSelectFocused(true)}
                  onBlur={() => setIsEventSelectFocused(false)}
                  className="p-2 border rounded-md focus:outline-none bg-white text-sm min-w-[180px] transition-shadow"
                  style={{
                    borderColor: themeColors.accent,
                    boxShadow: isEventSelectFocused ? `0 0 0 2px ${themeColors.accent}` : undefined,
                  }}
                >
                  {eventsCatalog.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                  <option value={CREATE_NEW_EVENT_OPTION}>+ Create New Event</option>
                </select>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-gray-200">
              <div className="flex gap-2 -mb-px items-end">
              <button
                type="button"
                onClick={() => setActiveTab('movement')}
                className={`px-4 py-2 rounded-t-md border-b-2 font-semibold text-sm transition-colors ${activeTab === 'movement' ? 'text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
                style={{
                  borderBottomColor: activeTab === 'movement' ? themeColors.accent : 'transparent',
                  color: activeTab === 'movement' ? themeColors.accent : undefined,
                }}
              >
                Wave Config
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('event')}
                className={`px-4 py-2 rounded-t-md border-b-2 font-semibold text-sm transition-colors ${activeTab === 'event' ? 'text-gray-900' : 'text-gray-600 hover:text-gray-800'}`}
                style={{
                  borderBottomColor: activeTab === 'event' ? themeColors.accent : 'transparent',
                  color: activeTab === 'event' ? themeColors.accent : undefined,
                }}
              >
                Event Config
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                aria-label="Open security settings"
                className="ml-auto h-9 w-10 rounded-t-md border-b-2 border-transparent opacity-0"
              >
                <span className="sr-only">Security</span>
              </button>
              </div>
            </div>
          </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {tabContent}

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
                  void handleSave();
                } catch (error) {
                  console.error('❌ Error calling handleSave:', error);
                }
              }}
              disabled={isSaving || !brandTitle.trim()}
              className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-white border-2 rounded-lg transition-all active:scale-95 font-semibold"
              style={{
                backgroundColor: eventBranding?.customGradient?.mid || eventBranding?.customColor || '#ea580c',
                borderColor: eventBranding?.customGradient?.mid || eventBranding?.customColor || '#ea580c',
                color: eventBranding?.customGradient?.mid ? '#fff' : '',
              }}
            >
              {isSaving ? 'Saving...' : isCreatingNewEvent ? 'Create Event' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
      </PasscodeProtection>
    </div>
  );
}
