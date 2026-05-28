"use client";

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Participant, Wave, WAVE_EVENTS } from '@/types';
import { getFirebase } from '@/lib/firebase';
import { collection, doc, setDoc, writeBatch, serverTimestamp, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { secureLogger } from '@/lib/secureLogger';

interface WaveStore {
  waves: Record<string, Wave>;
  currentWaveId: string | null;
  eventNotes: string;
  customEvents: string[];
  intervalMinutes: number;
  workMinutes: number;
  restMinutes: number;
  maxParticipants: number;
  workoutTimerWorkSeconds: number;
  workoutTimerRestSeconds: number;
  eventStartDate: string; // Format: "YYYY-MM-DD"
  eventStartTime: string; // Format: "HH:mm" (24-hour)
  totalWaves: number;
  accessPasscode: string; // Passcode for protecting pages
  // Alert settings are hardcoded - always enabled with beep sound and flash visual
  alertSettings: {
    workRestTransitions: boolean;
    eventStartEnd: boolean;
    soundType: 'beep';
    visualEffect: 'flash';
  };
  lastSavedAt: number | null;
  isDataLoaded: boolean;
  lastFirebaseSync: number | null;
  activeWaves: Set<string>; // Track which waves are being actively edited
  lastUserActivity: number | null; // Track user activity for smart sync
  isUserActive: boolean; // Whether user is currently active
  syncInterval: number; // Dynamic sync interval based on activity

  addWave: (name?: string) => string;
  deleteWave: (waveId: string) => Promise<void>;
  setCurrentWave: (waveId: string) => void;
  updateWave: (waveId: string, updates: Partial<Wave>) => void;

  addParticipant: (waveId: string, name: string) => Promise<void>;
  deleteParticipant: (waveId: string, participantId: string) => Promise<void>;
  updateParticipantData: (waveId: string, participantId: string, field: string, value: string) => void;
  updateParticipantName: (waveId: string, participantId: string, name: string) => void;
  updateParticipantLeaderboardStatus: (waveId: string, participantId: string, includeInLeaderboard: boolean) => Promise<void>;

  setEventNotes: (notes: string) => void;
  updateWaveEvents: (events: string[]) => Promise<void>;
  setTimingConfig: (intervalMinutes: number, workMinutes: number, restMinutes: number) => Promise<void>;
  setMaxParticipants: (maxParticipants: number) => Promise<void>;
  setWorkoutTimerConfig: (workSeconds: number, restSeconds: number) => Promise<void>;
  setEventConfig: (startDate: string, startTime: string, totalWaves: number) => Promise<void>;
  setAccessPasscode: (passcode: string) => Promise<void>;
  saveAll: () => Promise<void>;
  loadAll: () => Promise<void>;
  loadGlobalConfig: () => Promise<void>;
  invalidateCache: () => void;
  clearCacheAndReload: () => Promise<void>;
  syncWithFirebase: () => Promise<void>;
  syncWithFirebaseNoCooldown: () => Promise<void>;
  fullSyncWithFirebase: () => Promise<void>;
  markWaveAsActive: (waveId: string) => void;
  markWaveAsInactive: (waveId: string) => void;
  forceUpdateAllParticipants: () => Promise<void>;
  setUserActivity: () => void; // Mark user as active
  setSyncInterval: (interval: number) => void; // Set sync interval
}

const createInitialWaveData = (events: string[]): Record<string, string> =>
  events.reduce((acc, e) => {
    acc[e] = '';
    return acc;
  }, {} as Record<string, string>);

export const useWaveStore = create<WaveStore>()(
  persist(
    (set, get) => ({
      waves: {},
      currentWaveId: null,
      eventNotes: '',
      customEvents: WAVE_EVENTS,
      intervalMinutes: 5,
      workMinutes: 3,
      restMinutes: 2,
      maxParticipants: 10,
      workoutTimerWorkSeconds: 60,
      workoutTimerRestSeconds: 30,
      eventStartDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      eventStartTime: '08:00',
      totalWaves: 30,
      accessPasscode: '54321Blastoff!', // Default passcode
      // Alert settings are hardcoded - always enabled with beep sound and flash visual
      alertSettings: {
        workRestTransitions: true,
        eventStartEnd: true,
        soundType: 'beep',
        visualEffect: 'flash'
      },
      lastSavedAt: null,
      isDataLoaded: false,
      lastFirebaseSync: null,
      activeWaves: new Set<string>(),
      lastUserActivity: null,
      isUserActive: false,
      syncInterval: 10000, // Start with 10 seconds, will be optimized based on activity

      addWave: (name?: string) => {
        const id = `wave${Date.now()}`;
        // Find the highest wave number and add 1
        const existingWaves = Object.values(get().waves);
        const waveNumbers = existingWaves.map(wave => {
          const match = wave.name.match(/Wave (\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        });
        const maxWaveNumber = waveNumbers.length > 0 ? Math.max(...waveNumbers) : 0;
        const nextWaveNumber = maxWaveNumber + 1;
        
        const wave: Wave = {
          id,
          name: name || `Wave ${nextWaveNumber}`,
          participants: [],
          startTime: '',
        };
        set((s) => ({ waves: { ...s.waves, [id]: wave }, currentWaveId: id }));
        return id;
      },

      deleteWave: async (waveId) => {
        const waves = { ...get().waves };
        delete waves[waveId];
        const remaining = Object.keys(waves);
        set({ waves, currentWaveId: remaining[0] ?? null });
        
        // Delete from Firebase
        try {
          const { db } = getFirebase();
          const waveRef = doc(collection(db, 'waves'), waveId);
          
          // Delete all participants in this wave first
          const participantsSnapshot = await getDocs(collection(waveRef, 'participants'));
          const deletePromises = participantsSnapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          
          // Delete the wave document
          await deleteDoc(waveRef);
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          secureLogger.error('❌ Failed to delete wave from Firebase:', error);
          alert('Failed to delete wave from Firebase. Please try again.');
        }
      },

      setCurrentWave: (waveId) => set({ currentWaveId: waveId }),

      updateWave: (waveId, updates) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        set((s) => ({ waves: { ...s.waves, [waveId]: { ...wave, ...updates } } }));
      },

      addParticipant: async (waveId, name) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Check if adding this participant would exceed the limit
        const { maxParticipants } = get();
        if (wave.participants.length >= maxParticipants) {
          alert(`Cannot add more participants. Maximum limit is ${maxParticipants} per wave.`);
          return;
        }
        
        const participant: Participant = {
          id: `p-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name,
          waveData: createInitialWaveData(get().customEvents),
          includeInLeaderboard: true, // Default to checked - must opt out
        };
        
        const updatedWave = { ...wave, participants: [...wave.participants, participant] };
        
        // Update local state immediately
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(collection(db, 'waves'), waveId);
          
          // Save wave document
          await setDoc(waveRef, {
            id: waveId,
            name: updatedWave.name,
            startTime: updatedWave.startTime,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Save participant to subcollection
          const participantRef = doc(collection(waveRef, 'participants'), participant.id);
          await setDoc(participantRef, {
            id: participant.id,
            name: participant.name,
            waveData: participant.waveData,
            includeInLeaderboard: participant.includeInLeaderboard,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          secureLogger.error('❌ Failed to save participant to Firebase:', error);
          alert('Failed to save participant. Please try again.');
        }
      },

      deleteParticipant: async (waveId, participantId) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Update local state immediately
        const updatedParticipants = wave.participants.filter((p) => p.id !== participantId);
        const updatedWave = { ...wave, participants: updatedParticipants };
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Delete from Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(collection(db, 'waves'), waveId);
          const participantRef = doc(collection(waveRef, 'participants'), participantId);
          
          await deleteDoc(participantRef);
          
          // Also update the wave document metadata
          await setDoc(waveRef, {
            id: waveId,
            name: updatedWave.name,
            startTime: updatedWave.startTime,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Trigger immediate sync for other users
          await get().syncWithFirebase();
        } catch (error) {
          console.error('❌ Failed to delete participant from Firebase:', error);
          alert('Failed to delete participant from Firebase. Please try again.');
        }
      },

      updateParticipantData: (waveId, participantId, field, value) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Mark user as active when they're typing
        get().setUserActivity();
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: {
              ...wave,
              participants: wave.participants.map((p) =>
                p.id === participantId ? { ...p, waveData: { ...p.waveData, [field]: value } } : p
              ),
            },
          },
        }));
      },

      updateParticipantName: (waveId, participantId, name) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: {
              ...wave,
              participants: wave.participants.map((p) =>
                p.id === participantId ? { ...p, name } : p
              ),
            },
          },
        }));
      },

      updateParticipantLeaderboardStatus: async (waveId, participantId, includeInLeaderboard) => {
        const wave = get().waves[waveId];
        if (!wave) return;
        
        // Update local state immediately
        const updatedParticipants = wave.participants.map((p) =>
          p.id === participantId ? { ...p, includeInLeaderboard } : p
        );
        const updatedWave = { ...wave, participants: updatedParticipants };
        
        set((s) => ({
          waves: {
            ...s.waves,
            [waveId]: updatedWave,
          },
        }));
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const waveRef = doc(collection(db, 'waves'), waveId);
          const participantRef = doc(collection(waveRef, 'participants'), participantId);
          
          await setDoc(participantRef, {
            includeInLeaderboard,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          
          // Don't sync immediately - local state is already updated and Firebase is saved
          // Other users will pick up changes on their next sync interval
        } catch (error) {
          console.error('❌ Failed to update leaderboard status in Firebase:', error);
          alert('Failed to update leaderboard status. Please try again.');
        }
      },

      setEventNotes: (notes) => set({ eventNotes: notes }),
      
      setTimingConfig: async (intervalMinutes, workMinutes, restMinutes) => {
        set({ intervalMinutes, workMinutes, restMinutes });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            timing: {
              intervalMinutes,
              workMinutes,
              restMinutes
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save timing config to Firebase:', error);
        }
      },
      
      setMaxParticipants: async (maxParticipants) => {
        set({ maxParticipants });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            maxParticipants,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save max participants to Firebase:', error);
        }
      },

      setWorkoutTimerConfig: async (workSeconds, restSeconds) => {
        set({ workoutTimerWorkSeconds: workSeconds, workoutTimerRestSeconds: restSeconds });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            workoutTimer: {
              workSeconds,
              restSeconds
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save workout timer config to Firebase:', error);
        }
      },

      setEventConfig: async (startDate, startTime, totalWaves) => {
        set({ eventStartDate: startDate, eventStartTime: startTime, totalWaves: totalWaves });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            event: {
              startDate,
              startTime,
              totalWaves
            },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save event config to Firebase:', error);
        }
      },

      setAccessPasscode: async (passcode) => {
        set({ accessPasscode: passcode });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            accessPasscode: passcode,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (error) {
          console.error('❌ Failed to save access passcode to Firebase:', error);
        }
      },

      updateWaveEvents: async (events) => {
        set({ customEvents: events });
        
        // Update all existing participants to include new events
        const waves = get().waves;
        const updatedWaves = Object.keys(waves).reduce((acc, waveId) => {
          const wave = waves[waveId];
          const updatedParticipants = wave.participants.map(participant => ({
            ...participant,
            waveData: {
              ...participant.waveData,
              ...createInitialWaveData(events)
            }
          }));
          acc[waveId] = { ...wave, participants: updatedParticipants };
          return acc;
        }, {} as Record<string, Wave>);
        set({ waves: updatedWaves });
        
        // Save to Firebase immediately
        try {
          const { db } = getFirebase();
          
          // Save config to Firebase
          const configRef = doc(db, 'config', 'global');
          await setDoc(configRef, {
            customEvents: events,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          // Update all existing participants in Firebase with new events
          
          for (const [waveId, wave] of Object.entries(updatedWaves)) {
            const waveRef = doc(db, 'waves', waveId);
            const participantsCol = collection(waveRef, 'participants');
            
            for (const participant of wave.participants) {
              const participantRef = doc(participantsCol, participant.id);
              await setDoc(participantRef, {
                id: participant.id,
                name: participant.name,
                waveData: participant.waveData,
                includeInLeaderboard: participant.includeInLeaderboard !== false, // Default to true unless explicitly false
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          }
          
        } catch (error) {
          console.error('❌ Failed to save custom events to Firebase:', error);
        }
      },

      // Batch save everything to Firestore (single-user)
      saveAll: async () => {
        const { db } = getFirebase();
        const s = get();

        // Save global config
        const configRef = doc(collection(db, 'config'), 'global');
        const batch = writeBatch(db);
        batch.set(configRef, {
          customEvents: s.customEvents,
          timing: {
            intervalMinutes: s.intervalMinutes,
            workMinutes: s.workMinutes,
            restMinutes: s.restMinutes,
          },
          eventNotes: s.eventNotes,
          maxParticipants: s.maxParticipants,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Save waves
        const nextWaves: Record<string, Wave> = {};
        for (const wave of Object.values(s.waves)) {
          const filteredParticipants = wave.participants.filter(
            (p) => p.name && p.name.trim().length > 0
          );
          const waveRef = doc(collection(db, 'waves'), wave.id);
          batch.set(waveRef, {
            id: wave.id,
            name: wave.name,
            startTime: wave.startTime,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Reconcile participants: delete any removed participants in Firestore
          try {
            const partsSnap = await getDocs(collection(waveRef, 'participants'));
            const existingIds = new Set(partsSnap.docs.map((d) => d.id));
            const currentIds = new Set(filteredParticipants.map((p) => p.id));
            for (const id of existingIds) {
              if (!currentIds.has(id)) {
                batch.delete(doc(collection(waveRef, 'participants'), id));
              }
            }
          } catch {
            // ignore delete discovery errors
          }

          for (const p of filteredParticipants) {
            const pRef = doc(collection(waveRef, 'participants'), p.id);
            batch.set(pRef, {
              id: p.id,
              name: p.name,
              waveData: p.waveData,
              includeInLeaderboard: p.includeInLeaderboard !== false, // Default to true unless explicitly false
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }

          // Stage local state update to drop emptied participants
          nextWaves[wave.id] = { ...wave, participants: filteredParticipants } as Wave;
        }

        await batch.commit();
        set((curr) => ({ lastSavedAt: Date.now(), waves: { ...curr.waves, ...nextWaves } }));
      },

      // Load global config from Firebase (called when config modal opens)
      loadGlobalConfig: async () => {
        secureLogger.log('🔄 Loading fresh global config from Firebase...');
        const { db } = getFirebase();

        try {
          const cfgRef = doc(collection(db, 'config'), 'global');
          const cfgSnap = await getDoc(cfgRef);
          if (cfgSnap.exists()) {
            const data = cfgSnap.data() as any;
            secureLogger.log('📋 Loaded config from Firebase:', data);
            
            if (Array.isArray(data.customEvents)) {
              set({ customEvents: data.customEvents as string[] });
            }
            if (data.timing) {
              const { intervalMinutes, workMinutes, restMinutes } = data.timing;
              set({
                intervalMinutes: Number(intervalMinutes) || 5,
                workMinutes: Number(workMinutes) || 3,
                restMinutes: Number(restMinutes) || 2,
              });
            }
            if (typeof data.eventNotes === 'string') {
              set({ eventNotes: data.eventNotes });
            }
            if (typeof data.maxParticipants === 'number') {
              set({ maxParticipants: data.maxParticipants });
            }
            if (data.workoutTimer) {
              const { workSeconds, restSeconds } = data.workoutTimer;
              set({
                workoutTimerWorkSeconds: Number(workSeconds) || 60,
                workoutTimerRestSeconds: Number(restSeconds) || 30,
              });
            }
            if (data.event) {
              const { startDate, startTime, totalWaves } = data.event;
              secureLogger.log('📅 Loaded event config:', { startDate, startTime, totalWaves });
              set({
                eventStartDate: startDate || new Date().toISOString().split('T')[0],
                eventStartTime: startTime || '08:00',
                totalWaves: Number(totalWaves) || 30,
              });
            }
            if (data.alertSettings) {
              set({ alertSettings: data.alertSettings });
            }
            if (typeof data.accessPasscode === 'string') {
              set({ accessPasscode: data.accessPasscode });
            }
          }
        } catch (e) {
          secureLogger.error('Error loading config:', e);
        }
      },

      // Load data from Firebase on app startup (with caching)
      loadAll: async () => {
        const state = get();
        
        // Always load fresh data from Firebase (no caching)
        secureLogger.log('🔄 Loading fresh data from Firebase...');
        
        // Load global config first
        await get().loadGlobalConfig();

        // Load waves
        const { db } = getFirebase();
        try {
          const wavesCol = collection(db, 'waves');
          const wavesSnap = await getDocs(wavesCol);
          
          secureLogger.log(`🌊 Found ${wavesSnap.docs.length} waves in Firebase`);
          
          const loaded: Record<string, Wave> = {};
          for (const waveDoc of wavesSnap.docs) {
            const w = waveDoc.data() as any;
            secureLogger.log(`🌊 Loading wave ${waveDoc.id}:`, w.name);
            
            // Load participants from subcollection
            const participantsCol = collection(waveDoc.ref, 'participants');
            const partsSnap = await getDocs(participantsCol);
            const participants = partsSnap.docs.map((d) => ({ ...(d.data() as any) })) as any[];
            
            secureLogger.log(`👥 Found ${participants.length} participants in wave ${waveDoc.id}`);
            
            loaded[waveDoc.id] = {
              id: waveDoc.id,
              name: w.name || waveDoc.id,
              startTime: w.startTime || '',
              participants: participants as any,
            } as Wave;
          }
          
          secureLogger.log(`✅ Loaded ${Object.keys(loaded).length} waves total`);
          
          if (Object.keys(loaded).length > 0) {
            const firstId = Object.keys(loaded)[0];
            set({ 
              waves: loaded, 
              currentWaveId: firstId, 
              isDataLoaded: true,
              lastFirebaseSync: Date.now()
            });
            secureLogger.log('✅ Set waves in store, current wave:', firstId);
          } else {
            set({ 
              isDataLoaded: true,
              lastFirebaseSync: Date.now()
            });
            secureLogger.log('✅ No waves found, marked as loaded');
          }
        } catch (e) {
          console.error('Error loading waves:', e);
          set({ 
            isDataLoaded: true,
            lastFirebaseSync: Date.now()
          }); // Mark as loaded even on error to prevent retry loops
        }
      },

      // Invalidate cache to force reload
      invalidateCache: () => {
        console.log('🗑️ Invalidating cache, will reload on next access');
        set({ isDataLoaded: false });
      },

      clearCacheAndReload: async () => {
        console.log('🧹 Clearing cache and forcing fresh data load from Firebase...');
        console.log('📋 Note: Global config (timing, events, dates) always loads from Firebase');
        set({ 
          isDataLoaded: false,
          waves: {},
          currentWaveId: null,
          activeWaves: new Set()
        });
        await get().loadAll();
        console.log('✅ Cache cleared and fresh data loaded from Firebase');
      },

      // Smart sync with Firebase (only syncs active waves)
      syncWithFirebase: async () => {
        const state = get();
        const now = Date.now();
        
        // Smart cooldown based on user activity
        const cooldown = state.isUserActive ? 1000 : 5000; // 1s if active, 5s if inactive
        
        if (state.lastFirebaseSync && (now - state.lastFirebaseSync) < cooldown) {
          console.log(`⏰ Skipping sync - too recent (${cooldown}ms cooldown)`);
          return;
        }
        
        console.log(`🔄 Smart sync: checking for globally active waves...`);
        const { db } = getFirebase();
        
        // Load active waves from Firebase (global active status)
        let globalActiveWaves = new Set<string>();
        try {
          const activeWavesCol = collection(db, 'activeWaves');
          const activeWavesSnap = await getDocs(activeWavesCol);
          globalActiveWaves = new Set(activeWavesSnap.docs.map(doc => doc.id));
          console.log(`🌐 Found ${globalActiveWaves.size} globally active waves:`, Array.from(globalActiveWaves));
        } catch (error) {
          console.error('❌ Failed to load active waves from Firebase:', error);
        }
        
        // Only sync if there are globally active waves
        if (globalActiveWaves.size === 0) {
          console.log('⏰ Skipping sync - no globally active waves to monitor');
          set({ lastFirebaseSync: now });
          return;
        }
        
        console.log(`🔄 Smart sync: checking ${globalActiveWaves.size} globally active waves for multi-user updates...`);
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Only sync waves that are globally active (being edited by other users)
          for (const waveId of globalActiveWaves) {
            try {
              const waveRef = doc(collection(db, 'waves'), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as any;
              
              // Load participants from subcollection
              const participantsCol = collection(waveRef, 'participants');
              const partsSnap = await getDocs(participantsCol);
              const participants = partsSnap.docs.map((d) => ({ ...(d.data() as any) })) as any[];
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                participants: participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated active wave ${waveId} from Firebase`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({ 
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Smart sync complete - changes detected in active waves');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Smart sync complete - no changes in active waves');
          }
          
        } catch (error) {
          console.error('❌ Smart sync failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Smart sync with Firebase (no cooldown - for immediate updates)
      syncWithFirebaseNoCooldown: async () => {
        const state = get();
        const now = Date.now();
        
        console.log(`🔄 Smart sync (no cooldown): checking for globally active waves...`);
        const { db } = getFirebase();
        
        // Load active waves from Firebase (global active status)
        let globalActiveWaves = new Set<string>();
        try {
          const activeWavesCol = collection(db, 'activeWaves');
          const activeWavesSnap = await getDocs(activeWavesCol);
          globalActiveWaves = new Set(activeWavesSnap.docs.map(doc => doc.id));
          console.log(`🌐 Found ${globalActiveWaves.size} globally active waves:`, Array.from(globalActiveWaves));
        } catch (error) {
          console.error('❌ Failed to load active waves from Firebase:', error);
        }
        
        // Only sync if there are globally active waves
        if (globalActiveWaves.size === 0) {
          console.log('⏰ Skipping sync - no globally active waves to monitor');
          set({ lastFirebaseSync: now });
          return;
        }
        
        console.log(`🔄 Smart sync (no cooldown): checking ${globalActiveWaves.size} globally active waves for multi-user updates...`);
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Only sync waves that are globally active (being edited by other users)
          for (const waveId of globalActiveWaves) {
            try {
              const waveRef = doc(collection(db, 'waves'), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as any;
              
              // Load participants from subcollection
              const participantsCol = collection(waveRef, 'participants');
              const partsSnap = await getDocs(participantsCol);
              const participants = partsSnap.docs.map((d) => ({ ...(d.data() as any) })) as any[];
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                participants: participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated wave ${waveId} from Firebase (no cooldown sync)`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({ 
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Smart sync (no cooldown) complete - changes detected in active waves');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Smart sync (no cooldown) complete - no changes in active waves');
          }
          
        } catch (error) {
          console.error('❌ Smart sync (no cooldown) failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Full sync with Firebase (syncs ALL waves, not just active ones)
      fullSyncWithFirebase: async () => {
        const state = get();
        const now = Date.now();
        
        console.log('🔄 Full sync: checking ALL waves for updates...');
        const { db } = getFirebase();
        
        try {
          let hasChanges = false;
          const updatedWaves = { ...state.waves };
          
          // Sync ALL waves, not just active ones
          for (const waveId of Object.keys(state.waves)) {
            try {
              const waveRef = doc(collection(db, 'waves'), waveId);
              const waveSnap = await getDoc(waveRef);
              
              if (!waveSnap.exists()) {
                console.log(`⚠️ Wave ${waveId} no longer exists in Firebase`);
                continue;
              }
              
              const w = waveSnap.data() as any;
              
              // Load participants from subcollection
              const participantsCol = collection(waveRef, 'participants');
              const partsSnap = await getDocs(participantsCol);
              const participants = partsSnap.docs.map((d) => ({ ...(d.data() as any) })) as any[];
              
              const firebaseWave = {
                id: waveId,
                name: w.name || waveId,
                startTime: w.startTime || '',
                participants: participants,
              } as Wave;
              
              // Check if this wave has changed
              const localWave = state.waves[waveId];
              if (!localWave || JSON.stringify(localWave) !== JSON.stringify(firebaseWave)) {
                updatedWaves[waveId] = firebaseWave;
                hasChanges = true;
                console.log(`🔄 Updated wave ${waveId} from Firebase (full sync)`);
              }
            } catch (waveError) {
              console.error(`❌ Error syncing wave ${waveId}:`, waveError);
            }
          }
          
          if (hasChanges) {
            set({
              waves: updatedWaves,
              lastFirebaseSync: now
            });
            console.log('✅ Full sync complete - changes detected');
          } else {
            set({ lastFirebaseSync: now });
            console.log('✅ Full sync complete - no changes detected');
          }
          
        } catch (error) {
          console.error('❌ Full sync failed:', error);
          set({ lastFirebaseSync: now }); // Still update timestamp to prevent retry loops
        }
      },

      // Mark wave as active (being edited by this user) - GLOBAL in Firebase
      markWaveAsActive: async (waveId: string) => {
        const state = get();
        const newActiveWaves = new Set(state.activeWaves);
        newActiveWaves.add(waveId);
        set({ activeWaves: newActiveWaves });
        console.log(`📝 Marked wave ${waveId} as active (${newActiveWaves.size} total active waves)`);
        
        // Mark user as active when they start editing
        get().setUserActivity();
        
        // Save active status to Firebase so other users can see it
        try {
          const { db } = getFirebase();
          const activeRef = doc(collection(db, 'activeWaves'), waveId);
          await setDoc(activeRef, {
            waveId,
            activeAt: new Date().toISOString(),
            userId: 'user-' + Date.now() // Simple user ID for now
          }, { merge: true });
          console.log(`🌐 Saved active status to Firebase for wave ${waveId}`);
          
          // Immediately trigger sync for other users to see this wave is active
          setTimeout(() => {
            get().syncWithFirebaseNoCooldown();
          }, 100); // Small delay to ensure Firebase write completes
        } catch (error) {
          console.error('❌ Failed to save active status to Firebase:', error);
        }
      },

      // Mark wave as inactive (no longer being edited) - GLOBAL in Firebase
      markWaveAsInactive: async (waveId: string) => {
        const state = get();
        const newActiveWaves = new Set(state.activeWaves);
        newActiveWaves.delete(waveId);
        set({ activeWaves: newActiveWaves });
        console.log(`📝 Marked wave ${waveId} as inactive (${newActiveWaves.size} total active waves)`);
        
        // Remove active status from Firebase
        try {
          const { db } = getFirebase();
          const activeRef = doc(collection(db, 'activeWaves'), waveId);
          await deleteDoc(activeRef);
          console.log(`🌐 Removed active status from Firebase for wave ${waveId}`);
        } catch (error) {
          console.error('❌ Failed to remove active status from Firebase:', error);
        }
      },

      // Force update all participants with current custom events
      forceUpdateAllParticipants: async () => {
        console.log('🔄 Force updating all participants with current custom events...');
        const { db } = getFirebase();
        const state = get();
        
        try {
          for (const [waveId, wave] of Object.entries(state.waves)) {
            console.log(`🌊 Force updating wave ${waveId} with ${wave.participants.length} participants`);
            const waveRef = doc(db, 'waves', waveId);
            const participantsCol = collection(waveRef, 'participants');
            
            for (const participant of wave.participants) {
              // Ensure participant has all current custom events
              const updatedWaveData = {
                ...participant.waveData,
                ...createInitialWaveData(state.customEvents)
              };
              
              console.log(`👤 Force updating participant ${participant.id} (${participant.name})`);
              const participantRef = doc(participantsCol, participant.id);
              await setDoc(participantRef, {
                id: participant.id,
                name: participant.name,
                waveData: updatedWaveData,
                includeInLeaderboard: participant.includeInLeaderboard !== false, // Default to true unless explicitly false
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
            console.log(`✅ Force updated ${wave.participants.length} participants in wave ${waveId}`);
          }
          console.log('✅ All participants force updated with current custom events');
        } catch (error) {
          console.error('❌ Failed to force update participants:', error);
        }
      },

      // Mark user as active (for smart sync optimization)
      setUserActivity: () => {
        const now = Date.now();
        set({ 
          lastUserActivity: now,
          isUserActive: true 
        });
        
        // Reset user activity after 30 seconds of inactivity
        setTimeout(() => {
          const state = get();
          if (state.lastUserActivity && (Date.now() - state.lastUserActivity) > 30000) {
            set({ isUserActive: false });
            console.log('👤 User marked as inactive, reducing sync frequency');
          }
        }, 30000);
      },

      // Set sync interval (for dynamic optimization)
      setSyncInterval: (interval: number) => {
        set({ syncInterval: interval });
        console.log(`⏱️ Sync interval updated to ${interval}ms`);
      },


    }),
    {
      name: 'exos-wave-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // Only cache wave data and UI state - NOT global config
        waves: s.waves,
        currentWaveId: s.currentWaveId,
        isDataLoaded: s.isDataLoaded,
        lastFirebaseSync: s.lastFirebaseSync,
        // Global config (customEvents, timing, eventStartDate, etc.) always loads from Firebase
      }),
      onRehydrateStorage: () => (state) => {
        // Ensure all required fields have default values (will be overwritten by Firebase load)
        if (state) {
          // Set defaults for global config that will be loaded from Firebase
          // This prevents crashes while Firebase is loading
          if (!(state as any).customEvents) {
            (state as any).customEvents = WAVE_EVENTS;
          }
          if (!(state as any).intervalMinutes) {
            (state as any).intervalMinutes = 5;
          }
          if (!(state as any).workMinutes) {
            (state as any).workMinutes = 3;
          }
          if (!(state as any).restMinutes) {
            (state as any).restMinutes = 2;
          }
          if (!(state as any).maxParticipants) {
            (state as any).maxParticipants = 10;
          }
          if (!(state as any).workoutTimerWorkSeconds) {
            (state as any).workoutTimerWorkSeconds = 60;
          }
          if (!(state as any).workoutTimerRestSeconds) {
            (state as any).workoutTimerRestSeconds = 30;
          }
          if (!(state as any).eventStartDate) {
            (state as any).eventStartDate = new Date().toISOString().split('T')[0];
          }
          if (!(state as any).eventStartTime) {
            (state as any).eventStartTime = '08:00';
          }
          if (!(state as any).totalWaves) {
            (state as any).totalWaves = 30;
          }
          if (!(state as any).eventNotes) {
            (state as any).eventNotes = '';
          }
          if (!(state as any).accessPasscode) {
            (state as any).accessPasscode = '54321Blastoff!';
          }
          if (!(state as any).alertSettings) {
            (state as any).alertSettings = {
              workRestTransitions: true,
              eventStartEnd: true,
              soundType: 'beep',
              visualEffect: 'flash'
            };
          }
          
          // Initialize waves if empty or undefined
          if (!state.waves || Object.keys(state.waves).length === 0) {
            const id = `wave${Date.now()}`;
            state.waves = {
              [id]: {
                id,
                name: 'Wave 1',
                participants: [],
                startTime: '',
              },
            };
            state.currentWaveId = id;
          }
          
          secureLogger.log('✅ Store rehydrated with defaults - will load fresh global config from Firebase');
        }
      },
    }
  )
);