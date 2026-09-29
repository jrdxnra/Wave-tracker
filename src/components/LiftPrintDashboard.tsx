'use client';

import { useWaveStore } from '@/store/waveStore';
import { getAttemptField } from '@/lib/liftAttempts';

type LiftPrintParticipant = {
  id: string;
  name: string;
  waveData: Record<string, string>;
  genderCategory?: string;
  olympicLiftsOptIn?: boolean;
  firstPreferenceHour?: string;
  firstPreferenceFlexibility?: string;
  secondPreferenceHour?: string;
  secondPreferenceFlexibility?: string;
  liftMovementFlights?: Record<string, string>;
  liftMovementRackHeights?: Record<string, string>;
  liftMovementPrs?: Record<string, string>;
};

type LiftPrintWave = {
  id: string;
  name: string;
  participants: LiftPrintParticipant[];
};

interface LiftPrintDashboardProps {
  wave: LiftPrintWave;
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatTime = (value: string) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value || '';
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
};

const preferenceSummary = (hour?: string, flexibility?: string) => {
  const values = [hour, flexibility].map((value) => String(value || '').trim()).filter(Boolean);
  return values.join(' / ');
};

export default function LiftPrintDashboard({ wave }: LiftPrintDashboardProps) {
  const { customEvents, liftFlights, olympicLiftMovements, eventBranding, themeColors, eventNotes } = useWaveStore();

  const handlePrint = () => {
    const participantPages = Array.from(
      { length: Math.ceil(wave.participants.length / 2) },
      (_, pageIndex) => wave.participants.slice(pageIndex * 2, pageIndex * 2 + 2),
    );

    const cards = participantPages.map((participants, pageIndex) => `
      <main class="sheet${pageIndex === participantPages.length - 1 ? ' last-sheet' : ''}">
        ${participants.map((participant) => {
          const notes = [
            preferenceSummary(participant.firstPreferenceHour, participant.firstPreferenceFlexibility),
            preferenceSummary(participant.secondPreferenceHour, participant.secondPreferenceFlexibility),
          ].filter(Boolean);

          return `
            <article class="athlete-card">
              <header class="card-header">
                <p class="event-name">${escapeHtml(eventBranding.title)} &middot; Athlete Lift Card</p>
                <h1 class="athlete-name">${escapeHtml(participant.name)}</h1>
              </header>

              <section class="profile-strip">
                <div class="profile-item"><span class="label">Gender Category</span><span class="value">${escapeHtml(participant.genderCategory)}</span></div>
                <div class="profile-item"><span class="label">Olympic</span><span class="value">${participant.olympicLiftsOptIn ? 'Yes' : 'No'}</span></div>
              </section>

              <table class="movement-table">
                <thead>
                  <tr>
                    <th class="movement">Movement</th>
                    <th class="flight">Flight / Time</th>
                    <th class="compact">Height</th>
                    <th class="attempt">Attempt 1</th>
                    <th class="judge">Judge Initial</th>
                    <th class="attempt">Attempt 2</th>
                    <th class="judge">Judge Initial</th>
                    <th class="attempt">Attempt 3</th>
                    <th class="judge">Judge Initial</th>
                    <th class="compact">PR</th>
                  </tr>
                </thead>
                <tbody>
                  ${customEvents.map((movement) => {
                    const assignedFlight = participant.liftMovementFlights?.[movement] || '';
                    const flight = (liftFlights[movement] || []).find((option) => option.label === assignedFlight);
                    const isOlympic = olympicLiftMovements.includes(movement);
                    return `
                      <tr>
                        <td class="movement">${escapeHtml(movement)}${isOlympic ? '<span class="oly-mark">OLY</span>' : ''}</td>
                        <td><span class="flight-value">${escapeHtml(assignedFlight)}</span><span class="flight-time">${escapeHtml(formatTime(flight?.startTime || ''))}</span></td>
                        <td>${escapeHtml(participant.liftMovementRackHeights?.[movement])}</td>
                        <td>${escapeHtml(participant.waveData[getAttemptField(movement, 1)])}</td><td></td>
                        <td></td><td></td>
                        <td></td><td></td>
                        <td>${escapeHtml(participant.liftMovementPrs?.[movement])}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>

              <footer class="notes">
                <span class="label">Event Notes &amp; Details</span>
                <p>${escapeHtml([...notes, eventNotes].filter(Boolean).join(' | '))}</p>
              </footer>
            </article>
          `;
        }).join('')}
      </main>
    `).join('');

    const printWindow = window.open('', '_blank', 'popup,width=1000,height=900');
    if (!printWindow) {
      alert('Please allow pop-ups to print athlete cards.');
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(eventBranding.title)} - Athlete Cards</title>
          <style>
            :root { --start: ${themeColors.start}; --mid: ${themeColors.mid}; --end: ${themeColors.end}; --ink: #172033; --muted: #667085; --line: #cfd7e3; --panel: #f5f7fa; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #dfe5ec; color: var(--ink); font-family: "Aptos", "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet { width: 8.5in; height: 11in; margin: 0 auto 16px; padding: .28in; display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: .16in; background: #fff; break-after: page; }
            .last-sheet { break-after: auto; }
            .athlete-card { min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; border: 1.5px solid var(--ink); border-radius: 7px; background: #fff; break-inside: avoid; }
            .card-header { padding: 10px 13px; background: linear-gradient(100deg, var(--start), var(--mid) 55%, var(--end)); color: #fff; }
            .event-name { margin: 0 0 2px; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
            .athlete-name { margin: 0; font-size: 28px; line-height: 1.05; letter-spacing: 0; }
            .profile-strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
            .profile-item { min-width: 0; padding: 8px 10px; border-right: 1px solid var(--line); }
            .profile-item:last-child { border-right: 0; }
            .label { display: block; margin-bottom: 3px; color: var(--muted); font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
            .value { display: block; min-height: 16px; overflow: hidden; font-size: 13px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
            .movement-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .movement-table th, .movement-table td { height: 38px; padding: 6px 6px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: center; font-size: 11px; }
            .movement-table th:last-child, .movement-table td:last-child { border-right: 0; }
            .movement-table thead th { height: 32px; background: var(--ink); color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
            .movement-table .movement { width: 16%; padding-left: 8px; background: var(--panel); color: var(--ink); text-align: left; font-size: 12px; font-weight: 900; }
            .movement-table .flight { width: 16%; }
            .movement-table .attempt { width: 10%; }
            .movement-table .judge { width: 8%; }
            .movement-table .compact { width: 7%; }
            .flight-value { display: block; font-size: 12px; font-weight: 900; }
            .flight-time { display: block; margin-top: 2px; color: var(--ink); font-size: 12px; font-weight: 900; }
            .oly-mark { display: inline-block; margin-left: 3px; color: var(--start); font-size: 7px; font-weight: 900; vertical-align: 1px; }
            .notes { min-height: 44px; padding: 8px 10px; background: var(--panel); }
            .notes p { margin: 3px 0 0; font-size: 10px; line-height: 1.3; }
            @page { size: letter portrait; margin: 0; }
            @media print { body { background: #fff; } .sheet { margin: 0; } }
          </style>
        </head>
        <body>${cards}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={wave.participants.length === 0}
      className="rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor: themeColors.accent }}
    >
      <span className="hidden lg:inline">Print Athlete Cards</span>
      <span className="lg:hidden">Print</span>
    </button>
  );
}
