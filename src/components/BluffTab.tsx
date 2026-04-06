import { useMemo, useState } from 'react';
import type { PlayerStats, HandResult, Street } from '../lib/types';
import { isBelowMiddlePair } from '../lib/handEval';
import HandCard from './HandCard';

interface Props {
  stats: PlayerStats;
  onReplay?: (handNumber: string) => void;
}

interface BluffHand extends HandResult {
  bluffStreet: Street;
}

function getLastHeroBetStreet(hand: HandResult): Street | null {
  let last: Street | null = null;
  for (const a of hand.actions) {
    if (a.isHero && (a.action === 'raise' || a.action === 'bet')) {
      last = a.street;
    }
  }
  return last;
}

function isBluffCandidate(hand: HandResult): hand is HandResult & { holeCards: [string, string] } {
  return (
    !!hand.holeCards &&
    hand.board.length >= 3 &&
    isBelowMiddlePair(hand.holeCards, hand.board)
  );
}

export default function BluffTab({ stats, onReplay }: Props) {
  const [showFailed, setShowFailed] = useState(false);

  const { successful, failed, byStreet } = useMemo(() => {
    const successful: BluffHand[] = [];
    const failed: BluffHand[] = [];
    const byStreet: Record<Street, { won: number; lost: number; pnl: number }> = {
      preflop: { won: 0, lost: 0, pnl: 0 },
      flop: { won: 0, lost: 0, pnl: 0 },
      turn: { won: 0, lost: 0, pnl: 0 },
      river: { won: 0, lost: 0, pnl: 0 },
    };

    for (const hand of stats.handResults) {
      if (!isBluffCandidate(hand)) continue;

      const betStreet = getLastHeroBetStreet(hand);
      if (!betStreet) continue;

      if (!hand.wentToShowdown && hand.netResult > 0) {
        // Successful bluff: won without showdown
        successful.push({ ...hand, bluffStreet: betStreet });
        byStreet[betStreet].won++;
        byStreet[betStreet].pnl += hand.netResultBB;
      } else if (hand.wentToShowdown && hand.netResult < 0) {
        // Failed bluff: went to showdown and lost with weak hand
        failed.push({ ...hand, bluffStreet: betStreet });
        byStreet[betStreet].lost++;
        byStreet[betStreet].pnl += hand.netResultBB;
      }
    }

    return { successful, failed, byStreet };
  }, [stats.handResults]);

  const total = successful.length + failed.length;
  const successRate = total > 0 ? (successful.length / total) * 100 : 0;
  const bluffPnlBB = [...successful, ...failed].reduce((s, h) => s + h.netResultBB, 0);
  const bluffPnlCents = [...successful, ...failed].reduce((s, h) => s + h.netResult, 0);

  const chartData = (['flop', 'turn', 'river'] as Street[])
    .map(street => ({
      street: street.charAt(0).toUpperCase() + street.slice(1),
      won: byStreet[street].won,
      lost: byStreet[street].lost,
    }))
    .filter(d => d.won > 0 || d.lost > 0);

  if (total === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        No confirmed bluffs detected this session. Bluffs require visible hole cards weaker than middle pair.
      </div>
    );
  }

  const displayList = showFailed ? failed : successful;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">Bluffs</div>
            <div className="font-mono text-xl font-bold text-text-primary">{total}</div>
            <div className="text-text-muted text-[10px]">{successful.length}W {failed.length}L</div>
          </div>
          <div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">Success</div>
            <div className={`font-mono text-xl font-bold ${successRate >= 50 ? 'text-stat-green' : 'text-stat-red'}`}>
              {successRate.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">P&L</div>
            <div className={`font-mono text-xl font-bold ${bluffPnlCents >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
              {bluffPnlBB >= 0 ? '+' : ''}{bluffPnlBB.toFixed(1)}bb
            </div>
            <div className="text-text-muted text-[10px]">
              {bluffPnlCents >= 0 ? '+' : ''}${(bluffPnlCents / 100).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-text-muted text-[10px] uppercase tracking-wider">Avg Size</div>
            <div className="font-mono text-xl font-bold text-text-primary">
              {(() => {
                const sizes: number[] = [];
                for (const h of [...successful, ...failed]) {
                  for (const a of h.actions) {
                    if (a.isHero && (a.action === 'raise' || a.action === 'bet') && a.amount) {
                      sizes.push(a.amount / h.bigBlind);
                    }
                  }
                }
                if (sizes.length === 0) return 'N/A';
                return `${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}bb`;
              })()}
            </div>
          </div>
        </div>

        {/* Inline street breakdown — only show if multiple streets */}
        {chartData.length > 1 && (
          <div className="mt-4 pt-3 border-t border-border flex gap-4 justify-center">
            {chartData.map(d => (
              <div key={d.street} className="text-center">
                <div className="text-text-muted text-[10px] uppercase">{d.street}</div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-stat-green">{d.won}W</span>
                  <span className="text-stat-red">{d.lost}L</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toggle + Hand List */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setShowFailed(false)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!showFailed ? 'bg-stat-green/20 text-stat-green' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Won ({successful.length})
          </button>
          <button
            onClick={() => setShowFailed(true)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showFailed ? 'bg-stat-red/20 text-stat-red' : 'text-text-muted hover:text-text-secondary'}`}
          >
            Lost ({failed.length})
          </button>
        </div>
        {displayList.length === 0 ? (
          <div className="text-center py-6 text-text-muted text-sm">
            No {showFailed ? 'failed' : 'successful'} bluffs this session.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {displayList.slice(0, 8).map(h => (
              <HandCard key={h.handNumber} hand={h} onReplay={onReplay} />
            ))}
          </div>
        )}
        {displayList.length > 8 && (
          <p className="text-text-muted text-sm mt-2">+{displayList.length - 8} more</p>
        )}
      </div>
    </div>
  );
}
