import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Hand, EventPayload } from '../lib/types';
import { EVT } from '../lib/types';
import CardDisplay from './CardDisplay';
import { X, SkipBack, SkipForward, Play, Pause } from 'lucide-react';

interface Props {
  hand: Hand;
  heroPlayerId?: string;
  onClose: () => void;
}

interface PlayerState {
  id: string;
  name: string;
  seat: number;
  stack: number;
  cards?: [string, string];
  folded: boolean;
  roundBet: number;
  lastAction: string | null;
}

interface Snapshot {
  players: PlayerState[];
  pot: number;
  board: string[];
  street: string;
  actionLabel: string | null;
  activeSeat: number | null;
}

const SEAT_POSITIONS: Record<number, { top: string; left: string }> = {
  0: { top: '85%', left: '50%' },
  1: { top: '75%', left: '15%' },
  2: { top: '30%', left: '8%' },
  3: { top: '8%', left: '30%' },
  4: { top: '8%', left: '70%' },
  5: { top: '30%', left: '92%' },
  6: { top: '75%', left: '85%' },
  7: { top: '85%', left: '50%' },
};

function actionLabel(type: number, value?: number, bb?: number): string {
  const bbStr = value && bb ? ` ${(value / bb).toFixed(1)}bb` : '';
  switch (type) {
    case EVT.CHECK: return 'Check';
    case EVT.BB_POST: return `BB${bbStr}`;
    case EVT.SB_POST: return `SB${bbStr}`;
    case EVT.STRADDLE: return `Straddle${bbStr}`;
    case EVT.MISSED_BLIND: return `Post${bbStr}`;
    case EVT.CALL: return `Call${bbStr}`;
    case EVT.BET_RAISE: return `Raise${bbStr}`;
    case EVT.FOLD: return 'Fold';
    case EVT.POT_WON: return `Won${bbStr}`;
    case EVT.UNCALLED_RETURNED: return `Returned${bbStr}`;
    case EVT.SHOWDOWN: return 'Show';
    default: return '';
  }
}

function buildSnapshots(hand: Hand): Snapshot[] {
  const bb = hand.bigBlind;
  const snapshots: Snapshot[] = [];

  // Assign visual positions based on number of players
  const seatMap = new Map<number, number>();
  const sorted = [...hand.players].sort((a, b) => a.seat - b.seat);
  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    // Distribute evenly around the table
    const posIdx = Math.round((i / n) * 8) % 8;
    seatMap.set(sorted[i].seat, posIdx);
  }

  // Initial state
  const initPlayers: PlayerState[] = hand.players.map(p => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    stack: p.stack,
    cards: p.hand as [string, string] | undefined,
    folded: false,
    roundBet: 0,
    lastAction: null,
  }));

  let pot = 0;
  let board: string[] = [];
  let street = 'Preflop';
  let players = initPlayers.map(p => ({ ...p }));

  // Starting snapshot
  snapshots.push({
    players: players.map(p => ({ ...p })),
    pot,
    board: [...board],
    street,
    actionLabel: 'Hand starts',
    activeSeat: null,
  });

  for (const event of hand.events) {
    const p = event.payload;

    if (p.type === EVT.COMMUNITY) {
      // Flush round bets to pot
      for (const pl of players) {
        pot += pl.roundBet;
        pl.roundBet = 0;
        pl.lastAction = null;
      }
      const cards = (p as { cards: string[] }).cards;
      board = [...board, ...cards];
      const turn = (p as { turn: number }).turn;
      street = turn === 1 ? 'Flop' : turn === 2 ? 'Turn' : 'River';
      snapshots.push({
        players: players.map(pl => ({ ...pl })),
        pot,
        board: [...board],
        street,
        actionLabel: `${street} dealt`,
        activeSeat: null,
      });
      continue;
    }

    if (p.type === EVT.HAND_END) continue;

    if (!('seat' in p)) continue;
    const seat = (p as { seat: number }).seat;
    const value = 'value' in p ? (p as { value: number }).value : 0;
    const player = players.find(pl => pl.seat === seat);
    if (!player) continue;

    const investTypes = [EVT.BB_POST, EVT.SB_POST, EVT.STRADDLE, EVT.MISSED_BLIND, EVT.CALL, EVT.BET_RAISE];

    if (investTypes.includes(p.type)) {
      // value is cumulative for the round — actual new chips = value - roundBet
      const additional = Math.max(0, value - player.roundBet);
      player.stack -= additional;
      player.roundBet = value;
      player.lastAction = actionLabel(p.type, value, bb);
    } else if (p.type === EVT.FOLD) {
      player.folded = true;
      player.lastAction = 'Fold';
    } else if (p.type === EVT.CHECK) {
      player.lastAction = 'Check';
    } else if (p.type === EVT.POT_WON) {
      // Flush remaining round bets first
      for (const pl of players) {
        pot += pl.roundBet;
        pl.roundBet = 0;
      }
      player.stack += value;
      pot = Math.max(0, pot - value);
      player.lastAction = `Won ${(value / bb).toFixed(1)}bb`;
    } else if (p.type === EVT.UNCALLED_RETURNED) {
      player.stack += value;
      player.roundBet = Math.max(0, player.roundBet - value);
      player.lastAction = 'Returned';
    } else if (p.type === EVT.SHOWDOWN) {
      const cards = (p as { cards: string[] }).cards;
      if (cards && cards.length === 2) {
        player.cards = cards as [string, string];
      }
      player.lastAction = 'Show';
    } else if (p.type === EVT.SIT_OUT) {
      player.folded = true;
      player.lastAction = 'Sat out';
    } else {
      continue; // skip unknown events
    }

    snapshots.push({
      players: players.map(pl => ({ ...pl })),
      pot: pot + players.reduce((s, pl) => s + pl.roundBet, 0),
      board: [...board],
      street,
      actionLabel: `${player.name}: ${player.lastAction}`,
      activeSeat: seat,
    });
  }

  return snapshots;
}

export default function HandReplayer({ hand, heroPlayerId, onClose }: Props) {
  const snapshots = useMemo(() => buildSnapshots(hand), [hand]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const snap = snapshots[step] || snapshots[0];
  const bb = hand.bigBlind;

  // Assign visual positions
  const seatPosMap = useMemo(() => {
    const map = new Map<number, number>();
    const sorted = [...hand.players].sort((a, b) => a.seat - b.seat);
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      map.set(sorted[i].seat, Math.round((i / n) * 8) % 8);
    }
    return map;
  }, [hand.players]);

  const next = useCallback(() => {
    setStep(s => Math.min(s + 1, snapshots.length - 1));
  }, [snapshots.length]);

  const prev = useCallback(() => {
    setStep(s => Math.max(s - 1, 0));
  }, []);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    if (step >= snapshots.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(next, 800);
    return () => clearTimeout(timer);
  }, [playing, step, snapshots.length, next]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-2xl w-[95vw] max-w-[700px] p-4 md:p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-text-primary font-semibold">
            Hand #{hand.number}
            <span className="text-text-muted text-xs ml-2">{snap.street}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="relative w-full aspect-[16/10] mb-4">
          {/* Felt */}
          <div className="absolute inset-[10%] rounded-[50%] bg-[#0d4a2b] border-4 border-[#1a6b3f] shadow-inner" />

          {/* Pot */}
          <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-stat-yellow font-mono text-sm font-bold">
              {snap.pot > 0 ? `${(snap.pot / bb).toFixed(1)} BB` : ''}
            </div>
          </div>

          {/* Board */}
          <div className="absolute top-[52%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1.5">
            {snap.board.map((card, i) => (
              <div key={i} className="bg-white rounded-md px-1.5 py-1 shadow-md text-sm">
                <CardDisplay card={card} />
              </div>
            ))}
          </div>

          {/* Players */}
          {snap.players.map(player => {
            const posIdx = seatPosMap.get(player.seat) ?? 0;
            const pos = SEAT_POSITIONS[posIdx];
            const isHero = player.id === heroPlayerId;
            const isActive = snap.activeSeat === player.seat;
            const isDealer = player.seat === hand.dealerSeat;

            return (
              <div
                key={player.seat}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ top: pos.top, left: pos.left }}
              >
                <div className={`
                  bg-bg-card border rounded-lg px-2 py-1.5 text-center min-w-[80px] transition-all
                  ${isActive ? 'border-accent shadow-lg shadow-accent/20 scale-105' : 'border-border'}
                  ${player.folded ? 'opacity-40' : ''}
                `}>
                  <div className="flex items-center justify-center gap-1">
                    {isDealer && <span className="text-[9px] bg-stat-yellow text-black rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">D</span>}
                    <span className={`text-[11px] font-medium truncate max-w-[60px] ${isHero ? 'text-accent' : 'text-text-primary'}`}>
                      {player.name}
                    </span>
                  </div>
                  <div className="text-text-muted font-mono text-[10px]">
                    {(player.stack / bb).toFixed(0)}bb
                  </div>
                  {/* Hole cards */}
                  {player.cards && (isHero || snap.players.some(p => p.seat === player.seat && p.lastAction === 'Show')) && (
                    <div className="flex gap-0.5 justify-center mt-0.5">
                      {player.cards.map((c, i) => (
                        <span key={i} className="bg-white rounded px-0.5 text-[10px]">
                          <CardDisplay card={c} />
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Last action */}
                  {player.lastAction && !player.folded && (
                    <div className={`text-[9px] font-medium mt-0.5 ${
                      player.lastAction.startsWith('Won') ? 'text-stat-green' :
                      player.lastAction.startsWith('Raise') ? 'text-stat-yellow' :
                      player.lastAction.startsWith('Call') ? 'text-accent' :
                      player.lastAction === 'Fold' ? 'text-stat-red' :
                      'text-text-muted'
                    }`}>
                      {player.lastAction}
                    </div>
                  )}
                  {/* Round bet chip */}
                  {player.roundBet > 0 && (
                    <div className="text-stat-yellow font-mono text-[9px]">
                      {(player.roundBet / bb).toFixed(1)}bb
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action label */}
        <div className="text-center text-text-secondary text-sm mb-3 h-5">
          {snap.actionLabel}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setStep(0)}
            className="text-text-muted hover:text-text-primary p-2 transition-colors"
            title="Reset"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={prev}
            disabled={step === 0}
            className="text-text-muted hover:text-text-primary p-2 transition-colors disabled:opacity-30"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className="bg-accent hover:bg-accent/80 text-white p-2.5 rounded-full transition-colors"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={next}
            disabled={step >= snapshots.length - 1}
            className="text-text-muted hover:text-text-primary p-2 transition-colors disabled:opacity-30"
          >
            <SkipForward className="w-5 h-5" />
          </button>
          <span className="text-text-muted text-xs font-mono ml-2">
            {step + 1}/{snapshots.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-200"
            style={{ width: `${((step + 1) / snapshots.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
