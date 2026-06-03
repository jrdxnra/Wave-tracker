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
  };
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
  const leftEmoji = eventBranding.emojiLeft?.trim() || '';
  const rightEmoji = eventBranding.emojiRight?.trim() || '';

  const handlePrint = () => {
    // Freeze all print data at click-time so output remains consistent.
    const snapshot = {
      title: eventBranding.title,
      leftEmoji,
      rightEmoji,
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
        participants: wave.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          waveData: { ...(participant.waveData || {}) },
        })),
      },
    };

    const printWave = snapshot.wave;
    const printEvents = snapshot.customEvents;
    // Compute dynamic Name column width based on the average of the longest names
    const nameLengths = printWave.participants
      .map(p => (p.name || '').length);
    const topN = nameLengths.sort((a, b) => b - a).slice(0, 5);
    const avgChars = topN.length ? topN.reduce((a, b) => a + b, 0) / topN.length : 16;
    const nameWidthPx = Math.min(200, Math.max(140, Math.round(avgChars * 7.2 + 24)));

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
          <title>${snapshot.title} - ${printWave.name}</title>
          <style>
            body { 
              margin: 0; 
              padding: 12px; 
              font-family: 'Inter', Arial, sans-serif;
              background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
              font-size: 9pt;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              padding: 20px;
              background: linear-gradient(135deg, ${snapshot.themeColors.start} 0%, ${snapshot.themeColors.mid} 50%, ${snapshot.themeColors.end} 100%);
              border-radius: 12px;
              color: white;
              position: relative;
              overflow: hidden;
            }
            .header:before {
              content: '${snapshot.leftEmoji}';
              position: absolute;
              top: 10px;
              left: 20px;
              font-size: 24pt;
              opacity: 0.7;
            }
            .header:after {
              content: '${snapshot.rightEmoji}';
              position: absolute;
              top: 10px;
              right: 20px;
              font-size: 24pt;
              opacity: 0.7;
            }
            .title {
              font-size: 18pt;
              font-weight: bold;
              color: white;
              margin: 0 0 10px 0;
              text-align: center;
            }
            .wave-info {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
              background: white;
              padding: 15px;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              border-left: 4px solid #6b7280;
            }
            .wave-name {
              font-size: 16pt;
              font-weight: bold;
              color: white;
              text-align: center;
              margin-top: 5px;
            }
            .start-time {
              font-size: 12pt;
              color: #1f2937;
              font-weight: 700;
            }
            .participant-card {
              border: 2px solid #e5e7eb;
              border-radius: 8px;
              margin-bottom: 6px;
              background: white;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
              position: relative;
            }
            .participant-card:before {
              content: '💪';
              position: absolute;
              top: -8px;
              right: 10px;
              background: white;
              padding: 2px 6px;
              border-radius: 50%;
              font-size: 12pt;
              border: 2px solid #6b7280;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            .participant-info {
              background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
              padding: 8px 12px;
              border-bottom: 2px solid #e5e7eb;
              border-radius: 6px 6px 0 0;
              display: flex;
              justify-content: flex-start;
              align-items: center;
              gap: 12px;
              color: #1f2937;
            }
            .participant-name {
              font-weight: bold;
              font-size: 11pt;
              color: #1f2937;
            }
            .workout-section {
              padding: 3px 10px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 9pt;
              color: #374151;
            }
            .workout-section:last-child {
              border-bottom: none;
              border-radius: 0 0 6px 6px;
            }
            .workout-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(75px, 1fr));
              gap: 1px;
              margin-top: 2px;
            }
            .workout-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              height: 100%;
              justify-content: space-between;
            }
            .workout-label {
              font-weight: bold;
              font-size: 7pt;
              color: #374151;
              margin-bottom: 2px;
              text-transform: uppercase;
              min-height: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              word-wrap: break-word;
              word-break: break-word;
              max-width: 75px;
              line-height: 1.1;
            }
            .workout-value {
              font-size: 9pt;
              color: #000;
              min-height: 10px;
              border-bottom: 1px solid #d1d5db;
              width: 100%;
              text-align: center;
              margin-top: auto;
            }
            /* Two-line label when a hyphen is present: first part on line 1, rest on line 2 (kept together) */
            .hyphen-wrap {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .hyphen-wrap .line2 {
              white-space: nowrap;
            }
            /* Compact table layout (Option A) */
            .print-table { 
              width: 100%; 
              border-collapse: collapse; 
              table-layout: fixed; 
              display: table;
              border: 1px solid #d1d5db;
            }
            .print-table thead th { 
              font-size: 7pt; 
              text-transform: none; 
              color: #1f2937; 
              font-weight: bold; 
              padding: 4px 6px; 
              line-height: 1.2;
              background: #f8fafc;
              border: 1px solid #d1d5db;
              text-align: center;
            }
            .time-header {
              font-weight: bold;
              font-size: 7.5pt;
            }
            .print-table thead th:first-child {
              border-radius: 6px 0 0 0;
              background: #f8fafc;
              color: #1f2937;
              font-weight: 600;
            }
            .print-table thead th:last-child {
              border-radius: 0 6px 0 0;
            }
            .print-table th, .print-table td { border: 1px solid #d1d5db; }
            .print-table tbody td { 
              padding: 8px 4px; 
              vertical-align: middle; 
              line-height: 1.3; 
              color: #111827;
              height: 32px;
            }
            .col-num { width: 22px; text-align: right; color: #6b7280; padding-top: 6px !important; padding-bottom: 6px !important; }
            .col-name { width: ${nameWidthPx}px; padding-top: 6px !important; padding-bottom: 6px !important; }
            .name-cell { display: flex; flex-direction: column; justify-content: center; min-height: 24px; }
            .name-cell .name { font-weight: 700; font-size: 10pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .value { text-align: center; font-size: 9pt; }
            .header-label { display: flex; flex-direction: column; align-items: center; }
            .header-label .line2 { white-space: nowrap; }
            .mini-header th {
              font-size: 7pt; 
              text-transform: none; 
              color: #1f2937; 
              font-weight: 600; 
              padding: 4px 6px;
              border: 1px solid #d1d5db;
              background: #f8fafc;
              line-height: 1.2;
              text-align: center;
            }
            .mini-header th:first-child {
              background: #f8fafc;
              color: #1f2937;
              font-weight: 600;
            }
            .event-notes {
              margin-top: 12px;
              padding: 12px;
              background: #f8fafc;
              border: 2px solid #6b7280;
              border-radius: 8px;
              page-break-inside: avoid;
              min-height: 90px;
              color: #1f2937;
              position: relative;
            }
            .event-notes h3 {
              margin: 0 0 8px 0;
              font-size: 11pt;
              font-weight: bold;
              color: #1f2937;
            }
            .event-notes p {
              margin: 0;
              font-size: 9pt;
              color: #1f2937;
              line-height: 1.4;
            }
            @media print {
              body { 
                margin: 0; 
                padding: 12px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color-adjust: exact;
              }
              .header {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .participant-card { box-shadow: none; }
              thead { display: table-header-group; }
              .print-table { page-break-inside: auto; }
              .print-table tr { page-break-inside: avoid; page-break-after: auto; }
              .event-notes { page-break-before: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${snapshot.title} Wave Tracker</div>
            <div class="wave-name">${printWave.name}</div>
            ${printWave.startTime ? `<div class="start-time">Start Time: ${printWave.startTime}</div>` : ''}
          </div>

          <table class="print-table">
            <thead>
              <tr>
                <th class="col-num"></th>
                <th class="col-name" style="font-weight:600;text-transform:none;color:#1f2937;">
                  ${snapshot.movementTimingMode === 'individual'
                    ? '<div>&nbsp;</div><div>&nbsp;</div>'
                    : `<div>Timing: every ${snapshot.workMinutes + snapshot.restMinutes} min</div><div>Work ${snapshot.workMinutes}/ Rest ${snapshot.restMinutes}</div>`}
                </th>
                ${movementTimes.map((timing) => `
                  <th class="time-header">
                    <div>${timing.startLabel}</div>
                    ${snapshot.movementTimingMode === 'individual' ? `<div style="font-size:6.5pt;font-weight:600;color:#1d4ed8;">W${timing.workMinutes}/R${timing.restMinutes}</div>` : ''}
                  </th>
                `).join('')}
              </tr>
              <tr>
                <th class="col-num">#</th>
                <th class="col-name">Name</th>
                ${printEvents.map(event => {
                  if (event.includes('-')) {
                    const [first, ...restParts] = event.split('-');
                    const second = restParts.join('-').trim();
                    return `<th><span class=\"header-label\"><span>${first}</span><span class=\"line2\">${second}</span></span></th>`;
                  }
                  return `<th>${event}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${printWave.participants.slice(0, 15).map((participant, idx) => {
                const miniHeader = (idx > 0 && idx % 5 === 0) ? `
                  <tr class=\"mini-header\">
                    <th class=\"col-num\">#</th>
                    <th class=\"col-name\">Name</th>
                    ${printEvents.map(event => {
                      if (event.includes('-')) {
                        const [first, ...restParts] = event.split('-');
                        const second = restParts.join('-').trim();
                        return `<th><span class=\"header-label\"><span>${first}</span><span class=\"line2\">${second}</span></span></th>`;
                      }
                      return `<th>${event}</th>`;
                    }).join('')}
                  </tr>
                ` : '';

                return `
                  ${miniHeader}
                  <tr>
                    <td class=\"col-num\">${idx + 1}</td>
                    <td class=\"col-name\">
                      <div class=\"name-cell\">
                        <div class=\"name\">${participant.name || ''}</div>
                      </div>
                    </td>
                    ${printEvents.map(event => `<td class=\"value\">${(participant.waveData || {})[event] || ''}</td>`).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="event-notes">
            <h3>Event Notes & Details:</h3>
            <p>${snapshot.notes}</p>
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
