import { useState } from 'react';
import { findMostSimilarHCL, type HCLPlayer } from '../lib/hclPlayers';

interface Props {
  vpip: number;
  pfr: number;
  playerName: string;
}

function PlayerAvatar({ player, size = 64 }: { player: HCLPlayer; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = player.nickname.slice(0, 2).toUpperCase();

  if (imgError || !player.photo) {
    return (
      <div
        className="rounded-full bg-bg-hover border-2 border-border-light flex items-center justify-center font-bold text-text-secondary"
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={player.photo}
      alt={player.name}
      onError={() => setImgError(true)}
      className="rounded-full border-2 border-border-light object-cover"
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
    />
  );
}

export default function HCLComparison({ vpip, pfr }: Props) {
  const { player, similarity } = findMostSimilarHCL(vpip, pfr);

  const ringColor = similarity > 85 ? '#22c55e' : similarity > 70 ? '#fbbf24' : '#3b82f6';

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <div className="text-text-muted text-xs uppercase tracking-wider mb-3">
        Most Similar HCL Player
      </div>

      <div className="flex items-center gap-4">
        {/* Player photo with similarity ring */}
        <div className="relative shrink-0">
          <div
            className="rounded-full p-[3px]"
            style={{ background: `conic-gradient(${ringColor} ${similarity}%, transparent ${similarity}%)` }}
          >
            <PlayerAvatar player={player} size={72} />
          </div>
          <div
            className="absolute -bottom-1 -right-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: ringColor, color: '#080b11' }}
          >
            {similarity.toFixed(0)}%
          </div>
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-text-primary font-semibold text-lg truncate">
              {player.nickname}
            </span>
            <span className="text-text-muted text-xs shrink-0">
              {player.name}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-xs text-text-secondary">
              VPIP {player.vpip}%
            </span>
            <span className="font-mono text-xs text-text-secondary">
              PFR {player.pfr}%
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-hover text-text-muted">
              {player.style}
            </span>
          </div>

          <p className="text-text-muted text-xs mt-1.5 leading-relaxed">
            {player.note}
          </p>
        </div>
      </div>

      {/* Stat comparison bar */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted w-10">VPIP</span>
          <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full bg-accent/40 rounded-full"
              style={{ width: `${Math.min(vpip, 100)}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-stat-yellow"
              style={{ left: `${Math.min(player.vpip, 100)}%` }}
              title={`${player.nickname}: ${player.vpip}%`}
            />
          </div>
          <span className="font-mono text-text-secondary w-14 text-right">{vpip.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted w-10">PFR</span>
          <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden relative">
            <div
              className="absolute top-0 left-0 h-full bg-stat-green/40 rounded-full"
              style={{ width: `${Math.min(pfr, 100)}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-stat-yellow"
              style={{ left: `${Math.min(player.pfr, 100)}%` }}
              title={`${player.nickname}: ${player.pfr}%`}
            />
          </div>
          <span className="font-mono text-text-secondary w-14 text-right">{pfr.toFixed(0)}%</span>
        </div>
        <div className="flex justify-end text-[10px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-0.5 bg-stat-yellow inline-block" /> {player.nickname}
          </span>
        </div>
      </div>
    </div>
  );
}
