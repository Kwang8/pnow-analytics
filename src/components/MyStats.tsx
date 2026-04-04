import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getMyGamePlayerDocs, getGameRawData, getAllGamePlayers, getUserProfiles, type GamePlayerDoc } from '../lib/gameStore';
import { analyzePlayer, computeOpponentStats, type OpponentStat } from '../lib/analysis';
import type { HandResult, LeakHand } from '../lib/types';
import PreflopRangesTab from './PreflopRangesTab';
import LeaksTab from './LeaksTab';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { Loader2 } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PnlTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value as number;
  return (
    <div style={{ background: '#141a23', border: '1px solid #1e2a3a', borderRadius: 8, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
      <div style={{ color: '#e2e8f0', marginBottom: 4 }}>{label}</div>
      <div style={{ color: val >= 0 ? '#22c55e' : '#ef4444' }}>
        Cumulative: {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </div>
    </div>
  );
}

export default function MyStats() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<GamePlayerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [handResults, setHandResults] = useState<HandResult[]>([]);
  const [leaks, setLeaks] = useState<LeakHand[]>([]);
  const [handsLoading, setHandsLoading] = useState(false);
  const [opponents, setOpponents] = useState<{ name: string; handsPlayed: number; netResult: number }[]>([]);
  const [activeTab, setActiveTab] = useState<'Ranges' | 'Leaks' | 'Rivals' | 'Sessions'>('Rivals');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getMyGamePlayerDocs(user.uid).then(d => {
      setDocs(d);
      setLoading(false);
    });
  }, [user]);

  // Background load hand-level data for preflop chart, leaks & opponent stats
  useEffect(() => {
    if (docs.length === 0) return;
    setHandsLoading(true);

    const gameIds = docs.map(d => d.gameId);

    // Load raw data + gamePlayers claims in parallel
    Promise.all([
      Promise.all(
        docs.map(async (doc) => {
          const raw = await getGameRawData(doc.gameId);
          if (!raw) return null;
          return { raw, pokerNowId: doc.pokerNowId, gameId: doc.gameId };
        })
      ),
      getAllGamePlayers(gameIds),
    ]).then(async ([rawResults, allGpDocs]) => {
      // Analyze hands
      const allHands: HandResult[] = [];
      const allLeaks: LeakHand[] = [];
      const perGameOpponents: { gameId: string; stats: OpponentStat[] }[] = [];

      for (const entry of rawResults) {
        if (!entry) continue;
        const analysis = analyzePlayer(entry.raw, entry.pokerNowId);
        allHands.push(...analysis.handResults);
        allLeaks.push(...analysis.leaks);
        perGameOpponents.push({ gameId: entry.gameId, stats: computeOpponentStats(entry.raw, entry.pokerNowId) });
      }

      setHandResults(allHands);
      setLeaks(allLeaks);

      // Build claim map: (gameId, pokerNowId) → uid
      const claimMap = new Map<string, string>();
      for (const gp of allGpDocs) {
        if (gp.uid) claimMap.set(`${gp.gameId}_${gp.pokerNowId}`, gp.uid);
      }

      // Collect unique uids of opponents (exclude self)
      const oppUids = new Set<string>();
      for (const { gameId, stats } of perGameOpponents) {
        for (const opp of stats) {
          const uid = claimMap.get(`${gameId}_${opp.id}`);
          if (uid && uid !== user!.uid) oppUids.add(uid);
        }
      }

      // Batch-load user profiles for display names
      const profiles = await getUserProfiles([...oppUids]);

      // Merge opponent stats across sessions, keying by uid if claimed, else by poker now name
      const merged = new Map<string, { name: string; handsPlayed: number; netResult: number }>();
      for (const { gameId, stats } of perGameOpponents) {
        for (const opp of stats) {
          const uid = claimMap.get(`${gameId}_${opp.id}`);
          let key: string;
          let displayName: string;
          if (uid && uid !== user!.uid) {
            key = `uid:${uid}`;
            const profile = profiles.get(uid);
            displayName = profile?.username ? `@${profile.username}` : profile?.displayName ?? opp.name;
          } else if (uid === user!.uid) {
            continue; // skip self
          } else {
            key = `name:${opp.name}`;
            displayName = opp.name;
          }
          const prev = merged.get(key) ?? { name: displayName, handsPlayed: 0, netResult: 0 };
          prev.handsPlayed += opp.handsPlayed;
          prev.netResult += opp.netResult;
          merged.set(key, prev);
        }
      }

      setOpponents(Array.from(merged.values()));
      setHandsLoading(false);
    });
  }, [docs, user]);

  const sorted = useMemo(() =>
    [...docs].sort((a, b) => (a.gameDate ?? '').localeCompare(b.gameDate ?? '')),
    [docs],
  );

  const chartData = useMemo(() => {
    let cumDollars = 0;
    // Start at 0
    const points = [{ name: 'Start', cumDollars: 0 }];
    sorted.forEach((d, i) => {
      cumDollars += d.pnl / 100;
      const date = d.gameDate
        ? new Date(d.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `#${i + 1}`;
      // Deduplicate labels by appending session number if needed
      const label = sorted.length > 1 ? `${date} (#${i + 1})` : date;
      points.push({ name: label, cumDollars: Math.round(cumDollars * 100) / 100 });
    });
    return points;
  }, [sorted]);

  const totalSessions = docs.length;
  const totalHands = docs.reduce((s, d) => s + d.handsPlayed, 0);
  const totalPnlCents = docs.reduce((s, d) => s + d.pnl, 0);
  const totalPnlDollars = totalPnlCents / 100;
  const avgVpip = totalSessions > 0 ? docs.reduce((s, d) => s + d.vpip, 0) / totalSessions : 0;
  const avgPfr = totalSessions > 0 ? docs.reduce((s, d) => s + d.pfr, 0) / totalSessions : 0;
  const wins = docs.filter(d => d.pnl > 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading stats...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">My Stats</h2>
        <p className="text-text-secondary text-sm">Aggregated across all your sessions</p>
      </div>

      {totalSessions === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          No linked sessions yet. Upload a game or ask a friend to add you.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Sessions</div>
              <div className="font-mono text-2xl font-bold text-text-primary">{totalSessions}</div>
              <div className="text-text-muted text-xs">{wins}W / {totalSessions - wins}L</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Total Hands</div>
              <div className="font-mono text-2xl font-bold text-text-primary">{totalHands.toLocaleString()}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Total P&L</div>
              <div className={`font-mono text-2xl font-bold ${totalPnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                {totalPnlDollars >= 0 ? '+' : ''}${Math.abs(totalPnlDollars).toFixed(2)}
              </div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Win Rate</div>
              <div className={`font-mono text-2xl font-bold ${wins > totalSessions / 2 ? 'text-stat-green' : 'text-stat-red'}`}>
                {wins}/{totalSessions}
              </div>
              <div className="text-text-muted text-xs">sessions won</div>
            </div>
          </div>

          {/* Avg Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Avg VPIP</div>
              <div className="font-mono text-xl font-bold text-text-primary">{avgVpip.toFixed(1)}%</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg p-4">
              <div className="text-text-muted text-xs uppercase tracking-wider">Avg PFR</div>
              <div className="font-mono text-xl font-bold text-text-primary">{avgPfr.toFixed(1)}%</div>
            </div>
          </div>

          {/* PnL Chart */}
          {chartData.length > 2 && (
            <div className="bg-bg-card border border-border rounded-lg p-6">
              <h3 className="text-text-primary font-semibold mb-4">Cumulative P&L</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 10 }}
                    interval={0}
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
                  <Tooltip content={<PnlTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="cumDollars"
                    stroke={totalPnlDollars >= 0 ? '#22c55e' : '#ef4444'}
                    strokeWidth={2.5}
                    dot={{ fill: totalPnlDollars >= 0 ? '#22c55e' : '#ef4444', r: 5, strokeWidth: 2, stroke: '#141a23' }}
                    activeDot={{ r: 7, strokeWidth: 2, stroke: '#141a23' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tab Bar */}
          <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
            {(['Ranges', 'Leaks', 'Rivals', 'Sessions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-bg-card text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Ranges Tab */}
          {activeTab === 'Ranges' && (
            <div className="bg-bg-card border border-border rounded-lg p-6">
              {handsLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading hand data...
                </div>
              ) : (
                <PreflopRangesTab stats={{ handResults, leaks } as any} />
              )}
            </div>
          )}

          {/* Leaks Tab */}
          {activeTab === 'Leaks' && (
            <div className="bg-bg-card border border-border rounded-lg p-6">
              {handsLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading hand data...
                </div>
              ) : (
                <LeaksTab stats={{ handResults, leaks } as any} />
              )}
            </div>
          )}

          {/* Rivals Tab */}
          {activeTab === 'Rivals' && (
            <div className="bg-bg-card border border-border rounded-lg p-6">
              {handsLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading hand data...
                </div>
              ) : opponents.length === 0 ? (
                <div className="text-text-muted text-sm text-center py-8">
                  Not enough data yet
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Allies — top 5 positive */}
                  <div>
                    <div className="text-stat-green text-xs font-semibold uppercase tracking-wider mb-3">Allies (you win most against)</div>
                    <div className="space-y-2">
                      {opponents
                        .filter(o => o.netResult > 0)
                        .sort((a, b) => b.netResult - a.netResult)
                        .slice(0, 5)
                        .map((o, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                            <div>
                              <span className="text-text-primary text-sm">{o.name}</span>
                              <span className="text-text-muted text-xs ml-2">{o.handsPlayed} hands</span>
                            </div>
                            <span className="font-mono text-sm font-bold text-stat-green">
                              +${(o.netResult / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      {opponents.filter(o => o.netResult > 0).length === 0 && (
                        <div className="text-text-muted text-xs py-2">No allies yet</div>
                      )}
                    </div>
                  </div>
                  {/* Enemies — top 5 negative */}
                  <div>
                    <div className="text-stat-red text-xs font-semibold uppercase tracking-wider mb-3">Enemies (you lose most against)</div>
                    <div className="space-y-2">
                      {opponents
                        .filter(o => o.netResult < 0)
                        .sort((a, b) => a.netResult - b.netResult)
                        .slice(0, 5)
                        .map((o, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                            <div>
                              <span className="text-text-primary text-sm">{o.name}</span>
                              <span className="text-text-muted text-xs ml-2">{o.handsPlayed} hands</span>
                            </div>
                            <span className="font-mono text-sm font-bold text-stat-red">
                              -${(Math.abs(o.netResult) / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      {opponents.filter(o => o.netResult < 0).length === 0 && (
                        <div className="text-text-muted text-xs py-2">No enemies yet</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sessions Tab */}
          {activeTab === 'Sessions' && (
            <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                    <th className="text-left p-3">Date</th>
                    <th className="text-right p-3 font-mono">Hands</th>
                    <th className="text-right p-3 font-mono">VPIP</th>
                    <th className="text-right p-3 font-mono">PFR</th>
                    <th className="text-right p-3 font-mono">P&L ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d, i) => {
                    const date = d.gameDate
                      ? new Date(d.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : `Session ${i + 1}`;
                    return (
                      <tr key={`${d.gameId}-${i}`} className="border-b border-border/50">
                        <td className="p-3 text-text-secondary">{date}</td>
                        <td className="p-3 text-right font-mono text-text-secondary">{d.handsPlayed}</td>
                        <td className="p-3 text-right font-mono text-text-secondary">{d.vpip.toFixed(1)}%</td>
                        <td className="p-3 text-right font-mono text-text-secondary">{d.pfr.toFixed(1)}%</td>
                        <td className={`p-3 text-right font-mono font-bold ${d.pnl >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                          {d.pnl >= 0 ? '+' : ''}${(d.pnl / 100).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
