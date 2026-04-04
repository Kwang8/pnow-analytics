import { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getAllPlayerStats, type LeaderboardEntry } from '../lib/gameStore';
import { Loader2, Trophy } from 'lucide-react';

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getAllPlayerStats(user.uid).then(data => {
      setEntries(data);
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading leaderboard...
      </div>
    );
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
                    className={`border-b border-border/50 ${isMe ? 'bg-accent/10' : ''}`}
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
