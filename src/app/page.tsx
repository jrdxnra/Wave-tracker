'use client';

import { useEffect, useState } from 'react';
import { useWaveStore } from '@/store/waveStore';
import WaveQuickViewCard from '@/components/WaveQuickViewCard';
import ConfigurationModal from '@/components/ConfigurationModal';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import PasscodeProtection from '@/components/PasscodeProtection';
import { getFirebase } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const {
    waves,
    eventNotes,
    accessPasscode,
    addWave,
    setEventNotes,
    loadAll,
    syncWithFirebase,
    clearCacheAndReload,
  } = useWaveStore();

  const waveIds = Object.keys(waves);

  const handleManualSave = async () => {
    try {
      // Save event notes to Firebase
      const { db } = getFirebase();
      const configRef = doc(db, 'config', 'global');
      
      await setDoc(configRef, {
        eventNotes: eventNotes,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      // Trigger immediate sync for other users
      await syncWithFirebase();
      
      alert('Event notes saved successfully!');
    } catch (error) {
      console.error('❌ Failed to save event notes:', error);
      alert('Failed to save event notes. Please try again.');
    }
  };

  useEffect(() => {
    setMounted(true);
    // Load data from Firebase on startup (with caching)
    loadAll();
    
    // No automatic syncing on main page - only manual saves
  }, [loadAll]); // Load once on mount

  // Manual save system - users save when ready using the Save Wave button

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Wave Tracker...</p>
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
              <div className="header-emoji header-emoji-left">💪</div>
              <div className="header-emoji header-emoji-right">🔥</div>
              <div className="pt-8 sm:pt-4">
                <h1 className="text-2xl sm:text-4xl header-title mb-2">🔥 G-ROX Wave Tracker 🔥</h1>
                <p className="text-white/90">Manage wave based events with ease</p>
              </div>
            </div>
          </header>

        {/* Total Participant Count Summary */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Total Participants</h2>
                <p className="text-sm text-gray-600">Across all waves</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-orange-600">
                  {Object.values(waves).reduce((total, wave) => total + wave.participants.length, 0)}
                </div>
                <div className="text-sm text-gray-500">
                  {waveIds.length} wave{waveIds.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div id="all-waves-quick-view-container" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {waveIds.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-12">
                  <p className="text-center text-gray-500 mb-6">
                    No waves created yet. Create your first wave to get started!
                  </p>
                  <button
                    onClick={() => addWave()}
                    className="btn-primary text-white rounded-lg shadow-lg px-8 py-4 text-lg font-bold flex flex-col items-center justify-center transform hover:scale-105 transition-all duration-200"
                    title="Add your first wave"
                  >
                    <span className="text-4xl mb-2">+</span>
                    <span>Create First Wave</span>
                  </button>
                </div>
              ) : (
                <>
                  {waveIds.map((id) => <WaveQuickViewCard key={id} wave={waves[id]} />)}
                  {/* Dynamic Add Wave Button positioned as next card */}
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => addWave()}
                      className="btn-primary text-white rounded-lg shadow-lg px-6 py-8 text-sm font-bold flex flex-col items-center justify-center w-full h-full min-h-[200px] transform hover:scale-105 transition-all duration-200"
                      title="Add new wave"
                    >
                      <span className="text-3xl mb-2">+</span>
                      <span>Add Wave</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
            <div id="waves-content-container">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Event Notes & Details:</h3>
                <div className="space-y-3">
                  <textarea
                    value={eventNotes}
                    onChange={(e) => setEventNotes(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 resize-vertical"
                    rows={4}
                    placeholder="Enter event notes, special instructions, or additional details..."
                  />
            <div className="flex justify-center">
              <button
                onClick={handleManualSave}
                className="btn-secondary text-white font-bold py-2 px-4 rounded-md transition duration-300"
              >
                <span className="hidden lg:inline">Save Notes</span>
                <span className="lg:hidden">Save</span>
              </button>
            </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Floating Hamburger Menu */}
      <FloatingHamburgerMenu 
        onConfigClick={() => setIsConfigOpen(true)} 
        currentPage="wave"
      />


      
      <ConfigurationModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)}
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
