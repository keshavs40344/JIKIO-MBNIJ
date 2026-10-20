/**
 * VESPERA ATELIER — CLIENT APPLICATION (SPA)
 * Connects directly to Vespera Atelier REST v1 APIs.
 */

// Application State
const state = {
  activeView: 'storefront',
  categories: [],
  products: [],
  activeCategory: '',
  cart: [], // [{ variantId, quantity }]
  repricedCart: null,
  activeModalProduct: null,
  selectedVariant: null,
  adminToken: null,
  sellerToken: null,
  customerToken: null,
};

// ------------------- INITIALIZATION -------------------
document.addEventListener('DOMContentLoaded', async () => {
  await setupInitialTokens();
  await loadCategories();
  await loadProducts();
  await refreshCartDisplay();
});

async function setupInitialTokens() {
  // Setup demo customer session for seamless luxury discovery checkout
  try {
    const loginRes = await fetch('/api/v1/auth/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@royalty.local', password: 'BuyerPass2026!#' })
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      state.customerToken = data.data.accessToken;
    } else {
      // Auto-register demo customer
      const reg = await fetch('/api/v1/auth/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'buyer@royalty.local', password: 'BuyerPass2026!#' })
      });
      if (reg.ok) {
        const loginAgain = await fetch('/api/v1/auth/customer/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'buyer@royalty.local', password: 'BuyerPass2026!#' })
        });
        const d = await loginAgain.json();
        state.customerToken = d.data.accessToken;
      }
    }
  } catch (err) {
    console.error('Customer setup note:', err);
  }
}

// ------------------- CATEGORIES & DISCOVERY -------------------
async function loadCategories() {
  try {
    const res = await fetch('/api/v1/categories');
    const json = await res.json();
    if (json.success) {
      state.categories = json.data;
      renderCategoryTiles(json.data);
    }
  } catch (err) {
    console.error('Failed to load categories', err);
  }
}

function renderCategoryTiles(categories) {
  const container = document.getElementById('category-tiles-container');
  if (!container) return;

  container.innerHTML = categories.map(cat => `
    <div class="category-card" onclick="filterByCategory('${cat.id}')">
      <h4>${cat.name}</h4>
      <p>${cat.description}</p>
    </div>
  `).join('');
}

async function loadProducts(filterParams = {}) {
  try {
    const query = new URLSearchParams(filterParams).toString();
    const res = await fetch(`/api/v1/products${query ? '?' + query : ''}`);
    const json = await res.json();
    if (json.success) {
      state.products = json.data;
      renderProductCards(json.data);
      const countDisplay = document.getElementById('product-count-display');
      if (countDisplay) {
        countDisplay.textContent = `Showing ${json.count} verified luxury creations`;
      }
    }
  } catch (err) {
    console.error('Failed to load products', err);
  }
}

function renderProductCards(products) {
  const container = document.getElementById('product-grid-container');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #fff; border: 1px solid var(--color-border);">
        <h4 style="font-size: 1.4rem; margin-bottom: 8px;">No garments matched your criteria</h4>
        <p style="font-size: 0.85rem; color: var(--color-ink-muted); margin-bottom: 18px;">Try clearing specific fabric or occasion filters to explore the full collection.</p>
        <button class="btn btn-outline btn-sm" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(item => {
    const prod = item.product;
    const lowestPrice = Math.min(...item.variants.map(v => v.price));
    const highestMrp = Math.max(...item.variants.map(v => v.mrp));
    const imgUrl = prod.images[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c';

    return `
      <div class="product-card" onclick="openProductModal('${prod.slug}')">
        <div class="product-image-wrap">
          <img src="${imgUrl}" alt="${prod.title}" loading="lazy">
          <div class="product-badge-strip">
            <span class="badge-tag">${prod.occasion}</span>
            <span class="badge-tag" style="color: var(--color-crimson);">${prod.fabricMaterial}</span>
          </div>
        </div>
        <div class="product-info">
          <span class="product-seller">${item.sellerStoreName}</span>
          <h4 class="product-title font-serif">${prod.title}</h4>
          <p class="product-attributes">${prod.fit} • ${item.variants.length} Variants Available</p>
          <div class="product-price-row">
            <div>
              <span class="price-main">₹${lowestPrice.toLocaleString('en-IN')}</span>
              ${highestMrp > lowestPrice ? `<span class="mrp-strike">₹${highestMrp.toLocaleString('en-IN')}</span>` : ''}
            </div>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openProductModal('${prod.slug}')">Inspect</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ------------------- FILTERS & SEARCH -------------------
function applyFilters() {
  const fabric = document.getElementById('filter-fabric').value;
  const occasion = document.getElementById('filter-occasion').value;
  const sort = document.getElementById('filter-sort').value;
  const q = document.getElementById('filter-search').value.trim();

  const params = {};
  if (state.activeCategory) params.categoryId = state.activeCategory;
  if (fabric) params.fabric = fabric;
  if (occasion) params.occasion = occasion;
  if (sort) params.sort = sort;
  if (q) params.q = q;

  loadProducts(params);
}

let searchDebounceTimeout = null;
function handleSearchInput(e) {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
}

function filterByCategory(categoryId) {
  state.activeCategory = categoryId;
  applyFilters();
  scrollToDiscovery();
}

function resetFilters() {
  state.activeCategory = '';
  document.getElementById('filter-fabric').value = '';
  document.getElementById('filter-occasion').value = '';
  document.getElementById('filter-sort').value = 'newest';
  document.getElementById('filter-search').value = '';
  loadProducts();
}

function scrollToDiscovery() {
  const el = document.getElementById('discovery-section');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ------------------- PRODUCT MODAL & VARIANT SELECTOR -------------------
async function openProductModal(slug) {
  try {
    const res = await fetch(`/api/v1/products/${slug}`);
    const json = await res.json();
    if (!json.success) return;

    const data = json.data;
    state.activeModalProduct = data;
    state.selectedVariant = data.variants[0];

    document.getElementById('modal-product-img').src = data.product.images[0] || '';
    document.getElementById('modal-product-seller').textContent = data.sellerStoreName;
    document.getElementById('modal-product-title').textContent = data.product.title;
    document.getElementById('modal-product-desc').textContent = data.product.description;
    document.getElementById('modal-product-price').textContent = `₹${state.selectedVariant.price.toLocaleString('en-IN')}`;
    document.getElementById('modal-product-fabric').textContent = data.product.fabricMaterial;
    document.getElementById('modal-product-occasion').textContent = data.product.occasion;
    document.getElementById('modal-product-care').textContent = data.product.careInstructions;

    // Render Color Options
    const colorsContainer = document.getElementById('modal-colors-container');
    const uniqueColors = [...new Set(data.variants.map(v => v.colorName))];
    colorsContainer.innerHTML = uniqueColors.map(c => `
      <span class="badge-tag" style="cursor: pointer; border: 1px solid var(--color-border); padding: 5px 12px;">${c}</span>
    `).join('');

    // Render Size Options
    renderSizeOptions(data.variants);

    document.getElementById('product-modal').classList.add('active');
  } catch (err) {
    console.error('Error opening product modal', err);
  }
}

function renderSizeOptions(variants) {
  const container = document.getElementById('modal-sizes-container');
  container.innerHTML = variants.map(v => {
    const isSelected = state.selectedVariant && state.selectedVariant.id === v.id;
    return `
      <button class="portal-badge ${isSelected ? 'current' : ''}" onclick="selectModalVariant('${v.id}')">
        ${v.sizeName} (${v.availableStock > 0 ? 'In Stock' : 'Out of Stock'})
      </button>
    `;
  }).join('');
}

function selectModalVariant(variantId) {
  if (!state.activeModalProduct) return;
  const v = state.activeModalProduct.variants.find(item => item.id === variantId);
  if (v) {
    state.selectedVariant = v;
    document.getElementById('modal-product-price').textContent = `₹${v.price.toLocaleString('en-IN')}`;
    renderSizeOptions(state.activeModalProduct.variants);
  }
}

function toggleSizeGuide() {
  const guide = document.getElementById('size-guide-box');
  if (guide) {
    guide.style.display = guide.style.display === 'none' ? 'block' : 'none';
  }
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

// ------------------- CART ENGINE (SERVER REPRICED) -------------------
function addCurrentModalToBag() {
  if (!state.selectedVariant) return;

  const existing = state.cart.find(it => it.variantId === state.selectedVariant.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ variantId: state.selectedVariant.id, quantity: 1 });
  }

  closeProductModal();
  refreshCartDisplay();
  openCartDrawer();
}

async function refreshCartDisplay() {
  const countEl = document.getElementById('cart-count');
  const totalItems = state.cart.reduce((sum, it) => sum + it.quantity, 0);
  if (countEl) countEl.textContent = totalItems.toString();

  if (state.cart.length === 0) {
    renderEmptyCart();
    return;
  }

  // Call server-side authoritative repricing
  try {
    const res = await fetch('/api/v1/cart/reprice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: state.cart })
    });
    const json = await res.json();
    if (json.success) {
      state.repricedCart = json.data;
      renderRepricedCart(json.data);
    }
  } catch (err) {
    console.error('Cart repricing failed', err);
  }
}

function renderEmptyCart() {
  const list = document.getElementById('cart-items-list');
  if (list) {
    list.innerHTML = `
      <div style="text-align: center; padding: 48px 16px; color: var(--color-ink-muted);">
        <p style="font-size: 1rem; margin-bottom: 12px;">Your bespoke bag is currently empty.</p>
        <button class="btn btn-outline btn-sm" onclick="closeCartDrawer()">Continue Discovery</button>
      </div>
    `;
  }
  document.getElementById('cart-subtotal').textContent = '₹0';
  document.getElementById('cart-tax').textContent = '₹0';
  document.getElementById('cart-shipping').textContent = 'Complimentary';
  document.getElementById('cart-total').textContent = '₹0';
}

function renderRepricedCart(cartData) {
  const list = document.getElementById('cart-items-list');
  if (!list) return;

  list.innerHTML = cartData.items.map(it => `
    <div style="display: flex; gap: 14px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border-subtle);">
      <img src="${it.imageUrl || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c'}" style="width: 70px; height: 93px; object-fit: cover; border-radius: var(--radius-xs);">
      <div style="flex-grow: 1;">
        <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--color-champagne); font-weight: 600;">${it.sellerStoreName}</span>
        <h4 style="font-size: 1rem; line-height: 1.2;">${it.productTitle}</h4>
        <p style="font-size: 0.78rem; color: var(--color-ink-muted);">${it.colorName} • Size: ${it.sizeName}</p>
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px;">
          <span style="font-weight: 600; font-size: 0.95rem;">₹${it.lineTotal.toLocaleString('en-IN')}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-outline btn-sm" style="padding: 2px 8px;" onclick="changeCartQty('${it.variantId}', -1)">-</button>
            <span style="font-size: 0.85rem;">${it.quantity}</span>
            <button class="btn btn-outline btn-sm" style="padding: 2px 8px;" onclick="changeCartQty('${it.variantId}', 1)">+</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  document.getElementById('cart-subtotal').textContent = `₹${cartData.subtotal.toLocaleString('en-IN')}`;
  document.getElementById('cart-tax').textContent = `₹${cartData.taxAmount.toLocaleString('en-IN')}`;
  document.getElementById('cart-shipping').textContent = cartData.shippingFee === 0 ? 'Complimentary' : `₹${cartData.shippingFee}`;
  document.getElementById('cart-total').textContent = `₹${cartData.totalAmount.toLocaleString('en-IN')}`;
}

function changeCartQty(variantId, delta) {
  const item = state.cart.find(it => it.variantId === variantId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter(it => it.variantId !== variantId);
  }
  refreshCartDisplay();
}

function openCartDrawer() {
  document.getElementById('cart-drawer-backdrop').classList.add('active');
  document.getElementById('cart-drawer').classList.add('active');
}

function closeCartDrawer() {
  document.getElementById('cart-drawer-backdrop').classList.remove('active');
  document.getElementById('cart-drawer').classList.remove('active');
}

// ------------------- CHECKOUT MODAL -------------------
function openCheckoutModal() {
  closeCartDrawer();
  if (state.cart.length === 0) {
    alert('Your shopping bag is empty.');
    return;
  }
  document.getElementById('checkout-modal').classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('active');
}

async function executeCheckoutOrder() {
  const recipientName = document.getElementById('chk-name').value;
  const street = document.getElementById('chk-street').value;
  const city = document.getElementById('chk-city').value;
  const postalCode = document.getElementById('chk-pin').value;
  const phone = document.getElementById('chk-phone').value;

  const payload = {
    items: state.cart,
    shippingAddress: {
      recipientName,
      street,
      city,
      state: 'Rajasthan',
      postalCode,
      country: 'India',
      phone
    }
  };

  try {
    const res = await fetch('/api/v1/checkout/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      closeCheckoutModal();
      state.cart = [];
      refreshCartDisplay();

      const order = json.data;
      alert(`Bespoke Order Confirmed!\nOrder Reference: ${order.orderNumber}\nTotal Amount: ₹${order.totalAmount.toLocaleString('en-IN')}\n\nSplitted into ${order.subOrders.length} vendor fulfilment package(s).`);
    } else {
      alert(`Checkout failed: ${json.error.message}`);
    }
  } catch (err) {
    console.error('Checkout error', err);
    alert('An error occurred during order execution.');
  }
}

// ------------------- VIEW SWITCHER -------------------
function switchView(viewName) {
  state.activeView = viewName;

  document.querySelectorAll('.portal-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.portal-badge').forEach(el => el.classList.remove('current'));

  const viewEl = document.getElementById(`view-${viewName}`);
  const badgeEl = document.getElementById(`badge-${viewName}`);

  if (viewEl) viewEl.classList.add('active');
  if (badgeEl) badgeEl.classList.add('current');

  if (viewName === 'seller') {
    initSellerWorkspace();
  } else if (viewName === 'admin') {
    initAdminConsole();
  }
}

// ------------------- SELLER WORKSPACE -------------------
async function initSellerWorkspace() {
  // Login as demo verified weaver
  if (!state.sellerToken) {
    try {
      const res = await fetch('/api/v1/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'weaver@banaras.local', password: 'WeaverPass2026!#' })
      });
      if (res.ok) {
        const json = await res.json();
        state.sellerToken = json.data.accessToken;
      }
    } catch {}
  }

  loadSellerOrders();
  loadSellerCatalog();
  loadSellerSettlements();
}

function switchSellerTab(tabName) {
  document.querySelectorAll('.seller-sub-tab').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`seller-tab-${tabName}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('#view-seller .tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}

async function loadSellerOrders() {
  if (!state.sellerToken) return;
  try {
    const res = await fetch('/api/v1/seller/orders', {
      headers: { 'Authorization': `Bearer ${state.sellerToken}` }
    });
    const json = await res.json();
    if (json.success) {
      renderSellerOrdersTable(json.data);
    }
  } catch (err) {
    console.error('Error loading seller orders', err);
  }
}

function renderSellerOrdersTable(orders) {
  const tbody = document.getElementById('seller-orders-tbody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-ink-muted);">No assigned sub-orders yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(ord => `
    <tr>
      <td><strong>${ord.subOrderNumber}</strong></td>
      <td>${new Date(ord.createdAt).toLocaleDateString()}</td>
      <td>${ord.items.map(i => `${i.productName} (${i.size}) × ${i.quantity}`).join(', ')}</td>
      <td>₹${ord.subtotal.toLocaleString('en-IN')}</td>
      <td>₹${ord.commissionAmount.toLocaleString('en-IN')}</td>
      <td style="color: var(--color-forest); font-weight: 600;">₹${ord.netSellerAmount.toLocaleString('en-IN')}</td>
      <td><span class="status-pill status-${ord.status.toLowerCase()}">${ord.status}</span></td>
      <td>
        ${ord.status === 'PLACED' ? `
          <button class="btn btn-outline btn-sm" onclick="dispatchSubOrder('${ord.id}')">Dispatch</button>
        ` : ord.carrierName ? `${ord.carrierName}: ${ord.trackingNumber}` : '—'}
      </td>
    </tr>
  `).join('');
}

async function dispatchSubOrder(subOrderId) {
  const tracking = prompt('Enter Courier Tracking Number:', `BD${Math.floor(100000000 + Math.random() * 900000000)}IN`);
  if (!tracking) return;

  try {
    const res = await fetch(`/api/v1/seller/orders/${subOrderId}/fulfill`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.sellerToken}`
      },
      body: JSON.stringify({
        status: 'DISPATCHED',
        carrierName: 'BlueDart Express',
        trackingNumber: tracking
      })
    });

    if (res.ok) {
      alert('Package marked as Dispatched with tracking credentials.');
      loadSellerOrders();
    }
  } catch (err) {
    alert('Error updating dispatch status.');
  }
}

async function loadSellerCatalog() {
  // Load products belonging to current seller
  const tbody = document.getElementById('seller-catalog-tbody');
  if (!tbody) return;

  // Render current known catalog
  tbody.innerHTML = state.products.map(item => `
    <tr>
      <td><strong>${item.product.title}</strong></td>
      <td>${item.product.fabricMaterial}</td>
      <td>${item.product.occasion}</td>
      <td>${item.variants.map(v => `${v.sizeName} (₹${v.price} • ${v.availableStock} in stock)`).join('<br>')}</td>
      <td><span class="status-pill status-approved">APPROVED</span></td>
    </tr>
  `).join('');
}

async function loadSellerSettlements() {
  if (!state.sellerToken) return;
  try {
    const res = await fetch('/api/v1/seller/settlements', {
      headers: { 'Authorization': `Bearer ${state.sellerToken}` }
    });
    const json = await res.json();
    if (json.success) {
      document.getElementById('seller-balance-display').textContent = `₹${json.data.currentBalance.toLocaleString('en-IN')}`;
      renderSellerLedgerTable(json.data.entries);
    }
  } catch (err) {
    console.error('Error loading settlements', err);
  }
}

function renderSellerLedgerTable(entries) {
  const tbody = document.getElementById('seller-ledger-tbody');
  if (!tbody) return;

  tbody.innerHTML = entries.map(e => `
    <tr>
      <td>${new Date(e.createdAt).toLocaleString()}</td>
      <td><strong>${e.entryType}</strong></td>
      <td>${e.referenceNote}</td>
      <td style="color: var(--color-forest); font-weight: 600;">₹${e.amount.toLocaleString('en-IN')}</td>
      <td><span class="status-pill status-approved">${e.status}</span></td>
    </tr>
  `).join('');
}

function toggleAddProductForm() {
  const form = document.getElementById('add-product-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitNewProduct() {
  const title = document.getElementById('new-prod-title').value;
  const categoryId = document.getElementById('new-prod-cat').value;
  const fabric = document.getElementById('new-prod-fabric').value;
  const occasion = document.getElementById('new-prod-occasion').value;
  const price = Number(document.getElementById('new-prod-price').value);
  const stock = Number(document.getElementById('new-prod-stock').value);

  if (!title || !price || !stock) {
    alert('Please complete all garment details.');
    return;
  }

  const payload = {
    title,
    categoryId,
    description: `Artisanal creation handcrafted in ${fabric} for ${occasion}.`,
    fabricMaterial: fabric,
    occasion,
    fit: 'Classic Tailored Fit',
    careInstructions: 'Dry clean only',
    brandClaim: 'Banaras Loom Verified',
    variants: [
      {
        sku: `SKU-${Date.now().toString().slice(-6)}`,
        colorName: 'Royal Hue',
        colorHex: '#8A252C',
        sizeName: 'M',
        mrp: Math.round(price * 1.25),
        price,
        availableStock: stock,
        reservedStock: 0
      }
    ]
  };

  try {
    const res = await fetch('/api/v1/seller/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.sellerToken}`
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('Garment submitted successfully! It has entered the Super Admin product authenticity moderation queue.');
      toggleAddProductForm();
      loadProducts();
    } else {
      const err = await res.json();
      alert(`Submission rejected: ${err.error.message}`);
    }
  } catch (err) {
    alert('Error submitting garment.');
  }
}

async function submitSellerOnboarding() {
  const storeName = document.getElementById('onboard-store-name').value;
  const businessGstin = document.getElementById('onboard-gstin').value;
  const businessPan = document.getElementById('onboard-pan').value;
  const registeredAddress = document.getElementById('onboard-address').value;

  try {
    const res = await fetch('/api/v1/seller/onboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify({ storeName, businessGstin, businessPan, registeredAddress })
    });

    if (res.ok) {
      alert('Seller onboarding application submitted! Awaiting Super Admin authenticity verification.');
    } else {
      const err = await res.json();
      alert(`Error: ${err.error.message}`);
    }
  } catch {
    alert('Failed to submit application.');
  }
}

// ------------------- PLATFORM OWNER / SUPER ADMIN -------------------
async function initAdminConsole() {
  if (state.adminToken) {
    document.getElementById('admin-login-box').style.display = 'none';
    document.getElementById('admin-dashboard-content').style.display = 'block';
    loadAdminStats();
    loadAdminSellers();
    loadAdminModeration();
    loadAdminAudit();
  } else {
    document.getElementById('admin-login-box').style.display = 'block';
    document.getElementById('admin-dashboard-content').style.display = 'none';
  }
}

async function loginAdmin() {
  const email = document.getElementById('admin-login-email').value;
  const password = document.getElementById('admin-login-pass').value;
  const totpCode = document.getElementById('admin-login-totp').value;

  try {
    const res = await fetch('/api/v1/auth/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totpCode })
    });

    const json = await res.json();
    if (json.success) {
      state.adminToken = json.data.accessToken;
      initAdminConsole();
    } else {
      alert(`Admin MFA login failed: ${json.error.message}`);
    }
  } catch (err) {
    alert('Admin authentication failed.');
  }
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-sub-tab').forEach(el => el.style.display = 'none');
  const target = document.getElementById(`admin-tab-${tabName}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('#view-admin .tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/v1/admin/stats', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });
    const json = await res.json();
    if (json.success) {
      document.getElementById('kpi-sellers').textContent = json.data.totalSellers;
      document.getElementById('kpi-pending-sellers').textContent = json.data.pendingSellerVerifications;
      document.getElementById('kpi-products').textContent = json.data.approvedProductsCount;
      document.getElementById('kpi-pending-prods').textContent = json.data.pendingProductModerations;
    }
  } catch (err) {
    console.error('Error loading stats', err);
  }
}

async function loadAdminSellers() {
  try {
    const res = await fetch('/api/v1/admin/sellers', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });
    const json = await res.json();
    if (json.success) {
      const tbody = document.getElementById('admin-sellers-tbody');
      tbody.innerHTML = json.data.map(s => `
        <tr>
          <td><strong>${s.storeName}</strong></td>
          <td>${s.businessGstin || '—'}</td>
          <td>${s.businessPan || '—'}</td>
          <td>${s.registeredAddress || '—'}</td>
          <td><span class="status-pill status-${s.verificationStatus.toLowerCase()}">${s.verificationStatus}</span></td>
          <td>
            ${s.verificationStatus !== 'APPROVED' ? `
              <button class="btn btn-primary btn-sm" onclick="decideSeller('${s.id}', 'APPROVED')">Approve</button>
              <button class="btn btn-outline btn-sm" onclick="decideSeller('${s.id}', 'REJECTED')">Reject</button>
            ` : 'Verified'}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading admin sellers', err);
  }
}

async function decideSeller(sellerId, status) {
  const reason = prompt(`Enter recorded audit reason for ${status}:`, 'Business registration verified.');
  if (!reason) return;

  try {
    const res = await fetch(`/api/v1/admin/sellers/${sellerId}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.adminToken}`
      },
      body: JSON.stringify({ status, reason })
    });

    if (res.ok) {
      alert(`Seller application marked as ${status}.`);
      loadAdminSellers();
      loadAdminStats();
    }
  } catch {
    alert('Decision failed.');
  }
}

async function loadAdminModeration() {
  try {
    const res = await fetch('/api/v1/admin/products/moderation-queue', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });
    const json = await res.json();
    if (json.success) {
      const tbody = document.getElementById('admin-moderation-tbody');
      if (json.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-ink-muted);">No garments awaiting moderation.</td></tr>`;
        return;
      }

      tbody.innerHTML = json.data.map(item => `
        <tr>
          <td><strong>${item.product.title}</strong></td>
          <td>${item.sellerStoreName}</td>
          <td>${item.product.fabricMaterial} • ${item.product.occasion}</td>
          <td>${item.product.brandClaim || 'Self-Produced'}</td>
          <td><span class="status-pill status-${item.product.moderationStatus.toLowerCase()}">${item.product.moderationStatus}</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="decideProduct('${item.product.id}', 'APPROVED')">Approve</button>
            <button class="btn btn-outline btn-sm" onclick="decideProduct('${item.product.id}', 'REJECTED')">Reject</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading moderation queue', err);
  }
}

async function decideProduct(productId, status) {
  const reason = prompt(`Enter recorded reason for ${status}:`, 'Verified fabric authenticity and photography standards.');
  if (!reason) return;

  try {
    const res = await fetch(`/api/v1/admin/products/${productId}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.adminToken}`
      },
      body: JSON.stringify({ status, reason })
    });

    if (res.ok) {
      alert(`Product marked as ${status}.`);
      loadAdminModeration();
      loadAdminStats();
      loadProducts();
    }
  } catch {
    alert('Decision failed.');
  }
}

async function loadAdminAudit() {
  try {
    const res = await fetch('/api/v1/admin/audit-logs?limit=30', {
      headers: { 'Authorization': `Bearer ${state.adminToken}` }
    });
    const json = await res.json();
    if (json.success) {
      const tbody = document.getElementById('admin-audit-tbody');
      tbody.innerHTML = json.data.map(log => `
        <tr>
          <td>${new Date(log.createdAt).toLocaleTimeString()}</td>
          <td><span class="status-pill status-approved">${log.actorRole}</span></td>
          <td><strong>${log.action}</strong></td>
          <td>${log.targetType}</td>
          <td style="font-family: monospace; font-size: 0.75rem;">${log.ipHash || '—'}</td>
          <td style="font-size: 0.75rem; color: var(--color-ink-secondary);">${JSON.stringify(log.detailsSanitized)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading audit logs', err);
  }
}
