import { useMemo } from 'react';
import type { OverallStats } from '../lib/types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
  ScatterChart, Scatter, ReferenceLine, ZAxis, Label, Tooltip,
} from 'recharts';

interface Props {
  stats: OverallStats;
  onSelectPlayer: (id: string) => void;
}

function getPlayerStyle(vpip: number, pfr: number): { label: string; category: string } {
  const loose = vpip > 25;
  const aggressive = pfr > 15;

  if (loose && aggressive) return { label: 'LAG', category: 'Loose-Aggressive' };
  if (loose && !aggressive) return { label: 'Calling Station', category: 'Loose-Passive' };
  if (!loose && aggressive) return { label: 'TAG', category: 'Tight-Aggressive' };
  return { label: 'Nit', category: 'Tight-Passive' };
}

const quadrantColors: Record<string, string> = {
  'TAG': '#22c55e',
  'LAG': '#fbbf24',
  'Nit': '#3b82f6',
  'Calling Station': '#ef4444',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PnlTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div style={{ background: '#141a23', border: '1px solid #1e2a3a', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
      <div style={{ color: '#e2e8f0', marginBottom: 4 }}>{label}</div>
      <div style={{ color: value >= 0 ? '#22c55e' : '#ef4444' }}>
        P&L: {value > 0 ? '+' : ''}{value.toFixed(1)} BB
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const m = d.meta;
  return (
    <div style={{ background: '#141a23', border: '1px solid #1e2a3a', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
      <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
        {m.name} — {m.styleLabel}
      </div>
      <div style={{ color: '#94a3b8' }}>VPIP: {d.vpip.toFixed(1)}%</div>
      <div style={{ color: '#94a3b8' }}>PFR: {d.pfr.toFixed(1)}%</div>
      <div style={{ color: m.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
        P&L: {m.pnl > 0 ? '+' : ''}{m.pnl.toFixed(1)} BB
      </div>
    </div>
  );
}

export default function OverallView({ stats, onSelectPlayer }: Props) {
  const pnlData = useMemo(() =>
    stats.players.map(p => ({
      name: p.name,
      pnl: p.pnlBB,
      barColor: p.pnlBB >= 0 ? '#22c55e' : '#ef4444',
    })),
    [stats]
  );

  const scatterData = useMemo(() =>
    stats.players.map(p => {
      const s = getPlayerStyle(p.vpip, p.pfr);
      return {
        vpip: p.vpip,
        pfr: p.pfr,
        hands: p.handsPlayed,
        // Metadata stored under a single key so Recharts doesn't spread it onto SVG elements
        meta: {
          name: p.name,
          id: p.id,
          pnl: p.pnlBB,
          styleLabel: s.label,
          fill: quadrantColors[s.label],
        },
      };
    }),
    [stats]
  );

  return (
    <div className="space-y-6">
      {/* Session Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Total Hands</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{stats.totalHands}</div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Players</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{stats.players.length}</div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Stakes</div>
          <div className="font-mono text-2xl font-bold text-text-primary">
            {(stats.bigBlind / 200).toFixed(2)}/{(stats.bigBlind / 100).toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Biggest Winner</div>
          <div className="font-mono text-xl font-bold text-stat-green">
            {stats.players[0]?.name} (+{stats.players[0]?.pnlBB.toFixed(1)})
          </div>
        </div>
      </div>

      {/* PnL Chart */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <h3 className="text-text-primary font-semibold mb-4">Session P&L (BB)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={pnlData} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" horizontal={false} />
            <XAxis type="number" stroke="#64748b" tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#64748b"
              tick={{ fill: '#e2e8f0', fontSize: 13 }}
              width={100}
            />
            <Tooltip content={<PnlTooltip />} />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
              {pnlData.map((entry, i) => (
                <Cell key={i} fill={entry.barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Player Style Quadrant */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <h3 className="text-text-primary font-semibold mb-4">Player Styles — VPIP vs PFR</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 40, bottom: 30, left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
            <XAxis
              type="number"
              dataKey="vpip"
              domain={[0, 80]}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
            >
              <Label value="VPIP %" offset={-10} position="insideBottom" fill="#94a3b8" fontSize={12} />
            </XAxis>
            <YAxis
              type="number"
              dataKey="pfr"
              domain={[0, 50]}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
            >
              <Label value="PFR %" angle={-90} position="insideLeft" fill="#94a3b8" fontSize={12} />
            </YAxis>
            <ZAxis type="number" dataKey="hands" range={[80, 300]} />
            <ReferenceLine x={25} stroke="#22c55e" strokeWidth={2} strokeOpacity={0.6} />
            <ReferenceLine y={15} stroke="#22c55e" strokeWidth={2} strokeOpacity={0.6} />
            <Tooltip content={<ScatterTooltip />} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Scatter data={scatterData} cursor="pointer" onClick={(d: any) => onSelectPlayer(d.meta.id)}>
              {scatterData.map((entry, i) => (
                <Cell key={i} fill={entry.meta.fill} fillOpacity={0.85} stroke={entry.meta.fill} strokeWidth={1} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#22c55e]" /> TAG</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#fbbf24]" /> LAG</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#3b82f6]" /> Nit</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#ef4444]" /> Calling Station</span>
        </div>
        <div className="grid grid-cols-2 gap-0 mt-2 text-center text-xs text-text-muted opacity-60">
          <div>Tight-Passive (Nit)</div>
          <div>Loose-Passive (Calling Station)</div>
          <div>Tight-Aggressive (TAG)</div>
          <div>Loose-Aggressive (LAG)</div>
        </div>
      </div>

      {/* Player Table */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
              <th className="text-left p-3">Player</th>
              <th className="text-right p-3 font-mono">Hands</th>
              <th className="text-right p-3 font-mono">VPIP</th>
              <th className="text-right p-3 font-mono">PFR</th>
              <th className="text-right p-3 font-mono">Style</th>
              <th className="text-right p-3 font-mono">P&L (BB)</th>
            </tr>
          </thead>
          <tbody>
            {stats.players.map(p => {
              const style = getPlayerStyle(p.vpip, p.pfr);
              return (
                <tr
                  key={p.id}
                  className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
                  onClick={() => onSelectPlayer(p.id)}
                >
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-right font-mono text-text-secondary">{p.handsPlayed}</td>
                  <td className="p-3 text-right font-mono text-text-secondary">{p.vpip.toFixed(1)}%</td>
                  <td className="p-3 text-right font-mono text-text-secondary">{p.pfr.toFixed(1)}%</td>
                  <td className="p-3 text-right">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ color: quadrantColors[style.label], background: `${quadrantColors[style.label]}15` }}>
                      {style.label}
                    </span>
                  </td>
                  <td className={`p-3 text-right font-mono font-bold ${p.pnlBB >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                    {p.pnlBB >= 0 ? '+' : ''}{p.pnlBB.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
