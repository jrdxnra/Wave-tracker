export interface Participant {
  id: string;
  name: string;
  waveData: Record<string, string>;
  includeInLeaderboard?: boolean; // Optional for backwards compatibility
  pingGroupOptIn?: boolean; // Optional for backwards compatibility
  olympicLiftsOptIn?: boolean; // Lift Event only: participant is doing Olympic lift movements
  bodyWeight?: string; // Lift Event only: participant bodyweight for lifting score context
  rackHeight?: string; // Deprecated: use liftMovementRackHeights instead (rack height differs per movement)
  liftMovementFlights?: Record<string, string>; // Lift Event only: flight letter per movement (e.g. Squat: "A", Bench: "C") — a lifter's flight can differ per movement
  liftMovementRacks?: Record<string, string>; // Lift Event only: rack/platform assignment per movement (e.g. Squat: "Rack 1", Snatch: "Platform A")
  liftMovementRackHeights?: Record<string, string>; // Lift Event only: rack height/pin setting per movement (rack-based movements only, e.g. Squat, Bench)
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
