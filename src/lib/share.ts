import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { OverallStats, PlayerStats, StreetAggression, Position, PositionStat } from './types';

// Compact serialization format for URL sharing
// We store enough to render the full dashboard without hand-level data

interface SharedData {
  v: 1; // version
  h: number; // total hands
  bb: number; // big blind
  p: SharedPlayer[];
}

interface SharedPlayer {
  id: string;
  n: string;   // name
  h: number;   // hands played
  hc: number;  // hands with cards
  v: number;   // vpip
  r: number;   // pfr
  cc: number;  // cold call
  tb: number;  // 3bet
  cb: number;  // cbet
  ws: number;  // wsd
  wt: number;  // wtsd
  rf: number;  // river fold
  pnl: number; // total pnl cents
  pbb: number; // pnl in bb
  apo: number; // avg preflop open bb
  afb: number; // avg flop bet pot %
  atb: number; // avg turn bet pot %
  arb: number; // avg river bet pot %
  ag: [CompactAgg, CompactAgg, CompactAgg]; // flop/turn/river aggression
  pos: CompactPos[];
}

type CompactAgg = [number, number, number, number]; // bets, checks, calls, folds
type CompactPos = [string, number, number, number, number]; // position, hands, vpip%, pfr%, netBB

export function encodeShareData(overall: OverallStats, playerStatsMap: Map<string, PlayerStats>): string {
  const data: SharedData = {
    v: 1,
    h: overall.totalHands,
    bb: overall.bigBlind,
    p: overall.players.map(op => {
      const ps = playerStatsMap.get(op.id);
      if (!ps) {
        // Fallback: only overall data available
        return {
          id: op.id, n: op.name, h: op.handsPlayed, hc: 0,
          v: op.vpip, r: op.pfr, cc: op.vpip - op.pfr, tb: 0, cb: 0,
          ws: 0, wt: 0, rf: 0, pnl: op.pnl, pbb: op.pnlBB,
          apo: 0, afb: 0, atb: 0, arb: 0,
          ag: [[0,0,0,0],[0,0,0,0],[0,0,0,0]],
          pos: [],
        };
      }
      const aggToArr = (a: StreetAggression): CompactAgg => [a.bets, a.checks, a.calls, a.folds];
      const positions: Position[] = ['BTN', 'CO', 'HJ', 'EP/MP', 'SB', 'BB'];
      return {
        id: op.id, n: ps.playerName, h: ps.handsPlayed, hc: ps.handsWithCards,
        v: ps.vpip, r: ps.pfr, cc: ps.coldCall, tb: ps.threeBet, cb: ps.cBet,
        ws: ps.wsd, wt: ps.wtsd, rf: ps.riverFold,
        pnl: ps.totalPnl, pbb: ps.totalPnlBB,
        apo: ps.avgPreflopOpenBB, afb: ps.avgFlopBetPot, atb: ps.avgTurnBetPot, arb: ps.avgRiverBetPot,
        ag: [aggToArr(ps.aggression.flop), aggToArr(ps.aggression.turn), aggToArr(ps.aggression.river)],
        pos: positions
          .filter(p => ps.positionStats[p].hands > 0)
          .map(p => {
            const s = ps.positionStats[p];
            return [p, s.hands, s.vpip, s.pfr, s.netBB] as CompactPos;
          }),
      };
    }),
  };

  return compressToEncodedURIComponent(JSON.stringify(data));
}

export function decodeShareData(encoded: string): { overall: OverallStats; playerStatsMap: Map<string, PlayerStats> } | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const data: SharedData = JSON.parse(json);
    if (data.v !== 1) return null;

    const overall: OverallStats = {
      totalHands: data.h,
      bigBlind: data.bb,
      players: data.p.map(p => ({
        id: p.id, name: p.n, pnl: p.pnl, pnlBB: p.pbb,
        vpip: p.v, pfr: p.r, handsPlayed: p.h,
      })),
    };

    const playerStatsMap = new Map<string, PlayerStats>();
    for (const p of data.p) {
      const arrToAgg = (a: CompactAgg): StreetAggression => ({
        bets: a[0], checks: a[1], calls: a[2], folds: a[3],
        aggressionFactor: a[2] > 0 ? a[0] / a[2] : a[0] > 0 ? Infinity : 0,
      });

      const positionStats: Record<Position, PositionStat> = {
        'BTN': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
        'CO': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
        'HJ': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
        'EP/MP': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
        'SB': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
        'BB': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
      };
      for (const [pos, hands, vpip, pfr, netBB] of p.pos) {
        positionStats[pos as Position] = { hands, vpip, pfr, netBB, handResults: [] };
      }

      playerStatsMap.set(p.id, {
        playerId: p.id,
        playerName: p.n,
        handsPlayed: p.h,
        handsWithCards: p.hc,
        vpip: p.v, pfr: p.r, coldCall: p.cc, threeBet: p.tb, cBet: p.cb,
        wsd: p.ws, wtsd: p.wt, riverFold: p.rf,
        totalPnl: p.pnl, totalPnlBB: p.pbb,
        avgPreflopOpenBB: p.apo, avgFlopBetPot: p.afb, avgTurnBetPot: p.atb, avgRiverBetPot: p.arb,
        aggression: { flop: arrToAgg(p.ag[0]), turn: arrToAgg(p.ag[1]), river: arrToAgg(p.ag[2]) },
        positionStats,
        biggestLosers: [],
        biggestWinners: [],
        leaks: [],
        handResults: [],
      });
    }

    return { overall, playerStatsMap };
  } catch {
    return null;
  }
}

export function getShareUrl(encoded: string): string {
  return `${window.location.origin}${window.location.pathname}#s=${encoded}`;
}

export function getShareDataFromUrl(): string | null {
  const hash = window.location.hash;
  if (hash.startsWith('#s=')) {
    return hash.slice(3);
  }
  return null;
}
