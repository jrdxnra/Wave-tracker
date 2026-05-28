export interface Participant {
  id: string;
  name: string;
  waveData: Record<string, string>;
  includeInLeaderboard?: boolean; // Optional for backwards compatibility
}

export interface Wave {
  id: string;
  name: string;
  participants: Participant[];
  startTime: string;
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
