# Future Improvements

## Leaderboard

- Add live leaderboard controls: athlete search, division and movement filters, and ranking modes for raw results, totals, or formula scores.
- Add an athlete spotlight panel showing all lifts, PR status, wave, and comparison details.
- Calculate and display real DOTS and Sinclair scores for live lift-event results instead of ranking only by raw weight.

## Pinned

### Global client tracking and cross-event leaderboard

- Implement a global Client/User system with unique IDs to track attendance and performance across events.
- Each participant in a wave should reference a global client ID.
- Enable tracking of which clients attend which events, how often, and their performance/improvement over time.
- Ensure leaderboard and participant data remain event-scoped, but allow for aggregate and historical views per client.
- Add UI and backend support for viewing a client’s event history and progress.

- Favicon strategy for event system:
  - Evaluate whether favicon should be dynamically event-specific (updates when switching events) or a single global icon for the site.
  - If dynamic, define where icon metadata is stored per event and how favicon updates across pages.
  - If global, choose and set one permanent event-site favicon to reduce complexity.

### Self-serve Google Form and Sheet integration

- A registration script generator and copy UI now exist in Event Configuration; verify the generated script end to end before treating setup as self-serve. Apps Script still needs manual installation and trigger authorization.
- Build a self-serve integration flow so admins can configure Google Form/Sheet registration sync without manually editing Apps Script constants.
- Generate a ready-to-paste Apps Script from event settings such as event ID, backend URL, secrets, and expected response sheet name.
- Decide between two supported models:
  - standardized required registration question set across events
  - admin-configurable field mapping from sheet columns/questions to app fields
- Prefer the standardized-question approach for reliability, with field mapping only if event requirements diverge.
- Include a setup UI/checklist in the app for copying the script, pasting it into Apps Script, and running trigger installation.
- Consider piloting this flow on G-ROX later if that event needs a registration form integration.

### Rebuild "Waitlist" and "Analytics" tabs (missing from GitHub repo)

- Production (`wavetracker.web.app`) has Waitlist and Analytics tabs whose original source was never committed. Investigation details: [TROUBLESHOOTING_LOG.md](TROUBLESHOOTING_LOG.md) (2026-09-21 entry).
- This repo now has separate Waitlist and Analytics tabs. Waitlist has a detail view and an admit-to-flights API, but the separate Form/Sheet intake is not connected and admission has not been tested with a real waitlist record. Analytics still displays a labeled reference snapshot, not live event calculations.
- **No prod deploys yet:** replace the reference analytics with live event-scoped results, connect and test waitlist intake/admission, and verify the production tabs' required workflows before overwriting production Hosting.

### New "Lift Event" template

This graduated from an idea to an active in-progress build. Full plan, decisions, and task checklist now live in [LIFT_EVENT_PLAN.md](LIFT_EVENT_PLAN.md) (with [LIFT_EVENT_TROUBLESHOOTING.md](LIFT_EVENT_TROUBLESHOOTING.md) tracking issues as we build it) — see those files instead of this entry going forward.

- The Flight tab now creates distinct Powerlifting and Olympic session pills at shared start times. Snatch and Clean & Jerk are grouped into each Olympic session, while a lifter has one participant record and per-movement assignments.
- Registrations owns initial assignments and resync; Flights can move assigned lifters. Verify the full assignment and capacity workflow with test records before production, including overlapping sessions and waitlist replacements.
- Powerlifting has the configured capacity; Olympic sessions are open-ended and must not consume Powerlifting slots. Check this against live event data before production rollout.

