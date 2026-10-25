/*
  /api/score — classifica del minigame dell'ape (Vercel Serverless Function, Node, zero dipendenze)

  GET  /api/score                      -> { enabled, top: [{ n, s }, ...] }   (top 10)
  POST /api/score {action:'start'}     -> { token }                           (a inizio partita)
  POST /api/score {action:'submit', name, score, token}
                                       -> { top, rank }                       (a fine partita)

  Storage: Upstash Redis (integrazione Vercel Marketplace, free tier). Le variabili d'ambiente
  vengono create dall'integrazione:  KV_REST_API_URL + KV_REST_API_TOKEN
  (oppure UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).

  Opzionali:
    NOTIFY_EMAIL    -> ti arriva una mail a ogni punteggio inserito
    RESEND_API_KEY  -> chiave di resend.com (necessaria per la mail)
    NOTIFY_FROM     -> mittente (default: "Bee <onboarding@resend.dev>")
    SCORE_SECRET    -> segreto per firmare i token (default: il token Redis)
*/
const crypto = require('crypto');

const GAME_MS = 20000;          // deve coincidere con GAME_MS in script.js
const MAX_SCORE = 100;          // oltre questo valore la partita non è plausibile
const TOKEN_MAX_AGE_S = 600;
const KEY = 'bee:lb';
const KEEP = 100;               // quante righe tenere in Redis (se ne mostrano 10)

function findEnv(suffixes, exclude = '') {
  for (const s of suffixes) {
    if (process.env[s]) return process.env[s];
  }
  const keys = Object.keys(process.env);
  for (const s of suffixes) {
    const match = keys.find(
      (k) => (k === s || k.endsWith(`_${s}`)) && (!exclude || !k.includes(exclude))
    );
    if (match && process.env[match]) return process.env[match];
  }
  return null;
}

const REDIS_URL = (
  process.env.leaderboard_KV_REST_API_URL ||
  findEnv(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'REDIS_REST_URL']) || ''
).replace(/\/+$/, '');

const REDIS_TOKEN =
  process.env.leaderboard_KV_REST_API_TOKEN ||
  findEnv(
    ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_REST_TOKEN'],
    'READ_ONLY'
  );

const SECRET = process.env.SCORE_SECRET || REDIS_TOKEN || 'bee-score-secret';


const BLOCKED = new Set([
  'ASS', 'SEX', 'FAG', 'KKK', 'NZI', 'CUM', 'TIT', 'FUC', 'DIO', 'CZZ', 'CUL', 'SSO', 'NIG', 'HIV', 'WTF'
]);

async function redis(commands) {
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map((o) => {
    if (o.error) throw new Error(o.error);
    return o.result;
  });
}

// [member, score, member, score, ...]  ->  [{ n, s }]
function parseTop(flat) {
  const rows = [];
  for (let i = 0; i < (flat || []).length; i += 2) {
    const n = String(flat[i]).split(':')[0];
    const s = Math.floor(Number(flat[i + 1]) / 1e10);
    rows.push({ n, s });
  }
  return rows;
}

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);

function makeToken() {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString('hex');
  return `${ts}.${nonce}.${sign(`${ts}.${nonce}`)}`;
}

function checkToken(token) {
  if (typeof token !== 'string') return null;
  const [ts, nonce, sig] = token.split('.');
  if (!ts || !nonce || !sig) return null;
  const good = sign(`${ts}.${nonce}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(ts);
  if (!(age >= GAME_MS / 1000 && age <= TOKEN_MAX_AGE_S)) return null; // la partita dura GAME_MS: prima è impossibile
  return nonce;
}

async function notify(name, score, rank) {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFY_EMAIL) return;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 3000);
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'Bee <onboarding@resend.dev>',
        to: [process.env.NOTIFY_EMAIL],
        subject: `bee score: ${name} ${score}`,
        text: `${name} ha fatto ${score} fiori (posizione ${rank + 1}).`
      })
    });
    clearTimeout(to);
  } catch (e) {
    /* la mail è un extra: non deve mai rompere il salvataggio */
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!REDIS_URL || !REDIS_TOKEN) {
    // storage non ancora collegato: il gioco funziona, la classifica resta spenta
    if (req.method === 'GET') return res.status(200).json({ enabled: false, top: [] });
    return res.status(503).json({ error: 'disabled' });
  }

  try {
    if (req.method === 'GET') {
      const [flat] = await redis([['ZREVRANGE', KEY, 0, 9, 'WITHSCORES']]);
      return res.status(200).json({ enabled: true, top: parseTop(flat) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    if (body.action === 'start') {
      return res.status(200).json({ token: makeToken() });
    }

    if (body.action === 'submit') {
      const name = String(body.name || '').toUpperCase();
      const score = Number(body.score);
      if (!/^[A-Z]{3}$/.test(name) || BLOCKED.has(name)) return res.status(400).json({ error: 'name' });
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return res.status(400).json({ error: 'score' });

      const nonce = checkToken(body.token);
      if (!nonce) return res.status(400).json({ error: 'token' });

      // il token vale una sola volta
      const [used] = await redis([['SET', `bee:used:${nonce}`, '1', 'NX', 'EX', String(TOKEN_MAX_AGE_S + 60)]]);
      if (used !== 'OK') return res.status(400).json({ error: 'token' });

      // a parità di punteggio sta sopra chi è arrivato prima
      const t = Math.floor(Date.now() / 1000) - 1.7e9;
      const composite = score * 1e10 + (1e10 - t);
      const member = `${name}:${crypto.randomBytes(5).toString('hex')}`;

      const [, , flat, rank] = await redis([
        ['ZADD', KEY, String(composite), member],
        ['ZREMRANGEBYRANK', KEY, 0, -(KEEP + 1)],
        ['ZREVRANGE', KEY, 0, 9, 'WITHSCORES'],
        ['ZREVRANK', KEY, member]
      ]);

      const r = typeof rank === 'number' && rank < 10 ? rank : -1;
      await notify(name, score, typeof rank === 'number' ? rank : 99);
      return res.status(200).json({ top: parseTop(flat), rank: r });
    }

    return res.status(400).json({ error: 'action' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
