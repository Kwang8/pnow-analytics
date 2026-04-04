import type { HandResult } from '../lib/types';

function CardDisplay({ card }: { card: string }) {
  const suit = card[card.length - 1];
  const rank = card.slice(0, -1);
  const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || suit;
  const suitColor = { h: 'text-suit-red', d: 'text-suit-red', c: 'text-suit-green', s: 'text-suit-gray' }[suit] || '';

  return (
    <span className={`font-mono font-bold ${suitColor}`}>
      {rank}{suitSymbol}
    </span>
  );
}

function CardGroup({ cards, label }: { cards: string[]; label?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {label && <span className="text-text-muted text-xs mr-1">{label}</span>}
      {cards.map((c, i) => (
        <span key={i}>
          <CardDisplay card={c} />
          {i < cards.length - 1 && <span className="text-text-muted mx-0.5"></span>}
        </span>
      ))}
    </span>
  );
}

const actionColors: Record<string, string> = {
  fold: 'text-stat-red',
  raise: 'text-stat-yellow',
  bet: 'text-stat-yellow',
  call: 'text-accent',
  check: 'text-text-muted',
  post: 'text-text-muted',
};

interface Props {
  hand: HandResult;
  compact?: boolean;
}

export default function HandCard({ hand, compact }: Props) {
  const resultColor = hand.netResultBB > 0 ? 'text-stat-green' : hand.netResultBB < 0 ? 'text-stat-red' : 'text-text-muted';
  const resultSign = hand.netResultBB > 0 ? '+' : '';

  // Group actions by street
  const streetActions = new Map<string, typeof hand.actions>();
  for (const a of hand.actions) {
    if (!streetActions.has(a.street)) streetActions.set(a.street, []);
    streetActions.get(a.street)!.push(a);
  }

  // Board by street
  const flopCards = hand.board.slice(0, 3);
  const turnCard = hand.board[3];
  const riverCard = hand.board[4];

  if (compact) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-3 hover:bg-bg-hover transition-colors">
        <div className="flex items-center justify-between mb-1">
          <span className="text-text-muted text-xs font-mono">#{hand.handNumber}</span>
          <span className={`font-mono text-sm font-bold ${resultColor}`}>
            {resultSign}{hand.netResultBB.toFixed(1)} BB
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hand.holeCards && <CardGroup cards={hand.holeCards} />}
          {hand.board.length > 0 && (
            <>
              <span className="text-text-muted">→</span>
              <CardGroup cards={hand.board} />
            </>
          )}
        </div>
        <div className="text-text-muted text-xs mt-1">
          {hand.position} · {hand.numPlayers}p · {hand.stackDepth.toFixed(0)}bb deep
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 hover:bg-bg-hover transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-xs font-mono bg-bg-secondary px-2 py-0.5 rounded">
            #{hand.handNumber}
          </span>
          <span className="text-text-secondary text-xs">
            {hand.position} · {hand.numPlayers}p · {hand.stackDepth.toFixed(0)}bb
          </span>
        </div>
        <span className={`font-mono text-lg font-bold ${resultColor}`}>
          {resultSign}{hand.netResultBB.toFixed(1)} BB
        </span>
      </div>

      {/* Cards */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {hand.holeCards && (
          <span className="bg-bg-secondary px-2 py-1 rounded text-sm">
            <CardGroup cards={hand.holeCards} />
          </span>
        )}
        {flopCards.length > 0 && (
          <>
            <span className="text-text-muted">→</span>
            <span className="bg-bg-secondary px-2 py-1 rounded text-sm">
              <CardGroup cards={flopCards} label="F" />
            </span>
          </>
        )}
        {turnCard && (
          <span className="bg-bg-secondary px-2 py-1 rounded text-sm">
            <CardGroup cards={[turnCard]} label="T" />
          </span>
        )}
        {riverCard && (
          <span className="bg-bg-secondary px-2 py-1 rounded text-sm">
            <CardGroup cards={[riverCard]} label="R" />
          </span>
        )}
      </div>

      {/* Action sequence by street */}
      <div className="space-y-1 text-xs">
        {Array.from(streetActions.entries()).map(([street, acts]) => (
          <div key={street} className="flex items-start gap-2">
            <span className="text-text-muted w-14 shrink-0 uppercase font-mono">{street}</span>
            <div className="flex flex-wrap gap-1">
              {acts.map((a, i) => (
                <span key={i} className={`${actionColors[a.action]} ${a.isHero ? 'font-bold' : 'opacity-60'}`}>
                  {a.isHero ? '●' : ''}{a.playerName.slice(0, 6)}:{a.action}
                  {a.amount ? ` ${(a.amount / hand.bigBlind).toFixed(1)}bb` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {hand.leakType && (
        <div className="mt-2 px-2 py-1 bg-stat-red/10 border border-stat-red/20 rounded text-stat-red text-xs">
          {hand.leakType.replace(/-/g, ' ')}
        </div>
      )}
    </div>
  );
}
