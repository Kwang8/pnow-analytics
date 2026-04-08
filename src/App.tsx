import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { PokerNowExport, PlayerStats, OverallStats } from './lib/types';
import { analyzePlayer, analyzeOverall } from './lib/analysis';
import { decodeShareData, getShareDataFromUrl } from './lib/share';
import {
  saveGame, getGameRawData, findExistingGame, getGameClaims, refreshGame,
  getMyGroups, createGroup, deleteGroup, updateMyAggregate,
  type GroupDoc,
} from './lib/gameStore';
import { useAuth } from './lib/AuthContext';
import LoginScreen from './components/LoginScreen';
import UsernameSetup from './components/UsernameSetup';
import OverallView from './components/OverallView';
import Dashboard from './components/Dashboard';
import GameLibrary from './components/GameLibrary';
import GroupsList from './components/GroupsList';
import GroupView from './components/GroupView';
import MyStats from './components/MyStats';
import Leaderboard from './components/Leaderboard';
import AuthButton from './components/AuthButton';
import NewGameModal from './components/NewGameModal';
import { Share2, Check, BarChart3, Trophy, Plus, Loader2, Menu, X } from 'lucide-react';

type ContentView = 'empty' | 'overall' | 'player' | 'mystats' | 'leaderboard' | 'group';

export default function App() {
  const { user, loading: authLoading, needsUsername, username } = useAuth();
  const [data, setData] = useState<PokerNowExport | null>(null);
  const [contentView, setContentView] = useState<ContentView>('empty');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [sharedOverall, setSharedOverall] = useState<OverallStats | null>(null);
  const [sharedPlayerMap, setSharedPlayerMap] = useState<Map<string, PlayerStats> | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Saved game tracking
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Map of gameId -> (pokerNowId -> uid | null)
  const [claimedMap, setClaimedMap] = useState<Map<string, Map<string, string | null>>>(new Map());

  // Groups
  const [groups, setGroups] = useState<GroupDoc[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const reloadGroups = useCallback(() => {
    if (!user) return;
    getMyGroups(user.uid).then(setGroups).catch(err => console.error('Failed to load groups:', err));
  }, [user]);

  // Selecting a group (or clearing the selection via "All games") updates
  // the main content: a group gets its own leaderboard view, while "All games"
  // drops back to the empty state.
  const handleSelectGroup = useCallback((id: string | null) => {
    setSelectedGroupId(id);
    setContentView(id ? 'group' : 'empty');
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    reloadGroups();
  }, [reloadGroups]);

  const handleCreateGroup = useCallback(async (name: string) => {
    if (!user) return;
    await createGroup(user.uid, name, username ?? '');
    reloadGroups();
  }, [user, username, reloadGroups]);

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    if (!user) return;
    await deleteGroup(groupId, user.uid);
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    reloadGroups();
  }, [user, selectedGroupId, reloadGroups]);

  // Check for shared game in URL on mount
  useEffect(() => {
    const hash = window.location.hash;
    // New short format: #g=<gameId>
    if (hash.startsWith('#g=')) {
      const gameId = hash.slice(3);
      if (gameId) {
        getGameRawData(gameId).then(raw => {
          if (raw) {
            setData(raw);
            setCurrentGameId(gameId);
            setIsSharedView(true);
            setContentView('overall');
          }
        });
      }
      return;
    }
    // Legacy format: #s=<compressed data>
    const encoded = getShareDataFromUrl();
    if (encoded) {
      const result = decodeShareData(encoded);
      if (result) {
        setSharedOverall(result.overall);
        setSharedPlayerMap(result.playerStatsMap);
        setIsSharedView(true);
        setContentView('overall');
      }
    }
  }, []);

  const overallStats = useMemo<OverallStats | null>(() => {
    if (data) return analyzeOverall(data);
    if (isSharedView) return sharedOverall;
    return null;
  }, [data, isSharedView, sharedOverall]);

  const playerStats = useMemo<PlayerStats | null>(() => {
    if (!selectedPlayerId) return null;
    if (data) return analyzePlayer(data, selectedPlayerId);
    if (isSharedView && sharedPlayerMap) {
      return sharedPlayerMap.get(selectedPlayerId) ?? null;
    }
    return null;
  }, [data, selectedPlayerId, isSharedView, sharedPlayerMap]);

  const handleFileSelected = useCallback(async (file: File) => {
    setUploadError(null);
    const text = await file.text();
    let parsed: PokerNowExport;
    try {
      parsed = JSON.parse(text) as PokerNowExport;
      if (!parsed.hands || !Array.isArray(parsed.hands)) {
        throw new Error('Invalid format: missing "hands" array');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse JSON');
      return;
    }

    setData(parsed);
    setIsSharedView(false);
    setSharedOverall(null);
    setSharedPlayerMap(null);
    setCurrentGameId(null);
    setSelectedPlayerId(null);

    setContentView('overall');
    setSidebarOpen(false);
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }

    // Auto-save
    if (user) {
      const overall = analyzeOverall(parsed);
      setSaving(true);
      try {
        const existing = await findExistingGame(user.uid, parsed.gameId);
        if (existing) {
          setCurrentGameId(existing);
          loadClaims(existing);
        } else {
          const id = await saveGame(user.uid, user.email ?? '', parsed, overall);
          setCurrentGameId(id);
          setRefreshKey(k => k + 1);
        }
        // Refresh denormalized aggregate for the public profile view
        updateMyAggregate(user.uid).catch(err => console.error('Aggregate update failed:', err));
      } catch (e) {
        console.error('Failed to save game:', e);
      }
      setSaving(false);
    }
  }, [user]);


  const loadClaims = useCallback(async (gameId: string) => {
    if (!user) return;
    const claims = await getGameClaims(gameId);
    setClaimedMap(prev => {
      const next = new Map(prev);
      next.set(gameId, claims);
      return next;
    });
  }, [user]);

  const handleOpenGame = useCallback(async (gameId: string) => {
    const raw = await getGameRawData(gameId);
    if (raw) {
      setData(raw);
      setCurrentGameId(gameId);
      setIsSharedView(false);
      setSharedOverall(null);
      setSharedPlayerMap(null);
      setSelectedPlayerId(null);

      setContentView('overall');
      setSidebarOpen(false);
      loadClaims(gameId);
    }
  }, [loadClaims]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshGame = useCallback(async () => {
    if (!currentGameId || refreshing) return;
    setRefreshing(true);
    try {
      await refreshGame(currentGameId);
      setRefreshKey(k => k + 1);
      if (user) {
        updateMyAggregate(user.uid).catch(err => console.error('Aggregate update failed:', err));
      }
    } catch (err) {
      console.error('Failed to refresh game:', err);
    }
    setRefreshing(false);
  }, [currentGameId, refreshing, user]);

  const handleSelectPlayer = useCallback((id: string) => {
    setSelectedPlayerId(id);
    setContentView('player');
  }, []);

  const handleBackToOverall = useCallback(() => {
    setContentView('overall');
    setSelectedPlayerId(null);
  }, []);

  const handleShare = useCallback(() => {
    if (!currentGameId) return;
    const url = `${window.location.origin}${window.location.pathname}#g=${currentGameId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentGameId]);

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(file);
        e.target.value = '';
      }}
    />
  );

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // Not logged in
  if (!user && !isSharedView) {
    return <div className="min-h-screen bg-bg-primary"><LoginScreen /></div>;
  }

  // Needs username setup
  if (user && needsUsername && !isSharedView) {
    return <UsernameSetup />;
  }

  // ─── Sidebar content ─────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* New Game button */}
      <div className="p-3 space-y-2">
        <button
          onClick={() => setShowNewGame(true)}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/85 text-white font-medium text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Game
        </button>
        <button
          onClick={() => { setContentView('mystats'); setSidebarOpen(false); }}
          className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors ${
            contentView === 'mystats'
              ? 'bg-accent/15 text-accent'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          My Stats
        </button>
        <button
          onClick={() => { setContentView('leaderboard'); setSidebarOpen(false); }}
          className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md transition-colors ${
            contentView === 'leaderboard'
              ? 'bg-accent/15 text-accent'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Leaderboard
        </button>
      </div>

      {uploadError && (
        <div className="mx-3 mb-2 px-2 py-1.5 bg-stat-red/10 border border-stat-red/30 rounded text-stat-red text-[10px]">
          {uploadError}
        </div>
      )}

      {/* Divider + groups */}
      <div className="border-t border-border mx-3" />
      <div className="px-3 pt-2 pb-1">
        <span className="text-text-muted text-[10px] uppercase tracking-wider font-medium">Groups</span>
      </div>
      <div className="px-1.5">
        {user && (
          <GroupsList
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelectGroup={handleSelectGroup}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onGroupsChanged={reloadGroups}
          />
        )}
      </div>

      {/* Divider + game list */}
      <div className="border-t border-border mx-3 mt-2" />
      <div className="px-3 pt-2 pb-1">
        <span className="text-text-muted text-[10px] uppercase tracking-wider font-medium">Games</span>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 pb-3">
        {user && (
          <GameLibrary
            onOpenGame={handleOpenGame}
            selectedGameId={currentGameId}
            refreshKey={refreshKey}
            groups={groups}
            selectedGroupId={selectedGroupId}
            onGroupsChanged={reloadGroups}
          />
        )}
      </div>

      {/* User at bottom */}
      <div className="border-t border-border p-3">
        <AuthButton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {fileInput}
      {showNewGame && (
        <NewGameModal
          onFileSelected={(file) => { setShowNewGame(false); handleFileSelected(file); }}
          onClose={() => setShowNewGame(false)}
        />
      )}

      {/* Header */}
      <header className="border-b border-border bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-50 shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden text-text-muted hover:text-text-primary p-1"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-xl font-bold">
              <span className="text-accent">Poker</span><span className="text-text-primary">Scope</span>
            </h1>
          </div>

          {/* Right: context actions */}
          <div className="flex items-center gap-2">
            {isSharedView && (
              <span className="text-xs px-2 py-1 rounded bg-accent/15 text-accent font-medium">
                Shared
              </span>
            )}
            {saving && (
              <span className="text-xs px-2 py-1 rounded bg-stat-green/15 text-stat-green font-medium animate-pulse">
                Saving...
              </span>
            )}
            {(contentView === 'overall' || contentView === 'player') && currentGameId && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-bg-hover"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-stat-green" />
                    <span className="text-stat-green hidden md:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Share</span>
                  </>
                )}
              </button>
            )}
            {/* Auth shown in sidebar on desktop, header on mobile */}
            <div className="md:hidden">
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — desktop: always visible, mobile: overlay */}
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-64 border-r border-border bg-bg-secondary shrink-0 flex-col">
          {sidebarContent}
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
            <aside className="relative w-72 h-full bg-bg-secondary border-r border-border flex flex-col">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-6">
            {contentView === 'empty' && (
              <div className="flex flex-col items-center justify-center py-24 text-text-muted">
                <p className="text-lg mb-2">Select a game or upload a new one</p>
                <p className="text-sm">Use the sidebar to browse your sessions</p>
              </div>
            )}

            {contentView === 'overall' && overallStats && (
              <div className="space-y-6">
                <OverallView
                  stats={overallStats}
                  onSelectPlayer={handleSelectPlayer}
                  gameId={currentGameId}
                  claimMap={currentGameId ? claimedMap.get(currentGameId) : undefined}
                  onRefresh={currentGameId && !isSharedView ? handleRefreshGame : undefined}
                  refreshing={refreshing}
                  onClaimed={(id) => {
                    if (!currentGameId || !user) return;
                    setClaimedMap(prev => {
                      const next = new Map(prev);
                      const inner = new Map(next.get(currentGameId) ?? []);
                      inner.set(id, user.uid);
                      next.set(currentGameId, inner);
                      return next;
                    });
                    // Claiming a new session changes the aggregate — refresh it
                    updateMyAggregate(user.uid).catch(err => console.error('Aggregate update failed:', err));
                  }}
                />
              </div>
            )}

            {contentView === 'player' && playerStats && (
              <Dashboard stats={playerStats} onBack={handleBackToOverall} isSharedView={isSharedView} data={data} />
            )}

            {contentView === 'mystats' && <MyStats />}

            {contentView === 'leaderboard' && <Leaderboard />}

            {contentView === 'group' && selectedGroupId && (() => {
              const g = groups.find(x => x.id === selectedGroupId);
              return g ? <GroupView group={g} /> : null;
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}
