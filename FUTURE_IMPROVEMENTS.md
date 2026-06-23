# Future Improvements

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

- Build a self-serve integration flow so admins can configure Google Form/Sheet registration sync without manually editing Apps Script constants.
- Generate a ready-to-paste Apps Script from event settings such as event ID, backend URL, secrets, and expected response sheet name.
- Decide between two supported models:
  - standardized required registration question set across events
  - admin-configurable field mapping from sheet columns/questions to app fields
- Prefer the standardized-question approach for reliability, with field mapping only if event requirements diverge.
- Include a setup UI/checklist in the app for copying the script, pasting it into Apps Script, and running trigger installation.
- Consider piloting this flow on G-ROX later if that event needs a registration form integration.
