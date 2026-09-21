# Lift Event Template — Plan

Tracks the design and build of a new "Lift Event" event template (powerlifting/Olympic lifting meets), plus the actual real event being configured from it for a live meet in ~45 days (target: Friday, Nov 6, 2026, per the SVL GFit Games flight sign-up form).

This is being built as two things at once:
1. A reusable **Lift Event template** in the app (like the existing Workout/Triathlon templates), fully admin-configurable — no hardcoded lifts, flights, or times.
2. A real **event instance** using that template, configured by the coach for the upcoming meet.

See also: [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md), [LIFT_EVENT_TROUBLESHOOTING.md](LIFT_EVENT_TROUBLESHOOTING.md), [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

Status key: ✅ Decided/Done · 🟡 In progress · ❓ Open question · ⛔ Deferred (parked)

---

## 1. Template & Settings (Configuration Modal)

- ✅ Rename existing "Create New Event" interval-mode template labels: `Global Interval` → `Workout Event`, `Individual Intervals` → `Triathlon Event`.
- ✅ Add a new third template option: `Lift Event`. Requires a new `movementTimingMode`/template value — today the type is only `'global' | 'individual'`.
- ✅ No live timer/countdown for Lift Event — only fixed schedule time blocks per lift + flight.
- 🟡 Settings must let the coach (not a hardcoded list) define:
  - Which lifts exist for the event (e.g., Back Squat, Bench Press, Deadlift, Snatch, Clean & Jerk) — addable/editable, not hardcoded.
  - A toggle per event to enable/disable the Olympic lifts (Snatch, Clean & Jerk) block, since not all clients do Oly lifts.
  - The flights (A/B/C/D, or however many) per lift, each with its own **start/end time** — coach-editable, same spirit as the existing per-movement interval editor but for time blocks instead of work/rest durations.
- ✅ Flight capacity reuses the existing **Total Waves / Max Participants** settings, applied per flight (same cap across all movements for now).
- ✅ Terminology: for the Lift Event template only, every UI label that currently says "Wave" (wave cards, "Total Waves", "Add Wave", etc.) should read "Flight" instead. Other templates keep saying "Wave."

## 2. Registration

- ✅ Per-lift flight preference selection (1st/2nd preference, same first-come-first-served pattern as today), chosen **independently per lift** — a lifter can be Flight A for Squat, Flight B for Bench, Flight C for Deadlift.
- ✅ Olympic lifts (Snatch, Clean & Jerk) are optional per lifter/event — registration should only show/require them if the event has Oly lifts enabled.
- ✅ New required **Division** field (Women / Men / Non-Binary) — being added to the actual Google Form (placed after Full Name). Building on the assumption this field will exist.
- ✅ Optional opener attempt weight collected at registration (matches the sample form's "if you know your first attempt weight, enter it here").
- ✅ Rack height collected at registration.
- ✅ Auto-assignment reuses the existing wave auto-assign logic (preference + flexibility, first-come-first-served) per lift+flight independently.

## 3. Check-in (Waves tab → "Flight" tab for this template)

- ✅ Check-in happens on the existing **Waves tab**, which displays as "Flight" tab/labels for this template.
- ✅ At check-in, staff enter/confirm each lifter's **bodyweight**, opener/attempt weight(s), and rack height, next to their name.
- ✅ Quick-view card grid changes from 3-per-row to 2-per-row for this template, to fit the added check-in fields.
- ❓ Exact field layout/inputs for check-in still to be designed in detail once implementation starts.

## 4. Live Rack Entry (Performance page)

- ✅ The **Performance page** is what supervisors use live at the racks (not the Waves/Flight tab — that's check-in only).
- ✅ Each lifter has 3 attempts: **Opener**, **2nd attempt**, **3rd attempt** — each stores a weight value + Hit/Miss state (default: not yet attempted).
- ✅ Supervisor can adjust the attempt weight and mark Hit/Miss at the rack.
- ✅ Hit/Miss (and weight) can be corrected/changed after the fact if needed.
- 🟡 Rack ≠ fixed roster all day: a lifter can be on a different flight letter per lift, so "Rack A" shows whichever lift+flight is scheduled there across the day, not one fixed group.
- 🟡 Multi-user: several supervisors work from different rack pages (or the same rack from different laptops) concurrently — needs to extend the existing active-wave real-time sync pattern in [src/store/waveStore.ts](src/store/waveStore.ts) to work per rack/flight.
- ✅ UI designed laptop-first (not mobile/iPad-first), per available hardware.

## 5. Leaderboard (client-facing, public)

- ✅ Clients only ever see the **Leaderboard page** — not Waves/Flight tab or Performance page.
- 🟡 New grouping needed: by category (Powerlifting: Squat/Bench/Deadlift vs. Olympic: Snatch/Clean & Jerk) then by Division (Women/Men/Non-Binary), matching the sample leaderboard sheet.
- ✅ "Best lift" = highest **successful** attempt; it replaces the prior best as heavier successful attempts land (e.g., successful 315 → successful 345 replaces 315 as the displayed best).
- ✅ A lifter's best appears as soon as it exists — leaderboard does **not** wait for all 3 attempts to be entered.
- ⛔ Bodyweight-adjusted scoring (DOTS for powerlifting, Sinclair for Olympic lifting) — deferred. Bodyweight collection timing/method needs more team discussion. For now: show raw weight totals only, no computed score.
- ❓ "Overall Totals" section (combining Powerlifting + Olympic totals per lifter) — open on exactly when/whether to show a lifter there.
- ⛔ PR flag (💪) logic — open: manual toggle vs. computed, and against what baseline (e.g., prior meet best). Deferred, revisit separately.

## 6. Explicitly deferred / open items (not blocking initial build)

- Bodyweight-adjusted scoring formulas (DOTS/Sinclair) and when bodyweight is collected.
- PR flag (💪) logic and baseline.
- "Overall Totals" leaderboard display rule.
- Detailed check-in field layout.

---

## Task checklist (unchecked = not started)

- [ ] Add `Lift Event` as a third template option in Configuration Modal (with `Workout Event` / `Triathlon Event` relabeled).
- [ ] Extend `MovementTimingMode`/template type + store (`src/store/waveStore.ts`) to support the new mode.
- [ ] Settings UI: coach-configurable lift list, per-lift flight count, per-flight start/end time, Oly-lifts-enabled toggle.
- [ ] Registration: per-lift flight preference fields, Division field, optional opener weight, rack height.
- [ ] Waves/Flight tab: "Wave" → "Flight" label swap for this template; check-in fields (bodyweight, attempt weight, rack height); 2-per-row card grid.
- [ ] Performance page: rack-based view, Opener/2nd/3rd attempt inputs with Hit/Miss, editable after the fact.
- [ ] Multi-user real-time sync extended to rack/flight granularity.
- [ ] Leaderboard: new category → division grouping, best-successful-lift logic, raw totals (no DOTS/Sinclair yet).
- [ ] Coordinate with team on the actual Google Form update (Division question) and confirm before relying on it.
