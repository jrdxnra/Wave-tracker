'use client';

import { useEffect, useState } from 'react';
import { useWaveStore } from '@/store/waveStore';
import { clientHasMounted, markClientMounted } from '@/lib/clientMounted';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import ConfigurationModal from '@/components/ConfigurationModal';
import EventTimeline from '@/components/EventTimeline';

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
  const { waves, customEvents, eventStartDate, eventStartTime, intervalMinutes, workMinutes, restMinutes, totalWaves, eventBranding, clearCacheAndReload, loadAll } = useWaveStore();
  const [exerciseLeaderboards, setExerciseLeaderboards] = useState<ExerciseLeaderboard[]>([]);
  const [totalLeaderboard, setTotalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [expandedLeaderboard, setExpandedLeaderboard] = useState<string | null>(null);
  const [showAllLeaderboards, setShowAllLeaderboards] = useState<Set<string>>(new Set());

  useEffect(() => {
    markClientMounted();
    setMounted(true);
    // Load fresh global config AND wave data from Firebase on page load
    loadAll();
  }, [loadAll]);

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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Leaderboard...</p>
        </div>
      </div>
    );
  }

  const renderLeaderboard = (entries: LeaderboardEntry[], showWave = true, leaderboardId: string) => {
    const isExpanded = expandedLeaderboard === leaderboardId;
    const showAll = showAllLeaderboards.has(leaderboardId);
    
    // Determine how many entries to display
    let displayedEntries: LeaderboardEntry[];
    if (showAll) {
      displayedEntries = entries; // Show all
    } else if (isExpanded) {
      displayedEntries = entries.slice(0, 100); // Show top 100
    } else {
      displayedEntries = entries.slice(0, 20); // Show top 20
    }
    
    const hasMoreThan20 = entries.length > 20;
    const hasMoreThan100 = entries.length > 100;

    const handleToggleExpand = () => {
      if (isExpanded || showAll) {
        // Collapse back to top 20
        setExpandedLeaderboard(null);
        const newShowAll = new Set(showAllLeaderboards);
        newShowAll.delete(leaderboardId);
        setShowAllLeaderboards(newShowAll);
        
        // Scroll to the top of this leaderboard card
        setTimeout(() => {
          const cardId = leaderboardId === 'total' 
            ? 'leaderboard-card-total' 
            : `leaderboard-card-${leaderboardId}`;
          const element = document.getElementById(cardId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      } else {
        setExpandedLeaderboard(leaderboardId);
      }
    };

    const handleShowAll = () => {
      const newShowAll = new Set(showAllLeaderboards);
      newShowAll.add(leaderboardId);
      setShowAllLeaderboards(newShowAll);
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
      <div id={`leaderboard-${leaderboardId}`} className="space-y-2">
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
            
            {/* Button Logic */}
            {!showAll && !isExpanded && hasMoreThan20 && (
              <button
                onClick={handleToggleExpand}
                className="w-full mt-4 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <span>See More (show top 100)</span>
                <span className="text-lg">▼</span>
              </button>
            )}
            
            {!showAll && isExpanded && (
              <div className="space-y-2 mt-4">
                {hasMoreThan100 && (
                  <button
                    onClick={handleShowAll}
                    className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <span>Show All ({entries.length} total entries)</span>
                    <span className="text-lg">▼▼</span>
                  </button>
                )}
                <button
                  onClick={handleToggleExpand}
                  className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <span>Show Less</span>
                  <span className="text-lg">▲</span>
                </button>
              </div>
            )}
            
            {showAll && (
              <button
                onClick={handleToggleExpand}
                className="w-full mt-4 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <span>Show Less</span>
                <span className="text-lg">▲</span>
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-50 text-gray-900 font-sans">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8 relative">
          <div className="header-gradient p-8">
            <div className="header-emoji header-emoji-left">{eventBranding.emojiLeft}</div>
            <div className="header-emoji header-emoji-right">{eventBranding.emojiRight}</div>
            <div className="pt-8 sm:pt-4">
              <h1 className="text-2xl sm:text-4xl header-title mb-2">{eventBranding.emojiLeft} {eventBranding.title} Leaderboard {eventBranding.emojiRight}</h1>
              <p className="text-white/90">Top performers across all waves</p>
            </div>
          </div>
        </header>

        {/* Event Timeline */}
        <EventTimeline 
          eventStartDate={eventStartDate}
          eventStartTime={eventStartTime}
          intervalMinutes={intervalMinutes}
          workMinutes={workMinutes}
          restMinutes={restMinutes}
          totalWaves={totalWaves}
          totalMovements={customEvents?.length || 8}
        />

        <main>
          {/* Total Reps Leaderboard */}
          <div id="leaderboard-card-total" className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <span className="text-3xl mr-3">🥇</span>
              Total Reps - All Participants
            </h2>
            {renderLeaderboard(totalLeaderboard, true, 'total')}
          </div>

          {/* Exercise-specific Leaderboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {exerciseLeaderboards.map(({ exercise, entries }) => (
              <div key={exercise} id={`leaderboard-card-exercise-${exercise}`} className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
                <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="text-2xl mr-2">💪</span>
                  {exercise.includes('-') ? (
                    <span className="inline-flex flex-col leading-tight">
                      <span>{exercise.split('-')[0]}</span>
                      <span className="text-sm">{exercise.split('-').slice(1).join('-')}</span>
                    </span>
                  ) : (
                    exercise
                  )}
                </h3>
                {renderLeaderboard(entries, true, `exercise-${exercise}`)}
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
    </div>
  );
}



