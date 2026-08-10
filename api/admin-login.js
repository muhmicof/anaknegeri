// api/admin-login.js
// Verifies the admin password on the SERVER instead of in client-side JS.
// The old code had ADMIN_DEFAULT_PASSWORD = 'admin123' sitting in app.js,
// readable by anyone who opens DevTools. This fixes that: the real password
// lives only in a Vercel environment variable, never shipped to the browser.
//
// POST /api/admin-login  { password: "..." }  -> { token: "..." } | 401

const { signToken, setCors } = require('../lib/kv');

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { password } = req.body || {};
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
            console.error('ADMIN_PASSWORD env var is not set on the server.');
            return res.status(500).json({ error: 'Konfigurasi admin belum lengkap di server.' });
        }

        if (password === adminPassword) {
            const token = signToken('admin');
            return res.status(200).json({ token });
        }

        return res.status(401).json({ error: 'Password salah.' });
    } catch (err) {
        console.error('admin-login API error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
};