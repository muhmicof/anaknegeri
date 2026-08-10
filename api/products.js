// api/products.js
// Single source of truth for product data, shared by every visitor and every device.
// Replaces the old localStorage-based getProducts()/saveProducts() in app.js.
//
// GET    /api/products            -> public, returns the product array
// POST   /api/products            -> admin only, adds a new product
// PUT    /api/products?id=3       -> admin only, updates a product
// DELETE /api/products?id=3       -> admin only, deletes a product
// POST   /api/products?action=reset -> admin only, resets to seed catalog

const { redis, requireAdmin, setCors } = require('../lib/kv');

const PRODUCTS_KEY = 'anak_negeri:products';

const seedProducts = [
    { id: 1, name: 'Keripik Ketela', price: 25000, category: 'keripik gurih', tag: 'Favorit', tagClass: '', image: 'images/keripik_ketela.jpg' },
    { id: 2, name: 'Keripik Pisang', price: 28000, category: 'keripik manis', tag: 'Best Seller', tagClass: 'tag-gold', image: 'images/keripik_pisang.jpg' },
    { id: 3, name: 'Keripik Talas', price: 30000, category: 'keripik gurih', tag: '', tagClass: '', image: 'images/keripik_talas.jpg' },
    { id: 4, name: 'Peyek Kacang', price: 22000, category: 'peyek gurih', tag: '', tagClass: '', image: 'images/peyek_kacang.jpg' },
    { id: 5, name: 'Kerupuk Bawang', price: 20000, category: 'gurih', tag: '', tagClass: '', image: 'images/kerupuk_bawang.jpg' }
];

async function getProducts() {
    const stored = await redis.get(PRODUCTS_KEY);
    if (Array.isArray(stored) && stored.length > 0) return stored;
    // First run ever: seed it so the store isn't empty.
    await redis.set(PRODUCTS_KEY, seedProducts);
    return seedProducts;
}

async function saveProducts(products) {
    await redis.set(PRODUCTS_KEY, products);
}

module.exports = async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            const products = await getProducts();
            return res.status(200).json(products);
        }

        // Everything below mutates data -> must be admin.
        if (!requireAdmin(req)) {
            return res.status(401).json({ error: 'Unauthorized. Silakan login ulang sebagai admin.' });
        }

        if (req.method === 'POST') {
            if (req.query.action === 'reset') {
                await saveProducts(seedProducts);
                return res.status(200).json(seedProducts);
            }

            const body = req.body || {};
            const { name, price, category, tag, image } = body;
            if (!name || typeof price !== 'number' || isNaN(price)) {
                return res.status(400).json({ error: 'Nama dan harga produk wajib diisi dengan benar.' });
            }

            const products = await getProducts();
            const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
            const newProduct = {
                id: newId,
                name: String(name).trim(),
                price: Math.round(price),
                category: category || 'gurih',
                tag: tag || '',
                tagClass: (tag || '').toLowerCase().includes('best') ? 'tag-gold' : '',
                image: image || 'images/hero_snack.jpg'
            };
            products.push(newProduct);
            await saveProducts(products);
            return res.status(201).json(newProduct);
        }

        if (req.method === 'PUT') {
            const id = parseInt(req.query.id, 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID produk tidak valid.' });

            const body = req.body || {};
            const products = await getProducts();
            const idx = products.findIndex(p => p.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

            const tag = body.tag !== undefined ? body.tag : products[idx].tag;
            products[idx] = {
                ...products[idx],
                name: body.name !== undefined ? String(body.name).trim() : products[idx].name,
                price: body.price !== undefined ? Math.round(Number(body.price)) : products[idx].price,
                category: body.category !== undefined ? body.category : products[idx].category,
                tag: tag,
                tagClass: (tag || '').toLowerCase().includes('best') ? 'tag-gold' : '',
                image: body.image !== undefined ? body.image : products[idx].image
            };

            await saveProducts(products);
            return res.status(200).json(products[idx]);
        }

        if (req.method === 'DELETE') {
            const id = parseInt(req.query.id, 10);
            if (isNaN(id)) return res.status(400).json({ error: 'ID produk tidak valid.' });

            const products = await getProducts();
            const exists = products.some(p => p.id === id);
            if (!exists) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

            const updated = products.filter(p => p.id !== id);
            await saveProducts(updated);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('products API error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
};