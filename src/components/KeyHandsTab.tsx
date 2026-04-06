import type { PlayerStats } from '../lib/types';
import HandCard from './HandCard';

interface Props {
  stats: PlayerStats;
  onReplay?: (handNumber: string) => void;
}

export default function KeyHandsTab({ stats, onReplay }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-text-primary font-semibold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-stat-red" />
          Biggest Losing Hands
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {stats.biggestLosers.map((h) => (
            <HandCard key={h.handNumber} hand={h} onReplay={onReplay} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-text-primary font-semibold mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-stat-green" />
          Biggest Winning Hands
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {stats.biggestWinners.map((h) => (
            <HandCard key={h.handNumber} hand={h} onReplay={onReplay} />
          ))}
        </div>
      </div>
    </div>
  );
}
