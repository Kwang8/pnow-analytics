import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { searchUserByUsername, addFriend } from '../lib/gameStore';
import { Search, UserPlus, Loader2, X } from 'lucide-react';

interface Props {
  onDone: () => void;
}

export default function AddFriend({ onDone }: Props) {
  const { user } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{ uid: string; displayName: string; email: string; photoURL: string; username: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    setSearching(true);
    setError('');
    setFoundUser(null);
    const found = await searchUserByUsername(searchInput.trim());
    setSearching(false);
    if (!found) {
      setError('No user found. They need to sign in and set a username first.');
      return;
    }
    if (found.uid === user?.uid) {
      setError("That's you!");
      return;
    }
    setFoundUser(found);
  };

  const handleAdd = async () => {
    if (!foundUser || !user) return;
    setAdding(true);
    try {
      await addFriend(user.uid, user.email ?? '', foundUser.uid, foundUser.email);
      setSuccess(true);
      setTimeout(() => onDone(), 1500);
    } catch {
      setError('Failed to add friend. Try again.');
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onDone} />
      <div className="relative bg-bg-card border border-border rounded-lg p-6 w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Friend
          </h3>
          <button onClick={onDone} className="text-text-muted hover:text-text-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-text-muted text-xs">
          Search by username to add a friend. You'll see all their games and they'll see yours.
        </p>

        {success ? (
          <div className="text-center py-4">
            <div className="text-stat-green font-medium mb-1">Friend added!</div>
            <div className="text-text-muted text-sm">You can now see each other's games.</div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="@username"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                autoFocus
                className="flex-1 bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !searchInput.trim()}
                className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent/80 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {error && <div className="text-stat-red text-xs">{error}</div>}

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

                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="w-full py-2 bg-stat-green text-white text-sm rounded-md hover:bg-stat-green/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Add Friend
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
