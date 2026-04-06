export default function CardDisplay({ card }: { card: string }) {
  const suit = card[card.length - 1];
  const rank = card.slice(0, -1);
  const suitSymbol = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' }[suit] || suit;
  const suitColor = { h: 'text-suit-red', d: 'text-suit-red', c: 'text-suit-green', s: 'text-suit-gray' }[suit] || '';

  return (
    <span className={`font-mono font-bold ${suitColor}`}>
      {rank}{suitSymbol}
    </span>
  );
}

export function CardGroup({ cards, label }: { cards: string[]; label?: string }) {
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
