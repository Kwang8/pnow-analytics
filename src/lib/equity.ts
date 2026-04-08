// Texas Hold'em equity calculator.
//
// Built on the `poker-odds-calculator` package's `Card`/`CardGroup`/`HandRank`
// primitives, but runs its own enumeration loop so we can:
//
//   1. Return fractional equities in [0, 1] with proper proportional
//      tie splitting (the package's built-in `getEquity()` rounds to
//      integer percentages and drops ties into a separate field).
//   2. Do **exact** exhaustive enumeration on postflop all-ins
//      (flop / turn / river) — deterministic and mathematically correct.
//   3. Fall back to a **seeded** Monte Carlo loop for preflop all-ins,
//      which keeps output reproducible across runs of the same hand.

import {
  Card, CardGroup, FullDeckGame, HandRank, Suit,
} from 'poker-odds-calculator';

const PREFLOP_MC_ITERATIONS = 50_000;
const GAME = new FullDeckGame();

// ─── Deterministic PRNG (mulberry32) ──────────────────────────────────
// Preflop MC is seeded by a hash of the hole cards so the same matchup
// always produces the same number, no matter when it's computed.

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromHoles(holes: [string, string][]): number {
  // Sort hole pairs so order-invariant (AA vs KK === KK vs AA).
  const sorted = [...holes].map(h => h.slice().sort().join('')).sort();
  let h = 2166136261;
  for (const pair of sorted) {
    for (let i = 0; i < pair.length; i++) {
      h = Math.imul(h ^ pair.charCodeAt(i), 16777619);
    }
  }
  return h >>> 0;
}

// ─── Card helpers ─────────────────────────────────────────────────────

/** Normalize to canonical form: uppercase rank + lowercase suit. */
export function normalizeCard(card: string): string {
  if (card.length !== 2) return card;
  return card[0].toUpperCase() + card[1].toLowerCase();
}

function parseHoles(holeHands: [string, string][]): CardGroup[] {
  return holeHands.map(h =>
    CardGroup.fromString(normalizeCard(h[0]) + normalizeCard(h[1])),
  );
}

function parseBoard(board: string[]): CardGroup {
  const str = board.map(normalizeCard).join('');
  return str.length > 0 ? CardGroup.fromString(str) : new CardGroup();
}

function buildRemainingDeck(used: CardGroup[]): Card[] {
  const usedKeys = new Set<string>();
  for (const group of used) {
    for (const card of group) {
      usedKeys.add(`${card.getRank()}-${card.getSuit()}`);
    }
  }
  const cards: Card[] = [];
  for (const suit of Suit.all()) {
    for (const rank of GAME.rank.all()) {
      if (!usedKeys.has(`${rank}-${suit}`)) {
        cards.push(new Card(rank, suit));
      }
    }
  }
  return cards;
}

// ─── Winner scoring ───────────────────────────────────────────────────

/** Score a single fully-dealt runout. Returns per-player pot shares,
 *  with multi-way ties split proportionally. Shares sum to exactly 1. */
function scoreRunout(holes: CardGroup[], fullBoard: CardGroup): number[] {
  let bestRank: HandRank | null = null;
  let winners: number[] = [];
  for (let i = 0; i < holes.length; i++) {
    const rank = HandRank.evaluate(GAME, holes[i].concat(fullBoard));
    if (bestRank === null) {
      bestRank = rank;
      winners = [i];
      continue;
    }
    const cmp = rank.compareTo(bestRank);
    if (cmp > 0) {
      bestRank = rank;
      winners = [i];
    } else if (cmp === 0) {
      winners.push(i);
    }
  }
  const shares = new Array<number>(holes.length).fill(0);
  const split = 1 / winners.length;
  for (const i of winners) shares[i] = split;
  return shares;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Compute each player's share of the pot given their hole cards and
 * the current board state. Board may be empty (preflop), 3, 4, or 5
 * cards; other lengths fall back to uniform.
 *
 * - Postflop (≥3 board cards): exhaustive enumeration. Exact and
 *   deterministic — AA vs KK on 2c3d4s is 91.01% to the aces every time.
 * - Preflop (empty board): Monte Carlo with a mulberry32 RNG seeded
 *   from the hole-card matchup. Reproducible across runs.
 *
 * Returns fractions in [0, 1] in the same order as `holeHands`.
 * Ties are split proportionally so the sum equals exactly 1.
 */
export function equity(
  holeHands: [string, string][],
  board: string[],
  iterations = PREFLOP_MC_ITERATIONS,
): number[] {
  if (holeHands.length < 2) return holeHands.map(() => 1);

  const holes = parseHoles(holeHands);
  const boardGroup = parseBoard(board);
  const cardsNeeded = 5 - boardGroup.length;

  // Defensive: unexpected partial boards fall back to uniform.
  if (cardsNeeded < 0 || cardsNeeded > 5) {
    return holeHands.map(() => 1 / holeHands.length);
  }

  // River: single deterministic score.
  if (cardsNeeded === 0) {
    return scoreRunout(holes, boardGroup);
  }

  const remaining = buildRemainingDeck([...holes, boardGroup]);
  const n = holes.length;
  const shares = new Array<number>(n).fill(0);
  let runCount = 0;

  // Flop (cardsNeeded=2, C(≤48, 2) ≤ 1128) and turn (cardsNeeded=1, ≤47)
  // are cheap enough to enumerate exhaustively — exact equity, no MC.
  if (cardsNeeded <= 2) {
    const pick = new Array<Card>(cardsNeeded);
    const recurse = (pos: number, start: number) => {
      if (pos === cardsNeeded) {
        const full = boardGroup.concat(CardGroup.fromCards(pick));
        const r = scoreRunout(holes, full);
        for (let i = 0; i < n; i++) shares[i] += r[i];
        runCount++;
        return;
      }
      for (let i = start; i < remaining.length; i++) {
        pick[pos] = remaining[i];
        recurse(pos + 1, i + 1);
      }
    };
    recurse(0, 0);
  } else {
    // Preflop (cardsNeeded=5). Exhaustive would be C(48, 5) ≈ 1.7M which
    // is too slow to run inline. Seeded Monte Carlo instead.
    const rng = mulberry32(seedFromHoles(holeHands));
    const pool = [...remaining];
    const poolLen = pool.length;

    for (let iter = 0; iter < iterations; iter++) {
      // Partial Fisher–Yates: only shuffle the last `cardsNeeded` slots.
      for (let i = poolLen - 1; i >= poolLen - cardsNeeded; i--) {
        const j = Math.floor(rng() * (i + 1));
        if (j !== i) {
          const tmp = pool[i];
          pool[i] = pool[j];
          pool[j] = tmp;
        }
      }
      const draw: Card[] = [];
      for (let i = poolLen - cardsNeeded; i < poolLen; i++) draw.push(pool[i]);
      const full = boardGroup.concat(CardGroup.fromCards(draw));
      const r = scoreRunout(holes, full);
      for (let i = 0; i < n; i++) shares[i] += r[i];
      runCount++;
    }
  }

  return shares.map(s => s / runCount);
}
