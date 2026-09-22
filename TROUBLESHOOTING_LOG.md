# Troubleshooting Log

Running log of major issues, root causes, and fixes for Wave Tracker. Newest entries go at the top.

See also: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md), [setup-dev.md](setup-dev.md), [setup-dev-emulator.md](setup-dev-emulator.md), [ALERT_SETTINGS_REMOVED.md](ALERT_SETTINGS_REMOVED.md).

## Process rule: dev deploys OK when asked, prod deploys are user-only

- The agent (Copilot) **may** run `npm run deploy:dev` (dev preview channel) when the user explicitly asks for it.
- The agent must **never** run `npm run deploy:prod` or anything that touches production hosting — promoting to prod is a user-only decision/action, gated by `ALLOW_PROD_DEPLOY=YES`.
- Default assumption if unclear: don't deploy at all, just build/commit/push to GitHub. Only deploy to dev when explicitly told to.

## Best workflow for this repo

- Make a batch of related changes.
- Run a single validation build after the batch is ready.
- Deploy to the dev preview only once the batch is stable.
- Only do a production deploy at the end of a milestone.
- Avoid running a full build/deploy for every tiny change; it slows the loop and adds churn without improving validation quality.

## Template

```
## YYYY-MM-DD — Short title

**Symptom:**
**Root cause:**
**Fix:**
**Files changed:**
```

---

## 2026-09-22 — Lift Event flights and Olympic lifts were modeled too globally

**Symptom:** Lift Event settings still showed global wave-style controls like Total Flights and Flight Start Interval, while movement rows already had their own flight times. Olympic lifts were also represented as an event-wide toggle, but the real workflow is participant-specific: only checked-in athletes opting into Olympic lifts should get those lift inputs and leaderboard entries.
**Root cause:** Lift Event configuration reused the legacy wave schedule model and stored only a broad Olympic enabled flag. The app needed movement-owned flight schedules plus named Olympic movements, with a participant opt-in flag during check-in.
**Fix:** Lift Events now create flight docs from movement flight start times, hide Total Flights / interval controls in Lift mode, let movement rows be marked as Oly lifts, add an Oly checkbox in registrations/check-in, disable Olympic performance inputs for non-opted participants, and exclude non-opted participants from Olympic leaderboard calculations.
**Files changed:** [src/components/ConfigurationModal.tsx](src/components/ConfigurationModal.tsx), [src/components/RegistrationsTab.tsx](src/components/RegistrationsTab.tsx), [src/components/PerformanceTable.tsx](src/components/PerformanceTable.tsx), [src/app/leaderboard/page.tsx](src/app/leaderboard/page.tsx), [src/app/api/register/route.ts](src/app/api/register/route.ts), [src/app/api/register/manage/route.ts](src/app/api/register/manage/route.ts), [src/store/waveStore.ts](src/store/waveStore.ts), [src/types/index.ts](src/types/index.ts).

---

## 2026-09-22 — Local dev server blocked by stale Next.js process

**Symptom:** Running `npm run dev` in the repo fails with: `Another next dev server is already running.` even though the user is starting it fresh.
**Root cause:** A previous Next dev server was still running in the same project directory on port 3000, leaving an active lock file/process. When the new dev command starts, it detects the existing instance and refuses to boot another server.
**Fix:** Kill the stale `next dev` process, then start the app again. In this environment, the process was `PID 112640` from the same project directory. After stopping it, `npm run dev` starts normally on the next available port or the original port if freed.
**Files changed:** None (runtime cleanup only).
**Takeaway:** If `npm run dev` says another server is already running, check for the active Next.js process first and terminate it before retrying. Use the same project directory and Node 22 runtime as the supported setup.

---

## 2026-09-21 — Dev site broken (missing Firebase config) after first deploy from this container

**Symptom:** After deploying to the dev preview channel, the site showed a runtime error ("Missing required Firebase environment variables...") and other events/data appeared missing or broken (not specific to the Lift Event template — the whole site was affected).
**Root cause:** This devcontainer had no `.env.local` file (only `env.example`). Next.js inlines `NEXT_PUBLIC_*` env vars into the client bundle at build time, so building/deploying without `.env.local` present ships a broken bundle with no Firebase config.
**Fix:** `cp env.example .env.local`, then re-ran `npm run deploy:dev`. Confirmed the rebuild picked up `.env.local` (`- Environments: .env.local` in the build output) before redeploying.
**Files changed:** `.env.local` created locally (not committed — it's gitignored env config, matches existing repo convention per [setup-dev.md](setup-dev.md)).
**Takeaway:** Before running any deploy from a fresh container/environment, always verify `.env.local` exists first (`ls .env.local`); if missing, copy from `env.example`.

---

## 2026-09-21 — Production has "Waitlist" and "Analytics" tabs that don't exist in this GitHub repo

**Symptom:** Dev preview site only shows "Waves" / "Registrations" tabs. Production (`wavetracker.web.app`) shows 4 tabs: Waves, Registrations, Waitlist, Analytics.
**Root cause:** Confirmed via `git branch -a` + per-branch search that no branch in this repo contains a "Waitlist" or "Analytics" tab. Confirmed via `gh codespace list` that only one Codespace exists (this one, created today) — no other Codespace has the missing code. Confirmed via chronicle/session history query that no prior session in this environment built those features. Confirmed the compiled prod JS bundle does contain the string "Waitlist" (`/_next/static/chunks/0om4_jj.~qdq0.js`), but no source maps are exposed (`.js.map` → 404), so the original source cannot be reconstructed from the live bundle.
**Conclusion:** That code was built and deployed directly to production (likely via the "Legacy / Equivalent Direct Command" `firebase deploy --only hosting` path in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)) from a local machine/clone that was never committed or pushed to GitHub, and is not recoverable through any tool available in this environment.
**Action plan:**
1. User to check their own computer for another local clone of this repo with the missing code.
2. If not found, rebuild Waitlist and Analytics tabs from scratch as new features, using the live production site as a functional reference.
3. **Hard rule until resolved: do NOT run any prod deploy** (`npm run deploy:prod` / `ALLOW_PROD_DEPLOY=YES`) — doing so would overwrite production and permanently remove the Waitlist/Analytics tabs, since this repo has no record of them.
**Files changed:** None (investigation only).

---
