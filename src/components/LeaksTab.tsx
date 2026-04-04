import type { PlayerStats } from '../lib/types';
import HandCard from './HandCard';

interface Props {
  stats: PlayerStats;
}

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
};

export default function LeaksTab({ stats }: Props) {
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

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([type, hands]) => {
        const info = leakLabels[type] || { title: type, desc: '' };
        return (
          <div key={type}>
            <div className="mb-3">
              <h3 className="text-text-primary font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-stat-red" />
                {info.title}
                <span className="text-text-muted font-mono text-sm font-normal">({hands.length})</span>
              </h3>
              <p className="text-text-muted text-sm">{info.desc}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {hands.slice(0, 8).map((h) => (
                <HandCard key={h.handNumber} hand={h} />
              ))}
            </div>
            {hands.length > 8 && (
              <p className="text-text-muted text-sm mt-2">+{hands.length - 8} more</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
