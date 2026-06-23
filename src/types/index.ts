export interface Participant {
  id: string;
  name: string;
  waveData: Record<string, string>;
  includeInLeaderboard?: boolean; // Optional for backwards compatibility
  pingGroupOptIn?: boolean; // Optional for backwards compatibility
}

export type MovementUnit = 'reps' | 'laps' | 'cals' | 'meters' | 'seconds' | 'rounds';

export interface Wave {
  id: string;
  name: string;
  participants: Participant[];
  startTime: string;
  coach?: string; // Name of the coach assigned to this wave
}

export interface FeedbackEntry {
  id: string;
  rating: number;
  message: string;
  createdAt: string;
  eventId: string;
}

export interface WaveStore {
  waves: Record<string, Wave>;
  currentWaveId: string | null;
  eventNotes: string;
}

export const WAVE_EVENTS = [
  '400m',
  'wall balls',
  'row',
  'sled push',
  'sled pull',
  'burpee/jump',
  'lunges',
  'farmers carry'
] as string[];

export type WaveEvent = string;
