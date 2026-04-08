import { useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  searchUserByUsername,
  inviteToGroup,
  kickFromGroup,
  leaveGroup,
  type GroupDoc,
} from '../lib/gameStore';
import { Search, UserPlus, Loader2, X, Crown, LogOut } from 'lucide-react';

interface Props {
  group: GroupDoc;
  onDone: () => void;
  onChanged: () => void;
}

type FoundUser = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  username: string;
};

export default function GroupInviteModal({ group, onDone, onChanged }: Props) {
  const { user, username: myUsername } = useAuth();
  const isOwner = user?.uid === group.ownerUid;

  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    const q = searchInput.trim().replace(/^@/, '');
    if (!q) return;
    setSearching(true);
    setError('');
    setFoundUser(null);
    const found = await searchUserByUsername(q);
    setSearching(false);
    if (!found) {
      setError('No user found with that username.');
      return;
    }
    if (found.uid === user?.uid) {
      setError("That's you!");
      return;
    }
    if (group.members?.includes(found.uid)) {
      setError('Already in this group.');
      return;
    }
    setFoundUser(found);
  }, [searchInput, user, group.members]);

  const handleInvite = useCallback(async () => {
    if (!foundUser || !user) return;
    setInviting(true);
    setError('');
    try {
      await inviteToGroup(group.id, user.uid, foundUser.uid, foundUser.username, foundUser.email);
      setFoundUser(null);
      setSearchInput('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to invite.');
    }
    setInviting(false);
  }, [foundUser, user, group.id, onChanged]);

  const handleKick = useCallback(async (memberUid: string, memberUsername: string) => {
    if (!user) return;
    if (!confirm(`Remove @${memberUsername} from "${group.name}"?`)) return;
    try {
      await kickFromGroup(group.id, user.uid, memberUid, memberUsername);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member.');
    }
  }, [user, group.id, group.name, onChanged]);

  const handleLeave = useCallback(async () => {
    if (!user || !myUsername) return;
    if (!confirm(`Leave "${group.name}"? You'll lose access to this group.`)) return;
    try {
      await leaveGroup(group.id, user.uid, myUsername);
      onChanged();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave group.');
    }
  }, [user, myUsername, group.id, group.name, onChanged, onDone]);

  // Zip members + usernames for display
  const memberRows = (group.members ?? []).map((uid, i) => ({
    uid,
    username: group.memberUsernames?.[i] ?? 'unknown',
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onDone} />
      <div className="relative bg-bg-card border border-border rounded-lg p-6 w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> {group.name}
          </h3>
          <button onClick={onDone} className="text-text-muted hover:text-text-primary p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-text-muted text-xs">
          {isOwner
            ? "Invite friends by username. They'll see every game in this group."
            : "You're a member of this group. Only the owner can invite others."}
        </p>

        {/* Invite form (owner only) */}
        {isOwner && (
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

            {foundUser && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-bg-secondary rounded-md p-3">
                  {foundUser.photoURL ? (
                    <img src={foundUser.photoURL} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">
                      {foundUser.displayName[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div className="text-text-primary text-sm font-medium">@{foundUser.username}</div>
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="w-full py-2 bg-stat-green text-white text-sm rounded-md hover:bg-stat-green/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Invite to group
                </button>
              </div>
            )}
          </>
        )}

        {error && <div className="text-stat-red text-xs">{error}</div>}

        {/* Member list */}
        <div className="space-y-1.5">
          <div className="text-text-muted text-[10px] uppercase tracking-wider font-medium">
            Members ({memberRows.length})
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {memberRows.map(m => {
              const isMemberOwner = m.uid === group.ownerUid;
              const isMe = m.uid === user?.uid;
              return (
                <div
                  key={m.uid}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg-secondary/50 text-sm"
                >
                  <div className="w-6 h-6 rounded-full bg-accent/20 text-accent text-[10px] flex items-center justify-center font-bold shrink-0">
                    {m.username[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="text-text-primary truncate flex-1">@{m.username}{isMe && ' (you)'}</span>
                  {isMemberOwner && (
                    <span title="Owner" className="text-stat-yellow">
                      <Crown className="w-3 h-3" />
                    </span>
                  )}
                  {isOwner && !isMemberOwner && (
                    <button
                      onClick={() => handleKick(m.uid, m.username)}
                      className="text-text-muted hover:text-stat-red p-0.5 rounded"
                      title="Remove from group"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {!isOwner && (
          <button
            onClick={handleLeave}
            className="w-full py-2 bg-stat-red/10 border border-stat-red/30 text-stat-red text-sm rounded-md hover:bg-stat-red/20 transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            Leave group
          </button>
        )}
      </div>
    </div>
  );
}
