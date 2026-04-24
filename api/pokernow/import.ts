import { FieldValue } from 'firebase-admin/firestore';
import { compressToUTF16 } from 'lz-string';
import { analyzeOverall } from '../../src/lib/analysis';
import type { PokerNowExport } from '../../src/lib/types';
import { adminDb } from '../_lib/firebaseAdmin';

type RequestLike = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => {
    json: (payload: unknown) => void;
    end: () => void;
  };
};

type ImportBody = {
  playerName?: string;
  data?: PokerNowExport;
};

function setCors(res: ResponseLike) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-import-key');
}

function badRequest(res: ResponseLike, error: string, extra: Record<string, unknown> = {}) {
  return res.status(400).json({ error, ...extra });
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function getParsedBody(body: unknown): ImportBody {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as ImportBody;
    } catch {
      return {};
    }
  }

  if (body && typeof body === 'object') {
    return body as ImportBody;
  }

  return {};
}

function looksLikeExport(data: unknown): data is PokerNowExport {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.playerId === 'string' &&
    typeof candidate.gameId === 'string' &&
    Array.isArray(candidate.hands)
  );
}

function getConfiguredImportUser() {
  const uid = process.env.POKERNOW_IMPORT_UID;
  const email = process.env.POKERNOW_IMPORT_EMAIL ?? '';

  if (!uid) {
    throw new Error('Missing POKERNOW_IMPORT_UID environment variable.');
  }

  return { uid, email };
}

async function findExistingGameIdByPokerNowGameId(pokerNowGameId: string, uploadedBy: string) {
  const snap = await adminDb
    .collection('games')
    .where('pokerNowGameId', '==', pokerNowGameId)
    .get();

  const existing = snap.docs.find((doc) => doc.data().uploadedBy === uploadedBy);
  return existing?.id ?? null;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const expectedImportKey = process.env.POKERNOW_IMPORT_KEY?.trim();
  const providedImportKey = String(req.headers['x-import-key'] ?? '').trim();
  if (expectedImportKey && providedImportKey !== expectedImportKey) {
    return res.status(401).json({ error: 'Invalid import key.' });
  }

  const body = getParsedBody(req.body);
  const playerName = String(body.playerName ?? '').trim();
  const data = body.data;

  if (!playerName) {
    return badRequest(res, 'Missing playerName.');
  }

  if (!looksLikeExport(data)) {
    return badRequest(res, 'Missing or invalid PokerNow export payload.');
  }

  if (!Array.isArray(data.hands) || data.hands.length === 0) {
    return badRequest(res, 'The export does not contain any hands.');
  }

  const overall = analyzeOverall(data);
  const matchedPlayer = overall.players.find(
    (player) => normalizeName(player.name) === normalizeName(playerName)
  );

  if (!matchedPlayer) {
    return badRequest(res, 'Player name was not found in this game.', {
      players: overall.players.map((player) => ({
        id: player.id,
        name: player.name,
      })),
    });
  }

  const { uid, email } = getConfiguredImportUser();
  const existingId = await findExistingGameIdByPokerNowGameId(data.gameId, uid);

  if (existingId) {
    return res.status(200).json({
      created: false,
      gameId: existingId,
      player: {
        id: matchedPlayer.id,
        name: matchedPlayer.name,
      },
    });
  }

  const gameRef = adminDb.collection('games').doc();
  const gameId = gameRef.id;
  const gameDate = data.hands.length > 0
    ? new Date(data.hands[0].startedAt).toISOString()
    : data.generatedAt;
  const rawData = compressToUTF16(JSON.stringify(data));

  const playerSummaries = overall.players.map((player) => ({
    pokerNowId: player.id,
    name: player.name,
    pnl: player.pnl,
    pnlBB: player.pnlBB,
    vpip: player.vpip,
    pfr: player.pfr,
    handsPlayed: player.handsPlayed,
  }));

  const batch = adminDb.batch();
  batch.set(gameRef, {
    uploadedBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    gameDate,
    pokerNowGameId: data.gameId,
    totalHands: overall.totalHands,
    bigBlind: overall.bigBlind,
    playerSummaries,
    members: [uid],
    memberEmails: email ? [email] : [],
    rawData,
  });

  for (const player of overall.players) {
    const gamePlayerRef = adminDb.collection('gamePlayers').doc(`${gameId}_${player.id}`);
    batch.set(gamePlayerRef, {
      gameId,
      pokerNowId: player.id,
      playerName: player.name,
      uid: player.id === matchedPlayer.id ? uid : null,
      pnl: player.pnl,
      pnlBB: player.pnlBB,
      vpip: player.vpip,
      pfr: player.pfr,
      handsPlayed: player.handsPlayed,
      bigBlind: overall.bigBlind,
      gameDate,
      uploadedBy: uid,
    });
  }

  await batch.commit();

  return res.status(201).json({
    created: true,
    gameId,
    player: {
      id: matchedPlayer.id,
      name: matchedPlayer.name,
    },
  });
}
