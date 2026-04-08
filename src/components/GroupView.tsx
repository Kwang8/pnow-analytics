import { useEffect, useMemo, useState } from 'react';
import { Folder, Loader2, TrendingUp } from 'lucide-react';
import {
  getAllGamePlayers, getUserProfiles,
  type GroupDoc,
} from '../lib/gameStore';
import { useAuth } from '../lib/AuthContext';

interface Props {
  group: GroupDoc;
}

interface PlayerRow {
  key: string;
  displayName: string;
  username: string;
  isMe: boolean;
  isClaimed: boolean;
  sessions: number;
  handsPlayed: number;
  actualCents: number;
  evCents: number;
}

export default function GroupView({ group }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Stable key so we reload only when the set of games actually changes.
  const gameIdsKey = useMemo(() => [...(group.gameIds ?? [])].sort().join('|'), [group.gameIds]);

  useEffect(() => {
    let cancelled = false;
    const gameIds = group.gameIds ?? [];

    if (gameIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRows(null);

    (async () => {
      try {
        // A single batched read of gamePlayers docs is enough now that
        // `evPnl` is denormalized onto each doc. No raw-data load, no
        // per-player `analyzePlayer` — just aggregation.
        const allGps = await getAllGamePlayers(gameIds);

        // Aggregate per-player stats across all games.
        // Identity rule: if a poker-now player is claimed to a uid, merge by that uid;
        // otherwise merge by lowercased name.
        const agg = new Map<string, {
          displayName: string;
          username: string;
          uid: string | null;
          actualCents: number;
          evCents: number;
          sessions: number;
          handsPlayed: number;
        }>();

        for (const gp of allGps) {
          const actual = gp.pnl;
          const ev = gp.evPnl ?? gp.pnl;       // older docs fall back to actual

          const key = gp.uid ? `uid:${gp.uid}` : `name:${gp.playerName.toLowerCase()}`;
          const prev = agg.get(key);
          if (prev) {
            prev.actualCents += actual;
            prev.evCents += ev;
            prev.sessions += 1;
            prev.handsPlayed += gp.handsPlayed;
            if (gp.uid && !prev.uid) prev.uid = gp.uid;
          } else {
            agg.set(key, {
              displayName: gp.playerName,
              username: '',
              uid: gp.uid,
              actualCents: actual,
              evCents: ev,
              sessions: 1,
              handsPlayed: gp.handsPlayed,
            });
          }
        }

        // Fetch real usernames/display names for claimed players.
        const uids = [...agg.values()].map(v => v.uid).filter((x): x is string => !!x);
        const profiles = await getUserProfiles(uids);
        for (const entry of agg.values()) {
          if (entry.uid) {
            const p = profiles.get(entry.uid);
            if (p) {
              entry.username = p.username;
              entry.displayName = p.displayName || entry.displayName;
            }
          }
        }

        const finalRows: PlayerRow[] = [...agg.entries()].map(([key, v]) => ({
          key,
          displayName: v.displayName,
          username: v.username,
          isMe: !!(user && v.uid === user.uid),
          isClaimed: !!v.uid,
          sessions: v.sessions,
          handsPlayed: v.handsPlayed,
          actualCents: v.actualCents,
          evCents: v.evCents,
        }));

        finalRows.sort((a, b) => b.actualCents - a.actualCents);
        if (!cancelled) {
          setRows(finalRows);
          setLoading(false);
        }
      } catch (err) {
        console.error('GroupView load failed:', err);
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
    // gameIdsKey covers changes to the game set; group.id for group switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, gameIdsKey, user?.uid]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const totalHands = rows.reduce((s, r) => s + r.handsPlayed, 0);
    const totalActual = rows.reduce((s, r) => s + r.actualCents, 0);
    const totalEv = rows.reduce((s, r) => s + r.evCents, 0);
    return { players: rows.length, totalHands, totalActual, totalEv };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Folder className="w-5 h-5 text-accent" />
          <h2 className="text-2xl font-bold text-text-primary">{group.name}</h2>
        </div>
        <p className="text-text-secondary text-sm mt-0.5">
          {group.gameIds?.length ?? 0} {group.gameIds?.length === 1 ? 'game' : 'games'}
          {' · '}
          {group.members?.length ?? 1} {group.members?.length === 1 ? 'member' : 'members'}
          {summary && ` · ${summary.totalHands.toLocaleString()} hands`}
        </p>
      </div>

      {/* Summary cards — fixed height to avoid layout shift while loading */}
      {summary && summary.players > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Players" value={summary.players.toString()} />
          <SummaryCard label="Games" value={(group.gameIds?.length ?? 0).toString()} />
          <SummaryCard
            label="Total Actual"
            value={fmtDollar(summary.totalActual / 100)}
            color={summary.totalActual >= 0 ? 'text-stat-green' : 'text-stat-red'}
          />
          <SummaryCard
            label="Total EV"
            value={fmtDollar(summary.totalEv / 100)}
            color="text-text-muted"
          />
        </div>
      )}

      {/* Leaderboard table */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-text-muted" />
            Player Leaderboard
          </h3>
          <span className="text-text-muted text-xs">Actual vs Expected (all-in EV adjusted)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">Crunching hands and equities…</span>
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-center py-12 text-text-muted text-sm">
            {(group.gameIds?.length ?? 0) === 0
              ? 'No games in this group yet. Add games from the sidebar to see a leaderboard.'
              : 'No player data found for this group.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left p-3 pl-4">#</th>
                  <th className="text-left p-3">Player</th>
                  <th className="text-right p-3 font-mono">Sessions</th>
                  <th className="text-right p-3 font-mono hidden md:table-cell">Hands</th>
                  <th className="text-right p-3 font-mono">Actual</th>
                  <th className="text-right p-3 font-mono">EV</th>
                  <th className="text-right p-3 font-mono pr-4">Luck</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const actualD = r.actualCents / 100;
                  const evD = r.evCents / 100;
                  const luckD = actualD - evD;
                  return (
                    <tr
                      key={r.key}
                      className={`border-t border-border/50 ${r.isMe ? 'bg-accent/10' : ''}`}
                    >
                      <td className="p-3 pl-4 text-text-muted font-mono">{i + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-bg-hover flex items-center justify-center text-text-muted text-xs shrink-0">
                            {r.displayName[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <div className={`font-medium truncate ${r.isMe ? 'text-accent' : 'text-text-primary'}`}>
                              {r.isClaimed && r.username
                                ? `@${r.username}`
                                : r.displayName}
                              {r.isMe && <span className="text-xs ml-1 text-accent/70">(you)</span>}
                            </div>
                            {!r.isClaimed && (
                              <div className="text-[10px] text-text-muted italic">unclaimed</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-text-secondary">{r.sessions}</td>
                      <td className="p-3 text-right font-mono text-text-secondary hidden md:table-cell">
                        {r.handsPlayed.toLocaleString()}
                      </td>
                      <td className={`p-3 text-right font-mono font-bold ${actualD >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                        {fmtDollar(actualD)}
                      </td>
                      <td className="p-3 text-right font-mono text-text-muted">
                        {fmtDollar(evD)}
                      </td>
                      <td className={`p-3 pr-4 text-right font-mono font-semibold ${luckD >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                        {fmtDollar(luckD)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDollar(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-lg p-4">
      <div className="text-text-muted text-xs uppercase tracking-wider">{label}</div>
      <div className={`font-mono text-2xl font-bold ${color ?? 'text-text-primary'}`}>{value}</div>
    </div>
  );
}
