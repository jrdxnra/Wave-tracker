'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWaveStore } from '@/store/waveStore';
import { clientHasMounted, markClientMounted } from '@/lib/clientMounted';
import PerformanceTable from '@/components/PerformanceTable';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import ConfigurationModal from '@/components/ConfigurationModal';
import EventClock from '@/components/EventClock';
import PasscodeProtection from '@/components/PasscodeProtection';

export default function PerformancePage() {
  const { waves, currentWaveId, eventStartDate, eventStartTime, totalWaves, intervalMinutes, workMinutes, restMinutes, alertSettings, accessPasscode, eventBranding, activeEventId, eventClockEnabled, markWaveAsActive, markWaveAsInactive, clearCacheAndReload, loadAll, setUserActivity, isDataLoaded } = useWaveStore();

  const [mounted, setMounted] = useState(clientHasMounted);
  // Pre-initialize as complete when store already has data (instant page transitions)
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(isDataLoaded);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<'movement' | 'event'>('movement');
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null);
  const router = useRouter();
  const waveIds = Object.keys(waves);
  
  // Use local selectedWaveId for tab persistence, fallback to currentWaveId
  const activeWaveId = selectedWaveId || currentWaveId;
  const currentWave = activeWaveId ? waves[activeWaveId] : null;

  useEffect(() => {
    let isCancelled = false;
    markClientMounted();
    setMounted(true);
    (async () => {
      await loadAll();
      if (!isCancelled) {
        setIsInitialLoadComplete(true);
      }
    })();
    
    // Handle pull-to-refresh on mobile
    const handleRefresh = async () => {
      await loadAll();
    };
    
    // Listen for visibility change (happens on pull-to-refresh)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleRefresh();
      }
    };
    
    // Listen for page show event (happens on pull-to-refresh)
    const handlePageShow = () => {
      handleRefresh();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [loadAll, isDataLoaded]);

  // No background sync - only sync on page load and after saves

  // Initialize selected wave when waves are loaded
  useEffect(() => {
    if (waveIds.length > 0 && !selectedWaveId) {
      // Try to restore from localStorage first
      const savedWaveId = localStorage.getItem(`performance-selected-wave:${activeEventId}`);
      if (savedWaveId && waveIds.includes(savedWaveId)) {
        setSelectedWaveId(savedWaveId);
      } else {
        setSelectedWaveId(currentWaveId || waveIds[0]);
      }
    }
  }, [waveIds, currentWaveId, selectedWaveId, activeEventId]);

  // Save selected wave to localStorage when it changes
  useEffect(() => {
    if (selectedWaveId) {
      localStorage.setItem(`performance-selected-wave:${activeEventId}`, selectedWaveId);
    }
  }, [selectedWaveId, activeEventId]);

  // Mark wave as active when selected, inactive when deselected
  useEffect(() => {
    if (activeWaveId) {
      markWaveAsActive(activeWaveId);
    }
    
    // Cleanup: mark as inactive when component unmounts
    return () => {
      if (activeWaveId) {
        markWaveAsInactive(activeWaveId);
      }
    };
  }, [activeWaveId, markWaveAsActive, markWaveAsInactive]);

  if (!mounted || !isInitialLoadComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Performance Tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <PasscodeProtection requiredPasscode={accessPasscode}>
      <div className="bg-gray-50 text-gray-900 font-sans">
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
          <header className="text-center mb-8 relative">
            <div className="header-gradient p-8">
              <div className="header-emoji header-emoji-left">{eventBranding.emojiLeft}</div>
              <div className="header-emoji header-emoji-right">{eventBranding.emojiRight}</div>
              <div className="pt-8 sm:pt-4">
                <h1 className="text-2xl sm:text-4xl header-title mb-2">{eventBranding.emojiLeft} {eventBranding.title} Performance {eventBranding.emojiRight}</h1>
                <p className="text-white/90">Record workout performance data for all waves</p>
              </div>
            </div>
          </header>

        <main>
          {waveIds.length === 0 ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">No Waves Available</h2>
              <p className="text-gray-600 mb-6">Create waves in the configuration page first.</p>
              <button
                onClick={() => router.push('/')}
                className="btn-primary text-white px-6 py-2 rounded-lg"
              >
                Go to Wave Configuration
              </button>
            </div>
          ) : (
            <div>
              {/* Wave Selection Grid */}
              <div className="mb-8">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Wave</h3>
                  
                  {/* Wave Grid */}
                  <div className="grid grid-cols-7 gap-2">
                    {waveIds.map((id) => (
                      <button
                        key={id}
                        onClick={() => {
                          setSelectedWaveId(id);
                          setUserActivity(); // Mark user as active when selecting wave
                        }}
                        className={`font-bold py-2 px-3 rounded-md transition duration-300 text-sm flex items-center justify-center ${
                          activeWaveId === id
                            ? 'btn-primary text-white'
                            : 'btn-secondary text-white'
                        }`}
                      >
                        <span className="hidden lg:inline">{waves[id].name}</span>
                        <span className="lg:hidden">{waves[id].name.replace('Wave ', '')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Event Clock */}
              {eventClockEnabled && (
                <EventClock 
                  eventStartDate={eventStartDate}
                  eventStartTime={eventStartTime}
                  intervalMinutes={intervalMinutes}
                  workMinutes={workMinutes}
                  restMinutes={restMinutes}
                  totalWaves={totalWaves}
                  alertSettings={alertSettings}
                  enableAlerts={true}
                />
              )}

              {/* Performance Table */}
              {currentWave ? (
            <PerformanceTable wave={currentWave} />
              ) : (
                <div className="text-center py-12">
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">Select a Wave</h3>
                  <p className="text-gray-600">Choose a wave tab above to start recording performance data.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Floating Hamburger Menu */}
      <FloatingHamburgerMenu 
        onSettingsClick={() => {
          setConfigInitialTab('movement');
          setIsConfigOpen(true);
        }}
        currentPage="performance"
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
    </PasscodeProtection>
  );
}


