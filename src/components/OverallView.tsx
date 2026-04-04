import { useMemo, useState } from 'react';
import type { OverallStats } from '../lib/types';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceLine, ZAxis, Label, Tooltip,
} from 'recharts';
import { findMostSimilarHCL } from '../lib/hclPlayers';
import { useAuth } from '../lib/AuthContext';
import { claimPlayer } from '../lib/gameStore';
import { User, Check, Loader2 } from 'lucide-react';

interface Props {
  stats: OverallStats;
  onSelectPlayer: (id: string) => void;
  gameId?: string | null;
  claimedPlayerIds?: Set<string>;
  onClaimed?: (pokerNowPlayerId: string) => void;
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

const ROLE_BADGE: Record<'shark' | 'fish', { label: string; color: string }> = {
  shark: { label: 'Table Shark', color: '#f97316' },
  fish: { label: 'Table Fish', color: '#60a5fa' },
};

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
        P&L: {m.pnl >= 0 ? '+' : ''}${m.pnl.toFixed(2)}
      </div>
    </div>
  );
}

function HCLMiniAvatar({ player }: { player: import('../lib/hclPlayers').HCLPlayer }) {
  const [err, setErr] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {err ? (
        <div className="w-6 h-6 rounded-full bg-bg-hover text-[9px] flex items-center justify-center font-bold text-text-muted shrink-0">
          {player.nickname.slice(0, 2)}
        </div>
      ) : (
        <img
          src={player.photo}
          alt={player.nickname}
          onError={() => setErr(true)}
          className="w-6 h-6 rounded-full object-cover shrink-0"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="text-text-secondary text-xs truncate">{player.nickname}</span>
    </div>
  );
}

export default function OverallView({ stats, onSelectPlayer, gameId, claimedPlayerIds, onClaimed }: Props) {
  const { user } = useAuth();
  const [claiming, setClaiming] = useState<string | null>(null);
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
          pnl: p.pnl / 100,
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
            {stats.players[0]?.name} (+${(stats.players[0]?.pnl / 100).toFixed(2)})
          </div>
        </div>
        {(() => {
          const shark = stats.players.find(p => p.tableRole === 'shark');
          const fish = stats.players.find(p => p.tableRole === 'fish');
          return (
            <>
              {shark && (
                <div className="bg-bg-card border border-border rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider" style={{ color: ROLE_BADGE.shark.color }}>Table Shark</div>
                  <div className="font-mono text-lg font-bold text-text-primary truncate">{shark.name}</div>
                  <div className="font-mono text-xs text-text-muted">{((shark.pnlBB / shark.handsPlayed) * 100).toFixed(1)} bb/100</div>
                </div>
              )}
              {fish && (
                <div className="bg-bg-card border border-border rounded-lg p-4">
                  <div className="text-xs uppercase tracking-wider" style={{ color: ROLE_BADGE.fish.color }}>Table Fish</div>
                  <div className="font-mono text-lg font-bold text-text-primary truncate">{fish.name}</div>
                  <div className="font-mono text-xs text-text-muted">{((fish.pnlBB / fish.handsPlayed) * 100).toFixed(1)} bb/100</div>
                </div>
              )}
            </>
          );
        })()}
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
            <Scatter
              data={scatterData}
              cursor="pointer"
              onClick={(d: any) => onSelectPlayer(d.meta.id)}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const fill = payload.meta.fill;
                const r = Math.max(6, Math.min(14, 4 + payload.hands * 0.04));
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.85} stroke={fill} strokeWidth={1} />
                    <text x={cx} y={cy + r + 12} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="Inter, sans-serif">
                      {payload.meta.name}
                    </text>
                  </g>
                );
              }}
            />
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
              <th className="text-center p-3 font-mono">Role</th>
              <th className="text-left p-3">HCL Twin</th>
              <th className="text-right p-3 font-mono">P&L ($)</th>
              {user && gameId && <th className="text-center p-3 w-20"></th>}
            </tr>
          </thead>
          <tbody>
            {stats.players.map(p => {
              const style = getPlayerStyle(p.vpip, p.pfr);
              const hcl = findMostSimilarHCL(p.vpip, p.pfr);
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
                  <td className="p-3 text-center">
                    {p.tableRole && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ color: ROLE_BADGE[p.tableRole].color, background: `${ROLE_BADGE[p.tableRole].color}15` }}>
                        {ROLE_BADGE[p.tableRole].label}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <HCLMiniAvatar player={hcl.player} />
                  </td>
                  <td className={`p-3 text-right font-mono font-bold ${p.pnl >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                    {p.pnl >= 0 ? '+' : ''}${(p.pnl / 100).toFixed(2)}
                  </td>
                  {user && gameId && (
                    <td className="p-3 text-center">
                      {claimedPlayerIds?.has(p.id) ? (
                        <span className="inline-flex items-center gap-1 text-stat-green text-xs font-medium">
                          <Check className="w-3 h-3" /> Me
                        </span>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!gameId || claiming) return;
                            setClaiming(p.id);
                            try {
                              await claimPlayer(gameId, user.uid, user.email ?? '', p.id);
                              onClaimed?.(p.id);
                            } catch (err) {
                              console.error('Claim failed:', err);
                            }
                            setClaiming(null);
                          }}
                          disabled={!!claiming}
                          className="inline-flex items-center gap-1 text-text-muted hover:text-accent text-xs px-2 py-1 rounded hover:bg-bg-hover transition-colors"
                          title="Link this player to your account"
                        >
                          {claiming === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                          This is me
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
