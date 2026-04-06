// Lightweight hand strength check for bluff detection

const RANK_ORDER = '23456789TJQKA';

function rankValue(card: string): number {
  const rank = card.slice(0, -1);
  return RANK_ORDER.indexOf(rank);
}

/**
 * Returns true if the hero's hole cards make less than middle pair on the board.
 * "Middle pair" = pairing with the median-ranked board card.
 * No pair at all = true (definitely weak).
 */
export function isBelowMiddlePair(holeCards: [string, string], board: string[]): boolean {
  if (board.length < 3) return true; // no board to pair with

  const boardRanks = board.map(c => rankValue(c)).sort((a, b) => a - b);
  const midIdx = Math.floor(boardRanks.length / 2);
  const middleRank = boardRanks[midIdx];

  const heroRanks = holeCards.map(c => rankValue(c));

  // Check if hero pairs with any board card
  let bestPairRank = -1;
  for (const hr of heroRanks) {
    for (const br of boardRanks) {
      if (hr === br && hr > bestPairRank) {
        bestPairRank = hr;
      }
    }
  }

  // No pair at all = below middle pair
  if (bestPairRank < 0) return true;

  // Pair is strictly below middle board card
  return bestPairRank < middleRank;
}
