const summary = [
  { label: 'Registration Form', value: '0', detail: 'Webhook-verified submissions', color: '#2563eb' },
  { label: 'Waitlist Total', value: '5', detail: 'Manual admissions + remaining', color: '#d97706' },
  { label: 'Still Waiting', value: '0', detail: 'Current waitlisted status', color: '#ea580c' },
  { label: 'Manually Added', value: '5', detail: 'Waitlist replacements', color: '#7c3aed' },
  { label: 'Confirmed', value: '0', detail: 'Registration assignments', color: '#059669' },
  { label: 'Cancellations', value: '11', detail: '10 cancelled + 1 not reassigned', color: '#dc2626' },
];

const movements = [
  { name: 'Squat (reps)', recorded: 3, average: '197 reps' },
  { name: 'Bench (reps)', recorded: 3, average: '123 reps' },
  { name: 'Deadlift (reps)', recorded: 3, average: '197 reps' },
  { name: 'Clean & Jerk (reps)', recorded: 1, average: '123 reps' },
  { name: 'Snatch (reps)', recorded: 1, average: '123 reps' },
];

function Metric({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm" style={{ borderTopColor: color, borderTopWidth: 3 }}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-600">{detail}</p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Ratio({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900 whitespace-nowrap">{count}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: count.includes('60.0%') ? '60%' : count.includes('20.0%') ? '20%' : '0%', backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Registration and Waitlist</h2>
          <p className="mt-1 text-xs text-gray-500">Attendance = at least one recorded result</p>
        </div>
        <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded">Reference snapshot · not live</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {summary.map((metric) => <Metric key={metric.label} {...metric} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { title: 'Swim Levels', color: '#2563eb' },
          { title: 'Entry Type', color: '#059669' },
          { title: 'Triathlon Experience', color: '#d97706' },
        ].map(({ title, color }) => (
          <Section key={title} title={title}>
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="size-24 rounded-full border-[12px] border-gray-100" style={{ borderTopColor: color }} aria-hidden="true" />
              <div><p className="text-2xl font-bold text-gray-900">0</p><p className="text-xs text-gray-500">form responses</p></div>
            </div>
          </Section>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Wave Preference Fulfillment" subtitle="Confirmed registrations matched against selected hour windows and exact-minute requests.">
          <div className="space-y-4">
            <Ratio label="First choice" count="0 (0.0%)" color="#059669" />
            <Ratio label="Second choice" count="0 (0.0%)" color="#2563eb" />
            <Ratio label="Another time" count="0 (0.0%)" color="#d97706" />
          </div>
        </Section>
        <Section title="Attendance and Result Capture" subtitle="Unique clients are estimated by normalized participant name.">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['5', 'Estimated unique clients'], ['5', 'Roster records'],
              ['3 (60.0%)', 'Checked in / any result'], ['1 (20.0%)', 'All results recorded'],
              ['2', 'No results recorded'], ['0', 'Possible duplicate records'],
            ].map(([value, label]) => (
              <div key={label}><p className="text-2xl font-bold text-gray-900">{value}</p><p className="text-xs text-gray-500">{label}</p></div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Client Performance" subtitle="Average completed result excludes zero scores.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 text-left font-medium">Movement</th>
                <th className="py-2 text-right font-medium">Recorded</th>
                <th className="py-2 text-right font-medium">Average Result</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((movement) => (
                  <tr key={movement.name}>
                    <td className="py-2.5 text-gray-800">{movement.name}</td>
                    <td className="py-2.5 text-right text-gray-700">{movement.recorded}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">{movement.average}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Swim Performance by Level" subtitle="Average nonzero Squat result among matched registration records.">
          <div className="grid grid-cols-3 gap-3 text-center">
            {['Advanced', 'Intermediate', 'Novice'].map((level) => (
              <div key={level} className="min-w-0">
                <p className="text-2xl font-bold text-gray-900">-</p>
                <p className="text-xs text-gray-600 break-words">{level}</p>
                <p className="text-xs text-gray-500">0 clients</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Admission Method Completion">
          <div className="space-y-4">
            <Ratio label="Manual waitlist replacements" count="1 (20.0%)" color="#7c3aed" />
            <Ratio label="Form-assigned clients" count="0 (0.0%)" color="#2563eb" />
          </div>
        </Section>
        <Section title="Completion by Entry Type">
          <div className="space-y-4">
            {['Solo', 'Group', 'Buddy'].map((entryType) => <Ratio key={entryType} label={entryType} count="0 (0.0%)" color="#059669" />)}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Strongest Result Capture"><Ratio label="9:30 AM" count="3 (60.0%)" color="#059669" /></Section>
        <Section title="Weakest Result Capture"><Ratio label="9:30 AM" count="3 (60.0%)" color="#dc2626" /></Section>
      </div>
    </div>
  );
}