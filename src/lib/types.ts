// Poker Now JSON export types
export interface PokerNowExport {
  generatedAt: string;
  playerId: string;
  gameId: string;
  hands: Hand[];
}

export interface Hand {
  id: string;
  number: string;
  gameType: string;
  cents: boolean;
  smallBlind: number;
  bigBlind: number;
  ante: number | null;
  straddleSeat: number | null;
  dealerSeat: number;
  startedAt: number;
  bombPot: boolean;
  players: Player[];
  events: GameEvent[];
}

export interface Player {
  id: string;
  seat: number;
  name: string;
  stack: number;
  hand?: [string, string];
}

export interface GameEvent {
  at: number;
  payload: EventPayload;
}

export type EventPayload =
  | { type: 0; seat: number }                          // check
  | { type: 2; seat: number; value: number }            // BB post
  | { type: 3; seat: number; value: number }            // SB post
  | { type: 5; seat: number; value: number }            // straddle
  | { type: 6; seat: number; value: number }            // missed blind
  | { type: 7; seat: number; value: number }            // call
  | { type: 8; seat: number; value: number }            // bet/raise
  | { type: 9; turn: number; run: number; cards: string[] } // community cards
  | { type: 10; seat: number; value: number; pot?: number; position?: number } // pot won
  | { type: 11; seat: number }                          // fold
  | { type: 12; seat: number; cards: string[] }         // showdown
  | { type: 14; seat: number }                          // player left/sit out
  | { type: 15 }                                        // hand end
  | { type: 16; value: number; seat: number }           // uncalled bet returned
  | { type: number; [key: string]: unknown };            // catch-all

// Event type constants
export const EVT = {
  CHECK: 0,
  BB_POST: 2,
  SB_POST: 3,
  STRADDLE: 5,
  MISSED_BLIND: 6,
  CALL: 7,
  BET_RAISE: 8,
  COMMUNITY: 9,
  POT_WON: 10,
  FOLD: 11,
  SHOWDOWN: 12,
  SIT_OUT: 14,
  HAND_END: 15,
  UNCALLED_RETURNED: 16,
} as const;

// Position labels
export type Position = 'BTN' | 'SB' | 'BB' | 'CO' | 'HJ' | 'EP/MP';

// Street labels
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

// Stat health status
export type StatHealth = 'good' | 'warning' | 'bad';

// Computed stats for a player
export interface PlayerStats {
  playerId: string;
  playerName: string;
  handsPlayed: number;
  handsWithCards: number;
  vpip: number;
  pfr: number;
  coldCall: number;
  threeBet: number;
  cBet: number;
  wsd: number;
  wtsd: number;
  riverFold: number;
  totalPnl: number;        // in cents
  totalPnlBB: number;      // in BB
  avgPreflopOpenBB: number;
  avgFlopBetPot: number;
  avgTurnBetPot: number;
  avgRiverBetPot: number;
  aggression: {
    flop: StreetAggression;
    turn: StreetAggression;
    river: StreetAggression;
  };
  positionStats: Record<Position, PositionStat>;
  biggestLosers: HandResult[];
  biggestWinners: HandResult[];
  leaks: LeakHand[];
  handResults: HandResult[];
}

export interface StreetAggression {
  bets: number;
  checks: number;
  calls: number;
  folds: number;
  aggressionFactor: number;
}

export interface PositionStat {
  hands: number;
  vpip: number;
  pfr: number;
  netBB: number;
  handResults: HandResult[];
}

export interface AllInShowdown {
  /** Board state at the moment the pot was locked. Length 0/3/4 cards. */
  boardAtAllIn: string[];
  /** Total pot (cents) contested at showdown. */
  potCents: number;
  /** Hero's Monte-Carlo equity at the all-in moment, [0, 1]. */
  heroEquity: number;
  /** All contestants (hero included) with known hole cards. */
  contestants: Array<{
    seat: number;
    name: string;
    holeCards: [string, string];
    isHero: boolean;
    equity: number;
  }>;
}

export interface HandResult {
  handNumber: string;
  holeCards: [string, string] | null;
  board: string[];
  position: Position;
  numPlayers: number;
  stackDepth: number;
  actions: ActionEntry[];
  netResult: number;    // in cents — actual result
  netResultBB: number;
  bigBlind: number;
  wentToShowdown: boolean;
  evNet: number;        // in cents — EV-adjusted result. Equals netResult
                        // unless an all-in runout situation was detected.
  hadAllInShowdown: boolean;
  /** Populated only for hands where an all-in runout actually happened.
   *  Mirrors the data that `computeHeroEv` used to derive `evNet`. */
  allInShowdown?: AllInShowdown;
  leakType?: string;
}

export interface ActionEntry {
  street: Street;
  action: 'fold' | 'check' | 'call' | 'raise' | 'bet' | 'post';
  amount?: number;
  seat: number;
  playerName: string;
  isHero: boolean;
}

export interface LeakHand extends HandResult {
  leakType: string;
  leakDescription: string;
}

// Overall session stats for all players
export interface OverallStats {
  players: {
    id: string;
    name: string;
    pnl: number;       // cents
    pnlBB: number;
    vpip: number;
    pfr: number;
    handsPlayed: number;
    tableRole: 'fish' | 'shark' | null;
  }[];
  totalHands: number;
  bigBlind: number;
}
