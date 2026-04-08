import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  getAllPlayerStats,
  getPublicProfile,
  type LeaderboardEntry,
  type PublicProfile,
} from '../lib/gameStore';
import { Loader2, Trophy, Lock, ArrowLeft } from 'lucide-react';

type DetailState =
  | { kind: 'loading' }
  | { kind: 'locked-self' }   // viewer is private
  | { kind: 'locked-target' } // target is private
  | { kind: 'ready'; profile: PublicProfile };

export default function Leaderboard() {
  const { user, isPublic } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeaderboardEntry | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getAllPlayerStats(user.uid).then(data => {
      setEntries(data);
      setLoading(false);
    });
  }, [user]);

  const handleSelect = useCallback(async (entry: LeaderboardEntry) => {
    setSelected(entry);
    // Clicking yourself is always allowed
    if (entry.uid === user?.uid) {
      setDetail({
        kind: 'ready',
        profile: {
          uid: entry.uid,
          username: entry.username,
          displayName: entry.displayName,
          photoURL: entry.photoURL,
          aggregate: {
            sessions: entry.sessions,
            totalHands: entry.totalHands,
            totalPnlCents: entry.totalPnlCents,
            wins: entry.wins,
            avgVpip: 0,
            avgPfr: 0,
          },
        },
      });
      return;
    }
    // Viewer must be public to see others
    if (!isPublic) {
      setDetail({ kind: 'locked-self' });
      return;
    }
    setDetail({ kind: 'loading' });
    try {
      const profile = await getPublicProfile(entry.uid);
      if (!profile) {
        setDetail({ kind: 'locked-target' });
      } else {
        setDetail({ kind: 'ready', profile });
      }
    } catch (err) {
      console.error('Failed to load public profile:', err);
      setDetail({ kind: 'locked-target' });
    }
  }, [user, isPublic]);

  const handleBack = useCallback(() => {
    setSelected(null);
    setDetail(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading leaderboard...
      </div>
    );
  }

  if (selected && detail) {
    return <DetailView entry={selected} detail={detail} onBack={handleBack} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-500" />
          Leaderboard
        </h2>
        <p className="text-text-secondary text-sm">Global P&L rankings across all players</p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          No player data yet. Upload games and link players to populate the leaderboard.
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                <th className="text-left p-3 w-12">#</th>
                <th className="text-left p-3">Player</th>
                <th className="text-right p-3 font-mono">Sessions</th>
                <th className="text-right p-3 font-mono hidden md:table-cell">Hands</th>
                <th className="text-right p-3 font-mono">Win Rate</th>
                <th className="text-right p-3 font-mono">Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const isMe = user?.uid === entry.uid;
                const pnlDollars = entry.totalPnlCents / 100;
                const winRate = entry.sessions > 0
                  ? ((entry.wins / entry.sessions) * 100).toFixed(0)
                  : '0';
                return (
                  <tr
                    key={entry.uid}
                    onClick={() => handleSelect(entry)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-bg-hover transition-colors ${isMe ? 'bg-accent/10' : ''}`}
                  >
                    <td className="p-3 text-text-muted font-mono">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {entry.photoURL ? (
                          <img
                            src={entry.photoURL}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-bg-hover flex items-center justify-center text-text-muted text-xs">
                            {entry.displayName[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className={`font-medium truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                            @{entry.username || 'unknown'}
                            {isMe && <span className="text-xs ml-1 text-accent/70">(you)</span>}
                          </div>
                          {entry.username === 'wang' && (
                            <div className="text-[10px] text-text-muted italic">running cold, actually plays 50BB/hr above EV</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary">
                      {entry.sessions}
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary hidden md:table-cell">
                      {entry.totalHands.toLocaleString()}
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary">
                      {winRate}%
                    </td>
                    <td className={`p-3 text-right font-mono font-bold ${pnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                      {pnlDollars >= 0 ? '+' : ''}${Math.abs(pnlDollars).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetailView({
  entry,
  detail,
  onBack,
}: {
  entry: LeaderboardEntry;
  detail: DetailState;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm mb-2 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to leaderboard
        </button>
        <div className="flex items-center gap-3">
          {entry.photoURL ? (
            <img src={entry.photoURL} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-accent/20 text-accent text-lg flex items-center justify-center font-bold">
              {(entry.username || entry.displayName || '?')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-text-primary">@{entry.username || 'unknown'}</h2>
            <p className="text-text-secondary text-sm">{entry.displayName}</p>
          </div>
        </div>
      </div>

      {detail.kind === 'loading' && (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading profile...
        </div>
      )}

      {detail.kind === 'locked-self' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Lock className="w-8 h-8 text-text-muted mb-3" />
          <div className="text-text-primary font-semibold mb-1">Your profile is private</div>
          <p className="text-text-secondary text-sm max-w-sm">
            Make your profile public from the My Stats page to view other public players' stats.
          </p>
        </div>
      )}

      {detail.kind === 'locked-target' && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Lock className="w-8 h-8 text-text-muted mb-3" />
          <div className="text-text-primary font-semibold mb-1">This profile is private</div>
          <p className="text-text-secondary text-sm max-w-sm">
            This player hasn't made their profile public. Only public players can be viewed.
          </p>
        </div>
      )}

      {detail.kind === 'ready' && <AggregateCards profile={detail.profile} />}
    </div>
  );
}

function AggregateCards({ profile }: { profile: PublicProfile }) {
  const agg = profile.aggregate;
  if (!agg) {
    return (
      <div className="text-center py-12 text-text-muted text-sm">
        This player has not uploaded any games yet.
      </div>
    );
  }
  const pnlDollars = agg.totalPnlCents / 100;
  const pnlColor = pnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red';
  const winRate = agg.sessions > 0 ? (agg.wins / agg.sessions) * 100 : 0;
  const hasStyleStats = agg.avgVpip > 0 || agg.avgPfr > 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Sessions</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{agg.sessions}</div>
          <div className="text-text-muted text-xs">{agg.wins}W / {agg.sessions - agg.wins}L</div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Total Hands</div>
          <div className="font-mono text-2xl font-bold text-text-primary">{agg.totalHands.toLocaleString()}</div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Total P&L</div>
          <div className={`font-mono text-2xl font-bold ${pnlColor}`}>
            {pnlDollars >= 0 ? '+' : ''}${Math.abs(pnlDollars).toFixed(2)}
          </div>
        </div>
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <div className="text-text-muted text-xs uppercase tracking-wider">Win Rate</div>
          <div className={`font-mono text-2xl font-bold ${winRate >= 50 ? 'text-stat-green' : 'text-stat-red'}`}>
            {winRate.toFixed(0)}%
          </div>
        </div>
      </div>

      {hasStyleStats && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <div className="text-text-muted text-xs uppercase tracking-wider">Avg VPIP</div>
            <div className="font-mono text-xl font-bold text-text-primary">{agg.avgVpip.toFixed(1)}%</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <div className="text-text-muted text-xs uppercase tracking-wider">Avg PFR</div>
            <div className="font-mono text-xl font-bold text-text-primary">{agg.avgPfr.toFixed(1)}%</div>
          </div>
        </div>
      )}
    </>
  );
}
