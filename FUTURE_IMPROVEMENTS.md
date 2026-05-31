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
