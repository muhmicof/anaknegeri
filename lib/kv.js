// lib/kv.js
// Shared helpers used by every API route: Redis client + admin token verification.
// Lives outside api/ on purpose — Vercel only turns files inside api/ into
// routes, so this file is never exposed as an endpoint, just imported.

const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

// Upstash injects these automatically once you connect the integration
// in the Vercel dashboard (Storage tab). No manual copy-pasting needed.
const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN
});

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Diset langsung di sini atas permintaan — perhatikan: kalau repo ini PUBLIC
// di GitHub, siapa saja bisa baca secret ini dari source code, dan dengan
// secret ini orang bisa MEMALSUKAN token admin tanpa perlu tahu password
// sama sekali. Ini lebih sensitif daripada password itu sendiri.
const ADMIN_SECRET = '46773c3123f24b676f6b07f1c5851324fdef41fcfc8131cfcb0982be8ba6909a';

function signToken(payload) {
    const secret = ADMIN_SECRET;
    const data = `${payload}.${Date.now()}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return Buffer.from(`${data}.${sig}`).toString('base64url');
}

function verifyToken(token) {
    try {
        const secret = ADMIN_SECRET;
        if (!secret || !token) return false;

        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const parts = decoded.split('.');
        if (parts.length !== 3) return false;

        const [payload, ts, sig] = parts;
        const data = `${payload}.${ts}`;
        const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex');

        // timing-safe compare
        const sigBuf = Buffer.from(sig);
        const expectedBuf = Buffer.from(expectedSig);
        if (sigBuf.length !== expectedBuf.length) return false;
        if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

        const age = Date.now() - Number(ts);
        if (isNaN(age) || age > TOKEN_TTL_MS || age < 0) return false;

        return true;
    } catch (e) {
        return false;
    }
}

// Checks the Authorization: Bearer <token> header on write requests.
// Returns true/false. Route handlers should 401 if this is false.
function requireAdmin(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice('Bearer '.length);
    return verifyToken(token);
}

function setCors(res) {
    // Same-origin app, but harmless to allow — tighten if you ever split domains.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { redis, signToken, verifyToken, requireAdmin, setCors };