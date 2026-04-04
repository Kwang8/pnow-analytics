import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getMyGames, deleteGame, getMyGamePlayerDocs, type GameDoc } from '../lib/gameStore';
import { Trash2, Loader2 } from 'lucide-react';

interface Props {
  onOpenGame: (gameId: string) => void;
  selectedGameId: string | null;
  refreshKey: number;
}

export default function GameLibrary({ onOpenGame, selectedGameId, refreshKey }: Props) {
  const { user } = useAuth();
  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPnlByGame, setMyPnlByGame] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadGames = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getMyGames(user.uid),
      getMyGamePlayerDocs(user.uid),
    ]).then(([g, playerDocs]) => {
      setGames(g);
      // Sum PNL per game from all claimed players
      const pnlMap = new Map<string, number>();
      for (const doc of playerDocs) {
        pnlMap.set(doc.gameId, (pnlMap.get(doc.gameId) ?? 0) + doc.pnl);
      }
      setMyPnlByGame(pnlMap);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    loadGames();
  }, [loadGames, refreshKey]);

  const handleDelete = async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    if (!user || !confirm('Delete this game?')) return;
    setDeleting(gameId);
    await deleteGame(gameId, user.uid);
    setGames(prev => prev.filter(g => g.id !== gameId));
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted text-xs">
        <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
        Loading...
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-6 text-text-muted text-xs px-2">
        No games yet. Upload a hand history to get started.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {games.map(game => {
        const date = game.gameDate
          ? new Date(game.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '—';
        const stakes = `${(game.bigBlind / 200).toFixed(2)}/${(game.bigBlind / 100).toFixed(2)}`;
        const isActive = selectedGameId === game.id;
        const isShared = game.uploadedBy !== user?.uid;

        const myPnlCents = myPnlByGame.get(game.id);
        const hasMyPnl = myPnlCents !== undefined;
        const myPnlDollars = hasMyPnl ? myPnlCents / 100 : 0;

        return (
          <div
            key={game.id}
            onClick={() => onOpenGame(game.id)}
            className={`
              px-3 py-2.5 rounded-md cursor-pointer transition-colors group relative
              ${isActive
                ? 'bg-accent/15 border border-accent/30'
                : 'hover:bg-bg-hover border border-transparent'}
            `}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${isActive ? 'text-accent' : 'text-text-primary'}`}>
                    {date}
                  </span>
                  <span className="text-text-muted text-[10px]">{stakes}</span>
                  {isShared && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent">shared</span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1.5">
                  <span>{game.totalHands}h</span>
                  <span>{game.playerSummaries?.length ?? 0}p</span>
                  {hasMyPnl ? (
                    <span className={`font-mono font-medium ${myPnlDollars >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                      {myPnlDollars >= 0 ? '+' : ''}${myPnlDollars.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-text-muted italic">not claimed</span>
                  )}
                </div>
              </div>
              {!isShared && (
                <button
                  onClick={(e) => handleDelete(e, game.id)}
                  disabled={deleting === game.id}
                  className="text-text-muted hover:text-stat-red p-1 rounded hover:bg-bg-hover transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete"
                >
                  {deleting === game.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
