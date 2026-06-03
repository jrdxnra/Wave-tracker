'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useWaveStore } from '@/store/waveStore';
import PasscodeProtection from '@/components/PasscodeProtection';

function escapeCsvValue(value: string | number): string {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

type BrandTheme = 'orange' | 'blue' | 'emerald' | 'sunset';
const CREATE_NEW_EVENT_OPTION = '__create_new_event__';
const DEFAULT_EVENT_ID = 'g-rox';

type GradientPreset = {
  name: string;
  start: string;
  mid: string;
  end: string;
};

type EditableMinutes = number | '';
type EditableMovementIntervals = Record<string, { workMinutes: EditableMinutes; restMinutes: EditableMinutes }>;

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

function parseEditableMinutes(value: string): EditableMinutes {
  if (value === '') return '';
  return Math.max(0, parseInt(value, 10) || 0);
}

function normalizeMinutes(value: EditableMinutes): number {
  return Math.max(0, Number(value) || 0);
}

function normalizeMovementIntervals(
  intervals: EditableMovementIntervals,
  fallbackWork: EditableMinutes,
  fallbackRest: EditableMinutes,
): Record<string, { workMinutes: number; restMinutes: number }> {
  const normalizedFallbackWork = normalizeMinutes(fallbackWork);
  const normalizedFallbackRest = normalizeMinutes(fallbackRest);

  return Object.fromEntries(
    Object.entries(intervals).map(([movementName, values]) => [
      movementName,
      {
        workMinutes: values.workMinutes === '' ? normalizedFallbackWork : normalizeMinutes(values.workMinutes),
        restMinutes: values.restMinutes === '' ? normalizedFallbackRest : normalizeMinutes(values.restMinutes),
      },
    ])
  );
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
    movementTimingMode, movementIntervals,
    setTimingConfig, setMaxParticipants, setWorkoutTimerConfig, setEventConfig, setAccessPasscode,
    loadGlobalConfig, eventBranding, eventClockEnabled, setEventClockEnabled, themeColors,
    eventsCatalog, activeEventId, loadEventsCatalog, createEvent, deleteEvent, setActiveEvent, updateEventBranding,
    feedbackEnabled, setFeedbackEnabled, loadFeedbackEntries, passcodeProtectionEnabled, setPasscodeProtectionEnabled
  } = useWaveStore();
  
  const [activeTab, setActiveTab] = useState<'movement' | 'event' | 'security'>(initialTab);
  const [selectedEventId, setSelectedEventId] = useState<string>(activeEventId);
  const isCreatingNewEvent = selectedEventId === CREATE_NEW_EVENT_OPTION;

  const [events, setEvents] = useState<string[]>(customEvents);
  const [newEvent, setNewEvent] = useState('');
  const [interval, setInterval] = useState<number>(intervalMinutes);
  const [work, setWork] = useState<EditableMinutes>(workMinutes);
  const [rest, setRest] = useState<EditableMinutes>(restMinutes);
  const [movementTimingModeLocal, setMovementTimingModeLocal] = useState<'global' | 'individual'>(movementTimingMode);
  const [movementIntervalsLocal, setMovementIntervalsLocal] = useState<EditableMovementIntervals>(movementIntervals);
  const [maxParticipantsLocal, setMaxParticipantsLocal] = useState<number>(maxParticipants);
  const [timerWorkSeconds, setTimerWorkSeconds] = useState<number>(workoutTimerWorkSeconds);
  const [timerRestSeconds, setTimerRestSeconds] = useState<number>(workoutTimerRestSeconds);
  const [startDate, setStartDate] = useState<string>(eventStartDate);
  const [startTime, setStartTime] = useState<string>(eventStartTime);
  const [waves, setWaves] = useState<number>(totalWaves);
  const [passcode, setPasscode] = useState<string>(accessPasscode);
  const [passcodeProtectionEnabledLocal, setPasscodeProtectionEnabledLocal] = useState<boolean>(passcodeProtectionEnabled);
  const [feedbackEnabledLocal, setFeedbackEnabledLocal] = useState<boolean>(feedbackEnabled);

  const [newEventName, setNewEventName] = useState('');
  const [newEventMovementTimingMode, setNewEventMovementTimingMode] = useState<'global' | 'individual'>('global');
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
  const [isDownloadingFeedback, setIsDownloadingFeedback] = useState(false);
  const [isUpdatingPasscodeToggle, setIsUpdatingPasscodeToggle] = useState(false);
  const [isUpdatingFeedbackToggle, setIsUpdatingFeedbackToggle] = useState(false);
  const [isSwitchingEvent, setIsSwitchingEvent] = useState(false);
  const [isHydratingConfig, setIsHydratingConfig] = useState(false);
  const [isAddButtonHover, setIsAddButtonHover] = useState(false);
  const [isEventSelectFocused, setIsEventSelectFocused] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // Load fresh config from Firebase when modal opens and sync local state
  useEffect(() => {
    if (!isOpen) return;

    let isCancelled = false;
    setActiveTab(initialTab);
    setIsHydratingConfig(true);

    void (async () => {
      try {
        await loadEventsCatalog();
        await loadGlobalConfig();
      } finally {
        if (!isCancelled) {
          setIsHydratingConfig(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, initialTab, loadGlobalConfig, loadEventsCatalog]);

  // Sync local state whenever store values change
  useEffect(() => {
    setEvents(customEvents);
    setInterval(intervalMinutes);
    setWork(workMinutes);
    setRest(restMinutes);
    setMovementTimingModeLocal(movementTimingMode);
    setMovementIntervalsLocal(movementIntervals);
    setMaxParticipantsLocal(maxParticipants);
    setTimerWorkSeconds(workoutTimerWorkSeconds);
    setTimerRestSeconds(workoutTimerRestSeconds);
    setStartDate(eventStartDate);
    setStartTime(eventStartTime);
    setWaves(totalWaves);
    setPasscode(accessPasscode);
    setPasscodeProtectionEnabledLocal(passcodeProtectionEnabled);
    setFeedbackEnabledLocal(feedbackEnabled);
  }, [customEvents, intervalMinutes, workMinutes, restMinutes, movementTimingMode, movementIntervals, maxParticipants, workoutTimerWorkSeconds, workoutTimerRestSeconds, eventStartDate, eventStartTime, totalWaves, accessPasscode, passcodeProtectionEnabled, feedbackEnabled]);

  useEffect(() => {
    setMovementIntervalsLocal((prev) => {
      const next: EditableMovementIntervals = {};
      for (const movementName of events) {
        const existing = prev[movementName] || movementIntervals[movementName];
        next[movementName] = {
          workMinutes: existing?.workMinutes === '' ? '' : Math.max(0, Number(existing?.workMinutes) || normalizeMinutes(work)),
          restMinutes: existing?.restMinutes === '' ? '' : Math.max(0, Number(existing?.restMinutes) || normalizeMinutes(rest)),
        };
      }
      return next;
    });
  }, [events, movementIntervals, work, rest]);

  useEffect(() => {
    if (!isOpen) return;
    if (isCreatingNewEvent) {
      // Always reset all fields for a new event
      setBrandTitle('');
      setBrandEmojiLeft('');
      setBrandEmojiRight('');
      const defaultGradient = getDefaultGradient('orange');
      setGradientStart(defaultGradient.start);
      setGradientMid(defaultGradient.mid);
      setGradientEnd(defaultGradient.end);
      setNewEventName('');
      setNewEventMovementTimingMode('global');
    } else {
      setSelectedEventId(activeEventId);
      setBrandTitle(eventBranding.title);
      setBrandEmojiLeft(eventBranding.emojiLeft);
      setBrandEmojiRight(eventBranding.emojiRight);
      const defaultGradient = getDefaultGradient(eventBranding.theme);
      setGradientStart(eventBranding.customGradient?.start || defaultGradient.start);
      setGradientMid(eventBranding.customGradient?.mid || defaultGradient.mid);
      setGradientEnd(eventBranding.customGradient?.end || defaultGradient.end);
    }
  }, [isOpen, activeEventId, eventBranding, movementTimingMode, isCreatingNewEvent]);

  const handleSave = async () => {
    if (isSwitchingEvent || isHydratingConfig) return;
    setIsSaving(true);
    try {
      if (isCreatingNewEvent) {
        const createdEventName = newEventName.trim();
        if (!createdEventName) {
          alert('Event Name is required before creating an event.');
          return;
        }

        await createEvent(createdEventName);

        const createdEventId = useWaveStore.getState().activeEventId;
        if (createdEventId) {
          const perMovementDefaults = Object.fromEntries(
            events.map((movementName) => [
              movementName,
              {
                workMinutes: normalizeMinutes(work),
                restMinutes: normalizeMinutes(rest),
              }
            ])
          ) as Record<string, { workMinutes: number; restMinutes: number }>;

          await setTimingConfig(
            Math.max(1, Math.round(interval)),
            normalizeMinutes(work),
            normalizeMinutes(rest),
            newEventMovementTimingMode,
            newEventMovementTimingMode === 'individual' ? perMovementDefaults : {},
            createdEventId
          );

          await updateEventBranding({
            title: createdEventName,
            emojiLeft: brandEmojiLeft.trim(),
            emojiRight: brandEmojiRight.trim(),
            customGradient: {
              start: normalizeHexColor(gradientStart, getDefaultGradient('orange').start),
              mid: normalizeHexColor(gradientMid, getDefaultGradient('orange').mid),
              end: normalizeHexColor(gradientEnd, getDefaultGradient('orange').end),
            },
          }, createdEventId);
          setSelectedEventId(createdEventId);
          // Reset all fields to defaults for the new event
          setBrandTitle('');
          setBrandEmojiLeft('');
          setBrandEmojiRight('');
          const defaultGradient = getDefaultGradient('orange');
          setGradientStart(defaultGradient.start);
          setGradientMid(defaultGradient.mid);
          setGradientEnd(defaultGradient.end);
          setNewEventName('');
          setNewEventMovementTimingMode('global');
        }

        await setAccessPasscode(passcode.trim());
        await setPasscodeProtectionEnabled(passcodeProtectionEnabledLocal);
        await setFeedbackEnabled(feedbackEnabledLocal, createdEventId);
        onClose();
        return;
      }

      if (!brandTitle.trim()) {
        alert('Event Title is required before saving.');
        return;
      }

      if (selectedEventId !== activeEventId) {
        alert('Wait for event switching to finish before saving.');
        return;
      }

      const saveEventId = activeEventId;

      const eventsChanged = JSON.stringify(events) !== JSON.stringify(customEvents);
      if (eventsChanged) {
        await updateWaveEvents(events, saveEventId);
      }

      await setTimingConfig(
        Math.max(1, Math.round(interval)),
        normalizeMinutes(work),
        normalizeMinutes(rest),
        movementTimingModeLocal,
        normalizeMovementIntervals(movementIntervalsLocal, work, rest),
        saveEventId
      );
      await setMaxParticipants(maxParticipantsLocal, saveEventId);
      await setWorkoutTimerConfig(Math.max(1, Math.round(timerWorkSeconds)), Math.max(1, Math.round(timerRestSeconds)), saveEventId);
      await setEventConfig(startDate, startTime, Math.max(1, Math.round(waves)), saveEventId);
      await setAccessPasscode(passcode);
      await setPasscodeProtectionEnabled(passcodeProtectionEnabledLocal);
      await setFeedbackEnabled(feedbackEnabledLocal, saveEventId);

      await updateEventBranding({
        title: brandTitle.trim(),
        emojiLeft: brandEmojiLeft.trim(),
        emojiRight: brandEmojiRight.trim(),
        customGradient: {
          start: normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start),
          mid: normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid),
          end: normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end),
        },
      }, saveEventId);

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

  const handleDownloadFeedbackCsv = async () => {
    if (isCreatingNewEvent) {
      alert('Create the event before downloading feedback.');
      return;
    }

    setIsDownloadingFeedback(true);
    try {
      const exportEventId = selectedEventId === CREATE_NEW_EVENT_OPTION ? activeEventId : selectedEventId;
      const selectedEvent = eventsCatalog.find((event) => event.id === exportEventId);
      const entries = await loadFeedbackEntries(exportEventId);

      if (entries.length === 0) {
        alert('No feedback has been submitted yet for this event.');
        return;
      }

      const csvRows = [
        ['eventId', 'eventName', 'rating', 'message', 'submittedAt'],
        ...entries.map((entry) => [
          entry.eventId,
          selectedEvent?.name || brandTitle.trim() || exportEventId,
          entry.rating,
          entry.message,
          entry.createdAt,
        ]),
      ];

      const csvContent = csvRows
        .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
        .join('\n');

      const fileNameBase = (selectedEvent?.name || brandTitle || exportEventId)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'feedback';

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileNameBase}-feedback.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('❌ Failed to download feedback CSV:', error);
      alert('Failed to download feedback CSV. Please try again.');
    } finally {
      setIsDownloadingFeedback(false);
    }
  };

  const handlePasscodeToggle = async () => {
    const nextEnabled = !passcodeProtectionEnabledLocal;
    setPasscodeProtectionEnabledLocal(nextEnabled);
    setIsUpdatingPasscodeToggle(true);

    try {
      await setPasscodeProtectionEnabled(nextEnabled);
    } catch (error) {
      console.error('❌ Failed to update passcode protection:', error);
      setPasscodeProtectionEnabledLocal(!nextEnabled);
      alert('Failed to update passcode protection. Please try again.');
    } finally {
      setIsUpdatingPasscodeToggle(false);
    }
  };

  const handleFeedbackToggle = async () => {
    const nextEnabled = !feedbackEnabledLocal;
    const targetEventId = useWaveStore.getState().activeEventId;
    setFeedbackEnabledLocal(nextEnabled);
    setIsUpdatingFeedbackToggle(true);

    try {
      await setFeedbackEnabled(nextEnabled, targetEventId);
    } catch (error) {
      console.error('❌ Failed to update feedback visibility:', error);
      setFeedbackEnabledLocal(!nextEnabled);
      alert('Failed to update feedback visibility. Please try again.');
    } finally {
      setIsUpdatingFeedbackToggle(false);
    }
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

  const renderInfoTip = (tipText: string, label: string, align: 'left' | 'right' = 'left') => (
    <span className="relative inline-flex group">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-[10px] font-semibold text-gray-600 cursor-pointer"
        aria-label={label}
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-2 w-72 rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-800 shadow-md opacity-0 transition-opacity duration-150 whitespace-pre-line group-hover:opacity-100 group-focus-within:opacity-100 ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        <span className="space-y-1 block">
          {tipText.split('\n').map((rawLine, index) => {
            const line = rawLine.trim();
            if (!line) return null;

            const colonIndex = line.indexOf(':');
            let lead = '';
            let rest = '';

            if (colonIndex > 0) {
              lead = line.slice(0, colonIndex + 1);
              rest = line.slice(colonIndex + 1).trim();
            } else {
              const firstSpaceIndex = line.indexOf(' ');
              if (firstSpaceIndex > 0) {
                lead = line.slice(0, firstSpaceIndex);
                rest = line.slice(firstSpaceIndex + 1).trim();
              } else {
                lead = line;
              }
            }

            return (
              <span key={`${label}-${index}`} className="block">
                <span className="font-semibold">{lead}</span>
                {rest ? ` ${rest}` : ''}
              </span>
            );
          })}
        </span>
      </span>
    </span>
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
  if (isHydratingConfig) {
    tabContent = (
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--accent-color)]" />
        <p className="text-sm text-gray-600">Loading event settings...</p>
      </div>
    );
  } else if (activeTab === 'security') {
    tabContent = (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-medium text-gray-900">Site Access Control</h3>
            {renderInfoTip(
              'Shared Setting: This passcode is global for the entire site and is not tied to the selected event.',
              'Site Access Control information'
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Passcode Protection</h4>
                <p className="text-xs text-gray-600">Enable or disable the passcode wall for protected pages.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handlePasscodeToggle();
                }}
                disabled={isUpdatingPasscodeToggle}
                className="min-w-[100px] rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: passcodeProtectionEnabledLocal ? themeColors.accent : '#6b7280' }}
              >
                {isUpdatingPasscodeToggle ? 'Saving...' : passcodeProtectionEnabledLocal ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Passcode</label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                disabled={!passcodeProtectionEnabledLocal}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-medium text-gray-900">Feedback</h3>
            {renderInfoTip(
              'All submissions are saved to this event only, and Download Feedback CSV exports only this event\'s responses.',
              'Feedback CSV information'
            )}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Floating Feedback Box</h4>
                <p className="text-xs text-gray-600">Show or hide the feedback card at the bottom of the leaderboard page for this event.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleFeedbackToggle();
                }}
                disabled={isUpdatingFeedbackToggle}
                className="min-w-[100px] rounded-md px-3 py-2 text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: feedbackEnabledLocal ? themeColors.accent : '#6b7280' }}
              >
                {isUpdatingFeedbackToggle ? 'Saving...' : feedbackEnabledLocal ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-600">Feedback is stored in Firebase and can be exported here as CSV.</p>
              <button
                type="button"
                onClick={() => {
                  void handleDownloadFeedbackCsv();
                }}
                disabled={isDownloadingFeedback || isCreatingNewEvent}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: themeColors.accent }}
              >
                {isDownloadingFeedback ? 'Preparing CSV...' : 'Download Feedback CSV'}
              </button>
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
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-medium text-gray-900">Edit Current Event</h3>
            {renderInfoTip(
              'Changes will apply to all waves and participants.',
              'Edit Current Event tips'
            )}
          </div>
          <p className="text-sm text-gray-600">This section controls the active event schedule and wave movement setup.</p>
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Waves</label>
            <input
              type="number"
              min={1}
              value={waves}
              onChange={(e) => setWaves(parseInt(e.target.value || '1', 10))}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wave Start Interval (min)</label>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value || '1', 10))}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants</label>
            <select
              value={maxParticipantsLocal}
              onChange={(e) => setMaxParticipantsLocal(parseInt(e.target.value))}
              className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] bg-white"
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

        {movementTimingModeLocal === 'global' && (
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work (min)</label>
              <input
                type="number"
                min={0}
                value={work}
                onChange={(e) => setWork(parseEditableMinutes(e.target.value))}
                onBlur={() => setWork((current) => normalizeMinutes(current))}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rest / Transition (min)</label>
              <input
                type="number"
                min={0}
                value={rest}
                onChange={(e) => setRest(parseEditableMinutes(e.target.value))}
                onBlur={() => setRest((current) => normalizeMinutes(current))}
                className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
            </div>
          </div>
        )}

        {/* Add New Movement */}
        <div key={selectedEventId} className="mb-4 w-full">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-medium text-gray-900">Add New Movement</h3>
            {renderInfoTip(
              'Add hyphens (-) in movement names to control text wrapping in print.\nExample: BURPEE-BROAD JUMPS will wrap at the hyphen.',
              'Add New Movement tips'
            )}
          </div>
          <div className="grid w-full grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
            <div className="w-full min-w-0">
              <input
                type="text"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
                placeholder="Type movement name and press Enter"
                className="block w-full min-w-0 h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
              />
            </div>
            <button
              onClick={handleAddEvent}
              disabled={!newEvent.trim() || events.includes(newEvent.trim())}
              onMouseEnter={() => setIsAddButtonHover(true)}
              onMouseLeave={() => setIsAddButtonHover(false)}
              className="w-full sm:w-auto h-10 px-4 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{
                backgroundColor: isAddButtonHover ? themeColors.accentHover : themeColors.accent,
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Current Movements */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-0">
            <h3 className="text-lg font-medium text-gray-900">Current Movements</h3>
            <span className="text-xs font-medium text-gray-500">{events.length} total</span>
            {renderInfoTip(
              'Drag and drop movements to reorder them.\nUse the arrow buttons for precise reordering.',
              'Current Movements tips'
            )}
          </div>
          {movementTimingModeLocal === 'individual' && (
            <div className="mb-1 flex justify-end gap-2 pr-24 text-xs font-medium text-gray-500">
              <span className="w-16 text-center">Work</span>
              <span className="w-16 text-center">Rest</span>
            </div>
          )}
          <div className="space-y-2">
            {events.map((movementName, index) => {
              const movementTiming = movementIntervalsLocal[movementName] || {
                workMinutes: normalizeMinutes(work),
                restMinutes: normalizeMinutes(rest),
              };
              const duplicateName = events.some(
                (existingName, existingIndex) =>
                  existingIndex !== index &&
                  existingName.trim().toLowerCase() === movementName.trim().toLowerCase()
              );

              return (
              <div
                key={index}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 cursor-move items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-gray-500 w-6 text-right">{index + 1}.</span>
                  <input
                    type="text"
                    value={movementName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setEvents((prev) => prev.map((name, nameIndex) => (nameIndex === index ? nextName : name)));
                    }}
                    className={`w-full min-w-0 h-9 px-3 border rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] ${duplicateName ? 'border-red-300' : 'border-gray-300'}`}
                    aria-label={`Movement name ${index + 1}`}
                  />
                </div>
                <div className="flex flex-nowrap items-center justify-end gap-2 shrink-0">
                  {movementTimingModeLocal === 'individual' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium text-gray-500">W</span>
                      <input
                        type="number"
                        min={0}
                        value={movementTiming.workMinutes}
                        onChange={(e) => {
                          const nextWork = parseEditableMinutes(e.target.value);
                          setMovementIntervalsLocal((prev) => ({
                            ...prev,
                            [movementName]: {
                              workMinutes: nextWork,
                              restMinutes: prev[movementName]?.restMinutes ?? movementTiming.restMinutes,
                            },
                          }));
                        }}
                        onBlur={() => {
                          setMovementIntervalsLocal((prev) => ({
                            ...prev,
                            [movementName]: {
                              workMinutes: normalizeMinutes(prev[movementName]?.workMinutes ?? movementTiming.workMinutes),
                              restMinutes: prev[movementName]?.restMinutes ?? movementTiming.restMinutes,
                            },
                          }));
                        }}
                        className="w-12 sm:w-14 h-9 px-1 sm:px-2 shrink-0 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                        aria-label={`Work minutes for ${movementName}`}
                      />
                      <span className="text-xs font-medium text-gray-500">R</span>
                      <input
                        type="number"
                        min={0}
                        value={movementTiming.restMinutes}
                        onChange={(e) => {
                          const nextRest = parseEditableMinutes(e.target.value);
                          setMovementIntervalsLocal((prev) => ({
                            ...prev,
                            [movementName]: {
                              workMinutes: prev[movementName]?.workMinutes ?? movementTiming.workMinutes,
                              restMinutes: nextRest,
                            },
                          }));
                        }}
                        onBlur={() => {
                          setMovementIntervalsLocal((prev) => ({
                            ...prev,
                            [movementName]: {
                              workMinutes: prev[movementName]?.workMinutes ?? movementTiming.workMinutes,
                              restMinutes: normalizeMinutes(prev[movementName]?.restMinutes ?? movementTiming.restMinutes),
                            },
                          }));
                        }}
                        className="w-12 sm:w-14 h-9 px-1 sm:px-2 shrink-0 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                        aria-label={`Rest minutes for ${movementName}`}
                      />
                    </div>
                  )}
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="shrink-0 p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move Up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === events.length - 1}
                    className="shrink-0 p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move Down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => handleRemoveEvent(index)}
                    className="shrink-0 p-1 text-red-500 hover:text-red-700"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
              );
            })}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
              <input
                type="text"
                value={newEventName}
                onChange={(e) => {
                  setNewEventName(e.target.value);
                  setBrandTitle(e.target.value);
                }}
                placeholder="Event name"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Interval Mode *</label>
              <select
                value={newEventMovementTimingMode}
                onChange={(e) => setNewEventMovementTimingMode(e.target.value as 'global' | 'individual')}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] bg-white"
                required
              >
                <option value="global">Global Interval</option>
                <option value="individual">Individual Intervals</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              {renderGradientPresetPicker()}
              <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">Gradient Colors</label>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="relative min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">Left Emoji</label>
                <input
                  type="text"
                  value={brandEmojiLeft}
                  onChange={(e) => setBrandEmojiLeft(e.target.value)}
                  onFocus={() => setOpenEmojiPicker('left')}
                  onClick={() => setOpenEmojiPicker('left')}
                  className="w-full min-w-0 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                />
                {openEmojiPicker === 'left' && (
                  <div className="absolute left-0 z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
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
              <div className="relative min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">Right Emoji</label>
                <input
                  type="text"
                  value={brandEmojiRight}
                  onChange={(e) => setBrandEmojiRight(e.target.value)}
                  onFocus={() => setOpenEmojiPicker('right')}
                  onClick={() => setOpenEmojiPicker('right')}
                  className="w-full min-w-0 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                />
                {openEmojiPicker === 'right' && (
                  <div className="absolute left-auto right-0 max-sm:right-2 z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
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
      </div>
    );
  } else {
    tabContent = (
      <div className="space-y-6" ref={emojiPickerRef}>
        <div>
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">Event Title *</h3>
                <input
                  type="text"
                  value={brandTitle}
                  onChange={(e) => setBrandTitle(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                  required
                />
              </div>
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900">Event Clock/Timeline</h3>
                  {renderInfoTip(
                    'Wave Start Interval: Time between each wave starting (e.g., Wave 1 at 8:00, Wave 2 at 8:10).\nWork + Rest: Duration of each movement station. Movement times on performance/print sheets are calculated using Work + Rest.',
                    'Event Clock tips',
                    'right'
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !eventClockEnabled;
                    void setEventClockEnabled(nextEnabled);
                    if (typeof window !== 'undefined') {
                      window.__INSPECT_ENABLED = !nextEnabled;
                      if (!nextEnabled) {
                        // Enable inspect mode immediately when clock/timeline is disabled.
                        debugger;
                      }
                    }
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    eventClockEnabled
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {eventClockEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gradient Colors</label>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="relative min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">Left Emoji</label>
                <input
                  type="text"
                  value={brandEmojiLeft}
                  onChange={(e) => setBrandEmojiLeft(e.target.value)}
                  onFocus={() => setOpenEmojiPicker('left')}
                  onClick={() => setOpenEmojiPicker('left')}
                  className="w-full min-w-0 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                />
                {openEmojiPicker === 'left' && (
                  <div className="absolute left-0 z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
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
              <div className="relative min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-1">Right Emoji</label>
                <input
                  type="text"
                  value={brandEmojiRight}
                  onChange={(e) => setBrandEmojiRight(e.target.value)}
                  onFocus={() => setOpenEmojiPicker('right')}
                  onClick={() => setOpenEmojiPicker('right')}
                  className="w-full min-w-0 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)]"
                />
                {openEmojiPicker === 'right' && (
                  <div className="absolute left-auto right-0 max-sm:right-2 z-20 mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-lg w-[min(92vw,340px)]">
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
            <div className="flex flex-row flex-nowrap items-center gap-x-2 pb-0">
              <h2 className="text-2xl font-semibold text-gray-900">Configuration</h2>
              <div className="flex flex-row flex-nowrap gap-x-1 ml-2 w-full">
                <select
                  value={selectedEventId}
                  disabled={isSaving || isSwitchingEvent || isHydratingConfig}
                  onChange={async (e) => {
                    const nextEventId = e.target.value;
                    setSelectedEventId(nextEventId);
                    if (nextEventId === CREATE_NEW_EVENT_OPTION) {
                      setIsSwitchingEvent(false);
                      setActiveTab('event');
                      return;
                    }
                    if (nextEventId === activeEventId) return;

                    setIsSwitchingEvent(true);
                    try {
                      await setActiveEvent(nextEventId);
                      if (pathname !== '/') {
                        router.push('/');
                      }
                    } finally {
                      setIsSwitchingEvent(false);
                    }
                  }}
                  onFocus={() => setIsEventSelectFocused(true)}
                  onBlur={() => setIsEventSelectFocused(false)}
                  className="w-full sm:w-auto p-2 border rounded-md focus:outline-none bg-white text-sm min-w-[180px] transition-shadow"
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
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                >
                  ×
                </button>
              </div>
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
        <div className="px-6 pb-6 pt-0 overflow-y-auto flex-1">
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
              disabled={isSaving || isSwitchingEvent || isHydratingConfig || !brandTitle.trim()}
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
