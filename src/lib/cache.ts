// Session-level in-memory caches for expensive, immutable computations.
//
// Raw game data (compressed hand histories) and per-player analyses are
// fully determined by the inputs and never change within a session unless
// the underlying game is refreshed. Cache them aggressively so that
// switching between views (MyStats, GroupView, game tabs, etc.) is free
// after the first load.
//
// After a `refreshGame` call, the caller is responsible for invoking
// `invalidateGameCache(gameId)` to clear both tiers for that game.

import { getGameRawData } from './gameStore';
import { analyzePlayer } from './analysis';
import type { PokerNowExport, PlayerStats } from './types';

// gameId → raw export (or null if the game doesn't exist / is corrupt).
// Also cache inflight promises to deduplicate concurrent callers.
const rawCache = new Map<string, PokerNowExport | null>();
const rawInflight = new Map<string, Promise<PokerNowExport | null>>();

/** Cached wrapper around `getGameRawData`. */
export function getCachedGameRawData(gameId: string): Promise<PokerNowExport | null> {
  if (rawCache.has(gameId)) return Promise.resolve(rawCache.get(gameId) ?? null);
  const existing = rawInflight.get(gameId);
  if (existing) return existing;
  const p = getGameRawData(gameId).then(raw => {
    rawCache.set(gameId, raw);
    rawInflight.delete(gameId);
    return raw;
  }).catch(err => {
    rawInflight.delete(gameId);
    throw err;
  });
  rawInflight.set(gameId, p);
  return p;
}

// (gameId, pokerNowId) → analyzed PlayerStats
const analysisCache = new Map<string, PlayerStats>();

function analysisKey(gameId: string, pokerNowId: string): string {
  return `${gameId}:${pokerNowId}`;
}

/** Cached wrapper around `analyzePlayer`. The caller must provide a
 *  stable gameId to use as the cache key.  */
export function getCachedPlayerAnalysis(
  gameId: string,
  data: PokerNowExport,
  pokerNowId: string,
): PlayerStats {
  const key = analysisKey(gameId, pokerNowId);
  const cached = analysisCache.get(key);
  if (cached) return cached;
  const result = analyzePlayer(data, pokerNowId);
  analysisCache.set(key, result);
  return result;
}

/** Drop all cached data for a specific game. Call this after a manual
 *  refresh so subsequent reads pick up the new raw bytes and re-run
 *  analysis. */
export function invalidateGameCache(gameId: string): void {
  rawCache.delete(gameId);
  rawInflight.delete(gameId);
  const prefix = `${gameId}:`;
  for (const key of analysisCache.keys()) {
    if (key.startsWith(prefix)) analysisCache.delete(key);
  }
}

/** Nuclear option — primarily for dev/testing. */
export function clearAllCaches(): void {
  rawCache.clear();
  rawInflight.clear();
  analysisCache.clear();
}
