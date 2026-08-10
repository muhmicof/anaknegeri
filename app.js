/* ==========================================================================
   ANAK NEGERI - INTERACTIVE JAVASCRIPT APPLICATION LOGIC & ADMIN STATE
   Rewritten: product data now lives server-side (Upstash Redis via /api),
   not in localStorage. This is what makes admin changes visible to every
   visitor, on every device, instead of only the browser the admin used.
   ========================================================================== */

// --- In-memory cache of the last-fetched product list ---
// Replaces localStorage as the "current data" holder. Refetched from the
// server after every mutation and on page load/visibility change.
let productsCache = [];

// --- Admin session token (replaces the old sessionStorage boolean flag) ---
// Issued by POST /api/admin-login after the server verifies the password.
// Sent as "Authorization: Bearer <token>" on every write request.
function getAdminToken() {
    return sessionStorage.getItem('admin_token');
}
function setAdminToken(token) {
    sessionStorage.setItem('admin_token', token);
}
function clearAdminToken() {
    sessionStorage.removeItem('admin_token');
}

// --- Product Repository: now thin wrappers around fetch() ---
async function fetchProducts() {
    try {
        const res = await fetch('/api/products', { cache: 'no-store' });
        if (!res.ok) throw new Error('Gagal memuat produk');
        productsCache = await res.json();
        return productsCache;
    } catch (e) {
        console.error('Gagal mengambil data produk dari server:', e);
        return productsCache; // fall back to whatever we last had
    }
}

// Synchronous accessor for code that renders from the cache without
// wanting to await a fetch every time (e.g. building cart line items).
function getCachedProducts() {
    return productsCache;
}

async function adminRequest(url, options = {}) {
    const token = getAdminToken();
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        // Token missing/expired — force re-login instead of failing silently.
        clearAdminToken();
        checkAdminAuth();
        throw new Error('Sesi admin berakhir, silakan login kembali.');
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Permintaan gagal.');
    }

    return res.status === 204 ? null : res.json();
}

// --- Visitor Counter System ---
async function renderVisitorStats() {
    const todayEl = document.getElementById('visitor-today-count');
    const totalEl = document.getElementById('visitor-total-count');
    if (!todayEl || !totalEl) return;

    try {
        const response = await fetch('/api/visitor?ts=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('Request failed');
        const data = await response.json();
        todayEl.textContent = Number(data.today || 0).toLocaleString('id-ID');
        totalEl.textContent = Number(data.total || 0).toLocaleString('id-ID');
    } catch (error) {
        todayEl.textContent = '0';
        totalEl.textContent = '0';
    }
}

function initVisitorStatsAutoRefresh() {
    if (!document.getElementById('visitor-today-count') || !document.getElementById('visitor-total-count')) return;
    renderVisitorStats();
    // Every visit still increments the counter (GET /api/visitor increments).
    // A repeating interval would inflate counts every 5s per open tab, so we
    // only refresh on load/focus now instead of polling.
    window.addEventListener('focus', renderVisitorStats);
}

// --- Application Shopping State ---
let cart = [];

// --- DOM Elements ---
const cartOverlay = document.getElementById('cart-overlay');
const cartDrawer = document.getElementById('cart-drawer');
const cartBadge = document.getElementById('cart-badge');
const cartItemsList = document.getElementById('cart-items-list');
const emptyCartView = document.getElementById('empty-cart-view');
const cartSubtotalPrice = document.getElementById('cart-subtotal-price');
const toastContainer = document.getElementById('toast-container');
const siteHeader = document.getElementById('site-header');
const mobileToggle = document.getElementById('mobile-toggle');
const navMenu = document.getElementById('nav-menu');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initFilterTabs();
    initCartDrawer();
    initScrollHeader();
    initVisitorStatsAutoRefresh();
    initCrossDeviceRefresh();

    await fetchProducts();

    if (document.getElementById('product-grid')) {
        renderStorefrontProducts('all');
    }

    if (document.getElementById('admin-product-tbody')) {
        checkAdminAuth();
    }
});

// --- Refresh product data periodically / on tab focus ---
// Since data is now server-side and shared, "cross-tab sync" is replaced by
// "refetch from server" — this is what actually makes admin edits visible
// on OTHER devices, which localStorage's 'storage' event could never do.
function initCrossDeviceRefresh() {
    async function refresh() {
        await fetchProducts();
        if (document.getElementById('product-grid')) {
            const activeTab = document.querySelector('.tab-btn.active');
            const category = activeTab ? activeTab.getAttribute('data-category') : 'all';
            renderStorefrontProducts(category);
        }
        if (document.getElementById('admin-product-tbody')) {
            renderAdminTable();
        }
    }

    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('focus', refresh);
    // Light polling so the public storefront picks up admin changes without
    // requiring a manual refresh. 30s is a reasonable balance for a small
    // catalog; lower it if you need near-real-time updates.
    setInterval(refresh, 30000);
}

// --- Scroll Header Effect ---
function initScrollHeader() {
    if (!siteHeader) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) {
            siteHeader.classList.add('scrolled');
        } else {
            siteHeader.classList.remove('scrolled');
        }
    });
}

// --- Mobile Navigation Menu ---
function initNavigation() {
    if (mobileToggle && navMenu) {
        mobileToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = mobileToggle.querySelector('i');
            if (navMenu.classList.contains('active')) {
                icon.className = 'fa-solid fa-xmark';
            } else {
                icon.className = 'fa-solid fa-bars';
            }
        });

        navMenu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                mobileToggle.querySelector('i').className = 'fa-solid fa-bars';
            });
        });
    }
}

// --- Storefront Dynamic Product Renderer ---
function renderStorefrontProducts(categoryFilter = 'all') {
    const productGrid = document.getElementById('product-grid');
    if (!productGrid) return;

    const products = getCachedProducts();

    const filtered = products.filter(p => {
        if (!p) return false;
        if (categoryFilter === 'all') return true;
        const categoryStr = p.category ? String(p.category).toLowerCase() : '';
        return categoryStr.includes(String(categoryFilter).toLowerCase());
    });

    if (filtered.length === 0) {
        productGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--color-text-muted);">
                <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 12px; display: block;"></i>
                <p>Tidak ada produk dalam kategori ini.</p>
            </div>
        `;
        return;
    }

    productGrid.innerHTML = filtered.map(p => `
        <div class="product-card" data-category="${p.category}" id="product-card-${p.id}">
            <div class="product-img-wrapper">
                <img src="${p.image}" alt="${p.name}" class="product-img" onerror="this.src='images/hero_snack.jpg'">
                ${p.tag ? `<span class="product-tag ${p.tagClass || ''}">${p.tag}</span>` : ''}
            </div>
            <div class="product-details">
                <h3 class="product-title">${p.name}</h3>
                <p class="product-price">${formatRupiah(p.price)}</p>
                <button class="btn btn-card-add" onclick="addToCart(${p.id})">
                    <i class="fa-solid fa-plus"></i> Tambah
                </button>
            </div>
        </div>
    `).join('');
}

// --- Product Category Filtering ---
function initFilterTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const category = button.getAttribute('data-category');
            renderStorefrontProducts(category);
        });
    });
}

// --- Cart Drawer System ---
function initCartDrawer() {
    const cartToggleBtn = document.getElementById('cart-toggle-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');

    if (cartToggleBtn) cartToggleBtn.addEventListener('click', openCart);
    if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
    if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
}

function openCart() {
    if (!cartOverlay || !cartDrawer) return;
    cartOverlay.classList.add('active');
    cartDrawer.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    if (!cartOverlay || !cartDrawer) return;
    cartOverlay.classList.remove('active');
    cartDrawer.classList.remove('active');
    document.body.style.overflow = '';
}

// --- Add To Cart Handler ---
function addToCart(id, name = null, price = null, image = null) {
    const products = getCachedProducts();
    const targetProduct = products.find(p => p && String(p.id) === String(id));

    const itemToAdd = targetProduct || {
        id: id,
        name: name || 'Produk',
        price: price || 0,
        image: image || 'images/hero_snack.jpg'
    };

    const existingItem = cart.find(item => item && String(item.id) === String(id));

    if (existingItem) {
        existingItem.quantity += 1;
        if (targetProduct) existingItem.image = targetProduct.image;
    } else {
        cart.push({
            id: itemToAdd.id,
            name: itemToAdd.name,
            price: itemToAdd.price,
            image: itemToAdd.image,
            quantity: 1
        });
    }

    updateCartUI();
    showToast(`"${itemToAdd.name}" ditambahkan ke keranjang!`);
}

// --- Remove From Cart Handler ---
function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    updateCartUI();
    showToast('Produk dihapus dari keranjang.');
}

// --- Update Item Quantity ---
function updateQuantity(id, delta) {
    const item = cart.find(item => item.id === id);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            removeFromCart(id);
        } else {
            updateCartUI();
        }
    }
}

// --- Render Cart UI ---
function updateCartUI() {
    if (!cartBadge || !cartItemsList || !cartSubtotalPrice || !emptyCartView) return;

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    cartBadge.textContent = totalItems;

    const products = getCachedProducts();

    if (cart.length === 0) {
        emptyCartView.style.display = 'flex';
        cartItemsList.innerHTML = '';
        cartSubtotalPrice.textContent = 'Rp 0';
    } else {
        emptyCartView.style.display = 'none';
        cartItemsList.innerHTML = cart.map(item => {
            const liveProd = products.find(p => p && String(p.id) === String(item.id));
            const itemImg = liveProd ? liveProd.image : item.image;
            const itemName = liveProd ? liveProd.name : item.name;
            const itemPrice = liveProd ? liveProd.price : item.price;
            return `
                <div class="cart-item">
                    <img src="${itemImg}" alt="${itemName}" class="cart-item-img" onerror="this.src='images/hero_snack.jpg'">
                    <div class="cart-item-info">
                        <h4 class="cart-item-title">${itemName}</h4>
                        <p class="cart-item-price">${formatRupiah(itemPrice)}</p>
                        <div class="cart-item-controls">
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <span class="qty-num">${item.quantity}</span>
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                    <button class="remove-item-btn" onclick="removeFromCart(${item.id})" aria-label="Hapus">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            `;
        }).join('');

        cartSubtotalPrice.textContent = formatRupiah(totalPrice);
    }
}

// --- Helper: Format Currency ---
function formatRupiah(number) {
    return 'Rp ' + Number(number).toLocaleString('id-ID');
}

// --- Toast Notification Handler ---
function showToast(message) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fa-solid fa-circle-check" style="color: var(--color-accent-gold);"></i>
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// --- Directions & Store Actions ---
function openDirections() {
    window.open('https://www.google.com/maps/place/Keripik+Anak+Negeri/@-6.720844,110.8846591,17z/data=!3m1!4b1!4m6!3m5!1s0x2e70dba22728c0e1:0x1caabf1dfff9f02c!8m2!3d-6.720844!4d110.8846591!16s%2Fg%2F11s4h3168v', '_blank');
}

// --- Checkout Handler ---
function handleCheckout() {
    if (cart.length === 0) {
        showToast('Keranjang Anda masih kosong.');
        return;
    }

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemList = cart.map(i => `- ${i.name} (${i.quantity}x) = ${formatRupiah(i.price * i.quantity)}`).join('%0A');

    const message = `Halo Anak Negeri! Saya ingin memesan kudapan berikut:%0A%0A${itemList}%0A%0ATotal Pembayaran: *${formatRupiah(total)}*%0A%0AMohon informasi kelanjutan pemesanannya. Terima kasih!`;

    window.open(`https://wa.me/6285701515879?text=${message}`, '_blank');
}

// ==========================================================================
// ADMIN AUTHENTICATION SYSTEM
// ==========================================================================
// Password is verified server-side now (see api/admin-login.js). The client
// only ever sees a short-lived signed token, never the real password.

function checkAdminAuth() {
    const loginOverlay = document.getElementById('admin-login-overlay');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const isAuthenticated = !!getAdminToken();

    if (isAuthenticated) {
        if (loginOverlay) loginOverlay.classList.remove('active');
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        renderAdminTable();
    } else {
        if (loginOverlay) {
            loginOverlay.classList.add('active');
            setTimeout(() => {
                const pwdInput = document.getElementById('admin-password-input');
                if (pwdInput) pwdInput.focus();
            }, 100);
        }
        if (logoutBtn) logoutBtn.style.display = 'none';
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const pwdInput = document.getElementById('admin-password-input');
    const errorMsg = document.getElementById('login-error-msg');
    const loginCard = document.getElementById('admin-login-card');

    if (!pwdInput) return;

    const enteredPassword = pwdInput.value.trim();

    try {
        const res = await fetch('/api/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: enteredPassword })
        });
        const data = await res.json();

        if (res.ok && data.token) {
            setAdminToken(data.token);
            if (errorMsg) errorMsg.classList.remove('active');
            pwdInput.value = '';
            checkAdminAuth();
            showToast('Berhasil masuk ke Admin Panel!');
            return;
        }

        throw new Error(data.error || 'Password salah.');
    } catch (err) {
        if (errorMsg) errorMsg.classList.add('active');
        if (loginCard) {
            loginCard.classList.remove('shake-anim');
            void loginCard.offsetWidth; // trigger reflow for animation restart
            loginCard.classList.add('shake-anim');
        }
        pwdInput.select();
    }
}

function handleAdminLogout() {
    clearAdminToken();
    showToast('Anda telah keluar dari Admin Panel.');
    checkAdminAuth();
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

// ==========================================================================
// ADMIN DASHBOARD FUNCTIONS
// ==========================================================================

async function renderAdminTable() {
    const tbody = document.getElementById('admin-product-tbody');
    if (!tbody) return;

    await fetchProducts();
    const products = getCachedProducts();

    if (!Array.isArray(products) || products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: var(--color-text-muted);">
                    Belum ada produk. Klik tombol "Tambah Produk Baru".
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = products.map(p => `
        <tr>
            <td>
                <img src="${p.image}" alt="${p.name}" class="admin-thumb" onerror="this.src='images/hero_snack.jpg'">
            </td>
            <td class="font-bold">${p.name}</td>
            <td><span class="admin-badge badge-cat">${p.category}</span></td>
            <td><span class="admin-badge badge-tag">${p.tag || '-'}</span></td>
            <td class="font-bold text-primary">${formatRupiah(p.price)}</td>
            <td>
                <div class="admin-actions">
                    <button class="btn-admin-icon edit" onclick="openEditModal(${p.id})" title="Edit Harga & Gambar">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button class="btn-admin-icon delete" onclick="deleteProduct(${p.id})" title="Hapus Produk">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openEditModal(id = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const modalTitle = document.getElementById('modal-title');

    if (!modal || !form) return;

    if (id !== null) {
        const products = getCachedProducts();
        const product = products.find(p => p && String(p.id) === String(id));
        if (!product) return;

        modalTitle.textContent = 'Edit Produk: ' + product.name;
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('edit-name').value = product.name;
        document.getElementById('edit-price').value = product.price;
        document.getElementById('edit-category').value = product.category;
        document.getElementById('edit-tag').value = product.tag || '';
        document.getElementById('edit-image').value = product.image;
        document.getElementById('preview-image').src = product.image;
    } else {
        modalTitle.textContent = 'Tambah Produk Baru';
        form.reset();
        document.getElementById('edit-product-id').value = '';
        document.getElementById('edit-image').value = 'images/hero_snack.jpg';
        document.getElementById('preview-image').src = 'images/hero_snack.jpg';
    }

    modal.classList.add('active');
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('active');
}

async function saveProductFromForm(event) {
    event.preventDefault();
    const idVal = document.getElementById('edit-product-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const price = parseInt(document.getElementById('edit-price').value, 10);
    const category = document.getElementById('edit-category').value;
    const tag = document.getElementById('edit-tag').value.trim();
    const image = document.getElementById('edit-image').value.trim();

    if (!name || isNaN(price)) {
        alert('Mohon isi nama dan harga produk dengan benar.');
        return;
    }

    const payload = { name, price, category, tag, image };

    try {
        if (idVal) {
            await adminRequest(`/api/products?id=${encodeURIComponent(idVal)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast(`Produk "${name}" berhasil diperbarui!`);
        } else {
            await adminRequest('/api/products', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast(`Produk baru "${name}" berhasil ditambahkan!`);
        }

        closeProductModal();
        await renderAdminTable();
    } catch (err) {
        alert(err.message || 'Gagal menyimpan produk. Coba lagi.');
    }
}

async function deleteProduct(id) {
    const products = getCachedProducts();
    const product = products.find(p => p && String(p.id) === String(id));
    if (!product) return;

    if (!confirm(`Apakah Anda yakin ingin menghapus "${product.name}"?`)) return;

    try {
        await adminRequest(`/api/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        await renderAdminTable();
        showToast(`Produk "${product.name}" telah dihapus.`);
    } catch (err) {
        alert(err.message || 'Gagal menghapus produk. Coba lagi.');
    }
}

async function resetDefaultCatalog() {
    if (!confirm('Apakah Anda yakin ingin mengembalikan daftar produk ke data awal?')) return;

    try {
        await adminRequest('/api/products?action=reset', { method: 'POST', body: '{}' });
        await renderAdminTable();
        showToast('Katalog produk berhasil di-reset ke data bawaan.');
    } catch (err) {
        alert(err.message || 'Gagal me-reset katalog. Coba lagi.');
    }
}

// --- Helper: Compress & Resize Image File before sending to server ---
// Still worth doing client-side: shrinks payload size before it goes over
// the network and into Redis. Long-term, swap this for real file upload to
// Vercel Blob Storage instead of storing base64 strings — ask if you want
// that wired up next; base64-in-Redis works but is not the efficient path.
function compressImageFile(file, maxDimension = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.onerror = function (err) {
                reject(err);
            };
            img.src = e.target.result;
        };
        reader.onerror = function (err) {
            reject(err);
        };
        reader.readAsDataURL(file);
    });
}

// Live Image URL Preview & File Upload Listener
function initImageUploadHandlers() {
    const editImgInput = document.getElementById('edit-image');
    const editFileInput = document.getElementById('edit-image-file');
    const previewImg = document.getElementById('preview-image');

    if (editImgInput) {
        editImgInput.addEventListener('input', (e) => {
            if (previewImg) previewImg.src = e.target.value;
        });
    }

    if (editFileInput) {
        editFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    showToast('Mengompres & memproses gambar...');
                    const dataUrl = await compressImageFile(file, 800, 0.8);
                    if (editImgInput) editImgInput.value = dataUrl;
                    if (previewImg) previewImg.src = dataUrl;
                    showToast('Gambar berhasil diunggah & dioptimalkan!');
                } catch (err) {
                    console.error('Error compression:', err);
                    const reader = new FileReader();
                    reader.onload = function (event) {
                        const dataUrl = event.target.result;
                        if (editImgInput) editImgInput.value = dataUrl;
                        if (previewImg) previewImg.src = dataUrl;
                        showToast('Gambar berhasil diunggah!');
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageUploadHandlers);
} else {
    initImageUploadHandlers();
}