// TODO: Future improvement
// - Implement global client tracking so that a participant's results can be aggregated across events.
// - Each participant should reference a global client ID (not just name).
// - This will allow tracking attendance, performance, and improvements across events.
// - For now, leaderboard is event-scoped and safe from cross-event leakage.
'use client';

import { useEffect, useState } from 'react';
import { useWaveStore } from '@/store/waveStore';
import { clientHasMounted, markClientMounted } from '@/lib/clientMounted';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import ConfigurationModal from '@/components/ConfigurationModal';
import EventTimeline from '@/components/EventTimeline';
import EventClock from '@/components/EventClock';

interface LeaderboardEntry {
  name: string;
  value: number;
  waveName: string;
}

interface ExerciseLeaderboard {
  exercise: string;
  entries: LeaderboardEntry[];
}


export default function Leaderboard() {
  const [mounted, setMounted] = useState(clientHasMounted);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<'movement' | 'event'>('movement');
  const { waves, customEvents, eventStartDate, eventStartTime, intervalMinutes, workMinutes, restMinutes, totalWaves, eventBranding, clearCacheAndReload, loadAll, feedbackEnabled, submitFeedback, themeColors, isDataLoaded, eventClockEnabled, alertSettings, activeEventId } = useWaveStore();
  const [exerciseLeaderboards, setExerciseLeaderboards] = useState<ExerciseLeaderboard[]>([]);
  const [totalLeaderboard, setTotalLeaderboard] = useState<LeaderboardEntry[]>([]);
  // State for top N selection for Total leaderboard
  const [totalTopN, setTotalTopN] = useState(10);
  // Accordion state for movement leaderboards (Total always open)
  const [expandedMovements, setExpandedMovements] = useState<Record<string, boolean>>(() => ({}));
  const [showAllLeaderboards, setShowAllLeaderboards] = useState<Set<string>>(new Set());
  // On first load, collapse all movements
  useEffect(() => {
    if (exerciseLeaderboards.length > 0) {
      const collapsed: Record<string, boolean> = {};
      exerciseLeaderboards.forEach(lb => { collapsed[lb.exercise] = false; });
      setExpandedMovements(collapsed);
    }
  }, [exerciseLeaderboards.length]);
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState('');

  // Always reload all event data when activeEventId changes (force cache clear)
  useEffect(() => {
    markClientMounted();
    setMounted(true);
    clearCacheAndReload();
  }, [clearCacheAndReload, activeEventId]);

  useEffect(() => {
    if (!mounted || !waves || !customEvents) return;

    // Process all wave data to create leaderboards
    const exerciseData: Record<string, LeaderboardEntry[]> = {};
    const totalData: Record<string, { name: string; total: number; waveName: string }> = {};

    // Initialize exercise data
    customEvents.forEach(event => {
      exerciseData[event] = [];
    });

    // Process each wave
    Object.values(waves).forEach(wave => {
      wave.participants.forEach(participant => {
        // Skip participants who have explicitly opted out of the leaderboard
        if (participant.includeInLeaderboard === false) {
          return;
        }
        
        let participantTotal = 0;
        const participantKey = participant.name;

        // Process each exercise
        customEvents.forEach(event => {
          const valueStr = (participant.waveData || {})[event] || '';
          const value = parseFloat(valueStr) || 0;
          
          if (value > 0) {
            exerciseData[event].push({
              name: participant.name,
              value: value,
              waveName: wave.name
            });
            participantTotal += value;
          }
        });

        // Add to total leaderboard
        if (participantTotal > 0) {
          totalData[participantKey] = {
            name: participant.name,
            total: participantTotal,
            waveName: wave.name
          };
        }
      });
    });

    // Sort ALL entries for each exercise (no limit)
    const sortedExerciseLeaderboards: ExerciseLeaderboard[] = customEvents.map(event => ({
      exercise: event,
      entries: exerciseData[event]
        .sort((a, b) => b.value - a.value)
    }));

    // Sort ALL entries for total leaderboard (no limit)
    const sortedTotalLeaderboard = Object.values(totalData)
      .sort((a, b) => b.total - a.total)
      .map(entry => ({
        name: entry.name,
        value: entry.total,
        waveName: entry.waveName
      }));

    setExerciseLeaderboards(sortedExerciseLeaderboards);
    setTotalLeaderboard(sortedTotalLeaderboard);
  }, [mounted, waves, customEvents]);

  // Show loading spinner if not mounted or data not loaded
  if (!mounted || !isDataLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Leaderboard...</p>
        </div>
      </div>
    );
  }

  // Show empty state if no waves for this event
  if (!waves || Object.keys(waves).length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">😶‍🌫️</div>
          <p className="text-gray-600">No waves found for this event.<br/>Start by adding a wave or check your event selection.</p>
        </div>
      </div>
    );
  }

  // Accordion-aware leaderboard renderer
  // Add topN param for limiting entries (used for Total only)
  const renderLeaderboard = (entries: LeaderboardEntry[], showWave = true, leaderboardId: string, isAccordion: boolean = false, topN?: number) => {
    // For movements, use accordion state; for total, always expanded
    const isExpanded = leaderboardId === 'total' ? true : expandedMovements[leaderboardId.replace('exercise-', '')];
    const showAll = showAllLeaderboards.has(leaderboardId);
    let displayedEntries: LeaderboardEntry[];
    if (leaderboardId === 'total' && typeof topN === 'number') {
      displayedEntries = entries.slice(0, topN);
    } else if (showAll) {
      displayedEntries = entries;
    } else if (isExpanded) {
      displayedEntries = entries.slice(0, 100);
    } else {
      displayedEntries = entries.slice(0, 20);
    }

    // Accordion toggle for movements only
    const handleAccordionToggle = () => {
      if (!isAccordion) return;
      setExpandedMovements(prev => ({ ...prev, [leaderboardId.replace('exercise-', '')]: !prev[leaderboardId.replace('exercise-', '')] }));
    };

    // Calculate ranks with tie handling (dense ranking: 1-2-2-3)
    const calculateRank = (index: number, currentValue: number, entries: LeaderboardEntry[]): number => {
      if (index === 0) return 1;
      
      const prevRank = calculateRank(index - 1, entries[index - 1].value, entries);
      
      // If same value as previous entry, use same rank
      if (entries[index - 1]?.value === currentValue) {
        return prevRank;
      }
      
      // Otherwise, increment rank by 1 (dense ranking)
      return prevRank + 1;
    };

    return (
      <div id={`leaderboard-${leaderboardId}`} className="space-y-0">
        {/* Accordion header for movements (always visible) */}
        {isAccordion && (
          <div
            className={`cursor-pointer px-4 py-3 rounded-t-lg font-semibold text-lg flex items-center select-none transition-colors duration-200 border border-b-0 ${isExpanded ? 'bg-white text-gray-900 border-gray-200' : ''}`}
            style={{
              background: !isExpanded ? themeColors.accent : undefined,
              color: !isExpanded ? '#fff' : undefined,
            }}
            onClick={handleAccordionToggle}
          >
            <span className="text-2xl mr-2">💪</span>
            {leaderboardId.replace('exercise-', '')}
          </div>
        )}
        {/* Leaderboard content, only visible if expanded or not accordion */}
        {(leaderboardId === 'total' || isExpanded) && (
          <div className={isAccordion ? 'p-4 bg-white rounded-b-lg shadow border border-gray-200 border-t-0' : ''}>
            {entries.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No data available</p>
            ) : (
              <>
                {displayedEntries.map((entry, index) => {
                  const rank = calculateRank(index, entry.value, entries);
                  const isTied = index > 0 && entries[index - 1]?.value === entry.value;
                  return (
                    <div key={`${entry.name}-${index}`} className="flex items-center justify-between bg-white p-3 rounded-lg shadow border border-gray-200">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-orange-600 text-white rounded-full font-bold text-sm">
                          {rank}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 flex items-center gap-2">
                            {entry.name}
                            {isTied && <span className="text-xs text-orange-600 font-normal">(tied)</span>}
                          </div>
                          {showWave && <div className="text-xs text-gray-500">{entry.waveName}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-orange-600">{entry.value}</div>
                        <div className="text-xs text-gray-500">reps</div>
                      </div>
                    </div>
                  );
                })}
                {/* Button Logic (optional, can be removed if not needed) */}
                {!showAll && entries.length > 100 && (
                  <button
                    onClick={() => setShowAllLeaderboards(prev => new Set(prev).add(leaderboardId))}
                    className="w-full mt-4 py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <span>Show All ({entries.length} total entries)</span>
                  </button>
                )}
                {showAll && (
                  <button
                    onClick={() => setShowAllLeaderboards(prev => { const next = new Set(prev); next.delete(leaderboardId); return next; })}
                    className="w-full mt-4 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <span>Show Less</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleFeedbackSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedMessage = feedbackMessage.trim();
    if (!trimmedMessage) {
      setFeedbackStatus('Please enter feedback before submitting.');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      await submitFeedback(feedbackRating, trimmedMessage);
      setFeedbackMessage('');
      setFeedbackRating(5);
      setFeedbackStatus('Thanks. Your feedback was saved.');
    } catch (error) {
      console.error('❌ Failed to submit leaderboard feedback:', error);
      setFeedbackStatus('Feedback could not be saved. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="bg-gray-50 text-gray-900 font-sans">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8 relative">
          <div className="header-gradient p-8">
            <div className="header-emoji header-emoji-left">{eventBranding.emojiLeft}</div>
            <div className="header-emoji header-emoji-right">{eventBranding.emojiRight}</div>
            <div className="pt-8 sm:pt-4">
              <h1 className="text-2xl sm:text-5xl header-title mb-2 w-full flex-nowrap flex items-center font-bold overflow-hidden justify-center gap-0.5 sm:gap-3" style={{lineHeight: 1.05}}>
                <span className="text-base sm:text-2xl shrink-0 px-0.5">{eventBranding.emojiLeft}</span>
                <span className="hidden sm:inline truncate flex-shrink px-1">{eventBranding.title} </span>
                <span className="truncate flex-shrink px-1">Leaderboard</span>
                <span className="text-base sm:text-2xl shrink-0 px-0.5">{eventBranding.emojiRight}</span>
              </h1>
              <p className="text-white/90">Top performers across all waves</p>
            </div>
          </div>
        </header>

        {/* Event Timeline (game day only) */}
        {eventClockEnabled && (
          <EventTimeline 
            eventStartDate={eventStartDate}
            eventStartTime={eventStartTime}
            intervalMinutes={intervalMinutes}
            workMinutes={workMinutes}
            restMinutes={restMinutes}
            totalWaves={totalWaves}
            totalMovements={customEvents?.length || 8}
          />
        )}

        <main>
          {/* Total Reps Leaderboard (always expanded, not collapsible) */}
          <div id="leaderboard-card-total" className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-8">
            <div className="flex flex-row items-center justify-between mb-6 gap-x-2 flex-nowrap w-full">
              <div className="flex items-center gap-x-2 flex-nowrap">
                <span className="text-2xl mr-1">🥇</span>
                <h2 className="text-xl font-semibold text-gray-900 flex items-center whitespace-nowrap px-0 flex-shrink-0">
                  Total Reps - All
                </h2>
              </div>
              {/* Top-N selector - always inline with title */}
              <div className="flex flex-row flex-nowrap items-center gap-x-1 ml-2">
                {[10, 20, 50, 100].map(n => (
                  <button
                    key={n}
                    onClick={() => setTotalTopN(n)}
                    className={`
                      flex items-center justify-center rounded-full border font-semibold transition-colors duration-150
                      text-xs
                      w-6 h-6 sm:w-8 sm:h-8
                      p-0
                      ${totalTopN === n ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-orange-50'}
                    `}
                    style={{ minWidth: '1.5rem', minHeight: '1.5rem' }}
                    aria-label={`Show top ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {renderLeaderboard(totalLeaderboard, true, 'total', false, totalTopN)}
          </div>

          {/* Exercise-specific Leaderboards as accordions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {exerciseLeaderboards.map(({ exercise, entries }) => (
              <div key={exercise} id={`leaderboard-card-exercise-${exercise}`} className="mb-6">
                {renderLeaderboard(entries, true, `exercise-${exercise}`, true)}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Floating Hamburger Menu */}
      <FloatingHamburgerMenu 
        onSettingsClick={() => {
          setConfigInitialTab('movement');
          setIsConfigOpen(true);
        }}
        currentPage="leaderboard"
      />
      
      {/* Configuration Modal */}
      <ConfigurationModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)}
        initialTab={configInitialTab}
        onClearCache={async () => {
          await clearCacheAndReload();
          alert('✅ Cache cleared! Fresh data loaded from Firebase.');
          window.location.reload();
        }}
      />

      {feedbackEnabled && (
        <div className="fixed bottom-24 right-4 z-40 w-[calc(100%-1rem)] max-w-sm sm:right-6 sm:w-96">
          <form
            onSubmit={handleFeedbackSubmit}
            className="rounded-2xl border border-black/5 bg-white/95 p-4 shadow-2xl backdrop-blur"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Feedback</h2>
                <p className="text-xs text-gray-500">Rate this event and leave a note.</p>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFeedbackRating(star)}
                    className="text-xl leading-none transition-transform hover:scale-110"
                    aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                    style={{ color: star <= feedbackRating ? themeColors.accent : '#d1d5db' }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={feedbackMessage}
              onChange={(e) => {
                setFeedbackMessage(e.target.value);
                if (feedbackStatus) {
                  setFeedbackStatus('');
                }
              }}
              rows={4}
              maxLength={600}
              placeholder="What worked well, what felt off, or what should change next time?"
              className="mb-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2"
              style={{ borderColor: '#e5e7eb' }}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {feedbackStatus || `${feedbackMessage.trim().length}/600`}
              </div>
              <button
                type="submit"
                disabled={isSubmittingFeedback || !feedbackMessage.trim()}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: themeColors.accent }}
              >
                {isSubmittingFeedback ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}



