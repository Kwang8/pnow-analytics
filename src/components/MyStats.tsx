import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  getMyGamePlayerDocs, getAllGamePlayers, getUserProfiles,
  setProfilePublic, updateMyAggregate,
  type GamePlayerDoc,
} from '../lib/gameStore';
import { getCachedGameRawData, getCachedPlayerAnalysis } from '../lib/cache';
import { computeOpponentStats, type OpponentStat } from '../lib/analysis';
import type { HandResult, LeakHand } from '../lib/types';

/** A single all-in hand surfaced to the "All-Ins" tab. */
interface AllInHandRow {
  gameId: string;
  gameDate: string;
  hand: HandResult;
}
import PreflopRangesTab from './PreflopRangesTab';
import LeaksTab from './LeaksTab';
import EvChart from './EvChart';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { Loader2, Globe, Lock } from 'lucide-react';

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
  const { user, isPublic, setIsPublicLocal } = useAuth();
  const [docs, setDocs] = useState<GamePlayerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [handResults, setHandResults] = useState<HandResult[]>([]);
  const [leaks, setLeaks] = useState<LeakHand[]>([]);
  const [handsLoading, setHandsLoading] = useState(false);
  const [opponents, setOpponents] = useState<{ name: string; handsPlayed: number; netResult: number }[]>([]);
  // All-in hands with session context, for the "All-Ins" tab.
  const [allInHands, setAllInHands] = useState<AllInHandRow[]>([]);
  const [activeTab, setActiveTab] = useState<'Ranges' | 'Leaks' | 'Rivals' | 'Sessions' | 'All-Ins'>('Rivals');
  const [togglingPublic, setTogglingPublic] = useState(false);

  const handleTogglePublic = useCallback(async () => {
    if (!user || togglingPublic) return;
    setTogglingPublic(true);
    const next = !isPublic;
    try {
      // Always refresh denormalized aggregate before going public
      await updateMyAggregate(user.uid);
      await setProfilePublic(user.uid, next);
      setIsPublicLocal(next);
    } catch (e) {
      console.error('Failed to toggle profile visibility:', e);
    }
    setTogglingPublic(false);
  }, [user, isPublic, togglingPublic, setIsPublicLocal]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getMyGamePlayerDocs(user.uid).then(d => {
      setDocs(d);
      setLoading(false);
    });
  }, [user]);

  // Background load hand-level data for preflop chart, leaks & opponent stats.
  // Uses session-level in-memory caches so repeat mounts are near-instant.
  useEffect(() => {
    if (docs.length === 0) return;
    setHandsLoading(true);

    // Sort sessions chronologically so the hand-level outputs
    // (handResults, allInHands) end up in true time order.
    const sortedDocs = [...docs].sort((a, b) =>
      (a.gameDate ?? '').localeCompare(b.gameDate ?? ''),
    );
    const gameIds = sortedDocs.map(d => d.gameId);

    // Load raw data (cached) + gamePlayers claims in parallel
    Promise.all([
      Promise.all(
        sortedDocs.map(async (doc) => {
          const raw = await getCachedGameRawData(doc.gameId);
          if (!raw) return null;
          return { raw, pokerNowId: doc.pokerNowId, gameId: doc.gameId };
        })
      ),
      getAllGamePlayers(gameIds),
    ]).then(async ([rawResults, allGpDocs]) => {
      // Analyze hands (cached)
      const allHands: HandResult[] = [];
      const allLeaks: LeakHand[] = [];
      const perGameOpponents: { gameId: string; stats: OpponentStat[] }[] = [];
      const allIns: AllInHandRow[] = [];
      const docByGameId = new Map(sortedDocs.map(d => [d.gameId, d]));

      for (const entry of rawResults) {
        if (!entry) continue;
        const analysis = getCachedPlayerAnalysis(entry.gameId, entry.raw, entry.pokerNowId);
        allHands.push(...analysis.handResults);
        allLeaks.push(...analysis.leaks);
        perGameOpponents.push({ gameId: entry.gameId, stats: computeOpponentStats(entry.raw, entry.pokerNowId) });

        const gameDate = docByGameId.get(entry.gameId)?.gameDate ?? '';
        for (const h of analysis.handResults) {
          if (h.allInShowdown) {
            allIns.push({ gameId: entry.gameId, gameDate, hand: h });
          }
        }
      }

      setHandResults(allHands);
      setLeaks(allLeaks);
      setAllInHands(allIns);

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

  // Cumulative actual vs EV-adjusted restricted to *all-in* hands only.
  // Non-all-in hands contribute 0 to both lines (actual == ev), so they'd
  // just scale the axis without showing any divergence — we leave them out.
  // Each data point is one all-in hand; the divergence between the two
  // lines is your cumulative luck swing from getting it in.
  const evChart = useMemo(() => {
    if (allInHands.length === 0) return null;
    let cumActual = 0;
    let cumEv = 0;
    const points = [{ label: 'Start', actual: 0, ev: 0 }];
    allInHands.forEach((row, i) => {
      cumActual += row.hand.netResult / 100;
      cumEv += row.hand.evNet / 100;
      const date = row.gameDate
        ? new Date(row.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : `#${i + 1}`;
      points.push({
        label: `${date} #${i + 1}`,
        actual: Math.round(cumActual * 100) / 100,
        ev: Math.round(cumEv * 100) / 100,
      });
    });
    return { points, hasAllInEvents: true };
  }, [allInHands]);

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">My Stats</h2>
          <p className="text-text-secondary text-sm">Aggregated across all your sessions</p>
        </div>
        <button
          onClick={handleTogglePublic}
          disabled={togglingPublic}
          className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
            isPublic
              ? 'border-stat-green/40 text-stat-green bg-stat-green/10 hover:bg-stat-green/15'
              : 'border-border text-text-muted hover:text-text-primary hover:bg-bg-hover'
          }`}
          title={isPublic ? 'Your aggregate stats are visible to other public profiles' : 'Make your aggregate stats visible to other public profiles'}
        >
          {togglingPublic
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : isPublic
              ? <Globe className="w-3.5 h-3.5" />
              : <Lock className="w-3.5 h-3.5" />}
          {isPublic ? 'Public profile' : 'Private profile'}
        </button>
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

          {/* EV Chart — actual vs expected across all-in hands only.
              Each data point is one all-in showdown; non-all-in hands
              are deliberately excluded so the divergence between the
              two lines represents only your luck from getting it in. */}
          <EvChart
            points={evChart?.points ?? [{ label: 'Start', actual: 0, ev: 0 }]}
            hasAllInEvents={evChart?.hasAllInEvents ?? false}
            loading={handsLoading}
            subtitle="Cumulative outcome on your all-in showdowns only"
          />


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
            {(['Ranges', 'Leaks', 'Rivals', 'Sessions', 'All-Ins'] as const).map(tab => (
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

          {/* All-Ins Tab */}
          {activeTab === 'All-Ins' && (
            <div className="bg-bg-card border border-border rounded-lg p-6">
              {handsLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading hand data...
                </div>
              ) : (
                <AllInsTable rows={allInHands} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── All-Ins Table ─────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_COLOR: Record<string, string> = {
  s: '#e2e8f0',
  c: '#22c55e',
  d: '#60a5fa',
  h: '#ef4444',
};

function formatCard(card: string) {
  if (!card || card.length < 2) return <span>{card}</span>;
  const rank = card[0].toUpperCase();
  const suit = card[1].toLowerCase();
  return (
    <span style={{ color: SUIT_COLOR[suit] ?? '#e2e8f0' }}>
      {rank}
      {SUIT_SYMBOL[suit] ?? suit}
    </span>
  );
}

function Cards({ cards }: { cards: string[] }) {
  if (cards.length === 0) return <span className="text-text-muted italic text-xs">preflop</span>;
  return (
    <span className="font-mono">
      {cards.map((c, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {formatCard(c)}
        </span>
      ))}
    </span>
  );
}

function fmtMoney(cents: number): { str: string; positive: boolean } {
  const d = cents / 100;
  return {
    str: `${d >= 0 ? '+' : '-'}$${Math.abs(d).toFixed(2)}`,
    positive: d >= 0,
  };
}

type SortMode = 'recent' | 'luck';

function AllInsTable({ rows }: { rows: AllInHandRow[] }) {
  const [sortMode, setSortMode] = useState<SortMode>('luck');

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortMode === 'luck') {
      copy.sort((a, b) => {
        const la = Math.abs(a.hand.netResult - a.hand.evNet);
        const lb = Math.abs(b.hand.netResult - b.hand.evNet);
        return lb - la;
      });
    } else {
      copy.sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''));
    }
    return copy;
  }, [rows, sortMode]);

  const summary = useMemo(() => {
    const actual = rows.reduce((s, r) => s + r.hand.netResult, 0);
    const ev = rows.reduce((s, r) => s + r.hand.evNet, 0);
    return { count: rows.length, actual, ev, luck: actual - ev };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        No all-in showdowns yet. This tab fills up once you get chips in with cards exposed.
      </div>
    );
  }

  const luckFmt = fmtMoney(summary.luck);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat label="All-ins" value={summary.count.toString()} />
        <SummaryStat label="Actual" value={fmtMoney(summary.actual).str} color={fmtMoney(summary.actual).positive ? 'text-stat-green' : 'text-stat-red'} />
        <SummaryStat label="EV" value={fmtMoney(summary.ev).str} color="text-text-muted" />
        <SummaryStat label="Luck" value={luckFmt.str} color={luckFmt.positive ? 'text-stat-green' : 'text-stat-red'} />
      </div>

      {/* Sort toggle */}
      <div className="flex items-center justify-between">
        <div className="text-text-muted text-xs">
          Each row is one all-in hand, with your equity at the moment of commitment.
        </div>
        <div className="flex gap-1 bg-bg-secondary rounded-md p-0.5 text-xs">
          {(['luck', 'recent'] as const).map(m => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`px-2.5 py-1 rounded transition-colors ${
                sortMode === m
                  ? 'bg-bg-card text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {m === 'luck' ? 'Biggest swings' : 'Most recent'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">My hand</th>
              <th className="text-left p-2 hidden lg:table-cell">vs</th>
              <th className="text-left p-2 hidden md:table-cell">Board at all-in</th>
              <th className="text-right p-2 font-mono">Equity</th>
              <th className="text-right p-2 font-mono">Pot</th>
              <th className="text-right p-2 font-mono">Actual</th>
              <th className="text-right p-2 font-mono">EV</th>
              <th className="text-right p-2 font-mono">Luck</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const snap = r.hand.allInShowdown!;
              const hero = snap.contestants.find(c => c.isHero);
              const oppos = snap.contestants.filter(c => !c.isHero);
              const actual = fmtMoney(r.hand.netResult);
              const ev = fmtMoney(r.hand.evNet);
              const luck = fmtMoney(r.hand.netResult - r.hand.evNet);
              const equityPct = (snap.heroEquity * 100).toFixed(0);
              const dateStr = r.gameDate
                ? new Date(r.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
              return (
                <tr key={`${r.gameId}-${r.hand.handNumber}-${i}`} className="border-b border-border/30">
                  <td className="p-2 text-text-muted text-xs whitespace-nowrap">{dateStr}</td>
                  <td className="p-2">
                    {hero ? <Cards cards={hero.holeCards} /> : '—'}
                  </td>
                  <td className="p-2 hidden lg:table-cell">
                    <div className="flex flex-col gap-0.5 text-xs">
                      {oppos.map((o, j) => (
                        <div key={j} className="flex items-center gap-1.5">
                          <Cards cards={o.holeCards} />
                          <span className="text-text-muted truncate max-w-[80px]">{o.name}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 hidden md:table-cell">
                    <Cards cards={snap.boardAtAllIn} />
                  </td>
                  <td className="p-2 text-right font-mono text-text-secondary">{equityPct}%</td>
                  <td className="p-2 text-right font-mono text-text-muted">
                    ${(snap.potCents / 100).toFixed(0)}
                  </td>
                  <td className={`p-2 text-right font-mono font-bold ${actual.positive ? 'text-stat-green' : 'text-stat-red'}`}>
                    {actual.str}
                  </td>
                  <td className="p-2 text-right font-mono text-text-muted">{ev.str}</td>
                  <td className={`p-2 text-right font-mono font-bold ${luck.positive ? 'text-stat-green' : 'text-stat-red'}`}>
                    {luck.str}
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

function SummaryStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-secondary/60 border border-border rounded-md px-3 py-2">
      <div className="text-text-muted text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-base font-bold ${color ?? 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
