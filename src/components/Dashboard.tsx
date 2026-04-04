import { useState } from 'react';
import type { PlayerStats, StatHealth } from '../lib/types';
import StatCard from './StatCard';
import LeaksTab from './LeaksTab';
import KeyHandsTab from './KeyHandsTab';
import PositionTab from './PositionTab';

interface Props {
  stats: PlayerStats;
  onBack: () => void;
}

function getHealth(stat: string, value: number): StatHealth {
  const thresholds: Record<string, { bad: [number, 'gt' | 'lt']; warn: [number, 'gt' | 'lt'] }> = {
    vpip: { bad: [35, 'gt'], warn: [30, 'gt'] },
    pfr: { bad: [14, 'lt'], warn: [16, 'lt'] },
    coldCall: { bad: [15, 'gt'], warn: [12, 'gt'] },
    threeBet: { bad: [6, 'lt'], warn: [7, 'lt'] },
    wsd: { bad: [45, 'lt'], warn: [48, 'lt'] },
    wtsd: { bad: [45, 'gt'], warn: [40, 'gt'] },
    riverFold: { bad: [25, 'lt'], warn: [30, 'lt'] },
  };

  const t = thresholds[stat];
  if (!t) return 'good';

  const isBad = t.bad[1] === 'gt' ? value > t.bad[0] : value < t.bad[0];
  const isWarn = t.warn[1] === 'gt' ? value > t.warn[0] : value < t.warn[0];

  if (isBad) return 'bad';
  if (isWarn) return 'warning';
  return 'good';
}

const tabs = ['Stats', 'Leaks', 'Key Hands', 'Position'] as const;

export default function Dashboard({ stats, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Stats');

  const pnlColor = stats.totalPnlBB >= 0 ? 'text-stat-green' : 'text-stat-red';
  const pnlSign = stats.totalPnlBB >= 0 ? '+' : '';

  const afDisplay = (val: number) => val === Infinity ? '∞' : val.toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm mb-1 transition-colors">
            ← Back
          </button>
          <h2 className="text-2xl font-bold text-text-primary">{stats.playerName}</h2>
          <p className="text-text-secondary text-sm">
            {stats.handsPlayed} hands · {stats.handsWithCards} with hole cards
          </p>
        </div>
        <div className="text-right">
          <div className="text-text-muted text-xs uppercase tracking-wider">Session P&L</div>
          <div className={`font-mono text-3xl font-bold ${pnlColor}`}>
            {pnlSign}{stats.totalPnlBB.toFixed(1)} BB
          </div>
          <div className="text-text-muted font-mono text-sm">
            {pnlSign}${(stats.totalPnl / 100).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {activeTab === 'Stats' && (
        <div className="space-y-6">
          {/* Core Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="VPIP" value={`${stats.vpip.toFixed(1)}%`} health={getHealth('vpip', stats.vpip)} subtitle="Voluntarily put $ in" />
            <StatCard label="PFR" value={`${stats.pfr.toFixed(1)}%`} health={getHealth('pfr', stats.pfr)} subtitle="Preflop raise" />
            <StatCard label="Cold Call" value={`${stats.coldCall.toFixed(1)}%`} health={getHealth('coldCall', stats.coldCall)} subtitle="VPIP minus PFR" />
            <StatCard label="3-Bet" value={`${stats.threeBet.toFixed(1)}%`} health={getHealth('threeBet', stats.threeBet)} subtitle="Re-raise frequency" />
            <StatCard label="C-Bet" value={`${stats.cBet.toFixed(1)}%`} health={'good'} subtitle="Continuation bet" />
            <StatCard label="W$SD" value={`${stats.wsd.toFixed(1)}%`} health={getHealth('wsd', stats.wsd)} subtitle="Win rate at showdown" />
            <StatCard label="WTSD" value={`${stats.wtsd.toFixed(1)}%`} health={getHealth('wtsd', stats.wtsd)} subtitle="Went to showdown" />
            <StatCard label="River Fold" value={`${stats.riverFold.toFixed(1)}%`} health={getHealth('riverFold', stats.riverFold)} subtitle="Fold to river bet" />
          </div>

          {/* Aggression Table */}
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <h3 className="text-text-primary font-semibold p-4 pb-2">Aggression by Street</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
                  <th className="text-left p-3">Street</th>
                  <th className="text-right p-3 font-mono">Bets/Raises</th>
                  <th className="text-right p-3 font-mono">Checks</th>
                  <th className="text-right p-3 font-mono">Calls</th>
                  <th className="text-right p-3 font-mono">Folds</th>
                  <th className="text-right p-3 font-mono">AF</th>
                </tr>
              </thead>
              <tbody>
                {(['flop', 'turn', 'river'] as const).map(street => {
                  const a = stats.aggression[street];
                  return (
                    <tr key={street} className="border-b border-border/50">
                      <td className="p-3 capitalize font-medium">{street}</td>
                      <td className="p-3 text-right font-mono text-stat-yellow">{a.bets}</td>
                      <td className="p-3 text-right font-mono text-text-muted">{a.checks}</td>
                      <td className="p-3 text-right font-mono text-accent">{a.calls}</td>
                      <td className="p-3 text-right font-mono text-stat-red">{a.folds}</td>
                      <td className="p-3 text-right font-mono font-bold text-text-primary">{afDisplay(a.aggressionFactor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bet Sizing */}
          <div className="bg-bg-card border border-border rounded-lg p-4">
            <h3 className="text-text-primary font-semibold mb-3">Bet Sizing</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider">Preflop Open</div>
                <div className={`font-mono text-lg font-bold ${
                  stats.avgPreflopOpenBB >= 2.5 && stats.avgPreflopOpenBB <= 3.5 ? 'text-stat-green' :
                  stats.avgPreflopOpenBB > 0 ? 'text-stat-yellow' : 'text-text-muted'
                }`}>
                  {stats.avgPreflopOpenBB > 0 ? `${stats.avgPreflopOpenBB.toFixed(1)}x BB` : 'N/A'}
                </div>
                <div className="text-text-muted text-xs">Target: 2.5-3.5x</div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider">Flop Bet</div>
                <div className="font-mono text-lg font-bold text-text-primary">
                  {stats.avgFlopBetPot > 0 ? `${stats.avgFlopBetPot.toFixed(0)}% pot` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider">Turn Bet</div>
                <div className="font-mono text-lg font-bold text-text-primary">
                  {stats.avgTurnBetPot > 0 ? `${stats.avgTurnBetPot.toFixed(0)}% pot` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wider">River Bet</div>
                <div className="font-mono text-lg font-bold text-text-primary">
                  {stats.avgRiverBetPot > 0 ? `${stats.avgRiverBetPot.toFixed(0)}% pot` : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Leaks' && <LeaksTab stats={stats} />}
      {activeTab === 'Key Hands' && <KeyHandsTab stats={stats} />}
      {activeTab === 'Position' && <PositionTab stats={stats} />}
    </div>
  );
}
