import type { PlayerStats } from './types';

export interface DigestItem {
  icon: string;
  text: string;
}

export function generateSessionDigest(stats: PlayerStats): DigestItem[] {
  const items: DigestItem[] = [];
  const results = stats.handResults;
  if (results.length === 0) return items;

  // 1. P&L trajectory — find peak and trough
  let cum = 0;
  let peak = 0, peakHand = 0, trough = 0, troughHand = 0;
  for (let i = 0; i < results.length; i++) {
    cum += results[i].netResultBB;
    if (cum > peak) { peak = cum; peakHand = i + 1; }
    if (cum < trough) { trough = cum; troughHand = i + 1; }
  }
  const finalBB = stats.totalPnlBB;

  if (finalBB >= 0 && peak > 0) {
    items.push({
      icon: '📈',
      text: `Peaked at +${peak.toFixed(1)} BB around hand ${peakHand}${troughHand > peakHand ? `, dipped to ${trough.toFixed(1)} BB at hand ${troughHand} before recovering` : ''}`,
    });
  } else if (finalBB < 0 && trough < 0) {
    items.push({
      icon: '📉',
      text: `Hit bottom at ${trough.toFixed(1)} BB around hand ${troughHand}${peakHand < troughHand && peak > 0 ? ` after peaking at +${peak.toFixed(1)} BB` : ''}`,
    });
  }

  // 2. Biggest hand
  const allSorted = [...results].sort((a, b) => Math.abs(b.netResultBB) - Math.abs(a.netResultBB));
  const biggest = allSorted[0];
  if (biggest && Math.abs(biggest.netResultBB) >= 3) {
    const won = biggest.netResultBB > 0;
    const cards = biggest.holeCards ? biggest.holeCards.join('') : 'unknown hand';
    items.push({
      icon: won ? '🏆' : '💥',
      text: `Biggest hand: ${won ? 'won' : 'lost'} ${Math.abs(biggest.netResultBB).toFixed(1)} BB with ${cards} in hand #${biggest.handNumber} from ${biggest.position}`,
    });
  }

  // 3. Costliest leak
  if (stats.leaks.length > 0) {
    const grouped = new Map<string, number>();
    for (const l of stats.leaks) {
      grouped.set(l.leakType, (grouped.get(l.leakType) ?? 0) + l.netResult);
    }
    const sorted = [...grouped.entries()].sort((a, b) => a[1] - b[1]);
    const [leakType, leakCost] = sorted[0];
    const leakCount = stats.leaks.filter(l => l.leakType === leakType).length;
    const label = leakType.replace(/-/g, ' ');
    items.push({
      icon: '🩸',
      text: `Costliest leak: ${label} cost $${Math.abs(leakCost / 100).toFixed(2)} across ${leakCount} hand${leakCount !== 1 ? 's' : ''}`,
    });
  }

  // 4. Play style snapshot
  const tight = stats.vpip < 22;
  const loose = stats.vpip > 32;
  const aggressive = stats.pfr > 0 && (stats.pfr / stats.vpip) > 0.65;
  const passive = stats.pfr > 0 && (stats.pfr / stats.vpip) < 0.4;

  if (tight && aggressive) {
    items.push({ icon: '🎯', text: `Played tight-aggressive: ${stats.vpip.toFixed(0)}% VPIP, ${stats.pfr.toFixed(0)}% PFR — solid approach` });
  } else if (loose && passive) {
    items.push({ icon: '🎰', text: `Played loose-passive: ${stats.vpip.toFixed(0)}% VPIP, ${stats.pfr.toFixed(0)}% PFR — lots of calling, less raising` });
  } else if (loose) {
    items.push({ icon: '🔥', text: `Played loose: ${stats.vpip.toFixed(0)}% VPIP — seeing a lot of flops this session` });
  } else if (tight) {
    items.push({ icon: '🧊', text: `Played tight: ${stats.vpip.toFixed(0)}% VPIP — very selective hand choices` });
  }

  return items;
}
