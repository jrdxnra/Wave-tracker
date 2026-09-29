// Detects when a lifter's registration time-preference doesn't match any currently
// configured Flight for that movement — the exact failure mode that happens when the
// Google Form's time slots and the site's Settings flights drift out of sync.
import type { LiftFlight } from '@/store/waveStore';

function parseClockToMinutes(raw: string): number | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  const ampm = value.match(/^(\d{1,2}):(\d{2})\s*([aApP][mM])$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2]);
    const meridiem = ampm[3].toUpperCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour === 12) hour = meridiem === 'AM' ? 0 : 12;
    else if (meridiem === 'PM') hour += 12;
    return hour * 60 + minute;
  }

  const hm = value.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  return null;
}

// Registration preference text looks like "10:00AM-10:30AM"; only the start time is
// compared against flight start times, since that's what uniquely identifies a slot.
function parsePreferenceStartMinutes(preference: string): number | null {
  const value = String(preference || '').trim();
  if (!value) return null;
  const [startPart] = value.split('-');
  return parseClockToMinutes(startPart || '');
}

export function preferenceMatchesAnyFlight(preference: string, flights: LiftFlight[]): boolean {
  const preferenceStart = parsePreferenceStartMinutes(preference);
  if (preferenceStart === null) return true; // Nothing to check (blank/unparseable answer).
  if (flights.length === 0) return true; // No flights configured yet — not a mismatch to report.

  return flights.some((flight) => parseClockToMinutes(flight.startTime) === preferenceStart);
}

export interface LiftPreferenceCheckInput {
  movement: string;
  firstPreference: string;
  secondPreference: string;
}

export interface LiftPreferenceMismatch {
  movement: string;
  preference: string;
}

// Returns the movements where NEITHER the first nor second preference matches a
// configured flight — i.e. this lifter's answer can't currently be placed anywhere.
export function findUnmatchedLiftPreferences(
  inputs: LiftPreferenceCheckInput[],
  liftFlights: Record<string, LiftFlight[]>,
): LiftPreferenceMismatch[] {
  const mismatches: LiftPreferenceMismatch[] = [];

  inputs.forEach(({ movement, firstPreference, secondPreference }) => {
    const hasAnyPreference = Boolean(firstPreference.trim() || secondPreference.trim());
    if (!hasAnyPreference) return;

    const flights = liftFlights[movement] || [];
    const firstMatches = !firstPreference.trim() || preferenceMatchesAnyFlight(firstPreference, flights);
    const secondMatches = !secondPreference.trim() || preferenceMatchesAnyFlight(secondPreference, flights);

    if (!firstMatches && !secondMatches) {
      mismatches.push({ movement, preference: firstPreference || secondPreference });
    }
  });

  return mismatches;
}
