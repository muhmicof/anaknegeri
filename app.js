/* ==========================================================================
   ANAK NEGERI - INTERACTIVE JAVASCRIPT APPLICATION LOGIC & ADMIN STATE
   ========================================================================== */

// --- Default Seed Dataset ---
const seedProducts = [
    {
        id: 1,
        name: 'Keripik Ketela',
        price: 25000,
        category: 'keripik gurih',
        tag: 'Favorit',
        tagClass: '',
        image: 'images/keripik_ketela.jpg'
    },
    {
        id: 2,
        name: 'Keripik Pisang',
        price: 28000,
        category: 'keripik manis',
        tag: 'Best Seller',
        tagClass: 'tag-gold',
        image: 'images/keripik_pisang.jpg'
    },
    {
        id: 3,
        name: 'Keripik Talas',
        price: 30000,
        category: 'keripik gurih',
        tag: '',
        tagClass: '',
        image: 'images/keripik_talas.jpg'
    },
    {
        id: 4,
        name: 'Peyek Kacang',
        price: 22000,
        category: 'peyek gurih',
        tag: '',
        tagClass: '',
        image: 'images/peyek_kacang.jpg'
    },
    {
        id: 5,
        name: 'Kerupuk Bawang',
        price: 20000,
        category: 'gurih',
        tag: '',
        tagClass: '',
        image: 'images/kerupuk_bawang.jpg'
    }
];

// --- Product Repository Manager ---
function getProducts() {
    const stored = localStorage.getItem('anak_negeri_products');
    if (!stored) {
        localStorage.setItem('anak_negeri_products', JSON.stringify(seedProducts));
        return seedProducts;
    }
    try {
        return JSON.parse(stored);
    } catch (e) {
        return seedProducts;
    }
}

function saveProducts(products) {
    localStorage.setItem('anak_negeri_products', JSON.stringify(products));
}

// --- Visitor Counter System ---
async function renderVisitorStats() {
    const todayEl = document.getElementById('visitor-today-count');
    const totalEl = document.getElementById('visitor-total-count');
    if (!todayEl || !totalEl) return;

    try {
        const response = await fetch('visitor-counter.php?ts=' + Date.now(), {
            cache: 'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });

        if (!response.ok) {
            throw new Error('Request failed');
        }

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
    setInterval(renderVisitorStats, 5000);
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
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initFilterTabs();
    initCartDrawer();
    initScrollHeader();
    initVisitorStatsAutoRefresh();

    // Render Storefront if grid container exists
    if (document.getElementById('product-grid')) {
        renderStorefrontProducts('all');
    }

    // Render Admin Table & Check Auth if admin table exists
    if (document.getElementById('admin-product-tbody')) {
        checkAdminAuth();
    }
});

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

    const products = getProducts();

    const filtered = products.filter(p => {
        if (categoryFilter === 'all') return true;
        return p.category.includes(categoryFilter);
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
function addToCart(id) {
    const products = getProducts();
    const targetProduct = products.find(p => p.id === id);
    if (!targetProduct) return;

    const existingItem = cart.find(item => item.id === id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: targetProduct.id,
            name: targetProduct.name,
            price: targetProduct.price,
            image: targetProduct.image,
            quantity: 1
        });
    }

    updateCartUI();
    showToast(`"${targetProduct.name}" ditambahkan ke keranjang!`);
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

    if (cart.length === 0) {
        emptyCartView.style.display = 'flex';
        cartItemsList.innerHTML = '';
        cartSubtotalPrice.textContent = 'Rp 0';
    } else {
        emptyCartView.style.display = 'none';
        cartItemsList.innerHTML = cart.map(item => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='images/hero_snack.jpg'">
                <div class="cart-item-info">
                    <h4 class="cart-item-title">${item.name}</h4>
                    <p class="cart-item-price">${formatRupiah(item.price)}</p>
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
        `).join('');

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

const ADMIN_DEFAULT_PASSWORD = 'admin123';

function checkAdminAuth() {
    const loginOverlay = document.getElementById('admin-login-overlay');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';

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

function handleAdminLogin(event) {
    event.preventDefault();
    const pwdInput = document.getElementById('admin-password-input');
    const errorMsg = document.getElementById('login-error-msg');
    const loginCard = document.getElementById('admin-login-card');

    if (!pwdInput) return;

    const enteredPassword = pwdInput.value.trim();

    if (enteredPassword === ADMIN_DEFAULT_PASSWORD) {
        sessionStorage.setItem('admin_authenticated', 'true');
        if (errorMsg) errorMsg.classList.remove('active');
        pwdInput.value = '';
        checkAdminAuth();
        showToast('Berhasil masuk ke Admin Panel!');
    } else {
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
    sessionStorage.removeItem('admin_authenticated');
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

function renderAdminTable() {
    const tbody = document.getElementById('admin-product-tbody');
    if (!tbody) return;

    const products = getProducts();

    if (products.length === 0) {
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
        const products = getProducts();
        const product = products.find(p => p.id === id);
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

function saveProductFromForm(event) {
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

    let products = getProducts();

    if (idVal) {
        // Edit existing
        const id = parseInt(idVal, 10);
        products = products.map(p => {
            if (p.id === id) {
                return {
                    ...p,
                    name: name,
                    price: price,
                    category: category,
                    tag: tag,
                    tagClass: tag.toLowerCase().includes('best') ? 'tag-gold' : '',
                    image: image
                };
            }
            return p;
        });
        showToast(`Produk "${name}" berhasil diperbarui!`);
    } else {
        // Add new product
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        products.push({
            id: newId,
            name: name,
            price: price,
            category: category,
            tag: tag,
            tagClass: tag.toLowerCase().includes('best') ? 'tag-gold' : '',
            image: image
        });
        showToast(`Produk baru "${name}" berhasil ditambahkan!`);
    }

    saveProducts(products);
    closeProductModal();
    renderAdminTable();
}

function deleteProduct(id) {
    const products = getProducts();
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (confirm(`Apakah Anda yakin ingin menghapus "${product.name}"?`)) {
        const updated = products.filter(p => p.id !== id);
        saveProducts(updated);
        renderAdminTable();
        showToast(`Produk "${product.name}" telah dihapus.`);
    }
}

function resetDefaultCatalog() {
    if (confirm('Apakah Anda yakin ingin mengembalikan daftar produk ke data awal?')) {
        localStorage.setItem('anak_negeri_products', JSON.stringify(seedProducts));
        renderAdminTable();
        showToast('Katalog produk berhasil di-reset ke data bawaan.');
    }
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
        editFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const dataUrl = event.target.result;
                    if (editImgInput) editImgInput.value = dataUrl;
                    if (previewImg) previewImg.src = dataUrl;
                    showToast('Gambar berhasil diunggah & siap disimpan!');
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageUploadHandlers);
} else {
    initImageUploadHandlers();
}
