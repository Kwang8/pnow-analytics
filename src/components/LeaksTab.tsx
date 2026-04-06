import { useState } from 'react';
import type { PlayerStats } from '../lib/types';
import HandCard from './HandCard';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  stats: PlayerStats;
  onReplay?: (handNumber: string) => void;
}

const INITIAL_VISIBLE = 2;

const leakLabels: Record<string, { title: string; desc: string }> = {
  'bad-cold-call': {
    title: 'Bad Cold Calls',
    desc: 'Called a raise preflop with weak holdings (both cards below T, not suited connectors)',
  },
  'ep-junk-open': {
    title: 'EP/MP Junk Opens',
    desc: 'Opened substandard hands from early position in 5+ player games',
  },
  'river-bet-lost': {
    title: 'River Bets/Raises That Lost',
    desc: 'Bet or raised the river and lost — potential bad bluffs or thin value',
  },
  'check-call-bleed': {
    title: 'Check-Call Bleed',
    desc: 'Checked flop, called turn, then lost 5+ BB — classic passive leak',
  },
  'overlimp': {
    title: 'Overlimps',
    desc: 'Limped preflop instead of raising or folding — a well-known beginner leak',
  },
  '3bet-fold': {
    title: '3-Bet Then Folded',
    desc: '3-bet preflop then folded to a 4-bet — wasted chips with an aggressive move',
  },
  'cbet-fold': {
    title: 'C-Bet Then Folded',
    desc: 'C-bet the flop then folded to a raise — exploitable pattern',
  },
  'bb-fold-to-minraise': {
    title: 'BB Fold to Min-Raise',
    desc: 'Folded from BB facing a small raise (≤3x) — getting great pot odds to defend',
  },
  'missed-value-river': {
    title: 'Missed Value on River',
    desc: 'Checked river, went to showdown, and won 10+ BB — missed a value bet opportunity',
  },
  'overbet-bluff': {
    title: 'Overbet Bluffs',
    desc: 'Bet ≥ pot on turn/river and lost 10+ BB — expensive failed bluffs or overbets',
  },
};

export default function LeaksTab({ stats, onReplay }: Props) {
  const [expanded, setExpanded] = useState(false);

  const grouped = new Map<string, typeof stats.leaks>();
  for (const leak of stats.leaks) {
    if (!grouped.has(leak.leakType)) grouped.set(leak.leakType, []);
    grouped.get(leak.leakType)!.push(leak);
  }

  if (stats.leaks.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        No significant leaks detected. Nice play!
      </div>
    );
  }

  // Sum netResult (cents) per group and sort by total cost (worst first)
  const sortedGroups = Array.from(grouped.entries())
    .map(([type, hands]) => ({
      type,
      hands,
      totalCost: hands.reduce((sum, h) => sum + h.netResult, 0), // negative = lost money
    }))
    .sort((a, b) => a.totalCost - b.totalCost); // most negative first

  const topLeak = sortedGroups[0];
  const topLeakInfo = leakLabels[topLeak.type] || { title: topLeak.type, desc: '' };
  const visibleGroups = expanded ? sortedGroups : sortedGroups.slice(0, INITIAL_VISIBLE);
  const hiddenCount = sortedGroups.length - INITIAL_VISIBLE;

  return (
    <div className="space-y-8">
      {/* Top Leak Banner */}
      <div className="bg-stat-red/10 border border-stat-red/30 rounded-lg p-4">
        <div className="text-stat-red text-xs uppercase tracking-wider font-semibold mb-1">Your Most Expensive Leak</div>
        <div className="text-text-primary font-semibold">
          {topLeakInfo.title} cost you ${Math.abs(topLeak.totalCost / 100).toFixed(2)} across {topLeak.hands.length} hand{topLeak.hands.length !== 1 ? 's' : ''}
        </div>
      </div>

      {visibleGroups.map(({ type, hands, totalCost }) => {
        const info = leakLabels[type] || { title: type, desc: '' };
        return (
          <div key={type}>
            <div className="mb-3">
              <h3 className="text-text-primary font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-stat-red" />
                {info.title}
                <span className="text-text-muted font-mono text-sm font-normal">({hands.length})</span>
                <span className="font-mono text-sm font-normal text-stat-red">— ${Math.abs(totalCost / 100).toFixed(2)} lost</span>
              </h3>
              <p className="text-text-muted text-sm">{info.desc}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {hands.slice(0, 8).map((h) => (
                <HandCard key={h.handNumber} hand={h} onReplay={onReplay} />
              ))}
            </div>
            {hands.length > 8 && (
              <p className="text-text-muted text-sm mt-2">+{hands.length - 8} more</p>
            )}
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors text-sm"
        >
          {expanded ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show {hiddenCount} more leak{hiddenCount !== 1 ? 's' : ''} <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
    </div>
  );
}
