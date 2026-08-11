// api/visitor.js
// Calls the increment_visitor() Postgres function (defined in
// SUPABASE_SCHEMA.sql) which atomically bumps today's count and returns
// both today's and the all-time total in one round trip.
//
// GET /api/visitor -> { today, total }

const { supabase, setCors } = require('../lib/db');

function todayWIB() {
    const now = new Date();
    // WIB = UTC+7, so "today" resets at Indonesian midnight, not UTC midnight.
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const y = wib.getUTCFullYear();
    const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
    const d = String(wib.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { data, error } = await supabase.rpc('increment_visitor', {
            visit_day: todayWIB()
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        return res.status(200).json({
            today: row?.today_count || 0,
            total: row?.total_count || 0
        });
    } catch (err) {
        console.error('visitor API error:', err);
        return res.status(200).json({ today: 0, total: 0 });
    }
};