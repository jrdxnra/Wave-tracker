'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useWaveStore } from '@/store/waveStore';
import PasscodeProtection from '@/components/PasscodeProtection';

type BrandTheme = 'orange' | 'blue' | 'emerald' | 'sunset';

const THEME_GRADIENT_PRESETS: Record<BrandTheme, { start: string; mid: string; end: string }> = {
  orange: { start: '#ea580c', mid: '#f97316', end: '#fbbf24' },
  blue: { start: '#1d4ed8', mid: '#2563eb', end: '#38bdf8' },
  emerald: { start: '#047857', mid: '#059669', end: '#34d399' },
  sunset: { start: '#be185d', mid: '#db2777', end: '#fb7185' },
};

function normalizeHexColor(color: string, fallback: string): string {
  const normalized = color.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function getDefaultGradient(theme: BrandTheme) {
  return THEME_GRADIENT_PRESETS[theme] || THEME_GRADIENT_PRESETS.orange;
}

interface EventConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EventConfigurationModal({ isOpen, onClose }: EventConfigurationModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeEventId,
    eventsCatalog,
    eventBranding,
    accessPasscode,
    createEvent,
    setActiveEvent,
    updateEventBranding,
    loadEventsCatalog,
  } = useWaveStore();

  const [selectedEventId, setSelectedEventId] = useState<string>(activeEventId);
  const [newEventName, setNewEventName] = useState('');
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
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [openEmojiPicker, setOpenEmojiPicker] = useState<'left' | 'right' | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadEventsCatalog();
    }
  }, [isOpen, loadEventsCatalog]);

  // Sync form from store when opening or switching events. Avoid clobbering active edits.
  useEffect(() => {
    if (isOpen && !isDirty) {
      setSelectedEventId(activeEventId);
      setBrandTitle(eventBranding.title);
      setBrandEmojiLeft(eventBranding.emojiLeft);
      setBrandEmojiRight(eventBranding.emojiRight);
      const fallbackGradient = getDefaultGradient(eventBranding.theme);
      setGradientStart(eventBranding.customGradient?.start || fallbackGradient.start);
      setGradientMid(eventBranding.customGradient?.mid || fallbackGradient.mid);
      setGradientEnd(eventBranding.customGradient?.end || fallbackGradient.end);
      setNewEventName('');
      setOpenEmojiPicker(null);
    }
  }, [isOpen, activeEventId, eventBranding, isDirty]);

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

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;

    try {
      await createEvent(newEventName.trim());
      setNewEventName('');
      await loadEventsCatalog();
    } catch (error) {
      console.error('Failed to create event:', error);
      alert('Failed to create event. Please try again.');
    }
  };

  const handleSwitchEvent = async () => {
    if (selectedEventId !== activeEventId) {
      await setActiveEvent(selectedEventId);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saveEventId = useWaveStore.getState().activeEventId;
      await updateEventBranding({
        title: brandTitle.trim() || 'Event',
        emojiLeft: brandEmojiLeft.trim(),
        emojiRight: brandEmojiRight.trim(),
        customGradient: {
          start: normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start),
          mid: normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid),
          end: normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end),
        },
      }, saveEventId);
      setIsDirty(false);
      onClose();
    } catch (error) {
      console.error('Failed to save event configuration:', error);
      alert('Failed to save event configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };


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
  if (!isOpen) return null;

  const handleEmojiPick = (emojiData: EmojiClickData) => {
    if (openEmojiPicker === 'left') {
      setBrandEmojiLeft(emojiData.emoji);
    }
    if (openEmojiPicker === 'right') {
      setBrandEmojiRight(emojiData.emoji);
    }
    setIsDirty(true);
    setOpenEmojiPicker(null);
  };

  return (
    <div className="neutral-focus-scope fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <PasscodeProtection requiredPasscode={accessPasscode}>
        <div ref={modalRef} className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
          <div className="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-2xl font-semibold text-gray-900">Event Configuration</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              tabIndex={0}
            >
              ×
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            <div className="mb-6">
              <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <h3 className="text-lg font-medium text-gray-900">Event and Branding</h3>
                <div className="w-full sm:w-[22rem] sm:flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Active Event</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedEventId}
                      onChange={async (e) => {
                        const nextEventId = e.target.value;
                        setSelectedEventId(nextEventId);
                        if (nextEventId === activeEventId) return;

                        await setActiveEvent(nextEventId); // Wait for state to update
                        onClose();
                        if (pathname !== '/') {
                          router.push('/');
                        }
                      }}
                      className="input-focus-brand w-full p-2 border border-gray-300 rounded-md bg-white"
                    >
                      {eventsCatalog.map((event) => (
                        <option key={event.id} value={event.id}>{event.name}</option>
                      ))}
                    </select>
                    {/* Switch button removed: event switching is now instant on select change */}
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 mb-2">
                <h4 className="text-[11px] font-semibold text-indigo-900 mb-1 uppercase tracking-wide">Important</h4>
                <p className="text-[13px] text-indigo-700">Switch events to load a completely separate Wave, Performance, and Leaderboard dataset. Create a blank event to start fresh.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Create Blank Event</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateEvent()}
                      placeholder="Event name"
                      className="input-focus-brand flex-1 p-2 border border-gray-300 rounded-md"
                    />
                    <button
                      onClick={handleCreateEvent}
                      className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3" ref={emojiPickerRef}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
                  <input
                    type="text"
                    value={brandTitle}
                    onChange={(e) => {
                      setBrandTitle(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Event title"
                    className="input-focus-brand w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Theme Gradient Colors</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
                      <input
                        type="color"
                        value={normalizeHexColor(gradientStart, getDefaultGradient(eventBranding.theme).start)}
                        onChange={(e) => {
                          setGradientStart(e.target.value);
                          setIsDirty(true);
                        }}
                        className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                        aria-label="Choose gradient start color"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Middle</label>
                      <input
                        type="color"
                        value={normalizeHexColor(gradientMid, getDefaultGradient(eventBranding.theme).mid)}
                        onChange={(e) => {
                          setGradientMid(e.target.value);
                          setIsDirty(true);
                        }}
                        className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                        aria-label="Choose gradient middle color"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
                      <input
                        type="color"
                        value={normalizeHexColor(gradientEnd, getDefaultGradient(eventBranding.theme).end)}
                        onChange={(e) => {
                          setGradientEnd(e.target.value);
                          setIsDirty(true);
                        }}
                        className="h-10 w-full cursor-pointer rounded-md border border-gray-300 bg-white p-1"
                        aria-label="Choose gradient end color"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Left Emoji</label>
                    <input
                      type="text"
                      value={brandEmojiLeft}
                      onChange={(e) => {
                        setBrandEmojiLeft(e.target.value);
                        setIsDirty(true);
                      }}
                      onFocus={() => setOpenEmojiPicker('left')}
                      onClick={() => setOpenEmojiPicker('left')}
                      className="input-focus-brand w-full min-w-0 p-2 border border-gray-300 rounded-md"
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
                      onChange={(e) => {
                        setBrandEmojiRight(e.target.value);
                        setIsDirty(true);
                      }}
                      onFocus={() => setOpenEmojiPicker('right')}
                      onClick={() => setOpenEmojiPicker('right')}
                      className="input-focus-brand w-full min-w-0 p-2 border border-gray-300 rounded-md"
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

          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 p-4 sm:p-6 border-t border-gray-200 flex-shrink-0 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-gray-700 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn-secondary flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-3 text-white rounded-lg transition-all active:scale-95 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save Event Changes'}
            </button>
          </div>
        </div>
      </PasscodeProtection>
    </div>
  );
}
