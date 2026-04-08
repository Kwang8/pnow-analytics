// Monte-Carlo equity calculator for Texas Hold'em.
// Uses `pokersolver` for 5/7-card hand evaluation and runs a simple
// random-sampling runout to estimate each player's share of the pot.

import { Hand } from 'pokersolver';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

function buildDeck(): string[] {
  const deck: string[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

/** Normalize to canonical form: uppercase rank + lowercase suit. */
export function normalizeCard(card: string): string {
  if (card.length !== 2) return card;
  return card[0].toUpperCase() + card[1].toLowerCase();
}

/** Fisher–Yates shuffle, in place. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Compute each player's equity (share of pot) given their hole cards
 * and the current board. The board may be empty (preflop), 3 cards (flop),
 * 4 cards (turn), or 5 cards (river — deterministic, single run).
 *
 * Ties are split proportionally. Returns one fraction in [0, 1] per input hand,
 * in the same order as `holeHands`.
 */
export function equity(
  holeHands: [string, string][],
  board: string[],
  iterations = 1000,
): number[] {
  if (holeHands.length < 2) {
    // Trivial case — one player has 100% equity.
    return holeHands.map(() => 1);
  }

  const normHoles = holeHands.map(([a, b]) => [normalizeCard(a), normalizeCard(b)]);
  const normBoard = board.map(normalizeCard);

  // Remove all known cards from the deck.
  const dead = new Set<string>([...normHoles.flat(), ...normBoard]);
  const deck = buildDeck().filter(c => !dead.has(c));

  const cardsNeeded = 5 - normBoard.length;
  if (cardsNeeded < 0) return holeHands.map(() => 0);

  // River: one deterministic run.
  const runs = cardsNeeded === 0 ? 1 : iterations;
  const scores = new Array(normHoles.length).fill(0);

  for (let iter = 0; iter < runs; iter++) {
    let fullBoard: string[];
    if (cardsNeeded === 0) {
      fullBoard = normBoard;
    } else {
      const shuffled = shuffle([...deck]);
      fullBoard = [...normBoard, ...shuffled.slice(0, cardsNeeded)];
    }

    const solvedHands = normHoles.map(hole => Hand.solve([...hole, ...fullBoard]));
    const winners = Hand.winners(solvedHands);
    const share = 1 / winners.length;
    for (let i = 0; i < solvedHands.length; i++) {
      if (winners.includes(solvedHands[i])) scores[i] += share;
    }
  }

  return scores.map(s => s / runs);
}
