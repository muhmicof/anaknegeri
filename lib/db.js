// lib/db.js
// Shared helpers used by every API route: Supabase client + admin token
// verification. Lives outside api/ on purpose — Vercel only turns files
// inside api/ into routes, so this file is never exposed as an endpoint.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// SUPABASE_SERVICE_ROLE_KEY has full read/write access and bypasses Row
// Level Security — that's correct here because these functions only ever
// run on the server (never shipped to the browser), same trust boundary
// as the old Redis token. Never put the service role key in client-side
// code.
//
// Fallback chain: the Vercel<->Supabase Marketplace integration injects
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY automatically.
// Since our schema doesn't enable Row Level Security, the anon key already
// has full read/write access, so it works fine here even though it's
// named for client-side use. If you manually add SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY later, those take priority.
const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function signToken(payload) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) throw new Error('ADMIN_SECRET env var is not set');
    const data = `${payload}.${Date.now()}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return Buffer.from(`${data}.${sig}`).toString('base64url');
}

function verifyToken(token) {
    try {
        const secret = process.env.ADMIN_SECRET;
        if (!secret || !token) return false;

        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const parts = decoded.split('.');
        if (parts.length !== 3) return false;

        const [payload, ts, sig] = parts;
        const data = `${payload}.${ts}`;
        const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex');

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

function requireAdmin(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice('Bearer '.length);
    return verifyToken(token);
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { supabase, signToken, verifyToken, requireAdmin, setCors };