// api/visitor.js
// Replaces visitor-counter.php, which never worked on Vercel because Vercel
// does not run a PHP runtime. This does the same job (today count + total
// count) using Redis, atomically, shared across all visitors and devices.
//
// GET /api/visitor  -> increments counts once per call, returns { today, total }
//
// Note: this counts PAGE LOADS, not unique visitors (same as the old PHP
// script likely did). If you want unique-visitor counting later, that needs
// a cookie or IP-hash check before incrementing — ask if you want that added.

const { redis, setCors } = require('../lib/kv');

function todayKey() {
    const now = new Date();
    // Use WIB (UTC+7) so "today" resets at Indonesian midnight, not UTC midnight.
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const y = wib.getUTCFullYear();
    const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wib.getUTCDate()).padStart(2, '0');
    return `anak_negeri:visitors:${y}-${m}-${d}`;
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const dayKey = todayKey();
        const totalKey = 'anak_negeri:visitors:total';

        const [today, total] = await Promise.all([
            redis.incr(dayKey),
            redis.incr(totalKey)
        ]);

        // Let the daily counter key expire after 2 days so old day-keys don't
        // pile up forever in the database.
        await redis.expire(dayKey, 60 * 60 * 48);

        return res.status(200).json({ today, total });
    } catch (err) {
        console.error('visitor API error:', err);
        return res.status(200).json({ today: 0, total: 0 });
    }
};