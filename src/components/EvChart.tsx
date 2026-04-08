import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, ReferenceLine, Legend,
} from 'recharts';
import { TrendingUp, Loader2 } from 'lucide-react';

// Fixed chart-area height so loading/empty/active states all occupy the
// same vertical space. Prevents layout shift as async data arrives.
const CHART_AREA_HEIGHT = 280;

interface EvDataPoint {
  /** Label for the x-axis (hand number, session date, etc.) */
  label: string;
  /** Cumulative actual P&L in dollars */
  actual: number;
  /** Cumulative EV-adjusted P&L in dollars */
  ev: number;
}

interface Props {
  /** Already-cumulative data points in chronological order */
  points: EvDataPoint[];
  /** Whether any of the hands in this series involved an all-in runout */
  hasAllInEvents: boolean;
  /** Show a skeleton state while upstream data is still being analyzed */
  loading?: boolean;
  title?: string;
  subtitle?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EvTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p: { dataKey: string }) => p.dataKey === 'actual')?.value as number;
  const ev = payload.find((p: { dataKey: string }) => p.dataKey === 'ev')?.value as number;
  const diff = actual - ev;
  return (
    <div style={{ background: '#141a23', border: '1px solid #1e2a3a', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
      <div style={{ color: '#e2e8f0', marginBottom: 4 }}>{label}</div>
      <div style={{ color: actual >= 0 ? '#22c55e' : '#ef4444' }}>
        Actual: {actual >= 0 ? '+' : ''}${actual.toFixed(2)}
      </div>
      <div style={{ color: '#94a3b8' }}>
        EV: {ev >= 0 ? '+' : ''}${ev.toFixed(2)}
      </div>
      <div style={{ color: diff >= 0 ? '#22c55e' : '#ef4444', marginTop: 2, fontSize: 11 }}>
        {diff >= 0 ? 'Above EV' : 'Below EV'}: {diff >= 0 ? '+' : ''}${diff.toFixed(2)}
      </div>
    </div>
  );
}

export default function EvChart({
  points,
  hasAllInEvents,
  loading = false,
  title = 'Actual vs Expected (All-in EV)',
  subtitle = 'How you ran on all-in pots vs how you should have run',
}: Props) {
  const summary = useMemo(() => {
    if (points.length === 0) return { actual: 0, ev: 0, diff: 0 };
    const last = points[points.length - 1];
    return { actual: last.actual, ev: last.ev, diff: last.actual - last.ev };
  }, [points]);

  const showChart = !loading && hasAllInEvents && points.length > 1;
  const showLuckBadge = showChart;

  return (
    <div className="bg-bg-card border border-border rounded-lg p-6">
      {/* Header — identical layout across all states so nothing shifts. */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-text-muted" />
            <h3 className="text-text-primary font-semibold">{title}</h3>
          </div>
          <p className="text-text-muted text-xs mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right shrink-0" aria-hidden={!showLuckBadge}>
          <div className="text-text-muted text-[10px] uppercase tracking-wider">Luck</div>
          {showLuckBadge ? (
            <>
              <div className={`font-mono text-lg font-bold ${summary.diff >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                {summary.diff >= 0 ? '+' : ''}${summary.diff.toFixed(2)}
              </div>
              <div className="text-text-muted text-[10px]">{summary.diff >= 0 ? 'above EV' : 'below EV'}</div>
            </>
          ) : (
            <>
              <div className="font-mono text-lg font-bold text-text-muted/40">—</div>
              <div className="text-text-muted/0 text-[10px]">—</div>
            </>
          )}
        </div>
      </div>

      {/* Chart area — fixed height so loading/empty/active share the same footprint. */}
      <div style={{ height: CHART_AREA_HEIGHT }}>
        {loading && (
          <div className="h-full flex items-center justify-center text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Crunching equities…</span>
          </div>
        )}

        {!loading && !hasAllInEvents && (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-text-muted text-sm max-w-md">
              No all-in showdowns detected yet. This chart lights up when you get chips in with
              cards exposed — then we can compare the pots you actually won against what you
              “should have” won based on equity at the moment of the all-in.
            </p>
          </div>
        )}

        {showChart && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                interval="preserveStartEnd"
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
              <Tooltip content={<EvTooltip />} />
              <Legend
                verticalAlign="top"
                height={24}
                iconType="line"
                wrapperStyle={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#94a3b8' }}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#141a23' }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ev"
                name="Expected"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#141a23' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
