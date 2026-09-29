# Lift Event — Troubleshooting Log

Issue/troubleshooting log specific to the Lift Event template build (and the real event being configured from it). For the full context of what we're building and why, see [LIFT_EVENT_PLAN.md](LIFT_EVENT_PLAN.md) first — entries here assume that plan as background.

For general, non-Lift-Event repo issues, use [TROUBLESHOOTING_LOG.md](TROUBLESHOOTING_LOG.md) instead.

## Template

```
## YYYY-MM-DD — Short title

**Related plan section:** (e.g., "4. Live Rack Entry", "2. Registration")
**Symptom:**
**Root cause:**
**Fix:**
**Files changed:**
```

---

## 2026-09-22 — Flight tab UX rebuilt as list + detail panel (Lift Event only)

**Related plan section:** "3. Check-in (Waves tab → 'Flight' tab for this template)"
**Symptom:** The original Lift flight card grid (one card per flight, all participants inline) became too dense — BW, Oly, Ping, LB, and prefs all crammed into each row.
**Root cause:** Reused the generic Wave card layout for Lift instead of designing a dedicated Lift check-in UI.
**Fix:** Built a new `LiftFlightBoard` component with a compact scrollable list (filterable by flight chip) + a side detail panel for the selected lifter. Wired into `page.tsx` behind `isLiftTemplate` only — non-Lift events still use the original `WaveQuickViewCard` grid.
**Files changed:** `src/components/LiftFlightBoard.tsx` (new), `src/app/page.tsx`

---

## 2026-09-22 — Added check-in fields: Rack Height + per-lift Attempt Weights

**Related plan section:** "3. Check-in", "4. Live Rack Entry"
**Symptom:** Check-in detail panel only had Bodyweight + Oly opt-in; plan calls for rack height and opener/attempt weight collection at check-in too.
**Fix:** Added `rackHeight` to `Participant` type. Added an "Attempt Weights" section to the Lift detail panel using the same `waveData` field convention as the Performance page (`{movement}__attempt_N`), saved via `saveWavePerformance` so entries show up immediately on the Performance/rack page — no separate data model.
**Files changed:** `src/types/index.ts`, `src/components/LiftFlightBoard.tsx`

---

## 2026-09-22 — Corrected flight model: flight is per-movement, not per-person-for-the-event

**Related plan section:** "2. Registration", "4. Live Rack Entry"
**Symptom:** Initial rack-assignment mockup assumed a participant belongs to one fixed "Flight" for the whole event, and that a whole flight moves through the meet together. Neither is true.
**Root cause:** The app's existing Wave/Flight container (one wave = one fixed roster) doesn't match real meet logistics. A lifter's flight letter is chosen **independently per movement** (e.g. Squat: Flight A, Bench: Flight C, Deadlift: Flight B) based on what timing works for them — this was already called out in the plan but not yet modeled in participant data.
**Fix:**
- Added `liftMovementFlights?: Record<string, string>` to `Participant` (movement name → flight label for that movement).
- Added a `rackMovements: string[]` store field + `setLiftEventConfig(..., rackMovements)` so each movement can be flagged "uses rack assignment" (Squat/Bench yes, Deadlift no — floor-based; Oly lifts no — platform-based instead).
- Added a "Uses rack" checkbox next to the existing "Oly lift" checkbox per movement in `ConfigurationModal`.
- Added a "Flight per Movement" section to the Lift check-in detail panel (`LiftFlightBoard`) — one flight-select/input per movement, pulling options from that movement's configured flights (`liftFlights[movement]`), with a "RACK" badge on movements flagged as rack-based.
**Files changed:** `src/types/index.ts`, `src/store/waveStore.ts`, `src/components/ConfigurationModal.tsx`, `src/components/LiftFlightBoard.tsx`

**Still open / not yet built:**
- Actual Rack/Platform assignment screen on the Performance page (mocked in `public/lift-event-mockups.html`, not yet real) — should scope by **Movement + Flight** (not whole-event person list) to avoid a 200-person assignment list.
- Registration form / API don't yet collect per-movement flight preference — currently only entered manually at check-in via the new "Flight per Movement" section.

---

## 2026-09-22 — Added Number of Racks / Platforms setting (Lift Event only)

**Related plan section:** "4. Live Rack Entry"
**Symptom:** Rack/platform count was hardcoded (4 racks, 2 platforms) in the mockup with no way for a coach to configure it per venue.
**Fix:** Added `rackCount` and `platformCount` fields to the store (defaults 4 and 2), threaded through `setLiftEventConfig(..., rackCount, platformCount)`, persisted under `liftEvent.rackCount` / `liftEvent.platformCount`, and read back on load. Added "Number of Racks" / "Number of Platforms" number inputs to `ConfigurationModal`, shown only for the Lift template.
**Files changed:** `src/store/waveStore.ts`, `src/components/ConfigurationModal.tsx`

---

## 2026-09-22 — Performance page redesign mockup (`public/lift-event-mockups.html`) — full design spec

**Related plan section:** "4. Live Rack Entry"
**Context:** Iterated live with the user on a full mockup of the new Performance page interaction model. This is the target design for the real Performance page rebuild (not yet built in `src/app/performance/page.tsx` — still the old rack-grid version). Recording the final agreed design here as the build spec.

**Final design, step by step:**

1. **Single horizontal header row**, left to right: Category → Movement → Flight → Rack, each a compact tab group with a small uppercase label, separated by vertical dividers (not stacked, not three separate panels).
   - **Category**: Powerlifting vs. Olympic (top-level split; Oly lifts are a separate lane from Squat/Bench/Deadlift).
   - **Movement**: tabs tagged `RACK`, `FLOOR`, or `PLATFORM` based on the movement's configured type (see `rackMovements` setting — Squat/Bench = RACK, Deadlift = FLOOR, Snatch/Clean & Jerk = PLATFORM).
   - **Flight**: only the flights configured for the selected movement (from `liftFlights[movement]`).
   - **Rack**: only shown for RACK/PLATFORM movements. Fixed tab list from the new `rackCount`/`platformCount` settings (e.g. Rack 1–4, Platform A–B) — **always all clickable, even if empty**, never hidden based on current assignments.

2. **Check-in → Assign list** (directly under the header, above the live rack view): shows only the lifters checked in for the current Movement + Flight who are **not yet assigned** a rack/platform, each with a name + a rack/platform dropdown (placeholder "Choose rack…"). Assigning a lifter removes them from this list immediately and they appear in the corresponding rack's live view below.
   - This list is intentionally scoped to Movement + Flight (never the whole event) — flights are capped (e.g. 28), so this list is always small, which is what makes assignment practical.
   - Decision: rack assignment happens **at this step (Performance page, live, right before a flight lifts)**, not at check-in. Rack/rack-height needs differ per movement, so an early check-in-time assignment would go stale as soon as the event moves to the next movement. Check-in's job stays narrow: bodyweight, general intake, opener guesses.

3. **Rack live view** (below the assign list): shows only the lifters currently assigned to the selected Rack/Platform tab, each as a card with Opener/2nd/3rd attempt inputs + Hit/Miss toggles, plus a reassign dropdown on the card itself (in case someone needs to move racks after the fact).
   - No "up next" / "on deck" priority logic — deliberately removed. It's an open list; whoever has data to enter, enters it.
   - Each rack tab is isolated — the idea (not yet implemented beyond the mockup) is that a device opened to "Rack 1" only sees/saves Rack 1's data, so multiple racks can run concurrently on separate devices without stepping on each other.

4. **Floor movements** (Deadlift, no rack/platform needed): skip the assign-list and rack tabs entirely — just render one open list of everyone in that Flight, no rack step shown at all.

**Explicitly rejected ideas (don't re-litigate):**
- Assigning racks at check-in time instead of at the Performance page — rejected because rack setup varies per movement.
- Sorting/highlighting by "next attempt weight" with "up next" badges — rejected, user wants a plain open list.
- A single flat "assign all 200 people to a rack" screen — rejected; replaced by Movement+Flight scoping since flight caps keep the list small automatically.

**Mockup file:** `public/lift-event-mockups.html` (fully interactive vanilla JS prototype — category/movement/flight/rack tabs, check-in assign list, rack live view, all wired with mock data).

**Real build not yet started:**
- `src/app/performance/page.tsx` and `src/components/PerformanceTable.tsx` still use the old flat wave/rack-grid layout — need to be rebuilt to match this spec.
- Real per-device isolation (each rack tab's device only fetching/saving its own rack's data) is not implemented — the mockup fakes this with a static note banner only.
- Need to decide how `liftMovementFlights` (per-participant, per-movement flight assignment, added to `LiftFlightBoard` check-in) feeds into which lifters show up under a given Movement + Flight combo on this page.

---

## 2026-09-22 — Real Performance page rebuild: `LiftPerformanceBoard` (Lift Event only)

**Related plan section:** "4. Live Rack Entry"
**Symptom:** `src/app/performance/page.tsx` still used the old flat wave-grid + `PerformanceTable` layout for Lift events; the Movement → Flight → Rack spec (above) existed only as an HTML mockup.
**Fix:** Built `src/components/LiftPerformanceBoard.tsx`, a real implementation of the mockup spec, wired into `src/app/performance/page.tsx` behind `isLiftTemplate` only — non-Lift events still render the original wave-grid + `PerformanceTable` path unchanged.

**What it does:**
- Header row: Category (Powerlifting/Olympic, derived from `olympicLiftMovements`) → Movement (tagged RACK/PLATFORM/FLOOR from `rackMovements`/`olympicLiftMovements`) → Flight (from `liftFlights[movement]`) → Rack/Platform (fixed list sized from the new `rackCount`/`platformCount` settings).
- Roster for a Movement+Flight is computed by scanning **all** waves' participants and filtering on `participant.liftMovementFlights[movement] === flightLabel` (Oly movements additionally require `olympicLiftsOptIn === true`) — this is what makes the per-movement "Flight per Movement" data entered in `LiftFlightBoard` check-in actually feed this page.
- Added `liftMovementRacks?: Record<string, string>` to `Participant` (movement → rack/platform assignment). Check-in list shows only participants missing this for the current movement; assigning removes them from that list and they appear in the rack's live view.
- Attempt weights reuse the existing `{movement}__attempt_N` `waveData` convention (same as `PerformanceTable`/`LiftFlightBoard`), plus a new `{field}_status` convention (`'pending' | 'good' | 'miss'`) for Hit/Miss toggles — no schema change needed since `waveData` is a generic string map.
- Floor movements (e.g. Deadlift) skip the assign-list and rack tabs entirely — just an open grid of lifter cards for the flight.
- Rack assignment writes directly to `waves/{waveId}/participants/{id}` (+ mirrored to `registrations/{id}` when not a manual entry), same pattern as `LiftFlightBoard`.

**Files changed:** `src/types/index.ts` (added `liftMovementRacks`), `src/components/LiftPerformanceBoard.tsx` (new), `src/app/performance/page.tsx`

**Still open / not yet built:**
- Real per-device isolation (a device on "Rack 1" only fetching/saving Rack 1 data) — currently all racks are visible via tabs in the same page load, just filtered client-side.
- No leaderboard/DOTS/Sinclair scoring changes needed here — out of scope for this page.
- Division field still not collected anywhere (deferred per plan, tied to the Google Form update).

---

## 2026-09-23 — Rack height moved to per-movement, added to Performance page for rack matching

**Related plan section:** "3. Check-in", "4. Live Rack Entry"
**Symptom:** Rack height was a single generic field per participant (collected at check-in), but rack setup differs per movement (a lifter's Squat rack height isn't necessarily their Bench rack height). There was also no way to see/set rack height on the Performance page to help match a lifter to a compatible rack.
**Fix:**
- Replaced the single `rackHeight` field with `liftMovementRackHeights?: Record<string, string>` on `Participant` (movement → rack height/pin number).
- **Check-in (`LiftFlightBoard`)**: removed the generic top "Rack Height" input; added a rack height dropdown (1–20) next to each rack movement's 3 attempt inputs in the "Attempt Weights" section — only shown for movements flagged `rackMovements`, not Deadlift/Oly.
- **Performance page (`LiftPerformanceBoard`)**: added the same rack height dropdown in two places — the "Checked in" assign list (so staff can view/set height before picking a rack) and the live rack card (so it can be adjusted after assignment too). Only shown for rack movements, not platform/floor.
**Files changed:** `src/types/index.ts`, `src/components/LiftFlightBoard.tsx`, `src/components/LiftPerformanceBoard.tsx`

**Still open:** rack height doesn't yet auto-suggest a rack based on matching height — it's just visible/editable data for staff to manually match when assigning.

---

## 2026-09-23 — Rack-level height setting on the Performance page header

**Related plan section:** "4. Live Rack Entry"
**Symptom:** Rack height was only tracked per-lifter (what height they need). There was no way to record what height the physical rack is *currently* set to, which is what staff actually compare against when deciding assignment.
**Fix:** Added a new `rackHeightSettings: Record<string, Record<string, string>>` store field (movement → rack/platform key → current height), persisted to `liftEvent.rackHeightSettings` in the event config doc via a new `setRackHeightSetting(movement, rackKey, height, eventId)` action (merge write, doesn't touch other `liftEvent` fields). Added a height dropdown (7–14) directly in each rack's "{Rack} — live view" header on the Performance page, shown only for rack movements — this is the physical rack's current setting, separate from each lifter's individual desired height shown on their card.
**Files changed:** `src/store/waveStore.ts`, `src/components/LiftPerformanceBoard.tsx`

---

## 2026-09-28 — Rack height row intermittently missing in Flight tab participant details

**Related plan section:** "3. Check-in", "4. Live Rack Entry"
**Symptom:** In the Flight tab detail panel ("Flight per Movement"), the Squat/Bench Rack/Height row sometimes disappears entirely (Flight / 1st Attempt / PR still show), then comes back later.
**Root cause (confirmed in code):** The Rack row is gated on `rackMovements.includes(event)`. The store's `persist` `partialize` cached `liftFlights`/`olympicLiftMovements` plus `isDataLoaded`/`lastFirebaseSync` to sessionStorage, but **not** `rackMovements`, `rackCount`, `platformCount`, or `rackHeightSettings`. On a full page reload within 30s of the last sync, `loadAll` hits its freshness TTL and skips `loadGlobalConfig`, so those fields stay at defaults (`rackMovements: []`) → Rack row hidden, lifter `H{height}` badge hidden on Performance, rack counts reset to 4/2. After 30s (or opening Configuration, which calls `loadGlobalConfig`) it reappears — hence "intermittent".
**Fix:** Added `rackMovements`, `rackCount`, `platformCount`, `rackHeightSettings` to `partialize` so they rehydrate alongside the other lift config.
**Files changed:** `src/store/waveStore.ts`

**Still to verify separately:** when the row is visible it can show the "Height" placeholder for a lifter who entered a height at registration. The select only has options `7`–`14`, and registration heights map only from `squatRackHeight`/`benchRackHeight` to movements named exactly `Squat`/`Bench`. A value outside that list (e.g. `"9 holes"`) won't display. Needs a check of the raw registration values.

---

## 2026-09-28 — Bodyweight typed in Flight tab details not sticking

**Related plan section:** "3. Check-in"
**Symptom:** Bodyweight entered in the Flight tab participant detail panel is lost, while PR / flight / rack height entered the same way persist.
**Root cause (confirmed in code):** `handleLiftParticipantFieldChange` in `LiftFlightBoard` wrote updates to Firestore (participant + registration docs) and to local component state, but never to the participant object in the wave store. Store-level saves — notably `saveWavePerformance` (fired on blur of any 1st Attempt input in the same flight), `addParticipant`, `setCustomEvents`, `saveAll` — write `bodyWeight: participant.bodyWeight || ''` and `olympicLiftsOptIn` from the stale store copy with `merge: true`, blanking the value just saved. PR/flight/rack-height fields aren't included in those store writes, so they survived.
**Fix:** `handleLiftParticipantFieldChange` now also patches the matching participant in `useWaveStore` so later store saves write the current value.
**Files changed:** `src/components/LiftFlightBoard.tsx`

---
