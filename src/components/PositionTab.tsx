import { useState } from 'react';
import type { PlayerStats, Position } from '../lib/types';
import HandCard from './HandCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  stats: PlayerStats;
}

const positions: Position[] = ['BTN', 'CO', 'HJ', 'EP/MP', 'SB', 'BB'];

export default function PositionTab({ stats }: Props) {
  const [expanded, setExpanded] = useState<Position | null>(null);

  return (
    <div className="space-y-6">
      {/* Position summary table */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
              <th className="text-left p-3">Position</th>
              <th className="text-right p-3 font-mono">Hands</th>
              <th className="text-right p-3 font-mono">VPIP%</th>
              <th className="text-right p-3 font-mono">PFR%</th>
              <th className="text-right p-3 font-mono">Net (BB)</th>
              <th className="text-right p-3 font-mono">BB/Hand</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const ps = stats.positionStats[pos];
              if (ps.hands === 0) return null;
              const bbPerHand = ps.netBB / ps.hands;
              return (
                <tr
                  key={pos}
                  className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === pos ? null : pos)}
                >
                  <td className="p-3 font-medium flex items-center gap-2">
                    {expanded === pos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {pos}
                  </td>
                  <td className="p-3 text-right font-mono text-text-secondary">{ps.hands}</td>
                  <td className="p-3 text-right font-mono text-text-secondary">{ps.vpip.toFixed(1)}%</td>
                  <td className="p-3 text-right font-mono text-text-secondary">{ps.pfr.toFixed(1)}%</td>
                  <td className={`p-3 text-right font-mono font-bold ${ps.netBB >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                    {ps.netBB >= 0 ? '+' : ''}{ps.netBB.toFixed(1)}
                  </td>
                  <td className={`p-3 text-right font-mono ${bbPerHand >= 0 ? 'text-stat-green' : 'text-stat-red'}`}>
                    {bbPerHand >= 0 ? '+' : ''}{bbPerHand.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expanded position hands */}
      {expanded && (
        <div>
          <h3 className="text-text-primary font-semibold mb-3">
            {expanded} Hands (showing first 6)
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {stats.positionStats[expanded].handResults
              .filter(h => h.holeCards)
              .slice(0, 6)
              .map(h => (
                <HandCard key={h.handNumber} hand={h} />
              ))}
          </div>
          {stats.positionStats[expanded].handResults.filter(h => h.holeCards).length === 0 && (
            <p className="text-text-muted text-sm">No hands with visible hole cards from this position</p>
          )}
        </div>
      )}
    </div>
  );
}
