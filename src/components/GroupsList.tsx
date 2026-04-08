import { useState, useCallback } from 'react';
import { Plus, Folder, FolderOpen, X, Users } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { GroupDoc } from '../lib/gameStore';
import GroupInviteModal from './GroupInviteModal';

interface Props {
  groups: GroupDoc[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (id: string) => void;
  onGroupsChanged: () => void;
}

export default function GroupsList({
  groups,
  selectedGroupId,
  onSelectGroup,
  onCreateGroup,
  onDeleteGroup,
  onGroupsChanged,
}: Props) {
  const { user } = useAuth();
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const manageGroup = manageGroupId ? groups.find(g => g.id === manageGroupId) ?? null : null;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onCreateGroup(trimmed);
      setName('');
      setCreating(false);
    }
  }, [name, onCreateGroup]);

  const handleDelete = useCallback((e: React.MouseEvent, g: GroupDoc) => {
    e.stopPropagation();
    if (confirm(`Delete group "${g.name}"? Games inside will not be deleted.`)) {
      onDeleteGroup(g.id);
    }
  }, [onDeleteGroup]);

  const handleManage = useCallback((e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    setManageGroupId(groupId);
  }, []);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelectGroup(null)}
        className={`w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors ${
          selectedGroupId === null
            ? 'bg-accent/15 text-accent'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
        }`}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">All games</span>
      </button>

      {groups.map(g => {
        const isActive = selectedGroupId === g.id;
        const isOwner = g.ownerUid === user?.uid;
        const memberCount = g.members?.length ?? 1;
        return (
          <div key={g.id} className="group relative">
            <button
              onClick={() => onSelectGroup(g.id)}
              className={`w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors ${
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">{g.name}</span>
              <span className="text-[10px] text-text-muted shrink-0 pr-10">
                {g.gameIds?.length ?? 0}
                {memberCount > 1 && <span className="ml-1">· {memberCount}p</span>}
              </span>
            </button>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => handleManage(e, g.id)}
                className="text-text-muted hover:text-accent p-0.5 rounded"
                title={isOwner ? 'Invite and manage members' : 'View members'}
              >
                <Users className="w-3 h-3" />
              </button>
              {isOwner && (
                <button
                  onClick={(e) => handleDelete(e, g)}
                  className="text-text-muted hover:text-stat-red p-0.5 rounded"
                  title="Delete group"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      {creating ? (
        <form onSubmit={handleSubmit} className="px-2 py-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (!name.trim()) setCreating(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setName(''); setCreating(false); } }}
            placeholder="Group name"
            className="w-full bg-bg-primary border border-border rounded px-1.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent"
          />
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New group
        </button>
      )}

      {manageGroup && (
        <GroupInviteModal
          group={manageGroup}
          onDone={() => setManageGroupId(null)}
          onChanged={onGroupsChanged}
        />
      )}
    </div>
  );
}
