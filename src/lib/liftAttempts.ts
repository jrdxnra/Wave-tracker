// Shared attempt/status field naming + best-lift derivation for the Lift Event template.
// A single source of truth: only an attempt explicitly marked "Hit" ever counts.

export type AttemptStatus = 'pending' | 'good' | 'miss';

export const getAttemptField = (movement: string, attemptNumber: number) => `${movement}__attempt_${attemptNumber}`;
export const getAttemptStatusField = (movement: string, attemptNumber: number) => `${getAttemptField(movement, attemptNumber)}_status`;

// Best made attempt for a movement: entered weights are never mutated. An attempt only
// counts once it's marked 'good' (Hit) — 'pending' and 'miss' are both excluded.
export function getBestLiftFromAttempts(waveData: Record<string, string> | undefined, movement: string): number {
  const attemptValues = [1, 2, 3].map((attemptNumber) => {
    if (waveData?.[getAttemptStatusField(movement, attemptNumber)] !== 'good') return 0;
    const parsed = Number.parseFloat(waveData?.[getAttemptField(movement, attemptNumber)] || '');
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const bestAttempt = Math.max(0, ...attemptValues);

  const hasAnyAttempt = [1, 2, 3].some((attemptNumber) => waveData?.[getAttemptField(movement, attemptNumber)]);
  if (hasAnyAttempt) return bestAttempt;

  // Legacy fallback for data entered directly into the movement field (no per-attempt breakdown).
  const stored = Number.parseFloat(waveData?.[movement] || '');
  return Number.isFinite(stored) ? Math.max(bestAttempt, stored) : bestAttempt;
}
