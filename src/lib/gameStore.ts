import {
  collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp, writeBatch, updateDoc, arrayUnion,
  type Timestamp,
} from 'firebase/firestore';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { db } from './firebase';
import { analyzeOverall } from './analysis';
import type { PokerNowExport, OverallStats } from './types';

// ─── Types ──────────────────────────────────────────────────────────────

export interface GameDoc {
  id: string;
  uploadedBy: string;
  createdAt: Timestamp;
  gameDate: string;
  pokerNowGameId: string;
  totalHands: number;
  bigBlind: number;
  playerSummaries: PlayerSummary[];
  members: string[];
  memberEmails: string[];
}

export interface PlayerSummary {
  pokerNowId: string;
  name: string;
  pnl: number;
  pnlBB: number;
  vpip: number;
  pfr: number;
  handsPlayed: number;
}

export interface GamePlayerDoc {
  gameId: string;
  pokerNowId: string;
  playerName: string;
  uid: string | null;
  pnl: number;
  pnlBB: number;
  vpip: number;
  pfr: number;
  handsPlayed: number;
  bigBlind: number;
  gameDate: string;
  uploadedBy: string;
}

// ─── Save Game ──────────────────────────────────────────────────────────

export async function saveGame(
  uid: string,
  email: string,
  data: PokerNowExport,
  overall: OverallStats,
): Promise<string> {
  const gameRef = doc(collection(db, 'games'));
  const gameId = gameRef.id;

  const playerSummaries: PlayerSummary[] = overall.players.map(p => ({
    pokerNowId: p.id,
    name: p.name,
    pnl: p.pnl,
    pnlBB: p.pnlBB,
    vpip: p.vpip,
    pfr: p.pfr,
    handsPlayed: p.handsPlayed,
  }));

  // Compress the raw JSON for storage
  const rawData = compressToUTF16(JSON.stringify(data));

  await setDoc(gameRef, {
    uploadedBy: uid,
    createdAt: serverTimestamp(),
    gameDate: data.hands.length > 0
      ? new Date(data.hands[0].startedAt).toISOString()
      : data.generatedAt,
    pokerNowGameId: data.gameId,
    totalHands: overall.totalHands,
    bigBlind: overall.bigBlind,
    playerSummaries,
    members: [uid],
    memberEmails: [email],
    rawData,
  });

  // Write flat gamePlayers docs for aggregation queries
  const batch = writeBatch(db);
  for (const p of overall.players) {
    const gpRef = doc(db, 'gamePlayers', `${gameId}_${p.id}`);
    batch.set(gpRef, {
      gameId,
      pokerNowId: p.id,
      playerName: p.name,
      uid: null, // will be set when friend is linked
      pnl: p.pnl,
      pnlBB: p.pnlBB,
      vpip: p.vpip,
      pfr: p.pfr,
      handsPlayed: p.handsPlayed,
      bigBlind: overall.bigBlind,
      gameDate: data.hands.length > 0
        ? new Date(data.hands[0].startedAt).toISOString()
        : data.generatedAt,
      uploadedBy: uid,
    } satisfies GamePlayerDoc);
  }
  batch.commit();

  return gameId;
}

// ─── Get My Games ───────────────────────────────────────────────────────

export async function getMyGames(uid: string): Promise<GameDoc[]> {
  const q = query(
    collection(db, 'games'),
    where('members', 'array-contains', uid),
  );
  const snap = await getDocs(q);
  const games = snap.docs.map(d => ({ id: d.id, ...d.data() } as GameDoc));
  // Sort by game date (newest first), fall back to createdAt
  games.sort((a, b) => {
    const aTime = a.gameDate ? new Date(a.gameDate).getTime() : (a.createdAt?.toMillis?.() ?? 0);
    const bTime = b.gameDate ? new Date(b.gameDate).getTime() : (b.createdAt?.toMillis?.() ?? 0);
    return bTime - aTime;
  });
  return games;
}

// ─── Get Game Raw Data ──────────────────────────────────────────────────

export async function getGameRawData(gameId: string): Promise<PokerNowExport | null> {
  const snap = await getDoc(doc(db, 'games', gameId));
  if (!snap.exists()) return null;
  const rawData = snap.data().rawData as string;
  if (!rawData) return null;
  try {
    return JSON.parse(decompressFromUTF16(rawData)!) as PokerNowExport;
  } catch {
    return null;
  }
}

// ─── Refresh Game (re-derive stored summaries from raw data) ────────────

export async function refreshGame(gameId: string): Promise<void> {
  const snap = await getDoc(doc(db, 'games', gameId));
  if (!snap.exists()) return;
  const rawData = snap.data().rawData as string;
  if (!rawData) return;

  let data: PokerNowExport;
  try {
    data = JSON.parse(decompressFromUTF16(rawData)!) as PokerNowExport;
  } catch {
    return;
  }

  const overall = analyzeOverall(data);
  const gameDate = data.hands.length > 0
    ? new Date(data.hands[0].startedAt).toISOString()
    : data.generatedAt;

  const playerSummaries: PlayerSummary[] = overall.players.map(p => ({
    pokerNowId: p.id,
    name: p.name,
    pnl: p.pnl,
    pnlBB: p.pnlBB,
    vpip: p.vpip,
    pfr: p.pfr,
    handsPlayed: p.handsPlayed,
  }));

  await updateDoc(doc(db, 'games', gameId), {
    playerSummaries,
    gameDate,
    totalHands: overall.totalHands,
    bigBlind: overall.bigBlind,
  });

  // Batch-update gamePlayers docs (preserve existing uid)
  const batch = writeBatch(db);
  for (const p of overall.players) {
    const gpRef = doc(db, 'gamePlayers', `${gameId}_${p.id}`);
    batch.update(gpRef, {
      playerName: p.name,
      pnl: p.pnl,
      pnlBB: p.pnlBB,
      vpip: p.vpip,
      pfr: p.pfr,
      handsPlayed: p.handsPlayed,
      bigBlind: overall.bigBlind,
      gameDate,
    });
  }
  await batch.commit();
}

// ─── Delete Game ────────────────────────────────────────────────────────

export async function deleteGame(gameId: string, uid: string): Promise<boolean> {
  const ref = doc(db, 'games', gameId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().uploadedBy !== uid) return false;

  // Delete gamePlayers docs
  const summaries = snap.data().playerSummaries as PlayerSummary[];
  const batch = writeBatch(db);
  for (const p of summaries) {
    batch.delete(doc(db, 'gamePlayers', `${gameId}_${p.pokerNowId}`));
  }
  batch.delete(ref);
  await batch.commit();
  return true;
}

// ─── Get My Aggregated Stats ────────────────────────────────────────────

export async function getMyGamePlayerDocs(uid: string): Promise<GamePlayerDoc[]> {
  const q = query(
    collection(db, 'gamePlayers'),
    where('uid', '==', uid),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as GamePlayerDoc);
}

// ─── Username Utilities ─────────────────────────────────────────────────

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const normalized = username.toLowerCase();
  const q = query(collection(db, 'users'), where('username', '==', normalized));
  const snap = await getDocs(q);
  return snap.empty;
}

export async function setUsername(uid: string, username: string): Promise<void> {
  const normalized = username.toLowerCase();
  await updateDoc(doc(db, 'users', uid), { username: normalized });
}

export async function searchUserByUsername(username: string): Promise<{ uid: string; displayName: string; email: string; photoURL: string; username: string } | null> {
  const normalized = username.toLowerCase().replace(/^@/, '');
  const q = query(collection(db, 'users'), where('username', '==', normalized));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() } as { uid: string; displayName: string; email: string; photoURL: string; username: string };
}

// ──�� Add Friend (cross-add to all games) ─────────────���──────────────────

export async function searchUserByEmail(email: string): Promise<{ uid: string; displayName: string; email: string; photoURL: string } | null> {
  const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() } as { uid: string; displayName: string; email: string; photoURL: string };
}

export async function addFriend(
  myUid: string,
  myEmail: string,
  friendUid: string,
  friendEmail: string,
): Promise<void> {
  // Get all games where I'm a member → add friend
  const myGamesQ = query(collection(db, 'games'), where('members', 'array-contains', myUid));
  const myGames = await getDocs(myGamesQ);

  // Get all games where friend is a member → add me
  const friendGamesQ = query(collection(db, 'games'), where('members', 'array-contains', friendUid));
  const friendGames = await getDocs(friendGamesQ);

  const batch = writeBatch(db);

  for (const g of myGames.docs) {
    batch.update(g.ref, {
      members: arrayUnion(friendUid),
      memberEmails: arrayUnion(friendEmail),
    });
  }

  for (const g of friendGames.docs) {
    batch.update(g.ref, {
      members: arrayUnion(myUid),
      memberEmails: arrayUnion(myEmail),
    });
  }

  await batch.commit();
}

// ─── Claim "This is me" ─────────────────────────────────────────────────

export async function claimPlayer(
  gameId: string,
  uid: string,
  email: string,
  pokerNowPlayerId: string,
): Promise<void> {
  // Guard: check if already claimed by someone else
  const gpRef = doc(db, 'gamePlayers', `${gameId}_${pokerNowPlayerId}`);
  const gpSnap = await getDoc(gpRef);
  if (gpSnap.exists()) {
    const existing = gpSnap.data().uid as string | null;
    if (existing && existing !== uid) {
      throw new Error('This player slot is already claimed by another user.');
    }
  }

  const gameRef = doc(db, 'games', gameId);
  await updateDoc(gameRef, {
    members: arrayUnion(uid),
    memberEmails: arrayUnion(email),
  });
  await updateDoc(gpRef, { uid });
}

// ─── Get all claims for a game ──────────────────────────────────────────

export async function getGameClaims(gameId: string): Promise<Map<string, string | null>> {
  const q = query(
    collection(db, 'gamePlayers'),
    where('gameId', '==', gameId),
  );
  const snap = await getDocs(q);
  const map = new Map<string, string | null>();
  for (const d of snap.docs) {
    const data = d.data() as GamePlayerDoc;
    map.set(data.pokerNowId, data.uid);
  }
  return map;
}

// ─── Leaderboard: All Player Stats ──────────────────────────────────────

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  totalPnlCents: number;
  totalHands: number;
  sessions: number;
  wins: number;
}

export async function getAllPlayerStats(currentUid: string): Promise<LeaderboardEntry[]> {
  // Get all games the current user is a member of
  const gamesQ = query(collection(db, 'games'), where('members', 'array-contains', currentUid));
  const gamesSnap = await getDocs(gamesQ);
  const gameIds = gamesSnap.docs.map(d => d.id);

  if (gameIds.length === 0) return [];

  // Fetch all gamePlayers for those games (batched, Firestore 'in' max 30)
  const allGpDocs: GamePlayerDoc[] = [];
  for (let i = 0; i < gameIds.length; i += 30) {
    const batch = gameIds.slice(i, i + 30);
    const gpQ = query(collection(db, 'gamePlayers'), where('gameId', 'in', batch));
    const gpSnap = await getDocs(gpQ);
    allGpDocs.push(...gpSnap.docs.map(d => d.data() as GamePlayerDoc));
  }

  // Aggregate per uid (only linked players)
  const agg = new Map<string, { totalPnlCents: number; totalHands: number; sessions: number; wins: number }>();
  for (const gp of allGpDocs) {
    if (!gp.uid) continue;
    const prev = agg.get(gp.uid) ?? { totalPnlCents: 0, totalHands: 0, sessions: 0, wins: 0 };
    prev.totalPnlCents += gp.pnl;
    prev.totalHands += gp.handsPlayed;
    prev.sessions += 1;
    if (gp.pnl > 0) prev.wins += 1;
    agg.set(gp.uid, prev);
  }

  if (agg.size === 0) return [];

  // Fetch user profiles
  const uids = [...agg.keys()];
  const entries: LeaderboardEntry[] = [];

  for (let i = 0; i < uids.length; i += 30) {
    const batch = uids.slice(i, i + 30);
    const uq = query(collection(db, 'users'), where('__name__', 'in', batch));
    const uSnap = await getDocs(uq);
    for (const ud of uSnap.docs) {
      const profile = ud.data() as { displayName?: string; username?: string; photoURL?: string };
      const stats = agg.get(ud.id)!;
      entries.push({
        uid: ud.id,
        displayName: profile.displayName ?? 'Unknown',
        username: profile.username ?? '',
        photoURL: profile.photoURL ?? '',
        ...stats,
      });
    }
  }

  // Sort by PnL descending
  entries.sort((a, b) => b.totalPnlCents - a.totalPnlCents);
  return entries;
}

// ─── Batch-load all gamePlayers for given games ─────────────────────────

export async function getAllGamePlayers(gameIds: string[]): Promise<GamePlayerDoc[]> {
  if (gameIds.length === 0) return [];
  const allDocs: GamePlayerDoc[] = [];
  for (let i = 0; i < gameIds.length; i += 30) {
    const batch = gameIds.slice(i, i + 30);
    const gpQ = query(collection(db, 'gamePlayers'), where('gameId', 'in', batch));
    const gpSnap = await getDocs(gpQ);
    allDocs.push(...gpSnap.docs.map(d => d.data() as GamePlayerDoc));
  }
  return allDocs;
}

// ─── Batch-load user profiles by uid ────────────────────────────────────

export async function getUserProfiles(uids: string[]): Promise<Map<string, { displayName: string; username: string }>> {
  const map = new Map<string, { displayName: string; username: string }>();
  if (uids.length === 0) return map;
  for (let i = 0; i < uids.length; i += 30) {
    const batch = uids.slice(i, i + 30);
    const uq = query(collection(db, 'users'), where('__name__', 'in', batch));
    const uSnap = await getDocs(uq);
    for (const ud of uSnap.docs) {
      const data = ud.data() as { displayName?: string; username?: string };
      map.set(ud.id, {
        displayName: data.displayName ?? 'Unknown',
        username: data.username ?? '',
      });
    }
  }
  return map;
}

// ─── Check if game already saved ────────────────────────────────────────

export async function findExistingGame(uid: string, pokerNowGameId: string): Promise<string | null> {
  const q = query(
    collection(db, 'games'),
    where('members', 'array-contains', uid),
    where('pokerNowGameId', '==', pokerNowGameId),
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}
