import { useMemo, useState } from 'react';
import type { PlayerStats, HandResult, Position } from '../lib/types';

interface Props {
  stats: PlayerStats;
}

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
const RANK_ORDER: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, i]));

const POSITIONS: (Position | 'All')[] = ['All', 'BTN', 'CO', 'HJ', 'EP/MP', 'SB', 'BB'];

type HeroAction = 'open' | 'threeBet' | null;

interface ComboData {
  open: number;
  threeBet: number;
  total: number;
}

function cardRank(card: string): string {
  return card[0];
}

function cardSuit(card: string): string {
  return card[1];
}

function normalizeCombo(holeCards: [string, string]): string {
  const [a, b] = holeCards;
  const rankA = cardRank(a);
  const rankB = cardRank(b);
  const suitA = cardSuit(a);
  const suitB = cardSuit(b);

  // Sort by rank (higher first)
  const [high, low, highSuit, lowSuit] =
    RANK_ORDER[rankA] <= RANK_ORDER[rankB]
      ? [rankA, rankB, suitA, suitB]
      : [rankB, rankA, suitB, suitA];

  if (high === low) return `${high}${low}`; // Pair
  if (highSuit === lowSuit) return `${high}${low}s`; // Suited
  return `${high}${low}o`; // Offsuit
}

function classifyHeroAction(hand: HandResult): HeroAction {
  const preflopActions = hand.actions.filter(
    (a) => a.street === 'preflop' && a.action !== 'post'
  );

  let someoneRaised = false;
  for (const action of preflopActions) {
    if (action.isHero) {
      if (action.action === 'raise') {
        return someoneRaised ? 'threeBet' : 'open';
      }
      // Hero checked, called, or folded — not an open or 3-bet
      return null;
    }
    if (action.action === 'raise') {
      someoneRaised = true;
    }
  }
  return null;
}

function buildFrequencyMap(
  hands: HandResult[],
  position: Position | 'All'
): Map<string, ComboData> {
  const map = new Map<string, ComboData>();

  for (const hand of hands) {
    if (!hand.holeCards) continue;
    if (position !== 'All' && hand.position !== position) continue;

    const combo = normalizeCombo(hand.holeCards);
    const entry = map.get(combo) ?? { open: 0, threeBet: 0, total: 0 };
    entry.total++;

    const action = classifyHeroAction(hand);
    if (action === 'open') entry.open++;
    else if (action === 'threeBet') entry.threeBet++;

    map.set(combo, entry);
  }

  return map;
}

function comboLabel(row: number, col: number): string {
  if (row === col) return `${RANKS[row]}${RANKS[col]}`;
  if (row < col) return `${RANKS[row]}${RANKS[col]}s`;
  return `${RANKS[col]}${RANKS[row]}o`;
}

function cellColor(data: ComboData | undefined): string {
  if (!data || data.total === 0) return 'bg-bg-secondary';

  const openRate = data.open / data.total;
  const threeBetRate = data.threeBet / data.total;

  if (openRate === 0 && threeBetRate === 0) return 'bg-bg-secondary';

  // Scale opacity based on frequency — more hands = more opaque
  const maxOpacity = 0.85;
  const minOpacity = 0.25;
  const actionRate = openRate + threeBetRate;
  const opacity = minOpacity + (maxOpacity - minOpacity) * Math.min(actionRate, 1);

  if (threeBetRate > openRate) {
    // Dominant 3-bet → yellow/amber
    return `rgba(251, 191, 36, ${opacity.toFixed(2)})`;
  }
  // Dominant open → green
  return `rgba(34, 197, 94, ${opacity.toFixed(2)})`;
}

function cellBorderClass(data: ComboData | undefined): string {
  if (!data || data.total === 0) return 'border-border/30';
  const hasAction = data.open > 0 || data.threeBet > 0;
  if (!hasAction) return 'border-border/30';
  if (data.threeBet > data.open) return 'border-stat-yellow/40';
  return 'border-stat-green/40';
}

export default function PreflopRangesTab({ stats }: Props) {
  const [position, setPosition] = useState<Position | 'All'>('All');

  const freqMap = useMemo(
    () => buildFrequencyMap(stats.handResults, position),
    [stats.handResults, position]
  );

  const summary = useMemo(() => {
    let openCombos = 0;
    let threeBetCombos = 0;
    let totalHands = 0;

    for (const data of freqMap.values()) {
      totalHands += data.total;
      if (data.open > 0) openCombos++;
      if (data.threeBet > 0) threeBetCombos++;
    }

    return { openCombos, threeBetCombos, totalHands };
  }, [freqMap]);

  return (
    <div className="space-y-4">
      {/* Position selector */}
      <div className="flex gap-1 flex-wrap">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosition(pos)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              position === pos
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-muted hover:text-text-secondary'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Grid */}
      {summary.totalHands === 0 ? (
        <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-text-muted">
            No hands with hole cards{position !== 'All' ? ` from ${position}` : ''}.
          </p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-lg p-3 overflow-x-auto">
          <div
            className="grid gap-px mx-auto"
            style={{
              gridTemplateColumns: `repeat(13, minmax(0, 1fr))`,
              maxWidth: '650px',
            }}
          >
            {RANKS.map((_, row) =>
              RANKS.map((__, col) => {
                const label = comboLabel(row, col);
                const data = freqMap.get(label);
                const bg = cellColor(data);
                const isInline = bg.startsWith('rgba');
                const count = data ? data.open + data.threeBet : 0;

                return (
                  <div
                    key={`${row}-${col}`}
                    className={`
                      border ${cellBorderClass(data)}
                      flex flex-col items-center justify-center
                      aspect-square text-center rounded-sm select-none
                      ${!isInline ? bg : ''}
                    `}
                    style={isInline ? { backgroundColor: bg } : undefined}
                    title={
                      data
                        ? `${label}: ${data.open} open, ${data.threeBet} 3-bet (${data.total} dealt)`
                        : label
                    }
                  >
                    <span className="text-[10px] sm:text-xs font-medium text-text-primary leading-none">
                      {label}
                    </span>
                    {count > 0 && (
                      <span className="text-[9px] sm:text-[10px] font-mono text-text-secondary leading-none mt-0.5">
                        {count}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} />
          <span>Open Raise</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }} />
          <span>3-Bet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-bg-secondary border border-border/30" />
          <span>Not played / No raise</span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-text-secondary text-sm">
        Opened <span className="text-stat-green font-medium">{summary.openCombos}</span> combos,
        3-bet <span className="text-stat-yellow font-medium">{summary.threeBetCombos}</span> combos
        {position !== 'All' && ` from ${position}`}
        {' '}({summary.totalHands} hands with cards)
      </p>
    </div>
  );
}
