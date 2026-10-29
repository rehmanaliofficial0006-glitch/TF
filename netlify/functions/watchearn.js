// Netlify function: Watch & Earn (start / claim / cancel). No npm packages needed.
// Secrets (Netlify -> Site configuration -> Environment variables):
//   FIREBASE_CLIENT_EMAIL  and  FIREBASE_PRIVATE_KEY   (from a Firebase service-account key)
// Rewards are credited ONLY here; the browser never writes balances.
const crypto = require('crypto');

const DB = (process.env.FIREBASE_DB_URL || 'https://fftournament-4b000-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBppZ6uC1wpoSiwtfQt8Yh7rkUUfM7jZu8'; // public web key

class Fail extends Error { constructor(status, code, reason, extra) { super(reason); this.status = status; this.code = code; this.reason = reason; this.extra = extra || {}; } }
const fail = (status, code, reason, extra) => { throw new Fail(status, code, reason, extra); };

// ---------- Google auth for the Realtime Database REST API ----------
let tok = null, tokExp = 0;
async function accessToken() {
  if (tok && Date.now() < tokExp - 60000) return tok;
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  let key = process.env.FIREBASE_PRIVATE_KEY || '';
  if (!email || !key) fail(500, 'internal', 'SERVER_NOT_CONFIGURED');
  key = key.replace(/\\n/g, '\n').replace(/^"|"$/g, '');
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({ iss: email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig });
  const j = await r.json();
  if (!r.ok || !j.access_token) fail(500, 'internal', 'SERVER_AUTH_FAILED');
  tok = j.access_token; tokExp = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  return tok;
}
async function dbReq(method, path, body, headers) {
  const t = await accessToken();
  return fetch(`${DB}/${path}.json`, { method, headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
}
async function get(p) { const r = await dbReq('GET', p); if (!r.ok) throw new Error('db get ' + r.status); return r.json(); }
async function put(p, v) { const r = await dbReq('PUT', p, v); if (!r.ok) throw new Error('db put ' + r.status); }
async function patch(p, v) { const r = await dbReq('PATCH', p, v); if (!r.ok) throw new Error('db patch ' + r.status); }
async function push(p, v) { const r = await dbReq('POST', p, v); if (!r.ok) throw new Error('db push ' + r.status); return (await r.json()).name; }
// atomic read-modify-write using ETags; fn returns undefined to abort
async function tx(path, fn) {
  for (let i = 0; i < 12; i++) {
    const r = await dbReq('GET', path, undefined, { 'X-Firebase-ETag': 'true' });
    if (!r.ok) throw new Error('tx get ' + r.status);
    const etag = r.headers.get('etag'), cur = await r.json(), next = fn(cur);
    if (next === undefined) return { committed: false, value: cur };
    const w = await dbReq('PUT', path, next, { 'if-match': etag });
    if (w.ok) return { committed: true, value: next };
    if (w.status !== 412) throw new Error('tx put ' + w.status);
  }
  throw new Error('tx contention');
}

// ---------- helpers ----------
const dayKey = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10); // Asia/Karachi day
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const idOk = (x) => typeof x === 'string' && /^[-_A-Za-z0-9]{1,80}$/.test(x);
const urlOk = (u) => { try { const x = new URL(String(u || '').trim()); return (x.protocol === 'http:' || x.protocol === 'https:') && !x.username && !x.password; } catch (e) { return false; } };
const incInt = (p, n) => tx(p, (c) => (Number(c) || 0) + n);
const incMoney = (p, n) => tx(p, (c) => money((Number(c) || 0) + n));
const limitOf = (s) => (Number.isFinite(Number(s.dailyLimit)) ? Number(s.dailyLimit) : 10);

async function verifyUser(token) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  if (!r.ok) return null;
  const j = await r.json();
  return (j && j.users && j.users[0] && j.users[0].localId) || null;
}

async function cancelSession(uid, id, s, reason) {
  const r = await tx(`watchEarnSessions/${uid}/${id}/status`, (c) => (c === 'started' ? 'cancelled' : undefined));
  if (!r.committed) return false;
  await patch(`watchEarnSessions/${uid}/${id}`, { cancelledAt: Date.now(), cancelReason: String(reason || '').slice(0, 40) });
  await Promise.all([incInt('watchEarnStats/totals/cancelled', 1), incInt(`watchEarnStats/days/${dayKey()}/cancelled`, 1), s && s.adId ? incInt(`watchEarnStats/ads/${s.adId}/cancelled`, 1) : null].filter(Boolean)).catch(() => {});
  return true;
}

// ---------- actions ----------
async function start(uid, data) {
  const adId = data.adId;
  if (!idOk(adId)) fail(400, 'invalid-argument', 'AD_UNAVAILABLE');
  const [S0, ad, prof] = await Promise.all([get('watchEarnSettings'), get(`watchEarnAds/${adId}`), get(`users/${uid}/uid`)]);
  const S = S0 || {};
  if (S.enabled !== true) fail(400, 'failed-precondition', 'DISABLED');
  if (!prof) fail(400, 'failed-precondition', 'NO_PROFILE');
  if (!ad || ad.active !== true) fail(400, 'failed-precondition', 'AD_UNAVAILABLE');
  if (!urlOk(ad.url)) fail(400, 'failed-precondition', 'INVALID_URL');
  const limit = limitOf(S);
  const watched = Number(await get(`watchEarnDailyLimits/${uid}/${dayKey()}/count`)) || 0;
  if (watched >= limit) fail(429, 'resource-exhausted', 'LIMIT_REACHED');
  const reward = money(ad.reward === undefined || ad.reward === null ? S.defaultReward : ad.reward);
  const durationSec = Number(ad.duration) >= 1 ? Math.round(ad.duration) : (Number(S.durationSec) >= 1 ? Math.round(S.durationSec) : 10);
  if (!(reward > 0)) fail(400, 'failed-precondition', 'AD_UNAVAILABLE');
  const old = (await get(`watchEarnSessions/${uid}`)) || {};
  await Promise.all(Object.entries(old).filter(([, v]) => v && v.status === 'started').map(([k, v]) => cancelSession(uid, k, v, 'superseded')));
  const now = Date.now(), title = String(ad.title || 'Sponsored Ad').slice(0, 80), url = String(ad.url).trim();
  const sessionId = await push(`watchEarnSessions/${uid}`, { adId, title, url, reward, durationSec, status: 'started', startedAt: now, expiresAt: now + (durationSec + 600) * 1000 });
  await Promise.all([incInt(`watchEarnStats/ads/${adId}/started`, 1), incInt(`watchEarnStats/days/${dayKey()}/started`, 1)]).catch(() => {});
  return { sessionId, adId, title, adUrl: url, rewardPKR: reward, durationSec };
}

async function claim(uid, data) {
  const id = data.sessionId;
  if (!idOk(id)) fail(404, 'not-found', 'SESSION_NOT_FOUND');
  const sPath = `watchEarnSessions/${uid}/${id}`;
  const s = await get(sPath);
  if (!s) fail(404, 'not-found', 'SESSION_NOT_FOUND');
  if (s.status === 'claimed') fail(409, 'already-exists', 'DUPLICATE_CLAIM');
  if (s.status === 'claiming') fail(409, 'aborted', 'CLAIM_IN_PROGRESS');
  if (s.status !== 'started') fail(400, 'failed-precondition', 'SESSION_INVALID');
  const now = Date.now();
  if (now > Number(s.expiresAt)) { await put(sPath + '/status', 'expired'); fail(400, 'deadline-exceeded', 'SESSION_EXPIRED'); }
  const remainingMs = Number(s.startedAt) + Number(s.durationSec) * 1000 - now;
  if (remainingMs > 0) fail(400, 'failed-precondition', 'TOO_EARLY', { remainingMs });

  const lock = await tx(sPath + '/status', (c) => (c === 'started' ? 'claiming' : undefined));
  if (!lock.committed) fail(409, 'aborted', 'CLAIM_IN_PROGRESS');

  const S = (await get('watchEarnSettings')) || {};
  if (S.enabled !== true) { await put(sPath + '/status', 'started'); fail(400, 'failed-precondition', 'DISABLED'); }
  const limit = limitOf(S), d = dayKey(), reward = money(s.reward), dayPath = `watchEarnDailyLimits/${uid}/${d}`;
  let counted = false, paid = false, newBalance = 0, watchedToday = 0;
  try {
    const dl = await tx(dayPath, (c) => {
      const cur = c || { count: 0, earned: 0 };
      if ((Number(cur.count) || 0) >= limit) return;
      return { count: (Number(cur.count) || 0) + 1, earned: money((Number(cur.earned) || 0) + reward) };
    });
    if (!dl.committed) { await patch(sPath, { status: 'cancelled', cancelReason: 'limit' }); fail(429, 'resource-exhausted', 'LIMIT_REACHED'); }
    counted = true; watchedToday = Number(dl.value.count) || 1;
    const bal = await incMoney(`users/${uid}/balance`, reward);
    paid = true; newBalance = money(bal.value);
    await patch(sPath, { status: 'claimed', claimedAt: Date.now() });

    // bookkeeping (best effort — money is already credited and the session closed)
    try {
      const first = !((await get(`watchEarnUserStats/${uid}/totalAds`)) > 0), ts = Date.now();
      await Promise.all([
        push(`watchEarnHistory/${uid}`, { sessionId: id, adId: s.adId, adTitle: s.title, rewardPKR: reward, timestamp: ts }),
        push(`transactions/${uid}`, { type: 'watch_earn', amount: reward, description: `Watch & Earn: ${s.title}`, timestamp: ts, adId: s.adId }),
        push('watchEarnTransactions', { userId: uid, adId: s.adId, adTitle: s.title, rewardPKR: reward, status: 'completed', timestamp: ts }),
        incMoney(`watchEarnUserStats/${uid}/totalEarned`, reward), incInt(`watchEarnUserStats/${uid}/totalAds`, 1),
        incInt('watchEarnStats/totals/completed', 1), incMoney('watchEarnStats/totals/rewards', reward),
        first ? incInt('watchEarnStats/totals/users', 1) : null,
        incInt(`watchEarnStats/days/${d}/completed`, 1), incMoney(`watchEarnStats/days/${d}/rewards`, reward),
        incInt(`watchEarnStats/ads/${s.adId}/completed`, 1), incMoney(`watchEarnStats/ads/${s.adId}/rewards`, reward)
      ].filter(Boolean));
    } catch (e) { console.error('watch-earn bookkeeping failed', e); }
    return { rewardPKR: reward, newBalance, watchedToday, dailyLimit: limit, remainingToday: Math.max(0, limit - watchedToday) };
  } catch (e) {
    if (e instanceof Fail) throw e;
    console.error('claim failed', e);
    if (!paid) {
      if (counted) await tx(dayPath, (c) => (c ? { count: Math.max(0, (Number(c.count) || 1) - 1), earned: money(Math.max(0, (Number(c.earned) || 0) - reward)) } : c)).catch(() => {});
      await put(sPath + '/status', 'started').catch(() => {});
      fail(500, 'internal', 'PROCESSING_FAILED');
    }
    return { rewardPKR: reward, newBalance, watchedToday, dailyLimit: limit, remainingToday: Math.max(0, limit - watchedToday) };
  }
}

async function cancel(uid, data) {
  if (data.sessionId) {
    if (idOk(data.sessionId)) { const s = await get(`watchEarnSessions/${uid}/${data.sessionId}`); if (s) await cancelSession(uid, data.sessionId, s, data.reason); }
    return { ok: true };
  }
  const all = (await get(`watchEarnSessions/${uid}`)) || {};
  await Promise.all(Object.entries(all).filter(([, v]) => v && v.status === 'started').map(([k, v]) => cancelSession(uid, k, v, data.reason || 'page-load')));
  return { ok: true };
}

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
exports.handler = async (event) => {
  const out = (status, obj) => ({ statusCode: status, headers: H, body: JSON.stringify(obj) });
  try {
    if (event.httpMethod !== 'POST') return out(405, { ok: false, error: { code: 'failed-precondition', reason: 'POST_ONLY' } });
    const m = /^Bearer (.+)$/.exec((event.headers && (event.headers.authorization || event.headers.Authorization)) || '');
    if (!m) return out(401, { ok: false, error: { code: 'unauthenticated', reason: 'UNAUTHENTICATED' } });
    const uid = await verifyUser(m[1]);
    if (!uid) return out(401, { ok: false, error: { code: 'unauthenticated', reason: 'UNAUTHENTICATED' } });
    const body = JSON.parse(event.body || '{}');
    const fnMap = { start, claim, cancel };
    if (!fnMap[body.action]) return out(400, { ok: false, error: { code: 'invalid-argument', reason: 'BAD_ACTION' } });
    return out(200, { ok: true, data: await fnMap[body.action](uid, body) });
  } catch (e) {
    if (e instanceof Fail) return out(e.status, { ok: false, error: { code: e.code, reason: e.reason, extra: e.extra } });
    console.error('watchearn error', e);
    return out(500, { ok: false, error: { code: 'internal', reason: 'INTERNAL' } });
  }
};
