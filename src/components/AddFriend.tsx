import { useState } from 'react';
import { searchUserByUsername, addFriendToGame, type PlayerSummary } from '../lib/gameStore';
import { Search, UserPlus, Loader2, X } from 'lucide-react';

interface Props {
  gameId: string;
  players: PlayerSummary[];
  existingMembers: string[];
  onDone: () => void;
}

export default function AddFriend({ gameId, players, existingMembers, onDone }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ uid: string; displayName: string; email: string; photoURL: string; username: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    setSearching(true);
    setError('');
    setFoundUser(null);
    const user = await searchUserByUsername(searchInput.trim());
    setSearching(false);
    if (!user) {
      setError('No user found with that username. They need to sign in and set a username first.');
      return;
    }
    if (existingMembers.includes(user.uid)) {
      setError('This user already has access to this game.');
      return;
    }
    setFoundUser(user);
  };

  const handleAdd = async () => {
    if (!foundUser || !selectedPlayer) return;
    setAdding(true);
    try {
      await addFriendToGame(gameId, foundUser.uid, foundUser.email, selectedPlayer);
      setSuccess(true);
      setTimeout(() => onDone(), 1500);
    } catch {
      setError('Failed to add friend. Try again.');
      setAdding(false);
    }
  };

  if (success) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6 text-center">
        <div className="text-stat-green font-medium mb-1">Friend added!</div>
        <div className="text-text-muted text-sm">They can now see this game in their library.</div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-text-primary font-semibold flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add Friend to Game
        </h3>
        <button onClick={onDone} className="text-text-muted hover:text-text-primary p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-text-muted text-xs">
        Search by username to link a friend's account to a player seat. They'll see this game in their dashboard.
      </p>

      {/* Username search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="@username"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !searchInput.trim()}
          className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </div>

      {error && <div className="text-stat-red text-xs">{error}</div>}

      {/* Found user + player selection */}
      {foundUser && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-bg-secondary rounded-md p-3">
            {foundUser.photoURL ? (
              <img src={foundUser.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                {foundUser.displayName[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <div className="text-text-primary text-sm font-medium">{foundUser.displayName}</div>
              <div className="text-text-muted text-xs">@{foundUser.username}</div>
            </div>
          </div>

          <div>
            <label className="text-text-muted text-xs block mb-1">Which player are they?</label>
            <select
              value={selectedPlayer}
              onChange={e => setSelectedPlayer(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">Select a player...</option>
              {players.map(p => (
                <option key={p.pokerNowId} value={p.pokerNowId}>
                  {p.name} ({p.pnlBB >= 0 ? '+' : ''}{p.pnlBB.toFixed(1)} BB)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleAdd}
            disabled={adding || !selectedPlayer}
            className="w-full py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Add to Game
          </button>
        </div>
      )}
    </div>
  );
}
