import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  getMyGames,
  deleteGame,
  getMyGamePlayerDocs,
  addGameToGroup,
  removeGameFromGroup,
  createGroup,
  type GameDoc,
  type GroupDoc,
} from '../lib/gameStore';
import { Trash2, Loader2, FolderPlus, Check, Plus } from 'lucide-react';

interface Props {
  onOpenGame: (gameId: string) => void;
  selectedGameId: string | null;
  refreshKey: number;
  groups: GroupDoc[];
  selectedGroupId: string | null;
  onGroupsChanged: () => void;
}

export default function GameLibrary({
  onOpenGame,
  selectedGameId,
  refreshKey,
  groups,
  selectedGroupId,
  onGroupsChanged,
}: Props) {
  const { user } = useAuth();
  const [games, setGames] = useState<GameDoc[]>([]);
  const [myPnlByGame, setMyPnlByGame] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [openMenuGameId, setOpenMenuGameId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const loadGames = useCallback(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getMyGames(user.uid),
      getMyGamePlayerDocs(user.uid),
    ]).then(([g, playerDocs]) => {
      setGames(g);
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

  // Close popover on outside click
  useEffect(() => {
    if (!openMenuGameId) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuGameId(null);
        setNewGroupName('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenuGameId]);

  // Filter games by selected group
  const filteredGames = useMemo(() => {
    if (!selectedGroupId) return games;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return games;
    const idSet = new Set(group.gameIds ?? []);
    return games.filter(g => idSet.has(g.id));
  }, [games, groups, selectedGroupId]);

  // Build map: gameId -> Set of groupIds it belongs to (for popover checkmarks)
  const gameGroupMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const g of groups) {
      for (const gameId of g.gameIds ?? []) {
        if (!map.has(gameId)) map.set(gameId, new Set());
        map.get(gameId)!.add(g.id);
      }
    }
    return map;
  }, [groups]);

  const handleDelete = useCallback(async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    if (!user || !confirm('Delete this game?')) return;
    setDeleting(gameId);
    await deleteGame(gameId, user.uid);
    setGames(prev => prev.filter(g => g.id !== gameId));
    setDeleting(null);
    // Clean up stale group refs
    onGroupsChanged();
  }, [user, onGroupsChanged]);

  const handleToggleMenu = useCallback((e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    setOpenMenuGameId(prev => (prev === gameId ? null : gameId));
    setNewGroupName('');
  }, []);

  const handleToggleGroup = useCallback(async (e: React.MouseEvent, groupId: string, gameId: string, isIn: boolean) => {
    e.stopPropagation();
    if (isIn) {
      await removeGameFromGroup(groupId, gameId);
    } else {
      await addGameToGroup(groupId, gameId);
    }
    onGroupsChanged();
  }, [onGroupsChanged]);

  const handleCreateAndAdd = useCallback(async (e: React.FormEvent, gameId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const groupId = await createGroup(user.uid, trimmed);
    await addGameToGroup(groupId, gameId);
    setNewGroupName('');
    onGroupsChanged();
  }, [user, newGroupName, onGroupsChanged]);

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

  if (filteredGames.length === 0) {
    return (
      <div className="text-center py-6 text-text-muted text-xs px-2">
        No games in this group yet.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {filteredGames.map(game => {
        const date = game.gameDate
          ? new Date(game.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '—';
        const stakes = `${(game.bigBlind / 200).toFixed(2)}/${(game.bigBlind / 100).toFixed(2)}`;
        const isActive = selectedGameId === game.id;
        const isShared = game.uploadedBy !== user?.uid;
        const isMenuOpen = openMenuGameId === game.id;
        const inGroupSet = gameGroupMap.get(game.id) ?? new Set<string>();

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
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => handleToggleMenu(e, game.id)}
                  className={`p-1 rounded hover:bg-bg-hover transition-colors ${
                    inGroupSet.size > 0 || isMenuOpen
                      ? 'text-accent'
                      : 'text-text-muted hover:text-accent'
                  }`}
                  title="Add to group"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>
                {!isShared && (
                  <button
                    onClick={(e) => handleDelete(e, game.id)}
                    disabled={deleting === game.id}
                    className="text-text-muted hover:text-stat-red p-1 rounded hover:bg-bg-hover transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    {deleting === game.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {isMenuOpen && (
              <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-full mt-1 z-30 w-52 bg-bg-card border border-border rounded-md shadow-lg p-1"
              >
                <div className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1 font-medium">
                  Groups
                </div>
                {groups.length === 0 && (
                  <div className="text-[11px] text-text-muted px-2 py-1 italic">
                    No groups yet
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto">
                  {groups.map(g => {
                    const isIn = inGroupSet.has(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={(e) => handleToggleGroup(e, g.id, game.id, isIn)}
                        className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-bg-hover text-text-primary transition-colors"
                      >
                        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                          {isIn && <Check className="w-3 h-3 text-accent" />}
                        </span>
                        <span className="truncate flex-1 text-left">{g.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border mt-1 pt-1">
                  <form onSubmit={(e) => handleCreateAndAdd(e, game.id)} className="flex items-center gap-1 px-1">
                    <Plus className="w-3 h-3 text-text-muted shrink-0" />
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="New group"
                      className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted focus:outline-none py-1"
                    />
                  </form>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
