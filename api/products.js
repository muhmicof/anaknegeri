// api/products.js
// Product data lives in Supabase Postgres now (table: products).
// Same API contract as the Redis version — app.js on the frontend doesn't
// need to change at all.
//
// GET    /api/products              -> public, returns all products
// POST   /api/products              -> admin only, adds a new product
// PUT    /api/products?id=3         -> admin only, updates a product
// DELETE /api/products?id=3         -> admin only, deletes a product
// POST   /api/products?action=reset -> admin only, resets to seed catalog

const { supabase, requireAdmin, setCors } = require('../lib/db');

const seedProducts = [
    { name: 'Keripik Ketela', price: 25000, category: 'keripik gurih', tag: 'Favorit', tag_class: '', image: 'images/keripik_ketela.jpg' },
    { name: 'Keripik Pisang', price: 28000, category: 'keripik manis', tag: 'Best Seller', tag_class: 'tag-gold', image: 'images/keripik_pisang.jpg' },
    { name: 'Keripik Talas', price: 30000, category: 'keripik gurih', tag: '', tag_class: '', image: 'images/keripik_talas.jpg' },
    { name: 'Peyek Kacang', price: 22000, category: 'peyek gurih', tag: '', tag_class: '', image: 'images/peyek_kacang.jpg' },
    { name: 'Kerupuk Bawang', price: 20000, category: 'gurih', tag: '', tag_class: '', image: 'images/kerupuk_bawang.jpg' }
];

// Postgres column is tag_class (snake_case, Postgres convention), but the
// frontend expects tagClass (camelCase, JS convention). Convert at the
// boundary so app.js never has to know the database's naming style.
function toClientShape(row) {
    return {
        id: row.id,
        name: row.name,
        price: row.price,
        category: row.category,
        tag: row.tag,
        tagClass: row.tag_class,
        image: row.image
    };
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data.map(toClientShape));
        }

        if (!requireAdmin(req)) {
            return res.status(401).json({ error: 'Unauthorized. Silakan login ulang sebagai admin.' });
        }

        if (req.method === 'POST') {
            if (req.query.action === 'reset') {
                const { error: deleteError } = await supabase
                    .from('products')
                    .delete()
                    .gte('id', 0); // delete all rows
                if (deleteError) throw deleteError;

                const { data, error: insertError } = await supabase
                    .from('products')
                    .insert(seedProducts)
                    .select();
                if (insertError) throw insertError;

                return res.status(200).json(data.map(toClientShape));
            }

            const body = req.body || {};
            const { name, price, category, tag, image } = body;
            if (!name || typeof price !== 'number' || isNaN(price)) {
                return res.status(400).json({ error: 'Nama dan harga produk wajib diisi dengan benar.' });
            }

            const tagClass = (tag || '').toLowerCase().includes('best') ? 'tag-gold' : '';
            const { data, error } = await supabase
                .from('products')
                .insert({
                    name: String(name).trim(),
                    price: Math.round(price),
                    category: category || 'gurih',
                    tag: tag || '',
                    tag_class: tagClass,
                    image: image || 'images/hero_snack.jpg'
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json(toClientShape(data));
        }

        if (req.method === 'PUT') {
            const id = parseInt(req.query.id, 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID produk tidak valid.' });

            const body = req.body || {};
            const updates = {};
            if (body.name !== undefined) updates.name = String(body.name).trim();
            if (body.price !== undefined) updates.price = Math.round(Number(body.price));
            if (body.category !== undefined) updates.category = body.category;
            if (body.tag !== undefined) {
                updates.tag = body.tag;
                updates.tag_class = (body.tag || '').toLowerCase().includes('best') ? 'tag-gold' : '';
            }
            if (body.image !== undefined) updates.image = body.image;

            const { data, error } = await supabase
                .from('products')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === 'PGRST116') return res.status(404).json({ error: 'Produk tidak ditemukan.' });
                throw error;
            }
            return res.status(200).json(toClientShape(data));
        }

        if (req.method === 'DELETE') {
            const id = parseInt(req.query.id, 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID produk tidak valid.' });

            const { error, count } = await supabase
                .from('products')
                .delete({ count: 'exact' })
                .eq('id', id);

            if (error) throw error;
            if (count === 0) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('products API error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
};