import { useState, useMemo, useCallback } from 'react';
import type { PokerNowExport, PlayerStats, OverallStats } from './lib/types';
import { analyzePlayer, analyzeOverall } from './lib/analysis';
import Upload from './components/Upload';
import OverallView from './components/OverallView';
import Dashboard from './components/Dashboard';
import { RotateCcw } from 'lucide-react';

type View = 'upload' | 'overall' | 'player';

export default function App() {
  const [data, setData] = useState<PokerNowExport | null>(null);
  const [view, setView] = useState<View>('upload');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const overallStats = useMemo<OverallStats | null>(() => {
    if (!data) return null;
    return analyzeOverall(data);
  }, [data]);

  const playerStats = useMemo<PlayerStats | null>(() => {
    if (!data || !selectedPlayerId) return null;
    return analyzePlayer(data, selectedPlayerId);
  }, [data, selectedPlayerId]);

  const handleUpload = useCallback((parsed: PokerNowExport) => {
    setData(parsed);
    setView('overall');
  }, []);

  const handleSelectPlayer = useCallback((id: string) => {
    setSelectedPlayerId(id);
    setView('player');
  }, []);

  const handleBack = useCallback(() => {
    setView('overall');
    setSelectedPlayerId(null);
  }, []);

  const handleReset = useCallback(() => {
    setData(null);
    setView('upload');
    setSelectedPlayerId(null);
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary">
      {view !== 'upload' && (
        <header className="border-b border-border bg-bg-secondary/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1
              className="text-xl font-bold cursor-pointer"
              onClick={handleBack}
            >
              <span className="text-accent">Poker</span><span className="text-text-primary">Scope</span>
            </h1>
            <div className="flex items-center gap-3">
              {view === 'overall' && (
                <span className="text-text-muted text-sm">
                  {overallStats?.totalHands} hands · {overallStats?.players.length} players
                </span>
              )}
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-text-muted hover:text-text-primary text-sm transition-colors px-3 py-1.5 rounded-md hover:bg-bg-hover"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New file
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={view === 'upload' ? '' : 'max-w-6xl mx-auto px-4 py-6'}>
        {view === 'upload' && <Upload onUpload={handleUpload} />}
        {view === 'overall' && overallStats && (
          <OverallView stats={overallStats} onSelectPlayer={handleSelectPlayer} />
        )}
        {view === 'player' && playerStats && (
          <Dashboard stats={playerStats} onBack={handleBack} />
        )}
      </main>

      {view !== 'upload' && (
        <footer className="border-t border-border mt-12 py-4 text-center text-text-muted text-xs">
          All analysis runs locally — no data leaves your browser
        </footer>
      )}
    </div>
  );
}
