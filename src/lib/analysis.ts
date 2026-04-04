import {
  type PokerNowExport, type Hand, type PlayerStats,
  type Position, type Street, type StreetAggression, type PositionStat,
  type HandResult, type ActionEntry, type LeakHand, type OverallStats,
  type EventPayload, EVT,
} from './types';

// ─── Position Calculation ───────────────────────────────────────────────

function getPosition(hand: Hand, playerSeat: number): Position {
  const seats = hand.players.map(p => p.seat).sort((a, b) => a - b);
  const n = seats.length;
  const dealerIdx = seats.indexOf(hand.dealerSeat);
  const playerIdx = seats.indexOf(playerSeat);
  if (dealerIdx === -1 || playerIdx === -1) return 'EP/MP';

  const pos = ((playerIdx - dealerIdx) % n + n) % n;

  if (pos === 0) return 'BTN';
  if (pos === 1) return 'SB';
  if (pos === 2) return 'BB';
  if (n >= 5 && pos === n - 1) return 'CO';
  if (n >= 6 && pos === n - 2) return 'HJ';
  return 'EP/MP';
}

// ─── Street Detection ───────────────────────────────────────────────────

function getStreets(events: { payload: EventPayload }[]): Map<number, Street> {
  // Map event index to street
  const streetMap = new Map<number, Street>();
  let currentStreet: Street = 'preflop';

  for (let i = 0; i < events.length; i++) {
    const p = events[i].payload;
    if (p.type === EVT.COMMUNITY) {
      const turn = (p as { type: 9; turn: number }).turn;
      if (turn === 1) currentStreet = 'flop';
      else if (turn === 2) currentStreet = 'turn';
      else if (turn === 3) currentStreet = 'river';
    }
    streetMap.set(i, currentStreet);
  }
  return streetMap;
}

// ─── Pot Calculation ────────────────────────────────────────────────────

function getPotAtStreetStart(events: { payload: EventPayload }[], targetStreet: Street): number {
  let pot = 0;
  let currentStreet: Street = 'preflop';

  for (const e of events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY) {
      const turn = (p as { type: 9; turn: number }).turn;
      if (turn === 1) currentStreet = 'flop';
      else if (turn === 2) currentStreet = 'turn';
      else if (turn === 3) currentStreet = 'river';
      if (currentStreet === targetStreet) return pot;
    }
    if ('value' in p && ([EVT.BB_POST, EVT.SB_POST, EVT.STRADDLE, EVT.MISSED_BLIND, EVT.CALL, EVT.BET_RAISE] as number[]).includes(p.type)) {
      pot += (p as { value: number }).value;
    }
  }
  return pot;
}

// ─── Build action sequence ──────────────────────────────────────────────

function buildActions(hand: Hand, heroSeat: number): ActionEntry[] {
  const actions: ActionEntry[] = [];
  const streetMap = getStreets(hand.events);
  const playerMap = new Map(hand.players.map(p => [p.seat, p.name]));

  for (let i = 0; i < hand.events.length; i++) {
    const p = hand.events[i].payload;
    const street = streetMap.get(i)!;
    const seat = 'seat' in p ? (p as { seat: number }).seat : -1;

    let action: ActionEntry['action'] | null = null;
    let amount: number | undefined;

    switch (p.type) {
      case EVT.CHECK: action = 'check'; break;
      case EVT.CALL: action = 'call'; amount = (p as { value: number }).value; break;
      case EVT.BET_RAISE: action = 'raise'; amount = (p as { value: number }).value; break;
      case EVT.FOLD: action = 'fold'; break;
      case EVT.BB_POST: case EVT.SB_POST: case EVT.STRADDLE: case EVT.MISSED_BLIND:
        action = 'post'; amount = (p as { value: number }).value; break;
    }

    if (action && seat >= 0) {
      actions.push({
        street,
        action,
        amount,
        seat,
        playerName: playerMap.get(seat) || `Seat ${seat}`,
        isHero: seat === heroSeat,
      });
    }
  }
  return actions;
}

// ─── Net Result for a player in a hand ──────────────────────────────────

function getNetResult(hand: Hand, playerSeat: number): number {
  let invested = 0;
  let returned = 0;

  for (const e of hand.events) {
    const p = e.payload;
    if ('seat' in p && (p as { seat: number }).seat === playerSeat) {
      if (([EVT.BB_POST, EVT.SB_POST, EVT.STRADDLE, EVT.MISSED_BLIND, EVT.CALL, EVT.BET_RAISE] as number[]).includes(p.type)) {
        invested += (p as { value: number }).value;
      }
      if (p.type === EVT.POT_WON) {
        returned += (p as { value: number }).value;
      }
      if (p.type === EVT.UNCALLED_RETURNED) {
        returned += (p as { value: number }).value;
      }
    }
  }
  return returned - invested;
}

// ─── Check if player saw flop ───────────────────────────────────────────

function playerSawFlop(hand: Hand, playerSeat: number): boolean {
  let sawFlop = false;
  let folded = false;

  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.FOLD && 'seat' in p && (p as { seat: number }).seat === playerSeat) {
      folded = true;
    }
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn === 1) {
      sawFlop = !folded;
      break;
    }
  }
  // If no community cards at all but player didn't fold, they "saw" the end
  return sawFlop;
}

// ─── Check if player went to showdown ───────────────────────────────────

function playerWentToShowdown(hand: Hand, playerSeat: number): boolean {
  let folded = false;
  let hasShowdown = false;

  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.FOLD && 'seat' in p && (p as { seat: number }).seat === playerSeat) {
      folded = true;
    }
    if (p.type === EVT.SHOWDOWN) {
      hasShowdown = true;
    }
  }

  if (!hasShowdown) {
    // Check if hand ended after river without folds (everyone checked down)
    let hasRiver = false;
    for (const e of hand.events) {
      if (e.payload.type === EVT.COMMUNITY && (e.payload as { turn: number }).turn === 3) {
        hasRiver = true;
      }
    }
    if (hasRiver && !folded) {
      // Player was still in at river — count as showdown if pot was won
      const potEvents = hand.events.filter(e => e.payload.type === EVT.POT_WON);
      if (potEvents.length > 0) {
        // Multiple players still in at showdown (no fold after river)
        const activePlayers = hand.players.filter(p => {
          const didFold = hand.events.some(e =>
            e.payload.type === EVT.FOLD && 'seat' in e.payload && (e.payload as { seat: number }).seat === p.seat
          );
          return !didFold;
        });
        if (activePlayers.length >= 2 && !folded) return true;
      }
    }
    return false;
  }

  return !folded;
}

// ─── Board cards ────────────────────────────────────────────────────────

function getBoard(hand: Hand): string[] {
  const cards: string[] = [];
  for (const e of hand.events) {
    if (e.payload.type === EVT.COMMUNITY) {
      cards.push(...(e.payload as { cards: string[] }).cards);
    }
  }
  return cards;
}

// ─── Preflop analysis helpers ───────────────────────────────────────────

function getPreflopActions(hand: Hand): { seat: number; type: number; value?: number }[] {
  const actions: { seat: number; type: number; value?: number }[] = [];
  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY) break; // preflop ends at first community card
    if ('seat' in p) {
      actions.push({
        seat: (p as { seat: number }).seat,
        type: p.type,
        value: 'value' in p ? (p as { value: number }).value : undefined,
      });
    }
  }
  return actions;
}

function didVoluntarilyPutMoney(hand: Hand, playerSeat: number): boolean {
  const actions = getPreflopActions(hand);
  for (const a of actions) {
    if (a.seat === playerSeat) {
      if (a.type === EVT.CALL || a.type === EVT.BET_RAISE) return true;
    }
  }
  return false;
}

function didRaisePreflop(hand: Hand, playerSeat: number): boolean {
  const actions = getPreflopActions(hand);
  for (const a of actions) {
    if (a.seat === playerSeat && a.type === EVT.BET_RAISE) return true;
  }
  return false;
}

function had3BetOpportunity(hand: Hand, playerSeat: number): boolean {
  // Someone else raised before hero acted
  const actions = getPreflopActions(hand);
  let someoneRaised = false;
  for (const a of actions) {
    if (a.seat !== playerSeat && a.type === EVT.BET_RAISE) {
      someoneRaised = true;
    }
    // Once it's hero's first non-post action after someone raised
    if (someoneRaised && a.seat === playerSeat && a.type !== EVT.BB_POST && a.type !== EVT.SB_POST) {
      return true;
    }
  }
  return false;
}

function did3Bet(hand: Hand, playerSeat: number): boolean {
  const actions = getPreflopActions(hand);
  let someoneRaised = false;
  for (const a of actions) {
    if (a.seat !== playerSeat && a.type === EVT.BET_RAISE) {
      someoneRaised = true;
    }
    if (someoneRaised && a.seat === playerSeat && a.type === EVT.BET_RAISE) {
      return true;
    }
  }
  return false;
}

function hadCBetOpportunity(hand: Hand, playerSeat: number): boolean {
  // Player raised preflop AND saw the flop
  if (!didRaisePreflop(hand, playerSeat)) return false;
  if (!playerSawFlop(hand, playerSeat)) return false;
  return true;
}

function didCBet(hand: Hand, playerSeat: number): boolean {
  if (!hadCBetOpportunity(hand, playerSeat)) return false;

  let onFlop = false;
  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn === 1) {
      onFlop = true;
      continue;
    }
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn >= 2) break;

    if (onFlop && 'seat' in p && (p as { seat: number }).seat === playerSeat) {
      if (p.type === EVT.BET_RAISE) return true;
      if (p.type === EVT.CHECK || p.type === EVT.FOLD) return false;
    }
  }
  return false;
}

function facedRiverBet(hand: Hand, playerSeat: number): boolean {
  let onRiver = false;
  let someoneBet = false;
  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn === 3) {
      onRiver = true;
      continue;
    }
    if (!onRiver) continue;

    if ('seat' in p && (p as { seat: number }).seat !== playerSeat && p.type === EVT.BET_RAISE) {
      someoneBet = true;
    }
    if (someoneBet && 'seat' in p && (p as { seat: number }).seat === playerSeat) {
      return true; // player had to act facing a river bet
    }
  }
  return false;
}

function foldedToRiverBet(hand: Hand, playerSeat: number): boolean {
  let onRiver = false;
  let someoneBet = false;
  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn === 3) {
      onRiver = true;
      continue;
    }
    if (!onRiver) continue;

    if ('seat' in p && (p as { seat: number }).seat !== playerSeat && p.type === EVT.BET_RAISE) {
      someoneBet = true;
    }
    if (someoneBet && 'seat' in p && (p as { seat: number }).seat === playerSeat) {
      return p.type === EVT.FOLD;
    }
  }
  return false;
}

// ─── Bet sizing analysis ────────────────────────────────────────────────

function getPreflopOpenSizes(hand: Hand, playerSeat: number, bb: number): number | null {
  const actions = getPreflopActions(hand);
  let anyRaiseBefore = false;
  for (const a of actions) {
    if (a.type === EVT.BET_RAISE && a.seat !== playerSeat) {
      anyRaiseBefore = true;
    }
    if (a.seat === playerSeat && a.type === EVT.BET_RAISE && !anyRaiseBefore) {
      return (a.value || 0) / bb;
    }
  }
  return null;
}

function getStreetBetSizes(hand: Hand, playerSeat: number, targetStreet: Street): { betPct: number } | null {
  const pot = getPotAtStreetStart(hand.events.map(e => ({ payload: e.payload })), targetStreet);
  if (pot <= 0) return null;

  let onStreet = targetStreet === 'preflop';
  const turnMap: Record<number, Street> = { 1: 'flop', 2: 'turn', 3: 'river' };

  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY) {
      const street = turnMap[(p as { turn: number }).turn];
      if (street === targetStreet) onStreet = true;
      else if (onStreet) break;
    }
    if (onStreet && 'seat' in p && (p as { seat: number }).seat === playerSeat && p.type === EVT.BET_RAISE) {
      return { betPct: ((p as { value: number }).value / pot) * 100 };
    }
  }
  return null;
}

// ─── Street aggression ──────────────────────────────────────────────────

function getStreetActions(hand: Hand, playerSeat: number, targetStreet: Street): { bets: number; checks: number; calls: number; folds: number } {
  const result = { bets: 0, checks: 0, calls: 0, folds: 0 };
  const streetMap = getStreets(hand.events);

  for (let i = 0; i < hand.events.length; i++) {
    if (streetMap.get(i) !== targetStreet) continue;
    const p = hand.events[i].payload;
    if (!('seat' in p) || (p as { seat: number }).seat !== playerSeat) continue;

    switch (p.type) {
      case EVT.BET_RAISE: result.bets++; break;
      case EVT.CHECK: result.checks++; break;
      case EVT.CALL: result.calls++; break;
      case EVT.FOLD: result.folds++; break;
    }
  }
  return result;
}

// ─── Leak Detection ─────────────────────────────────────────────────────

function isWeakHolding(cards: [string, string]): boolean {
  const ranks = cards.map(c => c[0]);
  const suits = cards.map(c => c[1]);
  const rankOrder = '23456789TJQKA';
  const rankValues = ranks.map(r => rankOrder.indexOf(r));

  const bothBelowTen = rankValues.every(v => v < 8); // below T
  const suited = suits[0] === suits[1];
  const connected = Math.abs(rankValues[0] - rankValues[1]) === 1;

  if (bothBelowTen && !(suited && connected)) return true;
  return false;
}

function isEPJunk(cards: [string, string], numPlayers: number): boolean {
  if (numPlayers < 5) return false;
  const rankOrder = '23456789TJQKA';
  const ranks = cards.map(c => rankOrder.indexOf(c[0]));
  const suits = cards.map(c => c[1]);
  const suited = suits[0] === suits[1];
  const hi = Math.max(...ranks);
  const lo = Math.min(...ranks);

  // 77+ is fine
  if (ranks[0] === ranks[1] && ranks[0] >= 5) return false; // 77+
  // ATs+ is fine
  if (hi === 12 && lo >= 8 && suited) return false; // ATs+
  // AJo+ is fine
  if (hi === 12 && lo >= 9) return false; // AJo+
  // KQs, KJs
  if (hi === 11 && lo >= 9 && suited) return false;

  return true;
}

function detectLeaks(hand: Hand, playerSeat: number, bb: number): LeakHand | null {
  const player = hand.players.find(p => p.seat === playerSeat);
  if (!player?.hand) return null;

  const cards = player.hand as [string, string];
  const position = getPosition(hand, playerSeat);
  const actions = getPreflopActions(hand);
  const board = getBoard(hand);
  const netResult = getNetResult(hand, playerSeat);
  const netBB = netResult / bb;

  const baseResult: Omit<LeakHand, 'leakType' | 'leakDescription'> = {
    handNumber: hand.number,
    holeCards: cards,
    board,
    position,
    numPlayers: hand.players.length,
    stackDepth: player.stack / bb,
    actions: buildActions(hand, playerSeat),
    netResult,
    netResultBB: netBB,
    bigBlind: bb,
    wentToShowdown: playerWentToShowdown(hand, playerSeat),
  };

  // Bad cold call — called a raise with weak holdings
  const someoneRaisedBefore = actions.some(a => a.seat !== playerSeat && a.type === EVT.BET_RAISE);
  const heroCalled = actions.some(a => a.seat === playerSeat && a.type === EVT.CALL);
  if (someoneRaisedBefore && heroCalled && !didRaisePreflop(hand, playerSeat) && isWeakHolding(cards)) {
    return { ...baseResult, leakType: 'bad-cold-call', leakDescription: `Cold called with ${cards.join('')} — weak holding facing a raise` };
  }

  // EP junk opens
  if ((position === 'EP/MP' || position === 'HJ') && didRaisePreflop(hand, playerSeat) && isEPJunk(cards, hand.players.length)) {
    return { ...baseResult, leakType: 'ep-junk-open', leakDescription: `Opened ${cards.join('')} from ${position} in ${hand.players.length}-handed game` };
  }

  // River bets/raises that lost
  let onRiver = false;
  let heroBetRiver = false;
  for (const e of hand.events) {
    const p = e.payload;
    if (p.type === EVT.COMMUNITY && (p as { turn: number }).turn === 3) onRiver = true;
    if (onRiver && 'seat' in p && (p as { seat: number }).seat === playerSeat && p.type === EVT.BET_RAISE) {
      heroBetRiver = true;
    }
  }
  if (heroBetRiver && netResult < 0) {
    return { ...baseResult, leakType: 'river-bet-lost', leakDescription: `Bet/raised river with ${cards.join('')} and lost ${Math.abs(netBB).toFixed(1)} BB` };
  }

  // Check-call bleed: checked flop, called turn, lost 5+ BB
  if (playerSawFlop(hand, playerSeat)) {
    let flopCheck = false;
    let turnCall = false;
    let currentStreet: Street = 'preflop';

    for (const e of hand.events) {
      const p = e.payload;
      if (p.type === EVT.COMMUNITY) {
        const turn = (p as { turn: number }).turn;
        if (turn === 1) currentStreet = 'flop';
        else if (turn === 2) currentStreet = 'turn';
        else if (turn === 3) currentStreet = 'river';
      }
      if ('seat' in p && (p as { seat: number }).seat === playerSeat) {
        if (currentStreet === 'flop' && p.type === EVT.CHECK) flopCheck = true;
        if (currentStreet === 'turn' && p.type === EVT.CALL) turnCall = true;
      }
    }

    if (flopCheck && turnCall && netBB <= -5) {
      return { ...baseResult, leakType: 'check-call-bleed', leakDescription: `Check-called pattern: checked flop, called turn, lost ${Math.abs(netBB).toFixed(1)} BB` };
    }
  }

  return null;
}

// ─── Main Analysis ──────────────────────────────────────────────────────

export function analyzePlayer(data: PokerNowExport, playerId: string): PlayerStats {
  const hands = data.hands;
  const playerName = hands.flatMap(h => h.players).find(p => p.id === playerId)?.name || 'Unknown';

  let handsPlayed = 0;
  let handsWithCards = 0;
  let vpipCount = 0;
  let pfrCount = 0;
  let threeBetOpps = 0;
  let threeBetCount = 0;
  let cBetOpps = 0;
  let cBetCount = 0;
  let showdownWins = 0;
  let showdownCount = 0;
  let sawFlopCount = 0;
  let wentToShowdownCount = 0;
  let riverFacedCount = 0;
  let riverFoldedCount = 0;
  let totalPnl = 0;

  const preflopOpenSizes: number[] = [];
  const flopBetPcts: number[] = [];
  const turnBetPcts: number[] = [];
  const riverBetPcts: number[] = [];

  const aggFlop = { bets: 0, checks: 0, calls: 0, folds: 0 };
  const aggTurn = { bets: 0, checks: 0, calls: 0, folds: 0 };
  const aggRiver = { bets: 0, checks: 0, calls: 0, folds: 0 };

  const posStats: Record<Position, PositionStat> = {
    'BTN': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
    'CO': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
    'HJ': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
    'EP/MP': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
    'SB': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
    'BB': { hands: 0, vpip: 0, pfr: 0, netBB: 0, handResults: [] },
  };

  const allResults: HandResult[] = [];
  const leaks: LeakHand[] = [];

  for (const hand of hands) {
    const player = hand.players.find(p => p.id === playerId);
    if (!player) continue;

    handsPlayed++;
    const seat = player.seat;
    const bb = hand.bigBlind;
    const hasCards = !!player.hand;
    if (hasCards) handsWithCards++;

    const position = getPosition(hand, seat);
    const netResult = getNetResult(hand, seat);
    totalPnl += netResult;

    // VPIP/PFR
    if (didVoluntarilyPutMoney(hand, seat)) vpipCount++;
    if (didRaisePreflop(hand, seat)) pfrCount++;

    // 3-bet
    if (had3BetOpportunity(hand, seat)) {
      threeBetOpps++;
      if (did3Bet(hand, seat)) threeBetCount++;
    }

    // C-bet
    if (hadCBetOpportunity(hand, seat)) {
      cBetOpps++;
      if (didCBet(hand, seat)) cBetCount++;
    }

    // Showdown stats
    const sawFlop = playerSawFlop(hand, seat);
    if (sawFlop) sawFlopCount++;

    const wentToSD = playerWentToShowdown(hand, seat);
    if (wentToSD) {
      wentToShowdownCount++;
      showdownCount++;
      if (netResult > 0) showdownWins++;
    }

    // River fold
    if (facedRiverBet(hand, seat)) {
      riverFacedCount++;
      if (foldedToRiverBet(hand, seat)) riverFoldedCount++;
    }

    // Bet sizing
    const openSize = getPreflopOpenSizes(hand, seat, bb);
    if (openSize !== null) preflopOpenSizes.push(openSize);

    const flopBet = getStreetBetSizes(hand, seat, 'flop');
    if (flopBet) flopBetPcts.push(flopBet.betPct);
    const turnBet = getStreetBetSizes(hand, seat, 'turn');
    if (turnBet) turnBetPcts.push(turnBet.betPct);
    const riverBet = getStreetBetSizes(hand, seat, 'river');
    if (riverBet) riverBetPcts.push(riverBet.betPct);

    // Street aggression
    if (sawFlop) {
      const f = getStreetActions(hand, seat, 'flop');
      aggFlop.bets += f.bets; aggFlop.checks += f.checks; aggFlop.calls += f.calls; aggFlop.folds += f.folds;
      const t = getStreetActions(hand, seat, 'turn');
      aggTurn.bets += t.bets; aggTurn.checks += t.checks; aggTurn.calls += t.calls; aggTurn.folds += t.folds;
      const r = getStreetActions(hand, seat, 'river');
      aggRiver.bets += r.bets; aggRiver.checks += r.checks; aggRiver.calls += r.calls; aggRiver.folds += r.folds;
    }

    // Position stats
    posStats[position].hands++;
    if (didVoluntarilyPutMoney(hand, seat)) posStats[position].vpip++;
    if (didRaisePreflop(hand, seat)) posStats[position].pfr++;
    posStats[position].netBB += netResult / bb;

    // Hand result
    const hr: HandResult = {
      handNumber: hand.number,
      holeCards: player.hand as [string, string] | null,
      board: getBoard(hand),
      position,
      numPlayers: hand.players.length,
      stackDepth: player.stack / bb,
      actions: buildActions(hand, seat),
      netResult,
      netResultBB: netResult / bb,
      bigBlind: bb,
      wentToShowdown: wentToSD,
    };
    allResults.push(hr);
    posStats[position].handResults.push(hr);

    // Leak detection
    if (hasCards) {
      const leak = detectLeaks(hand, seat, bb);
      if (leak) leaks.push(leak);
    }
  }

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const pct = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;
  const af = (agg: typeof aggFlop): StreetAggression => ({
    ...agg,
    aggressionFactor: agg.calls > 0 ? agg.bets / agg.calls : agg.bets > 0 ? Infinity : 0,
  });

  // Modal BB for totalPnlBB
  const modalBB = hands.length > 0 ? hands[0].bigBlind : 100;

  // Position stats pct
  for (const pos of Object.keys(posStats) as Position[]) {
    const ps = posStats[pos];
    ps.vpip = pct(ps.vpip, ps.hands);
    ps.pfr = pct(ps.pfr, ps.hands);
  }

  const sorted = [...allResults].sort((a, b) => a.netResultBB - b.netResultBB);

  return {
    playerId,
    playerName,
    handsPlayed,
    handsWithCards,
    vpip: pct(vpipCount, handsPlayed),
    pfr: pct(pfrCount, handsPlayed),
    coldCall: pct(vpipCount - pfrCount, handsPlayed),
    threeBet: pct(threeBetCount, threeBetOpps),
    cBet: pct(cBetCount, cBetOpps),
    wsd: pct(showdownWins, showdownCount),
    wtsd: pct(wentToShowdownCount, sawFlopCount),
    riverFold: pct(riverFoldedCount, riverFacedCount),
    totalPnl,
    totalPnlBB: totalPnl / modalBB,
    avgPreflopOpenBB: avg(preflopOpenSizes),
    avgFlopBetPot: avg(flopBetPcts),
    avgTurnBetPot: avg(turnBetPcts),
    avgRiverBetPot: avg(riverBetPcts),
    aggression: {
      flop: af(aggFlop),
      turn: af(aggTurn),
      river: af(aggRiver),
    },
    positionStats: posStats,
    biggestLosers: sorted.slice(0, 12),
    biggestWinners: sorted.slice(-8).reverse(),
    leaks,
    handResults: allResults,
  };
}

// ─── Overall Session Stats ──────────────────────────────────────────────

export function analyzeOverall(data: PokerNowExport): OverallStats {
  const playerMap = new Map<string, { name: string; pnl: number; vpip: number; hands: number; pfr: number }>();

  const modalBB = data.hands.length > 0 ? data.hands[0].bigBlind : 100;

  for (const hand of data.hands) {
    for (const player of hand.players) {
      if (!playerMap.has(player.id)) {
        playerMap.set(player.id, { name: player.name, pnl: 0, vpip: 0, hands: 0, pfr: 0 });
      }
      const stats = playerMap.get(player.id)!;
      stats.hands++;
      stats.pnl += getNetResult(hand, player.seat);
      if (didVoluntarilyPutMoney(hand, player.seat)) stats.vpip++;
      if (didRaisePreflop(hand, player.seat)) stats.pfr++;
    }
  }

  const players = Array.from(playerMap.entries()).map(([id, s]) => ({
    id,
    name: s.name,
    pnl: s.pnl,
    pnlBB: s.pnl / modalBB,
    vpip: s.hands > 0 ? (s.vpip / s.hands) * 100 : 0,
    pfr: s.hands > 0 ? (s.pfr / s.hands) * 100 : 0,
    handsPlayed: s.hands,
  }));

  return {
    players: players.sort((a, b) => b.pnl - a.pnl),
    totalHands: data.hands.length,
    bigBlind: modalBB,
  };
}
