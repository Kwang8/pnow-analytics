import type { StatHealth } from '../lib/types';

interface Props {
  label: string;
  value: string;
  health: StatHealth;
  subtitle?: string;
}

const healthColors: Record<StatHealth, string> = {
  good: 'text-stat-green border-stat-green/30',
  warning: 'text-stat-yellow border-stat-yellow/30',
  bad: 'text-stat-red border-stat-red/30',
};

const healthBg: Record<StatHealth, string> = {
  good: 'bg-stat-green/5',
  warning: 'bg-stat-yellow/5',
  bad: 'bg-stat-red/5',
};

export default function StatCard({ label, value, health, subtitle }: Props) {
  return (
    <div className={`rounded-lg border p-4 ${healthBg[health]} ${healthColors[health].split(' ')[1]}`}>
      <div className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono text-2xl font-bold ${healthColors[health].split(' ')[0]}`}>
        {value}
      </div>
      {subtitle && <div className="text-text-muted text-xs mt-1">{subtitle}</div>}
    </div>
  );
}
