const crypto = require('crypto');

const COOKIE_NAME = 'guess_it_session';
const SESSION_TTL_DAYS = 30;

function env(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

function getSupabaseConfig() {
    const url = env('SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    return { url, serviceKey };
}

function getHeaders() {
    const { serviceKey } = getSupabaseConfig();
    return {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
    };
}

async function sb(path, options = {}) {
    const { url } = getSupabaseConfig();
    const res = await fetch(`${url}/rest/v1/${path}`, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers || {}) }
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
        const msg = json?.message || json?.error || text || `Supabase error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return json;
}

function normalizeUsername(raw) {
    return String(raw || '').trim().toLowerCase();
}

function validateUsername(username) {
    return /^[a-z0-9_]{3,15}$/.test(username);
}

function validatePassword(password) {
    return String(password || '').length >= 6;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored || '').split(':');
    if (!salt || !hash) return false;
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken() {
    return crypto.randomBytes(32).toString('hex');
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((part) => {
        const i = part.indexOf('=');
        if (i === -1) return;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        out[k] = decodeURIComponent(v);
    });
    return out;
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (_) { return {}; }
}

function setSessionCookie(res, token) {
    const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

async function findUserByUsername(username) {
    const rows = await sb(`app_users?username=eq.${encodeURIComponent(username)}&select=id,username,password_hash&limit=1`);
    return rows?.[0] || null;
}

async function createUser(username, password) {
    const passwordHash = hashPassword(password);
    const rows = await sb('app_users', {
        method: 'POST',
        body: JSON.stringify([{ username, password_hash: passwordHash }])
    });
    return rows?.[0] || null;
}

async function createSession(userId) {
    const token = randomToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await sb('app_sessions', {
        method: 'POST',
        body: JSON.stringify([{ user_id: userId, token_hash: tokenHash, expires_at: expiresAt }])
    });
    return { token, row: rows?.[0] || null };
}

async function getSessionUserFromRequest(req) {
    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const tokenHash = sha256(token);

    const rows = await sb(
        `app_sessions?token_hash=eq.${tokenHash}&select=id,user_id,expires_at,app_users(id,username)&limit=1`
    );
    const s = rows?.[0];
    if (!s) return null;
    if (new Date(s.expires_at).getTime() <= Date.now()) return null;
    return {
        sessionId: s.id,
        userId: s.user_id,
        username: s.app_users?.username || null
    };
}

async function deleteSessionByToken(token) {
    const tokenHash = sha256(token);
    await sb(`app_sessions?token_hash=eq.${tokenHash}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

module.exports = {
    normalizeUsername,
    validateUsername,
    validatePassword,
    readJsonBody,
    verifyPassword,
    parseCookies,
    setSessionCookie,
    clearSessionCookie,
    findUserByUsername,
    createUser,
    createSession,
    getSessionUserFromRequest,
    deleteSessionByToken
};
