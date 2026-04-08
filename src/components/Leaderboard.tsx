import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getPublicProfiles, type PublicProfile } from '../lib/gameStore';
import { Loader2, Trophy, Lock, ArrowLeft } from 'lucide-react';

export default function Leaderboard() {
  const { user, isPublic } = useAuth();
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PublicProfile | null>(null);

  const load = useCallback(() => {
    if (!isPublic) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getPublicProfiles()
      .then(setProfiles)
      .catch(err => console.error('Failed to load leaderboard:', err))
      .finally(() => setLoading(false));
  }, [isPublic]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isPublic) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock className="w-10 h-10 text-text-muted mb-3" />
        <h2 className="text-xl font-bold text-text-primary mb-1">Leaderboard is public-only</h2>
        <p className="text-text-secondary text-sm max-w-sm">
          Make your profile public from the My Stats page to see other public players and be listed here yourself.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading leaderboard...
      </div>
    );
  }

  if (selected) {
    return <ProfileDetail profile={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-500" />
          Leaderboard
        </h2>
        <p className="text-text-secondary text-sm">Public player rankings — click a row to view details</p>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          No public profiles yet. You're the first!
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
              {profiles.map((p, i) => {
                const isMe = user?.uid === p.uid;
                const agg = p.aggregate;
                const pnlDollars = (agg?.totalPnlCents ?? 0) / 100;
                const winRate = agg && agg.sessions > 0 ? ((agg.wins / agg.sessions) * 100).toFixed(0) : '—';
                return (
                  <tr
                    key={p.uid}
                    onClick={() => setSelected(p)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-bg-hover transition-colors ${isMe ? 'bg-accent/10' : ''}`}
                  >
                    <td className="p-3 text-text-muted font-mono">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.photoURL ? (
                          <img src={p.photoURL} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-bg-hover flex items-center justify-center text-text-muted text-xs">
                            {(p.username || p.displayName || '?')[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className={`font-medium truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                            @{p.username || 'unknown'}
                            {isMe && <span className="text-xs ml-1 text-accent/70">(you)</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary">
                      {agg?.sessions ?? '—'}
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary hidden md:table-cell">
                      {agg ? agg.totalHands.toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-right font-mono text-text-secondary">
                      {winRate}{agg ? '%' : ''}
                    </td>
                    <td className={`p-3 text-right font-mono font-bold ${pnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                      {agg ? `${pnlDollars >= 0 ? '+' : ''}$${Math.abs(pnlDollars).toFixed(2)}` : '—'}
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

function ProfileDetail({ profile, onBack }: { profile: PublicProfile; onBack: () => void }) {
  const agg = profile.aggregate;
  const pnlDollars = (agg?.totalPnlCents ?? 0) / 100;
  const pnlColor = pnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red';
  const winRate = agg && agg.sessions > 0 ? (agg.wins / agg.sessions) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm mb-2 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to leaderboard
        </button>
        <div className="flex items-center gap-3">
          {profile.photoURL ? (
            <img src={profile.photoURL} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-accent/20 text-accent text-lg flex items-center justify-center font-bold">
              {(profile.username || profile.displayName || '?')[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-text-primary">@{profile.username || 'unknown'}</h2>
            <p className="text-text-secondary text-sm">{profile.displayName}</p>
          </div>
        </div>
      </div>

      {!agg ? (
        <div className="text-center py-12 text-text-muted text-sm">
          This player has not uploaded any games yet.
        </div>
      ) : (
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
        </>
      )}
    </div>
  );
}
