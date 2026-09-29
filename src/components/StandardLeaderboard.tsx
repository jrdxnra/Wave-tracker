'use client';

import { useEffect, useState } from 'react';
import ConfigurationModal from '@/components/ConfigurationModal';
import EventPageHeader from '@/components/EventPageHeader';
import EventTimeline from '@/components/EventTimeline';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import LoadingState from '@/components/LoadingState';
import { clientHasMounted, markClientMounted } from '@/lib/clientMounted';
import { useWaveStore } from '@/store/waveStore';

type LeaderboardEntry = {
  name: string;
  value: number;
  waveName: string;
};

type ExerciseLeaderboard = {
  exercise: string;
  unit: string;
  entries: LeaderboardEntry[];
};

export default function StandardLeaderboard() {
  const {
    waves,
    customEvents,
    movementUnits,
    olympicLiftMovements,
    eventStartDate,
    eventStartTime,
    intervalMinutes,
    workMinutes,
    restMinutes,
    totalWaves,
    eventBranding,
    clearCacheAndReload,
    themeColors,
    isDataLoaded,
    eventClockEnabled,
    activeEventId,
  } = useWaveStore();
  const [mounted, setMounted] = useState(clientHasMounted);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [totalTopN, setTotalTopN] = useState(10);
  const [expandedMovements, setExpandedMovements] = useState<Record<string, boolean>>({});
  const [exerciseLeaderboards, setExerciseLeaderboards] = useState<ExerciseLeaderboard[]>([]);
  const [totalLeaderboard, setTotalLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    markClientMounted();
    setMounted(true);
    void clearCacheAndReload();
  }, [clearCacheAndReload, activeEventId]);

  useEffect(() => {
    if (!mounted) return;

    const exerciseData: Record<string, LeaderboardEntry[]> = Object.fromEntries(
      customEvents.map((event) => [event, []]),
    );
    const totalData: Record<string, LeaderboardEntry> = {};

    Object.values(waves).forEach((wave) => {
      wave.participants.forEach((participant) => {
        if (participant.includeInLeaderboard === false) return;

        let total = 0;
        customEvents.forEach((event) => {
          if (olympicLiftMovements.includes(event) && participant.olympicLiftsOptIn !== true) return;
          const value = Number.parseFloat((participant.waveData || {})[event] || '') || 0;
          if (value <= 0) return;
          exerciseData[event].push({ name: participant.name, value, waveName: wave.name });
          total += value;
        });

        if (total > 0) {
          const key = participant.id || `${wave.id}:${participant.name}`;
          totalData[key] = { name: participant.name, value: total, waveName: wave.name };
        }
      });
    });

    setExerciseLeaderboards(customEvents.map((exercise) => ({
      exercise,
      unit: movementUnits[exercise] || 'reps',
      entries: exerciseData[exercise].sort((a, b) => b.value - a.value),
    })));
    setTotalLeaderboard(Object.values(totalData).sort((a, b) => b.value - a.value));
  }, [mounted, waves, customEvents, movementUnits, olympicLiftMovements]);

  if (!mounted || !isDataLoaded) {
    return <LoadingState message="Loading Leaderboard..." />;
  }

  const renderEntries = (entries: LeaderboardEntry[], unit: string, limit?: number) => {
    const visibleEntries = typeof limit === 'number' ? entries.slice(0, limit) : entries;
    return visibleEntries.length === 0 ? (
      <p className="py-5 text-center text-gray-500">No data available</p>
    ) : (
      <div className="space-y-2">
        {visibleEntries.map((entry, index) => {
          const previous = visibleEntries[index - 1];
          const rank = previous?.value === entry.value
            ? visibleEntries.findIndex((candidate) => candidate.value === entry.value) + 1
            : index + 1;
          return (
            <div key={`${entry.name}-${index}`} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${themeColors.start}, ${themeColors.mid})` }}
                >
                  {rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{entry.name}</p>
                  <p className="text-xs text-gray-500">{entry.waveName}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold" style={{ color: themeColors.accent }}>{entry.value}</p>
                <p className="text-xs text-gray-500">{unit}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <EventPageHeader
          eventBranding={eventBranding}
          pageLabel="Leaderboard"
          subtitle="Top performers across all waves"
        />

        {eventClockEnabled && (
          <EventTimeline
            eventStartDate={eventStartDate}
            eventStartTime={eventStartTime}
            intervalMinutes={intervalMinutes}
            workMinutes={workMinutes}
            restMinutes={restMinutes}
            totalWaves={totalWaves}
            totalMovements={customEvents.length || 8}
          />
        )}

        <main>
          <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <div className="mb-6 flex items-center gap-3 overflow-x-auto">
              <span className="text-3xl">🥇</span>
              <h2 className="whitespace-nowrap text-2xl font-semibold">Total Score</h2>
              <div className="flex gap-1">
                {[10, 20, 50, 100].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTotalTopN(count)}
                    className="grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold"
                    style={totalTopN === count ? {
                      color: '#fff',
                      borderColor: themeColors.accent,
                      background: `linear-gradient(135deg, ${themeColors.start}, ${themeColors.end})`,
                    } : {
                      color: themeColors.accentHover,
                      borderColor: `${themeColors.mid}55`,
                      backgroundColor: `${themeColors.end}18`,
                    }}
                    aria-label={`Show top ${count}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            {renderEntries(totalLeaderboard, 'points', totalTopN)}
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {exerciseLeaderboards.map(({ exercise, unit, entries }) => {
              const isExpanded = expandedMovements[exercise] === true;
              return (
                <section key={exercise}>
                  <button
                    type="button"
                    onClick={() => setExpandedMovements((current) => ({ ...current, [exercise]: !isExpanded }))}
                    className={`flex w-full items-center rounded-lg px-4 py-3 text-left text-lg font-semibold ${isExpanded ? 'rounded-b-none border border-b-0 border-gray-200 bg-white text-gray-900' : 'text-white'}`}
                    style={!isExpanded ? { backgroundColor: themeColors.accent } : undefined}
                  >
                    <span className="mr-2 text-2xl">💪</span>
                    {exercise}
                  </button>
                  {isExpanded && (
                    <div className="rounded-b-lg border border-t-0 border-gray-200 bg-white p-4 shadow">
                      {renderEntries(entries, unit)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      </div>

      <FloatingHamburgerMenu onSettingsClick={() => setIsConfigOpen(true)} currentPage="leaderboard" />
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        initialTab="movement"
        onClearCache={async () => {
          await clearCacheAndReload();
          window.location.reload();
        }}
      />
    </div>
  );
}
