'use client';

import { useWaveStore } from '@/store/waveStore';

interface PrintDashboardProps {
  wave: {
    id: string;
    name: string;
    participants: Array<{
      id: string;
      name: string;
      waveData: Record<string, string>;
      includeInLeaderboard?: boolean;
    }>;
    startTime: string;
    coach?: string;
  };
}

function getPrintLayoutTier(activeParticipantCount: number): 5 | 10 | 15 | 20 {
  if (activeParticipantCount >= 16) return 20;
  if (activeParticipantCount >= 11) return 15;
  if (activeParticipantCount >= 6) return 10;
  return 5;
}

export default function PrintDashboard({ wave }: PrintDashboardProps) {
  const {
    customEvents,
    eventNotes,
    workMinutes,
    restMinutes,
    movementTimingMode,
    movementIntervals,
    eventBranding,
    themeColors,
  } = useWaveStore();

  const handlePrint = () => {
    const escapeHtml = (value: string = '') =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Freeze all print data at click-time so output remains consistent.
    const snapshot = {
      title: eventBranding.title,
      emojiLeft: eventBranding.emojiLeft || '',
      emojiRight: eventBranding.emojiRight || '',
      themeColors: { ...themeColors },
      notes: eventNotes || '',
      workMinutes,
      restMinutes,
      movementTimingMode,
      movementIntervals: { ...movementIntervals },
      customEvents: [...customEvents],
      wave: {
        id: wave.id,
        name: wave.name,
        startTime: wave.startTime,
        coach: wave.coach || '',
        participants: wave.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          waveData: { ...(participant.waveData || {}) },
        })),
      },
    };

    const printWave = snapshot.wave;
    const coachName = (printWave.coach || '').trim();
    const waveDisplayName = coachName
      ? `${printWave.name} w/ Coach ${coachName}`
      : printWave.name;
    const safeTitle = escapeHtml(snapshot.title || 'Wave Tracker');
    const safeEmojiLeft = escapeHtml(snapshot.emojiLeft || '');
    const safeEmojiRight = escapeHtml(snapshot.emojiRight || '');
    const safeWaveDisplayName = escapeHtml(waveDisplayName || printWave.name || 'Wave');
    const safeStartTime = escapeHtml(printWave.startTime || '');
    const waveParticipantCount = printWave.participants.length;
    const layoutTier = getPrintLayoutTier(waveParticipantCount);
    const configuredParticipantCount = Math.max(layoutTier, waveParticipantCount);
    const printableParticipants = printWave.participants.slice(0, configuredParticipantCount);
    const printableRows = Array.from({ length: configuredParticipantCount }, (_, index) => printableParticipants[index] ?? null);
    const printEvents = snapshot.customEvents;
    // Compute dynamic Name column width from the longest visible participant names.
    const visibleNameLengths = printableRows.map((p) => (p?.name || '').length);
    const longestVisibleName = visibleNameLengths.reduce((max, len) => Math.max(max, len), 8);
    const presetLayout = {
      5: { headerPadding: '18px 18px', titleFontSize: '18pt', startTimeFontSize: '11pt', cellFontSize: '8.6pt', cellHeight: 26, cellPadding: '5px 4px', cellMetaSize: '6pt', notesFontSize: '9.8pt', notesPadding: '14px', notesTitleSize: '11pt', notesLineHeight: '1.33', notesMinHeight: '240px' },
      10: { headerPadding: '15px 15px', titleFontSize: '17pt', startTimeFontSize: '10pt', cellFontSize: '8.6pt', cellHeight: 26, cellPadding: '5px 4px', cellMetaSize: '6pt', notesFontSize: '9.4pt', notesPadding: '13px', notesTitleSize: '10.2pt', notesLineHeight: '1.31', notesMinHeight: '190px' },
      15: { headerPadding: '13px 13px', titleFontSize: '16pt', startTimeFontSize: '9pt', cellFontSize: '8.6pt', cellHeight: 26, cellPadding: '5px 4px', cellMetaSize: '6pt', notesFontSize: '9pt', notesPadding: '12px', notesTitleSize: '9.8pt', notesLineHeight: '1.28', notesMinHeight: '150px' },
      20: { headerPadding: '12px 12px', titleFontSize: '15pt', startTimeFontSize: '8.5pt', cellFontSize: '8.6pt', cellHeight: 26, cellPadding: '5px 4px', cellMetaSize: '6pt', notesFontSize: '8.8pt', notesPadding: '11px', notesTitleSize: '9.6pt', notesLineHeight: '1.25', notesMinHeight: '120px' },
    } as const;
    const layout = presetLayout[layoutTier];
    const nameWidthPx = Math.max(84, Math.min(130, Math.round(longestVisibleName * 6.6 + 14)));
    const headerPadding = layout.headerPadding;
    const titleFontSize = layout.titleFontSize;
    const startTimeFontSize = layout.startTimeFontSize;
    const cellFontSize = layout.cellFontSize;
    const cellHeight = layout.cellHeight;
    const cellPadding = layout.cellPadding;
    const cellMetaSize = layout.cellMetaSize;
    const notesFontSize = layout.notesFontSize;
    const notesPadding = layout.notesPadding;
    const notesTitleSize = layout.notesTitleSize;
    const notesLineHeight = layout.notesLineHeight;
    const notesMinHeight = layout.notesMinHeight;

    // Use configured timing values from store

    // Build movement start times from wave.startTime
    const parseStart = (startStr) => {
      try {
        if (!startStr) return null;
        const now = new Date();
        const s = startStr.trim();
        let hours = 8, minutes = 0;
        
        // Match time with AM/PM (case insensitive)
        const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
        const hmMatch = s.match(/^(\d{1,2}):(\d{2})$/);
        
        if (ampmMatch) {
          hours = parseInt(ampmMatch[1], 10);
          minutes = parseInt(ampmMatch[2], 10);
          const period = ampmMatch[3].toLowerCase();
          
          // Convert 12-hour to 24-hour format
          if (period === 'pm' && hours !== 12) {
            hours += 12;
          } else if (period === 'am' && hours === 12) {
            hours = 0;
          }
        } else if (hmMatch) {
          hours = parseInt(hmMatch[1], 10);
          minutes = parseInt(hmMatch[2], 10);
        }
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
      } catch {
        return null;
      }
    };

    const startDate = parseStart(printWave.startTime) || new Date();
    const movementDurations = printEvents.map((movementName) => {
      const individual = snapshot.movementIntervals[movementName];
      const nextWork = snapshot.movementTimingMode === 'individual'
        ? Math.max(0, Number(individual?.workMinutes) || snapshot.workMinutes)
        : snapshot.workMinutes;
      const nextRest = snapshot.movementTimingMode === 'individual'
        ? Math.max(0, Number(individual?.restMinutes) || snapshot.restMinutes)
        : snapshot.restMinutes;
      return {
        workMinutes: nextWork,
        restMinutes: nextRest,
      };
    });

    let elapsedMinutes = 0;
    const movementTimes = movementDurations.map((duration) => {
      const t = new Date(startDate.getTime() + elapsedMinutes * 60000);
      elapsedMinutes += duration.workMinutes + duration.restMinutes;
      return {
        startLabel: t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        ...duration,
      };
    });

    
    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle} - ${safeWaveDisplayName}</title>
          <style>
            body {
              margin: 0;
              padding: 10px;
              font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
              background: linear-gradient(180deg, #edf4fb 0%, #e6eef7 100%);
              color: #0f172a;
            }
            .sheet {
              background: #ffffff;
              padding: 8px;
              min-height: calc(100vh - 20px);
              display: flex;
              flex-direction: column;
            }
            .header {
              padding: ${headerPadding};
              background: linear-gradient(135deg, ${snapshot.themeColors.start} 0%, ${snapshot.themeColors.mid} 52%, ${snapshot.themeColors.end} 100%);
              border-radius: 8px;
              color: white;
              position: relative;
              overflow: hidden;
            }
            .title {
              margin: 0;
              font-weight: 800;
              font-size: ${titleFontSize};
              line-height: 1.1;
            }
            .subtitle {
              margin: 6px 0 0;
              font-size: ${startTimeFontSize};
              opacity: 0.96;
              font-weight: 600;
            }
            .print-table {
              margin-top: 8px;
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              border: 1px solid #ccd8e6;
              border-radius: 7px;
              overflow: hidden;
              flex: 1;
            }
            .print-table th,
            .print-table td {
              border: 1px solid #ccd8e6;
              text-align: center;
              vertical-align: middle;
              color: #0b1a2d;
            }
            .print-table th {
              background: #f5f9ff;
              font-weight: 700;
              font-size: ${cellFontSize};
              padding: ${cellPadding};
              height: ${cellHeight}px;
              line-height: 1.05;
            }
            .col-num {
              width: 18px;
              background: #f8fbff;
              font-weight: 700;
            }
            .col-name {
              width: ${nameWidthPx}px;
              text-align: left;
              padding-left: 4px !important;
            }
            .event-head {
              font-weight: 800;
              font-size: ${cellFontSize};
              line-height: 1.05;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .event-sub {
              margin-top: 1px;
              font-size: ${cellMetaSize};
              font-weight: 600;
              color: #334155;
              line-height: 1.05;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .print-table tbody td {
              padding: ${cellPadding};
              height: ${cellHeight}px;
              line-height: 1.05;
              font-size: ${cellFontSize};
            }
            .name {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              font-weight: 700;
              font-size: ${cellFontSize};
            }
            .mini-header th {
              background: #edf5ff;
              color: #18314a;
              font-size: ${cellFontSize};
              font-weight: 700;
              text-transform: none;
              letter-spacing: 0;
              padding: ${cellPadding};
              height: ${cellHeight}px;
              line-height: 1.05;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .blank-row td {
              color: transparent;
            }
            .event-notes {
              margin-top: 7px;
              padding: ${notesPadding};
              border: 1px solid #cbd5e1;
              border-radius: 7px;
              background: #fcfeff;
              min-height: ${notesMinHeight};
            }
            .event-notes h3 {
              margin: 0 0 4px;
              font-size: ${notesTitleSize};
              font-weight: 800;
              color: #1d4f63;
              letter-spacing: 0.01em;
            }
            .event-notes .event-notes-content {
              margin: 0;
              font-size: ${notesFontSize};
              line-height: ${notesLineHeight};
              color: #0f172a;
              white-space: pre-line;
              overflow-wrap: anywhere;
            }
            @media print {
              body {
                margin: 0;
                padding: 8px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .sheet {
                box-shadow: none;
                border: none;
                min-height: calc(100vh - 16px);
              }
              .print-table {
                page-break-inside: auto;
              }
              .print-table tr {
                page-break-inside: avoid;
                page-break-after: auto;
              }
              .event-notes {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <div class="title">${safeTitle}${safeEmojiLeft ? ` <span style="font-style: normal;">${safeEmojiLeft}</span>` : ''}</div>
              <div class="subtitle">${safeWaveDisplayName}${printWave.startTime ? ` • Start ${safeStartTime}` : ''}${safeEmojiRight ? ` <span style="font-style: normal;">${safeEmojiRight}</span>` : ''}</div>
            </div>

            <table class="print-table">
              <thead>
                <tr>
                  <th class="col-num">#</th>
                  <th class="col-name">Name</th>
                  ${printEvents.map((event, eventIdx) => {
                    const safeEvent = escapeHtml(event);
                    const timing = movementTimes[eventIdx];
                    const timingMeta = timing
                      ? `${escapeHtml(timing.startLabel)}${snapshot.movementTimingMode === 'individual' ? ` • W${timing.workMinutes}/R${timing.restMinutes}` : ''}`
                      : '';
                    return `<th><div class="event-head">${safeEvent}</div>${timingMeta ? `<div class="event-sub">${timingMeta}</div>` : ''}</th>`;
                  }).join('')}
                </tr>
              </thead>
              <tbody>
                ${printableRows.map((participant, idx) => {
                  const miniHeader = (idx > 0 && idx % 5 === 0) ? `
                    <tr class=\"mini-header\">
                      <th class=\"col-num\">#</th>
                      <th class=\"col-name\">Name</th>
                      ${printEvents.map(event => `<th><div class="event-head">${escapeHtml(event)}</div></th>`).join('')}
                    </tr>
                  ` : '';

                  return `
                    ${miniHeader}
                    <tr class=\"${participant ? '' : 'blank-row'}\">
                      <td class=\"col-num\">${idx + 1}</td>
                      <td class=\"col-name\"><div class=\"name\">${escapeHtml(participant?.name || '')}</div></td>
                      ${printEvents.map(event => `<td>${escapeHtml((participant?.waveData || {})[event] || '')}</td>`).join('')}
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <div class="event-notes">
              <h3>Event Notes</h3>
              <div class="event-notes-content">${escapeHtml(snapshot.notes)}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    
    // Create a div with the print content
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100%';
    printContainer.style.height = '100%';
    printContainer.style.backgroundColor = 'white';
    printContainer.style.zIndex = '9999';
    printContainer.innerHTML = printHTML;
    document.body.appendChild(printContainer);
    
    // Hide the main content and show only the print content
    const mainContent = document.querySelector('body > div') as HTMLElement;
    if (mainContent) {
      mainContent.style.display = 'none';
    }
    
    // Also hide any other content that might interfere
    const allDivs = document.querySelectorAll('body > div');
    allDivs.forEach(div => {
      if (div !== printContainer) {
        (div as HTMLElement).style.display = 'none';
      }
    });
    
    // Trigger print
    window.print();
    
    // Clean up after printing
    setTimeout(() => {
      document.body.removeChild(printContainer);
      // Restore all hidden content
      allDivs.forEach(div => {
        (div as HTMLElement).style.display = '';
      });
    }, 1000);
  };

  return (
    <button
      onClick={handlePrint}
      className="text-white font-bold py-2 px-4 rounded-md transition duration-300"
      style={{ backgroundColor: themeColors.accent, color: '#fff' }}
    >
      <span className="hidden lg:inline">Print List</span>
      <span className="lg:hidden">Print</span>
    </button>
  );
}
