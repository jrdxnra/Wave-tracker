// TODO: Future improvement
// - Implement global client tracking so that a participant's results can be aggregated across events.
// - Each participant should reference a global client ID (not just name).
// - This will allow tracking attendance, performance, and improvements across events.
// - For now, leaderboard is event-scoped and safe from cross-event leakage.
'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ConfigurationModal from '@/components/ConfigurationModal';
import EventPageHeader from '@/components/EventPageHeader';
import FloatingHamburgerMenu from '@/components/FloatingHamburgerMenu';
import StandardLeaderboard from '@/components/StandardLeaderboard';
import { useWaveStore } from '@/store/waveStore';
import { getBestLiftFromAttempts } from '@/lib/liftAttempts';

type Row = {
  name: string;
  value: number;
  score?: string;
  pr?: boolean;
};

type EventLane = {
  label: string;
  formula: 'DOTS' | 'Sinclair';
  rows: Row[];
};

type DivisionGroup = {
  label: 'Female' | 'Male' | 'Non-Binary';
  events: EventLane[];
};

const powerLifts: DivisionGroup[] = [
  {
    label: 'Female',
    events: [
      { label: 'Squat', formula: 'DOTS', rows: [{ name: 'Suzette Escobar', value: 365, score: '143.8', pr: true }, { name: 'Annie Chin', value: 235, score: '119.5', pr: true }, { name: 'Lucie Tvrznikova', value: 260, score: '116.5', pr: true }, { name: 'Anqi Chen', value: 205, score: '113.1' }, { name: 'JaJan Hsu', value: 205, score: '109.8', pr: true }] },
      { label: 'Bench Press', formula: 'DOTS', rows: [{ name: 'JaJan Hsu', value: 170, score: '91.1', pr: true }, { name: 'Lucie Tvrznikova', value: 195, score: '87.4', pr: true }, { name: 'Suzette Escobar', value: 205, score: '80.8' }, { name: 'Chioma Ezete', value: 215, score: '78.2' }, { name: 'Tracy Zhou', value: 135, score: '69.3' }] },
      { label: 'Deadlift', formula: 'DOTS', rows: [{ name: 'Lucie Tvrznikova', value: 330, score: '147.9' }, { name: 'Suzette Escobar', value: 365, score: '143.8' }, { name: 'Anna Chang', value: 300, score: '142.6' }, { name: 'Michelle Divers', value: 280, score: '134.2' }, { name: 'Anqi Chen', value: 240, score: '132.4', pr: true }] }
    ]
  },
  {
    label: 'Male',
    events: [
      { label: 'Squat', formula: 'DOTS', rows: [{ name: 'Fadi Yousif', value: 562, score: '165.0', pr: true }, { name: 'Aaron Bargotta', value: 395, score: '144.5', pr: true }, { name: 'Abdulkader Elogeil', value: 441, score: '142.6', pr: true }, { name: 'Amandy Nwana', value: 485, score: '140.0', pr: true }, { name: 'Robin Gertenbach', value: 405, score: '135.8', pr: true }] },
      { label: 'Bench Press', formula: 'DOTS', rows: [{ name: 'Leo Pan', value: 315, score: '112.2', pr: true }, { name: 'Mekka Okereke', value: 457, score: '109.2' }, { name: 'Robin Gertenbach', value: 315, score: '105.6' }, { name: 'Daniel DeBoskey', value: 365, score: '105.3', pr: true }, { name: 'Kyle Ngo', value: 305, score: '103.1' }] },
      { label: 'Deadlift', formula: 'DOTS', rows: [{ name: 'Robin Gertenbach', value: 545, score: '182.7' }, { name: 'Fadi Yousif', value: 622, score: '182.6', pr: true }, { name: 'Michael Li', value: 606, score: '180.3', pr: true }, { name: 'Abdulkader Elogeil', value: 496, score: '160.4', pr: true }, { name: 'Aaron Bargotta', value: 430, score: '157.3' }] }
    ]
  },
  {
    label: 'Non-Binary',
    events: [
      { label: 'Squat', formula: 'DOTS', rows: [{ name: 'No results yet', value: 0, score: '—' }] },
      { label: 'Bench Press', formula: 'DOTS', rows: [{ name: 'No results yet', value: 0, score: '—' }] },
      { label: 'Deadlift', formula: 'DOTS', rows: [{ name: 'No results yet', value: 0, score: '—' }] }
    ]
  }
];

const olympicLifts: DivisionGroup[] = [
  {
    label: 'Female',
    events: [
      { label: 'Clean & Jerk', formula: 'Sinclair', rows: [{ name: 'Lucie Tvrznikova', value: 205, score: '112.4' }, { name: 'Tracy Zhou', value: 145, score: '91.0', pr: true }, { name: 'Raven Jia', value: 155, score: '89.3' }, { name: 'Sissi Gunter', value: 105, score: '67.7' }, { name: 'Junyan Liu', value: 105, score: '65.2', pr: true }] },
      { label: 'Snatch', formula: 'Sinclair', rows: [{ name: 'Lucie Tvrznikova', value: 160, score: '87.7', pr: true }, { name: 'Tracy Zhou', value: 105, score: '65.9' }, { name: 'Suzette Escobar', value: 100, score: '49.0', pr: true }, { name: 'Sissi Gunter', value: 75, score: '48.3' }, { name: 'Junyan Liu', value: 75, score: '46.6' }] }
    ]
  },
  {
    label: 'Male',
    events: [
      { label: 'Clean & Jerk', formula: 'Sinclair', rows: [{ name: 'Daniel Ho', value: 260, score: '158.9', pr: true }, { name: 'Kirill Levashov', value: 275, score: '149.0' }, { name: 'Sergiy Turchyn', value: 265, score: '148.9' }, { name: 'Aakash Dutt', value: 225, score: '147.3', pr: true }, { name: 'Shree Hardikar', value: 275, score: '139.9' }] },
      { label: 'Snatch', formula: 'Sinclair', rows: [{ name: 'Daniel Ho', value: 225, score: '137.5', pr: true }, { name: 'Sergiy Turchyn', value: 220, score: '123.6' }, { name: 'Aakash Dutt', value: 185, score: '121.1' }, { name: 'Kirill Levashov', value: 220, score: '119.2' }, { name: 'Aldrin Balisi', value: 195, score: '113.5' }] }
    ]
  },
  {
    label: 'Non-Binary',
    events: [
      { label: 'Clean & Jerk', formula: 'Sinclair', rows: [{ name: 'No results yet', value: 0, score: '—' }] },
      { label: 'Snatch', formula: 'Sinclair', rows: [{ name: 'No results yet', value: 0, score: '—' }] }
    ]
  }
];

const hexToRgba = (hex: string, alpha: number) => {
  const safeHex = hex.replace('#', '');
  const fullHex = safeHex.length === 3 ? safeHex.split('').map((char) => char + char).join('') : safeHex;
  const value = Number.parseInt(fullHex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)', color: '#111827', fontFamily: 'Trebuchet MS, Arial Narrow, sans-serif' },
  inner: { maxWidth: 1550, margin: '0 auto', padding: '22px' },
  masthead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '16px 20px', color: '#1f2937', background: '#ffffff', borderRadius: 8, border: '1px solid #fed7aa', boxShadow: '0 10px 22px rgba(124, 45, 18, 0.08)' },
  eyebrow: { margin: 0, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c2410c', fontWeight: 900 },
  title: { margin: '6px 0 0', fontSize: 28, lineHeight: 1, color: '#1f2937' },
  stats: { display: 'flex', alignItems: 'stretch', gap: 1, overflow: 'hidden', borderRadius: 5, background: '#fff7ed', border: '1px solid #fed7aa' },
  stat: { minWidth: 116, padding: '8px 13px', background: '#ffffff' },
  statLabel: { margin: 0, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 900 },
  statValue: { marginTop: 4, fontSize: 21, color: '#1f2937', fontWeight: 900 },
  section: { marginTop: 22 },
  sectionTitle: { display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 9px' },
  sectionTitleText: { margin: 0, fontSize: 22, lineHeight: 1, color: '#1f2937' },
  rule: { height: 2, flex: 1, background: '#dbe3ed' },
  division: { display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', border: 0, background: '#fff' },
  divisionName: { display: 'flex', alignItems: 'center', padding: '18px 12px', background: '#fff1e8', color: '#9a3412', fontSize: 13, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' },
  eventGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, padding: 10, background: '#eef2f7' },
  olyGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: 10, background: '#eef2f7' },
  eventLane: { minWidth: 0, padding: 11, background: '#ffffff', border: '1px solid #dbe3ed', borderRadius: 6, boxShadow: '0 3px 10px rgba(15, 23, 42, 0.05)' },
  laneHeader: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  laneLabel: { margin: 0, color: '#c2410c', fontSize: 12, fontWeight: 900 },
  laneFormula: { color: '#6b7280', fontSize: 10, fontWeight: 800 },
  standing: { display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, minHeight: 48, borderTop: '1px solid #e5e7eb' },
  rank: { width: 21, height: 21, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#e8edf4', color: '#4b5563', fontSize: 10, fontWeight: 900 },
  firstRank: { width: 21, height: 21, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#fef3c7', color: '#b45309', fontSize: 10, fontWeight: 900 },
  athlete: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 900 },
  score: { textAlign: 'right', whiteSpace: 'nowrap', color: '#c2410c', fontSize: 14, fontWeight: 900 },
  scoreSmall: { display: 'inline', margin: 0, color: '#1f2937', fontSize: 14, fontWeight: 800 },
  pr: { display: 'inline-grid', placeItems: 'center', width: 20, height: 16, marginLeft: 4, borderRadius: 4, background: '#fef3c7', color: '#b45309', fontSize: 8, fontWeight: 900, verticalAlign: '1px'} ,
  empty: { margin: 0, color: '#6b7280', fontSize: 12, fontWeight: 800 },
  totals: { display: 'grid', gridTemplateColumns: '110px repeat(2, minmax(0, 1fr))', marginTop: 8, overflow: 'hidden', borderRadius: 8, boxShadow: '0 12px 24px rgba(31, 41, 55, 0.18)' },
  totalsTitle: { display: 'flex', alignItems: 'center', padding: '16px 12px', color: '#ffffff', fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.25)' },
  totalLane: { padding: 11 },
  totalLaneTitle: { margin: '0 0 8px', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' },
  totalRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderTop: '1px solid rgba(15, 23, 42, 0.12)', color: '#111827', fontSize: 12, fontWeight: 900 },
  totalValue: { color: '#111827' },
  sectionDivider: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  numberValue: { margin: '8px 0 0', fontSize: 34, fontWeight: 900, lineHeight: 1 },
  scoreBefore: { content: '"Weight "', color: '#66758e', fontSize: 9, letterSpacing: '.04em', textTransform: 'uppercase' },
};

const confettiPieces = Array.from({ length: 18 }, (_, index) => index);

function LeaderboardCelebration() {
  const { waves, customEvents, olympicLiftMovements, movementTimingMode, themeColors } = useWaveStore();
  const [celebratingName, setCelebratingName] = useState<string | null>(null);
  const previousNames = useRef<Set<string> | null>(null);
  const celebrationTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leaderboardNames = new Set(
    Object.values(waves).flatMap((wave) => wave.participants)
      .filter((participant) => participant.includeInLeaderboard !== false)
      .filter((participant) => customEvents.some((event) => {
        if (olympicLiftMovements.includes(event) && participant.olympicLiftsOptIn !== true) return false;
        if (movementTimingMode === 'lift') return getBestLiftFromAttempts(participant.waveData, event) > 0;
        return (Number.parseFloat(participant.waveData?.[event] || '') || 0) > 0;
      }))
      .map((participant) => participant.name.trim())
      .filter(Boolean),
  );
  const namesSignature = [...leaderboardNames].sort().join('\u001f');

  useEffect(() => {
    if (!namesSignature) return;

    const currentNames = new Set(namesSignature.split('\u001f'));
    if (!previousNames.current) {
      previousNames.current = currentNames;
      return;
    }

    const newName = [...currentNames].find((name) => !previousNames.current?.has(name));
    previousNames.current = currentNames;
    if (!newName || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    setCelebratingName(newName);
    if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
    celebrationTimeout.current = setTimeout(() => setCelebratingName(null), 3600);
  }, [namesSignature]);

  useEffect(() => () => {
    if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
  }, []);

  if (!celebratingName) return null;

  return (
    <div className="leaderboard-celebration" role="status" aria-live="polite">
      <div
        className="leaderboard-celebration__card"
        style={{ borderColor: themeColors.accent, '--celebration-color': themeColors.accent } as CSSProperties}
      >
        <span className="leaderboard-celebration__emoji" aria-hidden="true">🥳</span>
        <div>
          <p className="leaderboard-celebration__eyebrow">New leaderboard entry</p>
          <p className="leaderboard-celebration__name">{celebratingName}</p>
        </div>
      </div>
      <div className="leaderboard-celebration__confetti" aria-hidden="true">
        {confettiPieces.map((piece) => <span key={piece} style={{ '--confetti-index': piece } as CSSProperties} />)}
      </div>
    </div>
  );
}

function LeaderboardRow({ name, value, score, pr }: Row, index: number, color: string, prColor: string) {
  const isFirst = index === 0;

  return (
    <div key={`${name}-${index}`} style={styles.standing}>
      <span style={isFirst ? { ...styles.firstRank, background: hexToRgba(prColor, 0.18), color: prColor } : styles.rank}>{index + 1}</span>
      <span style={styles.athlete}>
        {name}
        {pr && <span style={{ ...styles.pr, background: hexToRgba(prColor, 0.2), color: prColor }}>PR</span>}
      </span>
      <span style={{ ...styles.score, color, textAlign: 'right' }}>
        {value}
        <small style={styles.scoreSmall}>{score ? ` / ${score}` : ''}</small>
      </span>
    </div>
  );
}

export default function Leaderboard() {
  const movementTimingMode = useWaveStore((state) => state.movementTimingMode);
  return (
    <>
      <LeaderboardCelebration />
      {movementTimingMode === 'lift' ? <GFitLeaderboard /> : <StandardLeaderboard />}
    </>
  );
}

function GFitLeaderboard() {
  const { eventBranding, themeColors, waves, customEvents, olympicLiftMovements } = useWaveStore();
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const start = themeColors?.start || '#ea580c';
  const mid = themeColors?.mid || '#f97316';
  const end = themeColors?.end || '#fbbf24';
  const accent = themeColors?.accent || mid;
  const accentHover = themeColors?.accentHover || start;
  const powerColor = accentHover;
  const olyColor = end;
  const divisions: DivisionGroup['label'][] = ['Female', 'Male', 'Non-Binary'];
  const powerMovements = customEvents.filter((event) => !olympicLiftMovements.includes(event));
  const olympicMovements = customEvents.filter((event) => olympicLiftMovements.includes(event));

  const parseLift = (value: string | undefined) => {
    const parsed = Number.parseFloat(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const normalizeDivision = (value: string | undefined): DivisionGroup['label'] => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized.includes('non')) return 'Non-Binary';
    if (normalized.includes('men') && !normalized.includes('women')) return 'Male';
    if (normalized.includes('woman') || normalized.includes('women') || normalized.includes('female')) return 'Female';
    if (normalized.includes('male')) return 'Male';
    return 'Non-Binary';
  };
  const getBestLift = getBestLiftFromAttempts;


  const buildGroups = (movements: string[], formula: EventLane['formula'], requireOlympicOptIn = false): DivisionGroup[] => divisions.map((division) => ({
    label: division,
    events: movements.map((event) => {
      const rows = Object.values(waves).flatMap((wave) => wave.participants)
        .filter((participant) => participant.includeInLeaderboard !== false)
        .filter((participant) => normalizeDivision(participant.genderCategory) === division)
        .filter((participant) => !requireOlympicOptIn || participant.olympicLiftsOptIn === true)
        .map((participant) => {
          const value = getBestLift(participant.waveData, event);
          const prTarget = parseLift(participant.liftMovementPrs?.[event]);
          return {
            name: participant.name,
            value,
            pr: value > 0 && prTarget > 0 && value > prTarget,
          };
        })
        .filter((row) => row.value > 0)
        .sort((first, second) => second.value - first.value || first.name.localeCompare(second.name));

      return {
        label: event,
        formula,
        rows: rows.length > 0 ? rows : [{ name: 'No results yet', value: 0, score: '—' }],
      };
    }),
  }));

  const livePowerLifts = buildGroups(powerMovements, 'DOTS');
  const liveOlympicLifts = buildGroups(olympicMovements, 'Sinclair', true);
  const scoredRows = [...livePowerLifts, ...liveOlympicLifts]
    .flatMap((group) => group.events.flatMap((event) => event.rows))
    .filter((row) => row.name !== 'No results yet');
  const prCount = scoredRows.filter((row) => row.pr).length;
  const totalWeightLifted = scoredRows.reduce((sum, row) => sum + row.value, 0);

  const totalRows = (movements: string[], requireOlympicOptIn = false) => divisions.map((division) => {
    const lifterTotals = Object.values(waves).flatMap((wave) => wave.participants)
      .filter((participant) => participant.includeInLeaderboard !== false)
      .filter((participant) => normalizeDivision(participant.genderCategory) === division)
      .filter((participant) => !requireOlympicOptIn || participant.olympicLiftsOptIn === true)
      .map((participant) => ({
        name: participant.name,
        total: movements.reduce((sum, event) => sum + getBestLift(participant.waveData, event), 0),
      }))
      .filter((entry) => entry.total > 0)
      .sort((first, second) => second.total - first.total || first.name.localeCompare(second.name));
    const winner = lifterTotals[0];
    return { division, winner };
  });

  const renderEventLane = (lane: EventLane, isOlympic = false) => {
    const laneColor = isOlympic ? olyColor : powerColor;
    return (
      <article key={lane.label} style={styles.eventLane}>
        <div style={styles.laneHeader}>
          <span style={{ ...styles.laneLabel, color: laneColor }}>{lane.label}</span>
          <span style={styles.laneFormula}>{lane.formula}</span>
        </div>
        {lane.rows.map((row, index) => {
          const isNoData = row.name === 'No results yet';
          if (isNoData) {
            return <p key={`${lane.label}-empty`} style={styles.empty}>No results yet</p>;
          }
          return LeaderboardRow(row, index, laneColor, laneColor);
        })}
      </article>
    );
  };

  const renderDivision = (group: DivisionGroup, isOlympic = false) => {
    const laneColor = isOlympic ? olyColor : powerColor;
    return (
      <div key={group.label} style={styles.division}>
        <div style={{ ...styles.divisionName, background: hexToRgba(laneColor, 0.12), color: laneColor }}>{group.label}</div>
        <div style={isOlympic ? styles.olyGrid : styles.eventGrid}>
          {group.events.map((lane) => renderEventLane(lane, isOlympic))}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.page}>
      <main style={styles.inner}>
        <EventPageHeader
          eventBranding={eventBranding}
          pageLabel="Leaderboard"
          subtitle="GFit Games results across every lift"
          headerAside={(
            <div className="absolute right-5 top-1/2 hidden -translate-y-1/2 md:flex">
              <div style={{ ...styles.stats, background: `linear-gradient(135deg, ${start}, ${end})`, borderColor: hexToRgba(mid, 0.45) }}>
                <div style={{ ...styles.stat, background: 'rgba(255,255,255,0.92)' }}>
                  <p style={{ ...styles.statLabel, color: '#111827' }}>PR Count</p>
                  <p style={{ ...styles.statValue, color: accentHover }}>{prCount}</p>
                </div>
                <div style={{ ...styles.stat, background: 'rgba(255,255,255,0.92)' }}>
                  <p style={{ ...styles.statLabel, color: '#111827' }}>Weight Lifted</p>
                  <p style={{ ...styles.statValue, color: accentHover }}>{totalWeightLifted.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        />

        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <h2 style={{ ...styles.sectionTitleText, color: powerColor }}>Power Lifting</h2>
            <div style={{ ...styles.rule, background: hexToRgba(powerColor, 0.3) }} />
          </div>
          {livePowerLifts.map((group) => renderDivision(group, false))}
        </section>

        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <h2 style={{ ...styles.sectionTitleText, color: olyColor }}>Olympic Lifting</h2>
            <div style={{ ...styles.rule, background: hexToRgba(olyColor, 0.3) }} />
          </div>
          {liveOlympicLifts.map((group) => renderDivision(group, true))}
        </section>

        <section style={styles.section}>
          <div style={styles.sectionTitle}>
            <h2 style={styles.sectionTitleText}>Overall Totals</h2>
            <div style={{ ...styles.rule, background: hexToRgba(accent, 0.3) }} />
          </div>
          <div style={{ ...styles.totals, background: `linear-gradient(135deg, ${start} 0%, ${mid} 55%, ${end} 100%)`, border: 'none' }}>
            <div style={styles.totalsTitle}>Female<br />Male<br />Non-Binary</div>
            <article style={{ ...styles.totalLane, background: 'rgba(255,255,255,0.9)', borderLeft: '1px solid rgba(255,255,255,0.5)', borderTop: 'none' }}>
              <h3 style={{ ...styles.totalLaneTitle, color: powerColor }}>Powerlifting · DOTS</h3>
              {totalRows(powerMovements).map(({ division, winner }) => (
                <div key={`power-total-${division}`} style={styles.totalRow}>
                  <span>{division}{winner ? ` · ${winner.name}` : ''}</span>
                  <span style={{ ...styles.totalValue, color: winner ? powerColor : '#111827' }}>{winner ? `${winner.total.toLocaleString()} lbs` : '--'}</span>
                </div>
              ))}
            </article>
            <article style={{ ...styles.totalLane, background: 'rgba(255,255,255,0.82)', borderLeft: '1px solid rgba(255,255,255,0.5)', borderTop: 'none' }}>
              <h3 style={{ ...styles.totalLaneTitle, color: olyColor }}>Olympic · Sinclair</h3>
              {totalRows(olympicMovements, true).map(({ division, winner }) => (
                <div key={`olympic-total-${division}`} style={styles.totalRow}>
                  <span>{division}{winner ? ` · ${winner.name}` : ''}</span>
                  <span style={{ ...styles.totalValue, color: winner ? olyColor : '#111827' }}>{winner ? `${winner.total.toLocaleString()} lbs` : '--'}</span>
                </div>
              ))}
            </article>
          </div>
        </section>
      </main>
      <ConfigurationModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
      <FloatingHamburgerMenu onSettingsClick={() => setIsConfigOpen(true)} currentPage="leaderboard" />
    </div>
  );
}


