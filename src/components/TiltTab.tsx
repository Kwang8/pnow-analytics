import { useMemo } from 'react';
import type { PlayerStats, HandResult } from '../lib/types';
import HandCard from './HandCard';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';

interface Props {
  stats: PlayerStats;
  onReplay?: (handNumber: string) => void;
}

interface TiltWindow {
  trigger: HandResult;
  triggerIdx: number;
  windowHands: HandResult[];
  windowVpip: number;
  windowLoss: number; // BB lost in window
}

const TRIGGER_THRESHOLD_BB = 10;
const WINDOW_SIZE = 8;
const VPIP_SPIKE_THRESHOLD = 15;

export default function TiltTab({ stats, onReplay }: Props) {
  const baselineVpip = stats.vpip;
  const results = stats.handResults;

  const { tiltWindows, chartData } = useMemo(() => {
    const windows: TiltWindow[] = [];

    // Find trigger hands and analyze aftermath
    for (let i = 0; i < results.length; i++) {
      const hand = results[i];
      if (hand.netResultBB > -TRIGGER_THRESHOLD_BB) continue;

      // Get next WINDOW_SIZE hands
      const windowHands = results.slice(i + 1, i + 1 + WINDOW_SIZE);
      if (windowHands.length < 3) continue; // not enough hands to analyze

      // Compute VPIP in window (did hero voluntarily put money in?)
      let vpipCount = 0;
      let windowLoss = 0;
      for (const wh of windowHands) {
        const heroActions = wh.actions.filter(a => a.isHero);
        const voluntaryAction = heroActions.some(a =>
          a.street === 'preflop' && (a.action === 'call' || a.action === 'raise')
        );
        if (voluntaryAction) vpipCount++;
        if (wh.netResultBB < 0) windowLoss += wh.netResultBB;
      }

      const windowVpip = (vpipCount / windowHands.length) * 100;

      if (windowVpip > baselineVpip + VPIP_SPIKE_THRESHOLD) {
        windows.push({
          trigger: hand,
          triggerIdx: i,
          windowHands,
          windowVpip,
          windowLoss,
        });
      }
    }

    // Build chart data: rolling VPIP over a window
    const rollingWindow = 10;
    const chartData: { hand: number; vpip: number; tilt: boolean }[] = [];
    for (let i = 0; i < results.length; i++) {
      const start = Math.max(0, i - rollingWindow + 1);
      const slice = results.slice(start, i + 1);
      let vCount = 0;
      for (const h of slice) {
        const heroActions = h.actions.filter(a => a.isHero);
        if (heroActions.some(a => a.street === 'preflop' && (a.action === 'call' || a.action === 'raise'))) {
          vCount++;
        }
      }
      const rollingVpip = (vCount / slice.length) * 100;

      // Check if this hand falls within any tilt window
      const inTilt = windows.some(w => i > w.triggerIdx && i <= w.triggerIdx + WINDOW_SIZE);

      chartData.push({ hand: i + 1, vpip: rollingVpip, tilt: inTilt });
    }

    return { tiltWindows: windows, chartData };
  }, [results, baselineVpip]);

  const totalTiltCost = tiltWindows.reduce((s, w) => s + w.windowLoss, 0);
  const totalTiltCostCents = tiltWindows.reduce((s, w) => {
    return s + w.windowHands.filter(h => h.netResult < 0).reduce((sum, h) => sum + h.netResult, 0);
  }, 0);

  if (results.length < 20) {
    return (
      <div className="text-center py-12 text-text-muted">
        Need at least 20 hands to detect tilt patterns.
      </div>
    );
  }

  if (tiltWindows.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-stat-green/10 border border-stat-green/30 rounded-lg p-4">
          <div className="text-stat-green text-xs uppercase tracking-wider font-semibold mb-1">No Tilt Detected</div>
          <div className="text-text-secondary text-sm">
            Your play stayed consistent after big losses. Baseline VPIP: {baselineVpip.toFixed(0)}% — no significant spikes detected.
          </div>
        </div>

        {/* Still show the VPIP chart */}
        {chartData.length > 0 && (
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <h3 className="text-text-primary font-semibold mb-3">Rolling VPIP ({10}-hand window)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <XAxis dataKey="hand" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: '#141a23', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelFormatter={v => `Hand ${v}`}
                  formatter={(v: number) => [`${v.toFixed(0)}%`, 'VPIP']}
                />
                <Area type="monotone" dataKey="vpip" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
              <span>Baseline VPIP: {baselineVpip.toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tilt Summary Banner */}
      <div className="bg-stat-red/10 border border-stat-red/30 rounded-lg p-4">
        <div className="text-stat-red text-xs uppercase tracking-wider font-semibold mb-1">Tilt Detected</div>
        <div className="text-text-primary font-semibold">
          {tiltWindows.length} tilt episode{tiltWindows.length !== 1 ? 's' : ''} cost you{' '}
          {totalTiltCost.toFixed(1)} BB (${Math.abs(totalTiltCostCents / 100).toFixed(2)})
        </div>
        <div className="text-text-muted text-sm mt-1">
          Your VPIP spiked {VPIP_SPIKE_THRESHOLD}+ points above your {baselineVpip.toFixed(0)}% baseline after big losses.
        </div>
      </div>

      {/* Rolling VPIP Chart with tilt zones */}
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <h3 className="text-text-primary font-semibold mb-3">Rolling VPIP ({10}-hand window)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <XAxis dataKey="hand" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ background: '#141a23', border: '1px solid #1e293b', borderRadius: 8 }}
              labelFormatter={v => `Hand ${v}`}
              formatter={(v: number) => [`${v.toFixed(0)}%`, 'VPIP']}
            />
            {/* Tilt zone highlights */}
            {tiltWindows.map((w, i) => (
              <ReferenceArea
                key={i}
                x1={w.triggerIdx + 1}
                x2={Math.min(w.triggerIdx + 1 + WINDOW_SIZE, results.length)}
                fill="#ef4444"
                fillOpacity={0.15}
              />
            ))}
            <Area type="monotone" dataKey="vpip" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
          <span>Baseline VPIP: {baselineVpip.toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-stat-red/30 rounded" /> Tilt zone</span>
        </div>
      </div>

      {/* Tilt Episodes */}
      <div className="space-y-4">
        <h3 className="text-text-primary font-semibold">Tilt Episodes</h3>
        {tiltWindows.map((w, i) => (
          <div key={i} className="bg-bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-stat-red text-xs uppercase tracking-wider font-semibold">Trigger</span>
                <span className="text-text-muted text-xs ml-2">
                  Lost {Math.abs(w.trigger.netResultBB).toFixed(1)} BB in hand #{w.trigger.handNumber}
                </span>
              </div>
              <div className="text-right">
                <div className="text-text-muted text-xs">Next {w.windowHands.length} hands</div>
                <div className="text-stat-red font-mono text-sm font-bold">
                  VPIP {w.windowVpip.toFixed(0)}% (baseline {baselineVpip.toFixed(0)}%)
                </div>
                <div className="text-stat-red font-mono text-xs">
                  {w.windowLoss.toFixed(1)} BB lost
                </div>
              </div>
            </div>
            <HandCard hand={w.trigger} compact onReplay={onReplay} />
          </div>
        ))}
      </div>
    </div>
  );
}
