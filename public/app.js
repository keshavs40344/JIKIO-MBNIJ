/**
 * ICM MADHUBANI (ISHANI COLLECTION MITHILA) — CLIENT APPLICATION (SPA)
 * High-Fashion Artisanal Marketplace & Bespoke Couture Engine.
 */

// Global Application State
const state = {
  currentPath: '/',
  categories: [],
  products: [],
  activeAudience: '',
  activeCategory: '',
  activeSubcategory: '',
  activeOccasion: '',
  activeFabric: '',
  activePrice: '',
  activeSort: '',
  searchQuery: '',
  wishlist: JSON.parse(localStorage.getItem('icm_wishlist') || '[]'),
  cart: JSON.parse(localStorage.getItem('icm_cart') || '[]'),
  repricedCart: null,
  activePdpProduct: null,
  activePdpVariants: [],
  selectedVariant: null,
  pdpQuantity: 1,
  customerToken: null,
  sellerToken: null,
  adminToken: null,
};

// Safe Currency Formatter (Guarantees authentic Rupee symbol)
function formatPrice(val) {
  return '₹' + Number(val || 0).toLocaleString('en-IN');
}

// Category circle image mapping
const categoryImages = {
  cat_ethnic: '/assets/campaigns/campaign-sarees.jpg',
  cat_wedding: '/assets/campaigns/campaign-bridal.jpg',
  cat_women: '/assets/campaigns/campaign-womens-couture.jpg',
  cat_men: '/assets/campaigns/campaign-menswear.jpg',
  cat_kids: '/assets/campaigns/campaign-craft-storytelling.jpg',
  cat_footwear: '/assets/campaigns/campaign-accessories.jpg',
  cat_accessories: '/assets/campaigns/campaign-accessories.jpg',
};

// --------------------------------------------------------------------------
// INITIALIZATION
// --------------------------------------------------------------------------
async function initApp() {
  await setupInitialPatronSession();
  await loadCategories();
  await loadAllProducts();

  renderHeaderSubbar();
  renderMobileQuickCategories();

  // Setup Global Link Interceptor (for client-side routing)
  setupLinkInterceptor();

  // Handle current URL route
  handleRoute(window.location.pathname, window.location.search);

  // Popstate listener (Back / Forward browser buttons)
  window.addEventListener('popstate', () => {
    handleRoute(window.location.pathname, window.location.search);
  });

  // Update badges
  updateWishlistBadge();
  updateCartBadge();
  updateAdminNavVisibility();
  initSpatialExperience();
  initBackToTop();
  initHeaderScroll();
  initMegaMenuHoverBuffer();
}

function initMegaMenuHoverBuffer() {
  const items = document.querySelectorAll('.has-megamenu');
  items.forEach((item) => {
    let timeoutId = null;
    const panel = item.querySelector('.megamenu-panel');

    const show = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      items.forEach((other) => {
        if (other !== item) other.classList.remove('megamenu-open');
      });
      item.classList.add('megamenu-open');
      const navLink = item.querySelector('.nav-link');
      if (navLink) navLink.setAttribute('aria-expanded', 'true');
    };

    const hide = () => {
      timeoutId = setTimeout(() => {
        item.classList.remove('megamenu-open');
        const navLink = item.querySelector('.nav-link');
        if (navLink) navLink.setAttribute('aria-expanded', 'false');
        timeoutId = null;
      }, 180);
    };

    item.addEventListener('mouseenter', show);
    item.addEventListener('mouseleave', hide);
    if (panel) {
      panel.addEventListener('mouseenter', show);
      panel.addEventListener('mouseleave', hide);
    }
  });
}

function initHeaderScroll() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Setup Link Interceptor for SPA navigation
function setupLinkInterceptor() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (
      href &&
      href.startsWith('/') &&
      !href.startsWith('/api/') &&
      !href.startsWith('//') &&
      !link.hasAttribute('target') &&
      !link.hasAttribute('download')
    ) {
      e.preventDefault();
      navigateTo(href);
    }
  });
}

// Navigate function
function navigateTo(url, push = true) {
  if (push && url !== window.location.pathname + window.location.search) {
    history.pushState(null, '', url);
  }
  handleRoute(window.location.pathname, window.location.search);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --------------------------------------------------------------------------
// CLIENT-SIDE ROUTER DISPATCHER
// --------------------------------------------------------------------------
async function handleRoute(pathname, search) {
  state.currentPath = pathname;
  const searchParams = new URLSearchParams(search);

  // Hide all page views
  document.querySelectorAll('.page-view, .portal-view').forEach((el) => {
    el.classList.remove('active');
    el.style.display = 'none';
  });

  // Hide internal banner notice by default
  const noticeEl = document.getElementById('internal-portal-notice');
  if (noticeEl) noticeEl.style.display = 'none';

  // Pause/stop hero carousel when leaving homepage
  if (pathname !== '/' && pathname !== '') {
    stopCampaignCarousel();
  }

  // 1. Homepage: /
  if (pathname === '/' || pathname === '') {
    activateView('view-home');
    document.title = 'ICM Madhubani — Ishani Collection Mithila | Handcrafted Luxury & Royal Bespoke Couture';
    await loadCategories();
    await loadAllProducts();
    initCampaignCarousel();
    renderHeaderSubbar();
    renderMobileQuickCategories();
    renderCategoryPillars();
    await renderHomepageNewArrivals();
    await renderHomepageWeddingEdit();
    await renderHomepageGuilds();
    await renderRecentlyViewed();
    initScrollReveals();
    return;
  }

  // 2. Shop Directory: /shop
  if (pathname === '/shop') {
    activateView('view-shop');
    document.title = 'All Handcrafted Collections — ICM Madhubani';
    state.activeAudience = searchParams.get('audience') || '';
    state.activeCategory = searchParams.get('category') || '';
    state.activeSubcategory = searchParams.get('subcategory') || '';
    state.activeOccasion = searchParams.get('occasion') || '';
    state.activeFabric = searchParams.get('fabric') || '';
    state.activePrice = searchParams.get('price') || '';
    state.activeSort = searchParams.get('sort') || '';
    renderCatalogPage();
    return;
  }

  // Dedicated Audience Landing Pages: /women, /men, /kids (with subcategory support)
  if (pathname === '/women' || pathname.startsWith('/women/')) {
    activateView('view-shop');
    state.activeAudience = 'WOMEN';
    state.activeCategory = searchParams.get('category') || '';
    const subSlug = pathname.replace('/women', '').replace(/^\//, '').replace(/\/$/, '');
    state.activeSubcategory = subSlug || searchParams.get('subcategory') || '';
    state.activeOccasion = searchParams.get('occasion') || '';
    state.activeFabric = searchParams.get('fabric') || '';
    state.activePrice = searchParams.get('price') || '';
    state.activeSort = searchParams.get('sort') || '';
    document.title = "Women's Royal Couture & Handlooms — ICM Madhubani";
    renderCatalogPage();
    return;
  }

  if (pathname === '/men' || pathname.startsWith('/men/')) {
    activateView('view-shop');
    state.activeAudience = 'MEN';
    state.activeCategory = searchParams.get('category') || '';
    const subSlug = pathname.replace('/men', '').replace(/^\//, '').replace(/\/$/, '');
    state.activeSubcategory = subSlug || searchParams.get('subcategory') || '';
    state.activeOccasion = searchParams.get('occasion') || '';
    state.activeFabric = searchParams.get('fabric') || '';
    state.activePrice = searchParams.get('price') || '';
    state.activeSort = searchParams.get('sort') || '';
    document.title = "Men's Royal Heritage & Tailoring — ICM Madhubani";
    renderCatalogPage();
    return;
  }

  if (pathname === '/kids' || pathname.startsWith('/kids/')) {
    activateView('view-shop');
    state.activeAudience = 'KIDS';
    state.activeCategory = searchParams.get('category') || '';
    const subSlug = pathname.replace('/kids', '').replace(/^\//, '').replace(/\/$/, '');
    state.activeSubcategory = subSlug || searchParams.get('subcategory') || '';
    state.activeOccasion = searchParams.get('occasion') || '';
    state.activeFabric = searchParams.get('fabric') || '';
    state.activePrice = searchParams.get('price') || '';
    state.activeSort = searchParams.get('sort') || '';
    document.title = "Kids & Heirloom Heritage Wear — ICM Madhubani";
    renderCatalogPage();
    return;
  }

  // Virtual Atelier Route: /atelier
  if (pathname === '/atelier') {
    activateView('view-home');
    document.title = 'Virtual Bespoke Atelier — ICM Madhubani';
    await loadCategories();
    await loadAllProducts();
    initCampaignCarousel();
    const atelierEl = document.getElementById('virtual-atelier');
    if (atelierEl) {
      setTimeout(() => atelierEl.scrollIntoView({ behavior: 'smooth' }), 100);
    }
    return;
  }

  // 3. Category & Subcategory: /category/:slug or /category/:catSlug/:subSlug
  if (pathname.startsWith('/category/')) {
    const raw = pathname.replace('/category/', '').replace(/\/$/, '');
    const parts = raw.split('/');
    activateView('view-shop');
    state.activeAudience = searchParams.get('audience') || '';
    state.activeCategory = parts[0] || '';
    state.activeSubcategory = parts[1] || searchParams.get('subcategory') || '';
    state.activeOccasion = searchParams.get('occasion') || '';
    state.activeFabric = searchParams.get('fabric') || '';
    state.activePrice = searchParams.get('price') || '';
    state.activeSort = searchParams.get('sort') || '';
    const cat = state.categories.find((c) => c.id === state.activeCategory || c.slug === state.activeCategory);
    const catName = cat ? cat.name : 'Artisanal Category';
    document.title = `${catName} — ICM Madhubani`;
    renderCatalogPage();
    return;
  }

  // 4. Occasion: /occasion/:slug
  if (pathname.startsWith('/occasion/')) {
    const slug = pathname.replace('/occasion/', '').replace(/\/$/, '');
    activateView('view-shop');
    state.activeCategory = '';
    state.activeOccasion = slug.charAt(0).toUpperCase() + slug.slice(1);
    document.title = `${state.activeOccasion} Royal Edit — ICM Madhubani`;
    renderCatalogPage();
    return;
  }

  // 5. Brands & Guilds Directory: /brands
  if (pathname === '/brands') {
    activateView('view-brands');
    document.title = 'Curated Master Artisan Guilds — ICM Madhubani';
    renderBrandsDirectoryPage();
    return;
  }

  // 6. Dedicated Seller Atelier: /seller/:slug
  if (pathname.startsWith('/seller/')) {
    const slug = pathname.replace('/seller/', '').replace(/\/$/, '');
    // Check if it's a seller internal workspace route
    if (['onboarding', 'verification', 'catalogue', 'inventory', 'orders', 'dispatch', 'settlements', 'login'].includes(slug)) {
      activateView('view-seller');
      document.title = 'Artisan & Seller Partner Portal — ICM Madhubani';
      if (noticeEl) {
        noticeEl.style.display = 'flex';
        document.getElementById('portal-notice-text').textContent = 'Artisan & Seller Partner Workspace Active • Authenticated Portal';
      }
      switchSellerSubRoute(slug === 'login' ? 'orders' : slug);
      return;
    }

    activateView('view-seller-store');
    renderSellerStorefrontPage(slug);
    return;
  }

  // 7. Dedicated Product Detail Page: /product/:slug
  if (pathname.startsWith('/product/')) {
    const slug = pathname.replace('/product/', '').replace(/\/$/, '');
    activateView('view-product-detail');
    renderProductDetailPage(slug);
    return;
  }

  // 8. Search Results: /search
  if (pathname === '/search') {
    activateView('view-search');
    const q = searchParams.get('q') || '';
    state.searchQuery = q;
    document.title = q ? `Search: "${q}" — ICM Madhubani` : 'Search Handcrafted Archives — ICM Madhubani';
    renderSearchPage(q);
    return;
  }

  // 9. Wishlist: /wishlist
  if (pathname === '/wishlist') {
    activateView('view-wishlist');
    document.title = 'Your Saved Wishlist — ICM Madhubani';
    renderWishlistPage();
    return;
  }

  // 10. Shopping Bag: /cart
  if (pathname === '/cart') {
    activateView('view-cart');
    document.title = 'Your Shopping Bag — ICM Madhubani';
    renderCartPage();
    return;
  }

  // 11. Checkout: /checkout
  if (pathname === '/checkout') {
    activateView('view-checkout');
    document.title = 'Secure Patron Checkout — ICM Madhubani';
    renderCheckoutPage();
    return;
  }

  // 12. Account Overview: /account
  if (pathname === '/account') {
    activateView('view-account');
    document.title = 'Patron Atelier Dashboard — ICM Madhubani';
    renderAccountOverview();
    return;
  }

  // 13. Account Orders: /account/orders
  if (pathname === '/account/orders') {
    activateView('view-account-orders');
    document.title = 'Order History & Tracking — ICM Madhubani';
    renderAccountOrders();
    return;
  }

  // 14. Account Order Detail: /account/orders/:id
  if (pathname.startsWith('/account/orders/')) {
    const orderId = pathname.replace('/account/orders/', '').replace(/\/$/, '');
    activateView('view-account-order-detail');
    document.title = `Order ${orderId} — ICM Madhubani`;
    renderAccountOrderDetail(orderId);
    return;
  }

  // 15. Account Returns: /account/returns
  if (pathname === '/account/returns') {
    activateView('view-account-returns');
    document.title = 'Returns & Artisanal Exchanges — ICM Madhubani';
    renderAccountReturns();
    return;
  }

  // 16. Admin Console: /admin & /admin/:sub
  if (pathname.startsWith('/admin')) {
    activateView('view-admin');
    document.title = 'Platform Owner Governance Console — ICM Madhubani';
    if (noticeEl) {
      noticeEl.style.display = 'flex';
      document.getElementById('portal-notice-text').textContent = 'Platform Owner Governance Console • Multi-Factor Authenticated';
    }
    const sub = pathname.replace('/admin', '').replace(/^\//, '') || 'moderation';
    switchAdminSubRoute(sub);
    return;
  }

  // Fallback 404: Redirect to shop
  activateView('view-shop');
  document.title = 'All Handcrafted Collections — ICM Madhubani';
  renderCatalogPage();
}

function activateView(viewId) {
  const el = document.getElementById(viewId);
  if (el) {
    el.classList.add('active');
    el.style.display = 'block';
  }
}

// --------------------------------------------------------------------------
// SESSION & AUTH SETUP
// --------------------------------------------------------------------------
async function setupInitialPatronSession() {
  const cached = window.sessionStorage?.getItem('icm_patron_token');
  if (cached) {
    state.customerToken = cached;
    return;
  }

  try {
    const demoEmail = `patron_${Math.random().toString(36).substring(2, 8)}@icm-madhubani.local`;
    const regRes = await fetch('/api/v1/auth/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: demoEmail, password: 'PatronPass2026!#' }),
    });

    if (regRes.ok) {
      const loginRes = await fetch('/api/v1/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: 'PatronPass2026!#' }),
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        state.customerToken = loginData.data.accessToken;
        window.sessionStorage?.setItem('icm_patron_token', state.customerToken);
      }
    }
  } catch (err) {
    // Non-blocking discovery session
  }
}

// --------------------------------------------------------------------------
// DATA FETCHERS
// --------------------------------------------------------------------------
async function loadCategories() {
  try {
    const res = await fetch('/api/v1/categories');
    const json = await res.json();
    if (json.success) {
      state.categories = json.data;
      syncCategoryNavigationCounts();
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadAllProducts() {
  try {
    const res = await fetch('/api/v1/products');
    const json = await res.json();
    if (json.success) {
      state.products = json.data;
    }
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

// --------------------------------------------------------------------------
// PAGE 1: HOMEPAGE RENDERERS
// --------------------------------------------------------------------------
const categoryMetadata = {
  cat_ethnic: {
    title: 'Sarees & Handlooms',
    subtitle: 'Mithila Tussar & Banarasi Weaves',
    image: '/assets/campaigns/campaign-sarees.jpg',
    link: '/category/cat_ethnic',
  },
  cat_wedding: {
    title: 'Bridal & Festive',
    subtitle: 'Mulberry Lehengas & Brocades',
    image: '/assets/campaigns/campaign-bridal.jpg',
    link: '/category/cat_wedding',
  },
  cat_men: {
    title: 'Royal Menswear',
    subtitle: 'Tussar Bandhgalas & Tailored Jackets',
    image: '/assets/campaigns/campaign-menswear.jpg',
    link: '/category/cat_men',
  },
  cat_women: {
    title: "Women's Couture",
    subtitle: 'Chanderi Zari Angrakhas & Silks',
    image: '/assets/campaigns/campaign-womens-couture.jpg',
    link: '/category/cat_women',
  },
  cat_footwear: {
    title: 'Mojaris & Footwear',
    subtitle: 'Handcrafted Zardozi Leather Shoes',
    image: '/assets/campaigns/campaign-accessories.jpg',
    link: '/category/cat_footwear',
  },
  cat_accessories: {
    title: 'Stoles & Bags',
    subtitle: 'Handpainted Pure Silk Stoles',
    image: '/assets/campaigns/campaign-accessories.jpg',
    link: '/category/cat_accessories',
  },
};

function renderHeaderSubbar() {
  const container = document.getElementById('header-nav-subbar-links');
  if (!container) return;

  const totalCount = (state.products || []).length;
  const activeCategories = (state.categories || []).filter((c) => c.isActive !== false);

  const allActive = !state.activeCategory || state.currentPath === '/shop';
  let html = `<a href="/shop" class="subbar-link ${allActive ? 'active' : ''}">All Collections (${totalCount})</a>`;

  for (const cat of activeCategories) {
    const isCatActive = state.activeCategory === cat.id;
    html += `<a href="/category/${cat.id}" class="subbar-link ${isCatActive ? 'active' : ''}">${cat.name}</a>`;
  }

  html += `<a href="/brands" class="subbar-link">Artisan Guilds</a>`;
  html += `<a href="/#virtual-atelier" class="subbar-link">Virtual Atelier</a>`;

  container.innerHTML = html;
}

function renderMobileQuickCategories() {
  const container = document.getElementById('mobile-quick-categories-container');
  if (!container) return;

  const totalCount = (state.products || []).length;
  const activeCategories = (state.categories || []).filter((c) => c.isActive !== false);

  const allActive = !state.activeCategory || state.currentPath === '/shop';
  let html = `<a href="/shop" class="quick-cat-chip ${allActive ? 'active' : ''}">All (${totalCount})</a>`;

  for (const cat of activeCategories) {
    const isCatActive = state.activeCategory === cat.id;
    const shortName = cat.name.split(' ')[0];
    const count = cat.productCount !== undefined ? cat.productCount : 0;
    html += `<a href="/category/${cat.id}" class="quick-cat-chip ${isCatActive ? 'active' : ''}">${shortName} (${count})</a>`;
  }

  html += `<a href="/brands" class="quick-cat-chip chip-guild">Guilds (3)</a>`;

  container.innerHTML = html;
}

function renderCategoryPillars() {
  const container = document.getElementById('category-pillars-container');
  if (!container) return;

  const activeCategories = (state.categories || []).filter(
    (c) => c.isActive !== false && c.showOnHomepage !== false
  );

  container.innerHTML = activeCategories
    .map((cat) => {
      const img = cat.image || '/assets/campaigns/campaign-accessories.jpg';
      const subtitle = cat.subtitle || 'Artisanal Collection';
      const countNote = cat.productCount !== undefined ? ` • ${cat.productCount} Handcrafted Items` : '';
      return `
      <a href="/category/${cat.id}" class="category-editorial-card">
        <div class="category-card-media">
          <img src="${img}" alt="${cat.name}" loading="lazy">
          <div class="category-card-overlay"></div>
        </div>
        <div class="category-card-content">
          <span class="category-card-kicker">${subtitle}${countNote}</span>
          <h3 class="category-card-title">${cat.name}</h3>
          <span class="category-card-cta">
            Explore Collection
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </span>
        </div>
      </a>
    `;
    })
    .join('');
}

const guildMetadata = {
  seller_mithila_guild: {
    location: 'Jitwarpur, Madhubani, Bihar',
    specialty: 'Handpainted Tussar Silks & Freehand Kohbar Art',
    artisanFocus: 'Generational Mithila Women Collective',
    productsCount: 2,
    image: '/assets/campaigns/campaign-sarees.jpg',
  },
  seller_banaras_heritage: {
    location: 'Chowk, Varanasi, Uttar Pradesh',
    specialty: 'Katan Silk Handloom Sarees & Chanderi Zari',
    artisanFocus: 'Master Pit-Loom Weaver Guild',
    productsCount: 2,
    image: '/assets/campaigns/campaign-womens-couture.jpg',
  },
  seller_jaipur_royal: {
    location: 'Johari Bazaar, Jaipur, Rajasthan',
    specialty: 'Royal Bandhgalas, Bridal Lehengas & Zardozi Mojaris',
    artisanFocus: 'Imperial Bespoke Atelier',
    productsCount: 3,
    image: '/assets/campaigns/campaign-menswear.jpg',
  },
};

// --------------------------------------------------------------------------
// EDITORIAL FASHION CAMPAIGN HERO CAROUSEL ENGINE (PHASE 1.2)
// --------------------------------------------------------------------------
let carouselTimer = null;
let carouselCurrentIndex = 0;
let carouselTotalSlides = 5;
const CAROUSEL_INTERVAL_MS = 5500;
let carouselIsPaused = false;

function initCampaignCarousel() {
  const carouselEl = document.getElementById('hero-campaign-carousel');
  if (!carouselEl) return;

  const slides = carouselEl.querySelectorAll('.campaign-slide');
  if (!slides || slides.length === 0) return;
  carouselTotalSlides = slides.length;

  // Wire buttons and interactive listeners only once
  if (!carouselEl.dataset.initialized) {
    carouselEl.dataset.initialized = 'true';

    const prevBtn = document.getElementById('carousel-prev-btn');
    const nextBtn = document.getElementById('carousel-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        prevCampaignSlide();
        resetCampaignTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        nextCampaignSlide();
        resetCampaignTimer();
      });
    }

    // Dots indicator clicks
    const dots = carouselEl.querySelectorAll('.carousel-dot');
    dots.forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        const targetIndex = parseInt(dot.getAttribute('data-slide-to') || '0', 10);
        goToCampaignSlide(targetIndex);
        resetCampaignTimer();
      });
    });

    // Pause on mouseenter, resume on mouseleave
    carouselEl.addEventListener('mouseenter', () => {
      pauseCampaignCarousel();
    });
    carouselEl.addEventListener('mouseleave', () => {
      resumeCampaignCarousel();
    });

    // Pause on focusin, resume on focusout (accessibility)
    carouselEl.addEventListener('focusin', () => {
      pauseCampaignCarousel();
    });
    carouselEl.addEventListener('focusout', () => {
      resumeCampaignCarousel();
    });

    // Pause when document tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pauseCampaignCarousel();
      } else {
        resumeCampaignCarousel();
      }
    });

    // Keyboard navigation when carousel is focused
    carouselEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevCampaignSlide();
        resetCampaignTimer();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextCampaignSlide();
        resetCampaignTimer();
      }
    });

    // Touch Swipe handling for mobile & tablet
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    carouselEl.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        pauseCampaignCarousel();
      }
    }, { passive: true });

    carouselEl.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches[0]) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const duration = Date.now() - touchStartTime;

        // Ensure horizontal swipe
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && duration < 600) {
          if (deltaX < 0) {
            nextCampaignSlide();
          } else {
            prevCampaignSlide();
          }
          resetCampaignTimer();
        } else {
          resumeCampaignCarousel();
        }
      }
    }, { passive: true });
  }

  // Set initial slide state & start auto rotation
  goToCampaignSlide(carouselCurrentIndex, false);
  startCampaignTimer();
}

function goToCampaignSlide(index, animateProgress = true) {
  const carouselEl = document.getElementById('hero-campaign-carousel');
  if (!carouselEl) return;

  const slides = carouselEl.querySelectorAll('.campaign-slide');
  const dots = carouselEl.querySelectorAll('.carousel-dot');
  if (!slides || slides.length === 0) return;

  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  carouselCurrentIndex = index;

  slides.forEach((slide, i) => {
    if (i === carouselCurrentIndex) {
      slide.classList.add('active');
      slide.setAttribute('aria-hidden', 'false');
    } else {
      slide.classList.remove('active');
      slide.setAttribute('aria-hidden', 'true');
    }
  });

  dots.forEach((dot, i) => {
    if (i === carouselCurrentIndex) {
      dot.classList.add('active');
      dot.setAttribute('aria-selected', 'true');
    } else {
      dot.classList.remove('active');
      dot.setAttribute('aria-selected', 'false');
    }
  });

  // Reset & animate progress bar
  const progressBar = document.getElementById('carousel-progress-bar');
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    if (animateProgress && !carouselIsPaused) {
      void progressBar.offsetWidth; // trigger reflow
      progressBar.style.transition = `width ${CAROUSEL_INTERVAL_MS}ms linear`;
      progressBar.style.width = '100%';
    }
  }
}

function nextCampaignSlide() {
  goToCampaignSlide(carouselCurrentIndex + 1);
}

function prevCampaignSlide() {
  goToCampaignSlide(carouselCurrentIndex - 1);
}

function startCampaignTimer() {
  stopCampaignCarousel();
  carouselIsPaused = false;

  // Don't auto-rotate if reduced motion preferred
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const progressBar = document.getElementById('carousel-progress-bar');
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
    void progressBar.offsetWidth;
    progressBar.style.transition = `width ${CAROUSEL_INTERVAL_MS}ms linear`;
    progressBar.style.width = '100%';
  }

  carouselTimer = setTimeout(() => {
    nextCampaignSlide();
    startCampaignTimer();
  }, CAROUSEL_INTERVAL_MS);
}

function pauseCampaignCarousel() {
  carouselIsPaused = true;
  if (carouselTimer) {
    clearTimeout(carouselTimer);
    carouselTimer = null;
  }
  const progressBar = document.getElementById('carousel-progress-bar');
  if (progressBar) {
    const computedWidth = window.getComputedStyle(progressBar).width;
    progressBar.style.transition = 'none';
    progressBar.style.width = computedWidth;
  }
}

let carouselUserPaused = false;

function resumeCampaignCarousel() {
  if (carouselUserPaused) return;
  if (!carouselIsPaused) return;
  carouselIsPaused = false;
  startCampaignTimer();
}

function resetCampaignTimer() {
  stopCampaignCarousel();
  startCampaignTimer();
}

function stopCampaignCarousel() {
  if (carouselTimer) {
    clearTimeout(carouselTimer);
    carouselTimer = null;
  }
  const progressBar = document.getElementById('carousel-progress-bar');
  if (progressBar) {
    progressBar.style.transition = 'none';
    progressBar.style.width = '0%';
  }
}

function toggleCarouselPause() {
  const btn = document.getElementById('carousel-play-pause-btn');
  const iconPause = btn ? btn.querySelector('.icon-pause') : null;
  const iconPlay = btn ? btn.querySelector('.icon-play') : null;

  if (carouselUserPaused) {
    carouselUserPaused = false;
    resumeCampaignCarousel();
    if (btn) {
      btn.setAttribute('aria-label', 'Pause automatic slide rotation');
      btn.setAttribute('title', 'Pause automatic rotation');
    }
    if (iconPause) iconPause.style.display = 'block';
    if (iconPlay) iconPlay.style.display = 'none';
  } else {
    carouselUserPaused = true;
    pauseCampaignCarousel();
    if (btn) {
      btn.setAttribute('aria-label', 'Resume automatic slide rotation');
      btn.setAttribute('title', 'Resume automatic rotation');
    }
    if (iconPause) iconPause.style.display = 'none';
    if (iconPlay) iconPlay.style.display = 'block';
  }
}

async function renderHomepageCategoryGrids() {
  const container = document.getElementById('homepage-dynamic-category-sections');
  if (!container) return;

  try {
    if (!state.products || state.products.length === 0) {
      await loadAllProducts();
    }
    const products = state.products || [];
    const activeCategories = (state.categories || []).filter(
      (c) => c.isActive !== false && c.showOnHomepage !== false
    );

    let html = '';

    for (const cat of activeCategories) {
      const categoryProducts = products.filter((p) => p.product.categoryId === cat.id);

      // Requirement 3: If a category has no eligible products, do not display a misleading product grid or false count.
      if (categoryProducts.length === 0) {
        continue; // Hide empty category section from customer storefront
      }

      const tag = cat.merchandisingTag || 'Artisanal Looms';
      html += `
      <section class="section-wrapper category-dedicated-section" id="section-${cat.id}">
        <div class="section-header-row">
          <div>
            <span class="section-badge">${tag}</span>
            <h2 class="section-title">${cat.name}</h2>
            <p class="section-subtitle">${cat.description}</p>
          </div>
          <a href="/category/${cat.id}" class="btn-link-gold desktop-only">View All ${cat.name} (${categoryProducts.length}) →</a>
        </div>
        <div class="product-cards-grid product-grid" id="category-grid-${cat.id}">
          ${categoryProducts.map((item) => renderProductCardHtml(item)).join('')}
        </div>
        <div class="text-center mobile-only" style="margin-top: 20px;">
          <a href="/category/${cat.id}" class="btn btn-outline-gold w-100">View All ${cat.name} (${categoryProducts.length}) →</a>
        </div>
      </section>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error('Error rendering dynamic homepage category grids:', err);
  }
}

async function renderHomepageNewArrivals() {
  const container = document.getElementById('homepage-new-arrivals-grid');
  if (!container) return;

  try {
    if (!state.products || state.products.length === 0) {
      await loadAllProducts();
    }
    const arrivals = state.products || [];
    const totalCount = arrivals.length;

    // Update browse all catalog links dynamically
    const desktopLink = document.getElementById('browse-full-catalog-link');
    if (desktopLink) desktopLink.textContent = `Browse Full Marketplace Catalog (${totalCount}) →`;
    const mobileLink = document.getElementById('mobile-view-all-link');
    if (mobileLink) mobileLink.textContent = `View All Collections (${totalCount}) →`;

    // Render filter tabs dynamically based on active taxonomy categories
    const tabsContainer = document.getElementById('homepage-category-tabs-strip');
    if (tabsContainer) {
      const activeCategories = (state.categories || []).filter((c) => c.isActive !== false);
      const currentTab = state.homepageFilter || 'all';

      let tabsHtml = `<button class="mp-tab ${currentTab === 'all' ? 'active' : ''}" onclick="filterHomepageCatalog('all', this)">All Collections (${totalCount})</button>`;

      for (const cat of activeCategories) {
        const count = cat.productCount !== undefined ? cat.productCount : 0;
        tabsHtml += `<button class="mp-tab ${currentTab === cat.id ? 'active' : ''}" onclick="filterHomepageCatalog('${cat.id}', this)">${cat.name} (${count})</button>`;
      }
      tabsContainer.innerHTML = tabsHtml;
    }

    // Filter products if a tab is selected
    let displayed = arrivals;
    if (state.homepageFilter && state.homepageFilter !== 'all') {
      displayed = arrivals.filter((p) => p.product.categoryId === state.homepageFilter);
    }

    if (!displayed.length) {
      container.innerHTML = '<p class="text-center" style="grid-column: 1/-1; padding: 24px; color: var(--color-ink-muted);">No products found in this category currently.</p>';
      return;
    }
    container.innerHTML = displayed.map((item) => renderProductCardHtml(item)).join('');
  } catch (err) {
    console.error('Error rendering homepage new arrivals:', err);
  }
}

function filterHomepageCatalog(category, btnEl) {
  state.homepageFilter = category;
  const tabs = document.querySelectorAll('.mp-tab');
  tabs.forEach((t) => t.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const container = document.getElementById('homepage-new-arrivals-grid');
  if (!container) return;

  const allProducts = state.products || [];
  let filtered = allProducts;
  if (category !== 'all') {
    filtered = allProducts.filter((item) => item.product.categoryId === category);
  }

  if (!filtered.length) {
    container.innerHTML = `<p class="text-center" style="grid-column: 1/-1; padding: 32px; color: var(--color-ink-muted);">No products found in this category currently.</p>`;
    return;
  }

  container.innerHTML = filtered.map((item) => renderProductCardHtml(item)).join('');
}

function handleMobileSearch(e) {
  e.preventDefault();
  const input = document.getElementById('mobile-search-input');
  const query = input?.value.trim() || '';
  if (query) {
    navigateTo(`/search?q=${encodeURIComponent(query)}`);
  }
}

async function renderHomepageWeddingEdit() {
  const container = document.getElementById('homepage-wedding-grid');
  if (!container) return;

  try {
    if (!state.products || state.products.length === 0) {
      await loadAllProducts();
    }
    let weddingItems = (state.products || []).filter(
      (item) => item.product.occasion === 'Wedding'
    );
    if (!weddingItems.length) {
      weddingItems = (state.products || []).filter(
        (item) => item.product.occasion === 'Festive'
      );
    }

    if (weddingItems.length) {
      container.innerHTML = weddingItems.map((item) => renderProductCardHtml(item)).join('');
    }
  } catch (err) {
    console.error('Error rendering homepage wedding edit:', err);
  }
}

async function renderHomepageGuilds() {
  const container = document.getElementById('homepage-guilds-grid');
  if (!container) return;

  try {
    const res = await fetch('/api/v1/sellers');
    const json = await res.json();
    if (json.success && json.data.length) {
      container.innerHTML = json.data
        .map((seller) => {
          const meta = guildMetadata[seller.id] || {
            location: 'India Heritage Cluster',
            specialty: 'Artisanal Handloom Craft',
            artisanFocus: 'Master Artisan Collective',
            productsCount: 2,
            image: '/assets/campaigns/campaign-craft-storytelling.jpg',
          };
          return `
            <div class="guild-card">
              <div class="guild-card-img-wrap">
                <img src="${meta.image}" alt="${seller.storeName}" loading="lazy">
                <span class="guild-location-tag">📍 ${meta.location}</span>
              </div>
              <div class="guild-card-body">
                <div class="guild-header-row">
                  <h3 class="guild-name">${seller.storeName}</h3>
                  <span class="guild-status-tag">Curated Guild</span>
                </div>
                <p class="guild-specialty"><strong>Specialty:</strong> ${meta.specialty}</p>
                <div class="guild-meta-stats">
                  <span class="guild-stat-item">🎨 ${meta.artisanFocus}</span>
                  <span class="guild-stat-item">📦 ${meta.productsCount} Active Creations</span>
                </div>
                <a href="/seller/${seller.id}" class="btn btn-outline-gold btn-sm w-100">Browse Guild Atelier →</a>
              </div>
            </div>
          `;
        })
        .join('');
    }
  } catch (err) {
    console.error('Error loading guilds:', err);
  }
}

// --------------------------------------------------------------------------
// PAGE 2: CATALOG / SHOP PAGE (/shop, /category/:slug, /occasion/:slug)
// --------------------------------------------------------------------------
async function renderCatalogPage() {
  const container = document.getElementById('catalog-products-grid');
  const emptyState = document.getElementById('catalog-empty-state');
  const countBadge = document.getElementById('shop-results-count');
  const breadcrumbs = document.getElementById('shop-breadcrumbs');
  const shopTitle = document.getElementById('shop-title');
  const shopDesc = document.getElementById('shop-desc');

  // Sync inputs with state
  const catSelect = document.getElementById('filter-category');
  const occSelect = document.getElementById('filter-occasion');
  const fabSelect = document.getElementById('filter-fabric');
  const prcSelect = document.getElementById('filter-price');
  const srtSelect = document.getElementById('filter-sort');

  if (catSelect) catSelect.value = state.activeCategory || '';
  if (occSelect) occSelect.value = state.activeOccasion || '';
  if (fabSelect) fabSelect.value = state.activeFabric || '';
  if (prcSelect) prcSelect.value = state.activePrice || '';
  if (srtSelect) srtSelect.value = state.activeSort || '';

  // Find active subcategory object if selected
  let activeSubObj = null;
  if (state.activeSubcategory) {
    for (const c of state.categories) {
      const found = (c.subcategories || []).find(
        (s) => s.id === state.activeSubcategory || s.slug === state.activeSubcategory
      );
      if (found) {
        activeSubObj = found;
        break;
      }
    }
  }

  // Update Breadcrumbs & Title
  if (activeSubObj) {
    const subName = activeSubObj.name;
    if (state.activeAudience) {
      const audLabel = state.activeAudience === 'WOMEN' ? "Women's Collection" : state.activeAudience === 'MEN' ? "Men's Collection" : state.activeAudience === 'KIDS' ? "Kids Collection" : state.activeAudience;
      const audSlug = state.activeAudience.toLowerCase();
      breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/${audSlug}">${audLabel}</a> <span>/</span> <span class="current">${subName}</span>`;
      shopTitle.textContent = subName;
      shopDesc.textContent = `Handcrafted ${subName.toLowerCase()} curated under ${audLabel}. Direct weaver guild compensation and certified pure silk fabrics.`;
    } else if (state.activeCategory) {
      const cat = state.categories.find((c) => c.id === state.activeCategory || c.slug === state.activeCategory);
      const catName = cat ? cat.name : 'Category';
      const catSlug = cat ? cat.slug : state.activeCategory;
      breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/category/${catSlug}">${catName}</a> <span>/</span> <span class="current">${subName}</span>`;
      shopTitle.textContent = subName;
      shopDesc.textContent = `Handcrafted ${subName.toLowerCase()} curated under ${catName}. Authentic weaves from certified master artisan workshops.`;
    } else {
      breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/shop">Shop</a> <span>/</span> <span class="current">${subName}</span>`;
      shopTitle.textContent = subName;
      shopDesc.textContent = `Handcrafted ${subName.toLowerCase()} from our curated artisan archives.`;
    }
  } else if (state.activeCategory) {
    const cat = state.categories.find((c) => c.id === state.activeCategory || c.slug === state.activeCategory);
    const catName = cat ? cat.name : 'Category';
    breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/shop">Shop</a> <span>/</span> <span class="current">${catName}</span>`;
    shopTitle.textContent = `${catName} Collection`;
    shopDesc.textContent = `Handcrafted artisanal pieces curated under ${catName}. Regional handloom heritage and direct collective compensation.`;
  } else if (state.activeOccasion) {
    breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/shop">Shop</a> <span>/</span> <span class="current">${state.activeOccasion}</span>`;
    shopTitle.textContent = `${state.activeOccasion} Edit`;
    shopDesc.textContent = `Regal couture designed for grand festivities, weddings, and ceremonial celebrations.`;
  } else if (state.activeAudience) {
    const audLabel = state.activeAudience === 'WOMEN' ? "Women's Collection" : state.activeAudience === 'MEN' ? "Men's Collection" : state.activeAudience === 'KIDS' ? "Kids Collection" : state.activeAudience;
    breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <a href="/shop">Shop</a> <span>/</span> <span class="current">${audLabel}</span>`;
    shopTitle.textContent = audLabel;
    shopDesc.textContent = state.activeAudience === 'KIDS'
      ? 'Handcrafted heirloom ensembles for young princes and princesses. Age groups 2-3Y to 13-14Y. Currently preparing new artisan batches.'
      : `Curated handcrafted creations tailored for ${audLabel.toLowerCase()}. Direct weaver guild compensation and certified pure silk fabrics.`;
  } else {
    breadcrumbs.innerHTML = `<a href="/">Home</a> <span>/</span> <span class="current">All Collections</span>`;
    shopTitle.textContent = 'Handcrafted Luxury Catalogue';
    shopDesc.textContent = 'Explore authentic hand-drawn Mithila sarees, regal Banarasi weaves, and bespoke tailoring directly from verified master guilds.';
  }

  // Render Subcategory Bar
  const subcatBar = document.getElementById('shop-subcategories-bar');
  if (subcatBar) {
    let availableSubs = [];
    if (state.activeCategory) {
      const cat = state.categories.find((c) => c.id === state.activeCategory || c.slug === state.activeCategory);
      if (cat && cat.subcategories) availableSubs = cat.subcategories;
    } else if (state.activeAudience) {
      const audUpper = state.activeAudience.toUpperCase();
      let targetCatIds = [];
      if (audUpper === 'WOMEN') targetCatIds = ['cat_ethnic', 'cat_wedding', 'cat_women', 'cat_accessories'];
      else if (audUpper === 'MEN') targetCatIds = ['cat_men', 'cat_footwear'];
      else if (audUpper === 'KIDS') targetCatIds = ['cat_kids'];

      state.categories.forEach((c) => {
        if (targetCatIds.includes(c.id) && c.subcategories) {
          availableSubs.push(...c.subcategories);
        }
      });
    }

    if (availableSubs.length > 0) {
      subcatBar.style.display = 'block';
      const allActive = !state.activeSubcategory;
      subcatBar.innerHTML = `
        <div class="subcat-pills-container">
          <button type="button" class="subcat-pill ${allActive ? 'active' : ''}" onclick="selectSubcategory('')">
            All Creations
          </button>
          ${availableSubs
            .map((sub) => {
              const isSubActive = state.activeSubcategory === sub.id || state.activeSubcategory === sub.slug;
              return `
                <button type="button" class="subcat-pill ${isSubActive ? 'active' : ''}" onclick="selectSubcategory('${sub.slug || sub.id}')">
                  ${sub.name}
                </button>
              `;
            })
            .join('')}
        </div>
      `;
    } else {
      subcatBar.style.display = 'none';
      subcatBar.innerHTML = '';
    }
  }

  // Render Active Filter Chips
  renderActiveFilterChips();

  // Fetch filtered products
  const queryParams = new URLSearchParams();
  if (state.activeAudience) queryParams.append('audience', state.activeAudience);
  if (state.activeCategory) queryParams.append('categoryId', state.activeCategory);
  if (state.activeSubcategory) queryParams.append('subcategoryId', state.activeSubcategory);
  if (state.activeOccasion) queryParams.append('occasion', state.activeOccasion);
  if (state.activeFabric) queryParams.append('fabric', state.activeFabric);
  if (state.activeSort) queryParams.append('sort', state.activeSort);

  try {
    const res = await fetch(`/api/v1/products?${queryParams.toString()}`);
    const json = await res.json();
    let products = json.success ? json.data : [];

    // Client-side Price Range Filter
    if (state.activePrice) {
      products = products.filter((item) => {
        const vPrice = item.variants[0]?.price || 0;
        if (state.activePrice === 'under_5000') return vPrice < 5000;
        if (state.activePrice === '5000_15000') return vPrice >= 5000 && vPrice <= 15000;
        if (state.activePrice === '15000_30000') return vPrice >= 15000 && vPrice <= 30000;
        if (state.activePrice === 'above_30000') return vPrice > 30000;
        return true;
      });
    }

    if (countBadge) countBadge.textContent = `Showing ${products.length} Creation${products.length === 1 ? '' : 's'}`;

    if (products.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (container) {
        container.innerHTML = products.map((item) => renderProductCardHtml(item)).join('');
      }
    }
  } catch (err) {
    console.error('Error filtering catalog:', err);
  }
}

function renderActiveFilterChips() {
  const container = document.getElementById('active-filters-container');
  const chipsWrap = document.getElementById('active-filter-chips');
  if (!container || !chipsWrap) return;

  const chips = [];
  if (state.activeAudience) {
    const audLabel = state.activeAudience === 'WOMEN' ? 'Women' : state.activeAudience === 'MEN' ? 'Men' : state.activeAudience === 'KIDS' ? 'Kids' : state.activeAudience;
    chips.push({ key: 'audience', label: `Audience: ${audLabel}` });
  }
  if (state.activeCategory) {
    const cat = state.categories.find((c) => c.id === state.activeCategory);
    chips.push({ key: 'category', label: `Category: ${cat?.name || state.activeCategory}` });
  }
  if (state.activeSubcategory) {
    let subName = state.activeSubcategory;
    for (const c of state.categories) {
      const found = (c.subcategories || []).find(
        (s) => s.id === state.activeSubcategory || s.slug === state.activeSubcategory
      );
      if (found) {
        subName = found.name;
        break;
      }
    }
    chips.push({ key: 'subcategory', label: `Subcategory: ${subName}` });
  }
  if (state.activeOccasion) {
    chips.push({ key: 'occasion', label: `Occasion: ${state.activeOccasion}` });
  }
  if (state.activeFabric) {
    chips.push({ key: 'fabric', label: `Fabric: ${state.activeFabric}` });
  }
  if (state.activePrice) {
    chips.push({ key: 'price', label: `Price: ${state.activePrice.replace('_', '–')}` });
  }

  if (chips.length === 0) {
    container.style.display = 'none';
    chipsWrap.innerHTML = '';
  } else {
    container.style.display = 'flex';
    chipsWrap.innerHTML = chips
      .map(
        (chip) => `
      <span class="active-chip">
        ${chip.label}
        <button onclick="removeFilter('${chip.key}')" aria-label="Remove filter">✕</button>
      </span>
    `
      )
      .join('');
  }
}

function selectSubcategory(subIdentifier) {
  let subObj = null;
  if (subIdentifier) {
    for (const c of state.categories) {
      const found = (c.subcategories || []).find(
        (s) => s.slug === subIdentifier || s.id === subIdentifier
      );
      if (found) {
        subObj = found;
        break;
      }
    }
  }

  const semanticSlug = subObj ? subObj.slug : (subIdentifier || '');
  state.activeSubcategory = semanticSlug;

  // Update browser URL if under audience or category
  if (state.activeAudience) {
    const base = `/${state.activeAudience.toLowerCase()}`;
    const url = semanticSlug ? `${base}/${semanticSlug}` : base;
    window.history.pushState({}, '', url);
  } else if (state.activeCategory) {
    const cat = state.categories.find((c) => c.id === state.activeCategory || c.slug === state.activeCategory);
    const base = `/category/${cat ? cat.slug : state.activeCategory}`;
    const url = semanticSlug ? `${base}/${semanticSlug}` : base;
    window.history.pushState({}, '', url);
  } else {
    const url = semanticSlug ? `/shop?subcategory=${semanticSlug}` : '/shop';
    window.history.pushState({}, '', url);
  }
  renderCatalogPage();
}

function onFilterChange() {
  state.activeCategory = document.getElementById('filter-category')?.value || '';
  state.activeOccasion = document.getElementById('filter-occasion')?.value || '';
  state.activeFabric = document.getElementById('filter-fabric')?.value || '';
  state.activePrice = document.getElementById('filter-price')?.value || '';
  state.activeSort = document.getElementById('filter-sort')?.value || '';
  renderCatalogPage();
}

function removeFilter(key) {
  if (key === 'audience') state.activeAudience = '';
  if (key === 'category') state.activeCategory = '';
  if (key === 'subcategory') state.activeSubcategory = '';
  if (key === 'occasion') state.activeOccasion = '';
  if (key === 'fabric') state.activeFabric = '';
  if (key === 'price') state.activePrice = '';
  renderCatalogPage();
}

function clearAllFilters() {
  state.activeAudience = '';
  state.activeCategory = '';
  state.activeSubcategory = '';
  state.activeOccasion = '';
  state.activeFabric = '';
  state.activePrice = '';
  state.activeSort = '';
  state.searchQuery = '';
  renderCatalogPage();
}

function renderProductCardHtml(item) {
  const prod = item.product;
  const primaryVariant = item.variants[0] || {};
  const isWishlisted = state.wishlist.includes(prod.id);
  const discountPct =
    primaryVariant.mrp && primaryVariant.price
      ? Math.round(((primaryVariant.mrp - primaryVariant.price) / primaryVariant.mrp) * 100)
      : 0;
  const mainImage = (prod.images && prod.images[0]) || '/assets/campaigns/campaign-sarees.jpg';
  const secondaryImage = (prod.images && prod.images[1]) || null;

  // Extract unique colors for swatches
  const colorMap = new Map();
  (item.variants || []).forEach((v) => {
    if (v.colorHex && !colorMap.has(v.colorHex)) {
      colorMap.set(v.colorHex, v.colorName || 'Color');
    }
  });
  const colorSwatchesHtml = colorMap.size > 1
    ? `<div class="product-swatches" aria-label="Available colours">
        ${Array.from(colorMap.entries()).slice(0, 4).map(([hex, name]) =>
          `<span class="color-swatch-dot" style="background-color: ${hex};" title="${name}"></span>`
        ).join('')}
       </div>`
    : '';

  return `
    <div class="product-card" data-product-id="${prod.id}">
      <div class="product-card__image product-card-img-wrap product-card-media">
        <a href="/product/${prod.slug}" class="product-card-link-overlay" aria-label="${prod.title}">
          <img src="${mainImage}" alt="${prod.title}" class="product-card-img-primary" loading="lazy">
          ${secondaryImage ? `<img src="${secondaryImage}" alt="${prod.title} (alternate view)" class="product-card-img-secondary" loading="lazy">` : ''}
        </a>
        <span class="card-badge-top-left">${prod.fabricMaterial || 'Handloom'}</span>
        <button type="button" class="card-wishlist-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlistItem('${prod.id}')" aria-label="${isWishlisted ? 'Remove from Wishlist' : 'Save to Wishlist'}" title="${isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isWishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
        </button>
        <!-- Desktop Quick View Button -->
        <button type="button" class="card-quick-view-btn desktop-only" onclick="openQuickView('${prod.id}')" aria-label="Quick preview ${prod.title}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span>Quick View</span>
        </button>
      </div>
      <div class="product-card-body">
        <div class="product-card-meta-row">
          <span class="product-card-seller">by ${item.sellerStoreName}</span>
          ${colorSwatchesHtml}
        </div>
        <h3 class="product-card-title"><a href="/product/${prod.slug}">${prod.title}</a></h3>
        <div class="product-card-pricing">
          <span class="card-price">${formatPrice(primaryVariant.price)}</span>
          ${primaryVariant.mrp && primaryVariant.mrp > primaryVariant.price ? `<span class="card-mrp">${formatPrice(primaryVariant.mrp)}</span>` : ''}
          ${discountPct > 0 ? `<span class="card-discount">${discountPct}% OFF</span>` : ''}
        </div>
        <div class="product-card-actions">
          <button type="button" class="btn btn-card-quick-add" onclick="quickAddProductToCart('${primaryVariant.id}')" aria-label="Add ${prod.title} to Shopping Bag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
            <span>Add to Bag</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// PAGE 3: DEDICATED PRODUCT DETAIL PAGE (/product/:slug)
// --------------------------------------------------------------------------
async function renderProductDetailPage(slug) {
  const mainContent = document.getElementById('pdp-main-content');
  const notFoundState = document.getElementById('pdp-not-found');
  const relatedSection = document.getElementById('pdp-related-section');

  try {
    const res = await fetch(`/api/v1/products/${slug}`);
    const json = await res.json();

    if (!json.success || !json.data) {
      if (mainContent) mainContent.style.display = 'none';
      if (relatedSection) relatedSection.style.display = 'none';
      if (notFoundState) notFoundState.style.display = 'block';
      document.title = 'Garment Not Found — ICM Madhubani';
      return;
    }

    if (notFoundState) notFoundState.style.display = 'none';
    if (mainContent) mainContent.style.display = 'grid';
    if (relatedSection) relatedSection.style.display = 'block';

    const item = json.data;
    const prod = item.product;
    const variants = item.variants;
    state.activePdpProduct = prod;
    state.activePdpVariants = variants;
    state.selectedVariant = variants[0] || null;
    state.pdpQuantity = 1;

    // Track in recently viewed
    trackRecentlyViewed(prod.id);

    document.title = `${prod.title} — ICM Madhubani Handcrafted Luxury`;

    // Hierarchical Breadcrumbs
    const breadcrumbsNav = document.getElementById('pdp-breadcrumbs');
    if (breadcrumbsNav) {
      const cat = state.categories.find((c) => c.id === prod.categoryId || c.slug === prod.categoryId);
      const sub = cat?.subcategories?.find((s) => s.id === prod.subcategoryId || s.slug === prod.subcategoryId);
      let bHtml = `<a href="/">Home</a> <span>/</span> <a href="/shop">Shop</a>`;
      if (cat) {
        bHtml += ` <span>/</span> <a href="/category/${cat.slug}">${cat.name}</a>`;
        if (sub) {
          bHtml += ` <span>/</span> <a href="/category/${cat.slug}/${sub.slug}">${sub.name}</a>`;
        }
      }
      bHtml += ` <span>/</span> <span class="current">${prod.title}</span>`;
      breadcrumbsNav.innerHTML = bHtml;
    }

    // Gallery & Weave Inspection Zoom
    const mainImg = document.getElementById('pdp-main-img');
    const thumbStrip = document.getElementById('pdp-thumbnails');
    if (mainImg && prod.images.length) {
      mainImg.src = prod.images[0];
      mainImg.alt = prod.title;
    }
    if (thumbStrip) {
      thumbStrip.innerHTML = prod.images
        .map(
          (img, idx) => `
        <div class="pdp-thumb ${idx === 0 ? 'active' : ''}" onclick="switchPdpImage('${img}', this)">
          <img src="${img}" alt="${prod.title} thumbnail">
        </div>
      `
        )
        .join('');
    }
    initPdpZoom();

    // Info
    const sellerLink = document.getElementById('pdp-seller-link');
    if (sellerLink) {
      sellerLink.textContent = item.sellerStoreName || 'Master Guild';
      sellerLink.href = `/seller/${prod.sellerId}`;
      sellerLink.title = 'Visit verified artisan workshop';
    }
    document.getElementById('pdp-title').textContent = prod.title;
    document.getElementById('pdp-desc').textContent = prod.description;

    // Accordions
    document.getElementById('pdp-spec-fabric').textContent = `Material: ${prod.fabricMaterial} • Craft Tradition: ${prod.brandClaim}`;
    document.getElementById('pdp-spec-fit').textContent = `Fit: ${prod.fit} • Occasion: ${prod.occasion}`;
    document.getElementById('pdp-spec-care').textContent = prod.careInstructions;

    // Wishlist Button
    updatePdpWishlistState();

    // Render Variants (Colors & Sizes)
    renderPdpVariants();

    // Render Related Products
    renderPdpRelatedProducts(prod.categoryId, prod.id);
  } catch (err) {
    console.error('Error loading product detail:', err);
    if (mainContent) mainContent.style.display = 'none';
    if (notFoundState) notFoundState.style.display = 'block';
  }
}

function switchPdpImage(src, thumbEl) {
  const mainImg = document.getElementById('pdp-main-img');
  if (mainImg) mainImg.src = src;
  document.querySelectorAll('.pdp-thumb').forEach((el) => el.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
}

function initPdpZoom() {
  const stage = document.getElementById('pdp-zoom-stage');
  const img = document.getElementById('pdp-main-img');
  if (!stage || !img) return;

  stage.style.cursor = 'crosshair';
  stage.onmousemove = (e) => {
    const rect = stage.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    img.style.transformOrigin = `${x}% ${y}%`;
    img.style.transform = 'scale(2)';
  };
  stage.onmouseleave = () => {
    img.style.transformOrigin = 'center center';
    img.style.transform = 'scale(1)';
  };
}

function renderPdpVariants() {
  const variants = state.activePdpVariants;
  const current = state.selectedVariant;
  if (!variants.length || !current) return;

  // Colors
  const colorsContainer = document.getElementById('pdp-color-swatches');
  const selectedColorLabel = document.getElementById('pdp-selected-color');
  if (selectedColorLabel) selectedColorLabel.textContent = current.colorName;

  // Unique colors
  const uniqueColors = Array.from(new Set(variants.map((v) => v.colorHex))).map((hex) => {
    return variants.find((v) => v.colorHex === hex);
  });

  if (colorsContainer) {
    colorsContainer.innerHTML = uniqueColors
      .map(
        (v) => `
      <button class="color-swatch-btn ${v.colorHex === current.colorHex ? 'active' : ''}" 
        style="background: ${v.colorHex};" 
        title="${v.colorName}"
        onclick="selectPdpColor('${v.colorHex}')">
      </button>
    `
      )
      .join('');
  }

  // Sizes for current color
  const sizesContainer = document.getElementById('pdp-size-pills');
  const selectedSizeLabel = document.getElementById('pdp-selected-size');
  if (selectedSizeLabel) selectedSizeLabel.textContent = current.sizeName;

  const colorVariants = variants.filter((v) => v.colorHex === current.colorHex);
  if (sizesContainer) {
    sizesContainer.innerHTML = colorVariants
      .map((v) => {
        const isSelected = v.id === current.id;
        const isOutOfStock = v.availableStock <= 0;
        return `
        <button class="size-pill-btn ${isSelected ? 'active' : ''} ${isOutOfStock ? 'disabled' : ''}"
          ${isOutOfStock ? 'disabled' : ''}
          onclick="selectPdpVariant('${v.id}')">
          ${v.sizeName}
        </button>
      `;
      })
      .join('');
  }

  // Price & Stock
  const priceEl = document.getElementById('pdp-price');
  const mrpEl = document.getElementById('pdp-mrp');
  const discountEl = document.getElementById('pdp-discount');

  if (priceEl) priceEl.textContent = `₹${current.price.toLocaleString('en-IN')}`;
  if (mrpEl) mrpEl.textContent = `₹${current.mrp.toLocaleString('en-IN')}`;
  if (discountEl) {
    const pct = Math.round(((current.mrp - current.price) / current.mrp) * 100);
    discountEl.textContent = `${pct}% OFF`;
  }

  // Stock Status Indicator
  const stockEl = document.getElementById('pdp-stock-text');
  const indicator = document.querySelector('.stock-indicator');
  const addBtn = document.getElementById('pdp-btn-add-bag');
  const buyBtn = document.getElementById('pdp-btn-buy-now');

  if (current.availableStock > 3) {
    if (stockEl) stockEl.textContent = `In Stock (${current.availableStock} pieces available in atelier)`;
    if (indicator) {
      indicator.className = 'stock-indicator green';
    }
    if (addBtn) addBtn.disabled = false;
    if (buyBtn) buyBtn.disabled = false;
  } else if (current.availableStock > 0) {
    if (stockEl) stockEl.textContent = `Artisanal Scarcity — Only ${current.availableStock} pieces remaining`;
    if (indicator) {
      indicator.className = 'stock-indicator orange';
    }
    if (addBtn) addBtn.disabled = false;
    if (buyBtn) buyBtn.disabled = false;
  } else {
    if (stockEl) stockEl.textContent = 'Sold Out in Atelier Archives';
    if (indicator) {
      indicator.className = 'stock-indicator red';
    }
    if (addBtn) addBtn.disabled = true;
    if (buyBtn) buyBtn.disabled = true;
  }
}

function selectPdpColor(hex) {
  const match = state.activePdpVariants.find((v) => v.colorHex === hex);
  if (match) {
    state.selectedVariant = match;
    renderPdpVariants();
  }
}

function selectPdpVariant(variantId) {
  const match = state.activePdpVariants.find((v) => v.id === variantId);
  if (match) {
    state.selectedVariant = match;
    renderPdpVariants();
  }
}

function incrementPdpQty() {
  const max = state.selectedVariant?.availableStock || 1;
  if (state.pdpQuantity < max) {
    state.pdpQuantity++;
    document.getElementById('pdp-qty-val').textContent = state.pdpQuantity;
  } else {
    showToast(`Maximum atelier availability reached (${max} units)`);
  }
}

function decrementPdpQty() {
  if (state.pdpQuantity > 1) {
    state.pdpQuantity--;
    document.getElementById('pdp-qty-val').textContent = state.pdpQuantity;
  }
}

async function handlePdpAddToBag() {
  if (!state.selectedVariant) return;
  await addVariantToCart(state.selectedVariant.id, state.pdpQuantity);
  showToast(`Added ${state.activePdpProduct?.title} (${state.selectedVariant.sizeName}) to your shopping bag.`);
}

async function handlePdpBuyNow() {
  if (!state.selectedVariant) return;
  await addVariantToCart(state.selectedVariant.id, state.pdpQuantity);
  navigateTo('/checkout');
}

function updatePdpWishlistState() {
  const btn = document.getElementById('pdp-btn-wishlist');
  if (!btn || !state.activePdpProduct) return;
  const isSaved = state.wishlist.includes(state.activePdpProduct.id);
  btn.classList.toggle('active', isSaved);
  btn.querySelector('svg').setAttribute('fill', isSaved ? 'currentColor' : 'none');
}

function handlePdpWishlistToggle() {
  if (!state.activePdpProduct) return;
  toggleWishlistItem(state.activePdpProduct.id);
  updatePdpWishlistState();
}

async function renderPdpRelatedProducts(categoryId, currentId) {
  const container = document.getElementById('pdp-related-grid');
  if (!container) return;

  const matches = state.products.filter((p) => p.product.categoryId === categoryId && p.product.id !== currentId).slice(0, 3);
  if (matches.length === 0) {
    document.getElementById('pdp-related-section').style.display = 'none';
  } else {
    document.getElementById('pdp-related-section').style.display = 'block';
    container.innerHTML = matches.map((item) => renderProductCardHtml(item)).join('');
  }
}

// --------------------------------------------------------------------------
// PAGE 4: ARTISAN GUILDS & BRANDS DIRECTORY (/brands)
// --------------------------------------------------------------------------
async function renderBrandsDirectoryPage() {
  const container = document.getElementById('brands-directory-grid');
  if (!container) return;

  try {
    const res = await fetch('/api/v1/sellers');
    const json = await res.json();
    if (json.success && json.data.length) {
      container.innerHTML = json.data
        .map(
          (seller) => `
        <div class="guild-card">
          <div class="guild-card-header">
            <div class="guild-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
            </div>
            <div>
              <h3 class="guild-name">${seller.storeName}</h3>
              <span class="guild-provenance-tag">Curated Master Guild</span>
            </div>
          </div>
          <p class="guild-desc">
            Authentic generational handloom collective. Operating with pure silk yarns, authentic zari filaments, and regional handloom craft heritage.
          </p>
          <div style="margin-top: auto;">
            <a href="/seller/${seller.id}" class="btn btn-gold btn-sm w-100">View Workshop Collections →</a>
          </div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading brands directory:', err);
  }
}

// --------------------------------------------------------------------------
// PAGE 5: DEDICATED SELLER STOREFRONT (/seller/:slug)
// --------------------------------------------------------------------------
async function renderSellerStorefrontPage(sellerId) {
  const container = document.getElementById('seller-products-grid');
  const nameEl = document.getElementById('seller-profile-name');
  const crumbEl = document.getElementById('seller-crumb-name');

  try {
    const res = await fetch(`/api/v1/sellers/${sellerId}`);
    const json = await res.json();

    if (!json.success || !json.data) {
      if (nameEl) nameEl.textContent = 'Artisan Guild Not Found';
      if (container) container.innerHTML = '<p class="text-center">Artisan collective not found.</p>';
      return;
    }

    const { seller, products } = json.data;
    if (nameEl) nameEl.textContent = seller.storeName;
    if (crumbEl) crumbEl.textContent = seller.storeName;
    const bioEl = document.getElementById('seller-profile-bio');
    if (bioEl) {
      bioEl.textContent = seller.registeredAddress
        ? `📍 Registered Atelier: ${seller.registeredAddress} • Generational handloom workshop partnering with direct 88% collective compensation.`
        : 'Preserving generational craft heritage with authentic handloom and bespoke apparel.';
    }
    document.title = `${seller.storeName} — Handloom Atelier | ICM Madhubani`;

    if (container) {
      if (products.length === 0) {
        container.innerHTML = '<p class="text-center" style="grid-column: 1/-1;">No active garments currently listed for this atelier.</p>';
      } else {
        container.innerHTML = products.map((item) => renderProductCardHtml(item)).join('');
      }
    }
  } catch (err) {
    console.error('Error loading seller storefront:', err);
  }
}

// --------------------------------------------------------------------------
// PAGE 6: SEARCH RESULTS PAGE (/search)
// --------------------------------------------------------------------------
async function renderSearchPage(query) {
  const container = document.getElementById('search-products-grid');
  const emptyState = document.getElementById('search-empty-state');
  const countBadge = document.getElementById('search-results-count');
  const searchInput = document.getElementById('search-page-input');
  const title = document.getElementById('search-title');

  if (searchInput) searchInput.value = query;
  if (title) title.textContent = query ? `Search Results for "${query}"` : 'Search Handcrafted Archives';

  if (!query) {
    if (container) container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (countBadge) countBadge.textContent = '0 Results';
    return;
  }

  try {
    const res = await fetch(`/api/v1/products?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    const products = json.success ? json.data : [];

    if (countBadge) countBadge.textContent = `${products.length} Result${products.length === 1 ? '' : 's'}`;

    if (products.length === 0) {
      if (container) container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (container) {
        container.innerHTML = products.map((item) => renderProductCardHtml(item)).join('');
      }
    }
  } catch (err) {
    console.error('Error executing search:', err);
  }
}

function executeSearchPage() {
  const query = document.getElementById('search-page-input')?.value.trim() || '';
  navigateTo(`/search?q=${encodeURIComponent(query)}`);
}

function handleHeaderSearch(e) {
  e.preventDefault();
  const input = document.getElementById('header-search-input');
  const query = input?.value.trim() || '';
  if (query) {
    navigateTo(`/search?q=${encodeURIComponent(query)}`);
  }
}

// --------------------------------------------------------------------------
// PAGE 7: WISHLIST PAGE (/wishlist)
// --------------------------------------------------------------------------
function renderWishlistPage() {
  const container = document.getElementById('wishlist-products-grid');
  const emptyState = document.getElementById('wishlist-empty-state');
  const countBadge = document.getElementById('wishlist-page-count');

  const savedProducts = state.products.filter((p) => state.wishlist.includes(p.product.id));

  if (countBadge) {
    countBadge.textContent = `${savedProducts.length} Saved Creation${savedProducts.length === 1 ? '' : 's'}`;
  }

  if (savedProducts.length === 0) {
    if (container) container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (container) {
      container.innerHTML = savedProducts.map((item) => renderProductCardHtml(item)).join('');
    }
  }
}

function toggleWishlistItem(productId) {
  const idx = state.wishlist.indexOf(productId);
  let isAdded = false;
  if (idx > -1) {
    state.wishlist.splice(idx, 1);
    showToast('Removed item from your wishlist');
  } else {
    state.wishlist.push(productId);
    showToast('Saved item to your wishlist');
    isAdded = true;
  }
  localStorage.setItem('icm_wishlist', JSON.stringify(state.wishlist));
  updateWishlistBadge();

  // Instant UI feedback on matching buttons across the page
  document.querySelectorAll(`.product-card[data-product-id="${productId}"] .card-wishlist-btn`).forEach((btn) => {
    if (isAdded) {
      btn.classList.add('active');
      btn.setAttribute('aria-label', 'Remove from Wishlist');
      btn.setAttribute('title', 'Saved in Wishlist');
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', 'currentColor');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-label', 'Save to Wishlist');
      btn.setAttribute('title', 'Add to Wishlist');
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', 'none');
    }
  });

  if (state.currentPath === '/wishlist') {
    renderWishlistPage();
  }
}

function updateWishlistBadge() {
  const count = (state.wishlist || []).length;
  const badges = document.querySelectorAll('#wishlist-badge, .wishlist-count-drawer');
  badges.forEach((b) => {
    b.textContent = count;
    b.style.display = count > 0 ? 'inline-block' : 'none';
  });
}

// --------------------------------------------------------------------------
// PAGE 8: SHOPPING BAG / CART (/cart)
// --------------------------------------------------------------------------
async function renderCartPage() {
  const container = document.getElementById('cart-items-container');
  const emptyState = document.getElementById('cart-empty-state');
  const contentGrid = document.getElementById('cart-content-grid');

  if (state.cart.length === 0) {
    if (contentGrid) contentGrid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (contentGrid) contentGrid.style.display = 'grid';

  // Request Authoritative Repricing from Backend
  const repriceData = await repriceCartOnBackend();

  if (!repriceData || !repriceData.items) {
    if (container) container.innerHTML = '<p>Error loading cart details.</p>';
    return;
  }

  // Render items
  if (container) {
    container.innerHTML = repriceData.items
      .map(
        (item) => `
      <div class="cart-item-row">
        <div class="cart-item-thumb">
          <img src="${item.imageUrl || item.productImage || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=300&q=80'}" alt="${item.productTitle}">
        </div>
        <div class="cart-item-info">
          <h4 class="cart-item-title">${item.productTitle}</h4>
          <span class="cart-item-meta">Size: ${item.sizeName} • Color: ${item.colorName}</span>
          <span class="cart-item-meta">SKU: ${item.sku}</span>
          <div class="cart-item-actions">
            <div class="pdp-quantity-stepper">
              <button onclick="updateCartItemQty('${item.variantId}', ${item.quantity - 1})">−</button>
              <span>${item.quantity}</span>
              <button onclick="updateCartItemQty('${item.variantId}', ${item.quantity + 1})">+</button>
            </div>
            <button class="btn-remove-item" onclick="removeCartItem('${item.variantId}')">Remove</button>
          </div>
          <span class="cart-item-price">₹${item.lineTotal.toLocaleString('en-IN')}</span>
        </div>
      </div>
    `
      )
      .join('');
  }

  // Render Summary
  const subtotal = repriceData.subtotal || 0;
  const shipping = repriceData.shippingFee || 0;
  const grandTotal = repriceData.totalAmount || repriceData.grandTotal || (subtotal + shipping);

  const tax = repriceData.taxAmount || 0;

  document.getElementById('cart-subtotal-val').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  const taxEl = document.getElementById('cart-tax-val');
  if (taxEl) taxEl.textContent = `₹${tax.toLocaleString('en-IN')}`;
  document.getElementById('cart-shipping-val').textContent =
    shipping === 0 ? 'Complimentary' : `₹${shipping.toLocaleString('en-IN')}`;
  document.getElementById('cart-total-val').textContent = `₹${grandTotal.toLocaleString('en-IN')}`;

  // Shipping Progress
  const progressText = document.getElementById('shipping-progress-text');
  const progressFill = document.getElementById('shipping-progress-fill');
  if (repriceData.subtotal >= 2999) {
    if (progressText) progressText.textContent = '✓ You qualify for Complimentary Secure Express Delivery';
    if (progressFill) progressFill.style.width = '100%';
  } else {
    const diff = 2999 - repriceData.subtotal;
    if (progressText) progressText.textContent = `Add ₹${diff.toLocaleString('en-IN')} more for Complimentary Secure Delivery`;
    if (progressFill) progressFill.style.width = `${Math.min(100, Math.round((repriceData.subtotal / 2999) * 100))}%`;
  }
}

async function repriceCartOnBackend() {
  if (state.cart.length === 0) return null;
  try {
    const res = await fetch('/api/v1/cart/reprice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: state.cart }),
    });
    const json = await res.json();
    if (json.success) {
      state.repricedCart = json.data;
      return json.data;
    }
  } catch (err) {
    console.error('Cart repricing failed:', err);
  }
  return null;
}

async function addVariantToCart(variantId, qty = 1) {
  const existing = state.cart.find((i) => i.variantId === variantId);
  if (existing) {
    existing.quantity += qty;
  } else {
    state.cart.push({ variantId, quantity: qty });
  }
  localStorage.setItem('icm_cart', JSON.stringify(state.cart));
  updateCartBadge();
  await repriceCartOnBackend();
}

async function quickAddProductToCart(variantId) {
  await addVariantToCart(variantId, 1);
  showToast('Garment added to your curated shopping bag');
}

async function updateCartItemQty(variantId, newQty) {
  if (newQty <= 0) {
    removeCartItem(variantId);
    return;
  }
  const item = state.cart.find((i) => i.variantId === variantId);
  if (item) {
    item.quantity = newQty;
    localStorage.setItem('icm_cart', JSON.stringify(state.cart));
    updateCartBadge();
    renderCartPage();
  }
}

function removeCartItem(variantId) {
  state.cart = state.cart.filter((i) => i.variantId !== variantId);
  localStorage.setItem('icm_cart', JSON.stringify(state.cart));
  updateCartBadge();
  renderCartPage();
}

function updateCartBadge() {
  const count = (state.cart || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
  const badges = document.querySelectorAll('#cart-badge, #cart-badge-mobile, .cart-count-drawer');
  badges.forEach((b) => {
    b.textContent = count;
    b.style.display = count > 0 ? 'inline-block' : 'none';
  });
}

// --------------------------------------------------------------------------
// PAGE 9: CHECKOUT PAGE (/checkout)
// --------------------------------------------------------------------------
async function renderCheckoutPage() {
  const mainGrid = document.getElementById('checkout-main-grid');
  const successScreen = document.getElementById('order-success-screen');

  if (successScreen) successScreen.style.display = 'none';
  if (mainGrid) mainGrid.style.display = 'grid';

  if (state.cart.length === 0) {
    navigateTo('/cart');
    return;
  }

  const reprice = await repriceCartOnBackend();
  if (!reprice) return;

  const itemsList = document.getElementById('checkout-items-list');
  if (itemsList) {
    itemsList.innerHTML = reprice.items
      .map(
        (i) => `
      <div class="summary-line">
        <span>${i.productTitle} (${i.sizeName}) × ${i.quantity}</span>
        <strong>₹${i.lineTotal.toLocaleString('en-IN')}</strong>
      </div>
    `
      )
      .join('');
  }

  const subtotal = reprice.subtotal || 0;
  const shipping = reprice.shippingFee || 0;
  const grandTotal = reprice.totalAmount || reprice.grandTotal || (subtotal + shipping);
  const tax = reprice.taxAmount || 0;

  document.getElementById('chk-subtotal-val').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  const chkTaxEl = document.getElementById('chk-tax-val');
  if (chkTaxEl) chkTaxEl.textContent = `₹${tax.toLocaleString('en-IN')}`;
  document.getElementById('chk-shipping-val').textContent =
    shipping === 0 ? 'Complimentary' : `₹${shipping.toLocaleString('en-IN')}`;
  document.getElementById('chk-total-val').textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
}

async function submitPatronOrder(e) {
  e.preventDefault();
  if (!state.customerToken) {
    await setupInitialPatronSession();
  }

  const name = document.getElementById('chk-name').value.trim();
  const phone = document.getElementById('chk-phone').value.trim();
  const address = document.getElementById('chk-address').value.trim();
  const city = document.getElementById('chk-city').value.trim();
  const stateVal = document.getElementById('chk-state').value.trim();
  const pincode = document.getElementById('chk-pincode').value.trim();
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'PAYTM';

  const payload = {
    items: state.cart,
    paymentMethod,
    shippingAddress: {
      recipientName: name,
      street: address,
      city,
      state: stateVal,
      postalCode: pincode,
      country: 'India',
      phone,
    },
  };

  try {
    const res = await fetch('/api/v1/checkout/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.customerToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success && json.data) {
      // Clear cart
      state.cart = [];
      localStorage.setItem('icm_cart', '[]');
      updateCartBadge();

      // Show success screen
      document.getElementById('checkout-main-grid').style.display = 'none';
      const successScreen = document.getElementById('order-success-screen');
      successScreen.style.display = 'block';

      const orderId = json.data.id || json.data.orderId || json.data.orderNumber;
      document.getElementById('confirmed-order-id').textContent = orderId;
      document.getElementById('btn-view-confirmed-order').href = `/account/orders/${orderId}`;

      if (json.payment) {
        showToast(`Paytm Transaction Initiated (${json.payment.status}) &bull; Order ${json.data.orderNumber}`);
      }
    } else {
      alert(`Order placement failed: ${json.error?.message || 'Please check stock or payment options'}`);
    }
  } catch (err) {
    console.error('Order submission error:', err);
    alert('An unexpected error occurred while confirming your order. Please try again.');
  }
}

// --------------------------------------------------------------------------
// PAGE 10, 11, 12, 13: PATRON DASHBOARD, ORDERS & RETURNS
// --------------------------------------------------------------------------
function renderAccountOverview() {
  const emailEl = document.getElementById('acc-user-email');
  if (emailEl) {
    emailEl.textContent = 'patron.mithila@icm-madhubani.local';
  }
}

async function renderAccountOrders() {
  const container = document.getElementById('account-orders-list');
  const emptyState = document.getElementById('orders-empty-state');
  if (!container) return;

  if (!state.customerToken) {
    await setupInitialPatronSession();
  }

  try {
    const res = await fetch('/api/v1/customer/orders', {
      headers: { Authorization: `Bearer ${state.customerToken}` },
    });
    const json = await res.json();
    const orders = json.success ? json.data : [];

    if (orders.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      container.innerHTML = orders
        .map(
          (ord) => `
        <div class="order-card">
          <div class="order-card-header">
            <div class="order-meta-info">
              <span>Order ID</span>
              <strong>${ord.id}</strong>
            </div>
            <div class="order-meta-info">
              <span>Placed On</span>
              <strong>${new Date(ord.createdAt).toLocaleDateString()}</strong>
            </div>
            <div class="order-meta-info">
              <span>Total Payable</span>
              <strong>₹${ord.grandTotal.toLocaleString('en-IN')}</strong>
            </div>
            <span class="status-pill ${ord.paymentStatus === 'PAID' ? 'paid' : 'pending'}">${ord.paymentStatus}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
            <span style="font-size: 0.85rem; color: var(--color-stone-muted);">${ord.items?.length || 1} Item(s) in Parcel</span>
            <a href="/account/orders/${ord.id}" class="btn btn-outline-gold btn-sm">Inspect Order Package →</a>
          </div>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading account orders:', err);
  }
}

async function renderAccountOrderDetail(orderId) {
  const container = document.getElementById('order-detail-content');
  const crumb = document.getElementById('order-detail-crumb');
  if (!container) return;

  if (crumb) crumb.textContent = orderId;

  if (!state.customerToken) {
    await setupInitialPatronSession();
  }

  try {
    const res = await fetch(`/api/v1/customer/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${state.customerToken}` },
    });
    const json = await res.json();

    if (!json.success || !json.data) {
      container.innerHTML = '<p class="text-center">Order details not found.</p>';
      return;
    }

    const { order, subOrders } = json.data;

    container.innerHTML = `
      <div class="order-card-header">
        <div>
          <h2 style="font-family: var(--font-heading); margin: 0 0 4px; color: var(--color-warm-white);">Order #${order.id}</h2>
          <span style="font-size: 0.8rem; color: var(--color-stone-muted);">Placed on ${new Date(order.createdAt).toLocaleString()}</span>
        </div>
        <span class="status-pill ${order.paymentStatus === 'PAID' ? 'paid' : 'pending'}">${order.paymentStatus}</span>
      </div>

      <h3 style="font-family: var(--font-heading); margin: 24px 0 12px; color: var(--color-warm-white);">Artisan Guild Packages (${subOrders.length})</h3>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${subOrders
          .map(
            (so) => `
          <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); padding: 18px; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 0.8rem; color: var(--color-zari-gold); text-transform: uppercase;">Package: ${so.id}</span>
              <span class="status-pill ${so.fulfilmentStatus.toLowerCase()}">${so.fulfilmentStatus}</span>
            </div>
            <div style="font-size: 0.9rem; color: var(--color-warm-white); margin-bottom: 8px;">
              ${so.items.map((i) => `<div>${i.title} (${i.sizeName}) × ${i.quantity} — ₹${i.lineTotal.toLocaleString('en-IN')}</div>`).join('')}
            </div>
            ${so.trackingNumber ? `<span style="font-size: 0.78rem; color: var(--color-stone-muted);">Courier Tracking: <strong>${so.trackingNumber}</strong> (${so.carrierName || 'Handloom Express'})</span>` : ''}
          </div>
        `
          )
          .join('')}
      </div>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 1rem; color: var(--color-warm-white);">Total Order Amount:</span>
        <strong style="font-size: 1.4rem; color: var(--color-zari-gold);">₹${order.grandTotal.toLocaleString('en-IN')}</strong>
      </div>

      <div style="margin-top: 24px;">
        <a href="/account/returns" class="btn btn-outline-white btn-sm">Need Help with this Order? Request Return / Exchange</a>
      </div>
    `;
  } catch (err) {
    console.error('Error loading order detail:', err);
  }
}

async function renderAccountReturns() {
  const orderSelect = document.getElementById('return-order-select');
  if (!orderSelect) return;

  if (!state.customerToken) {
    await setupInitialPatronSession();
  }

  try {
    const res = await fetch('/api/v1/customer/orders', {
      headers: { Authorization: `Bearer ${state.customerToken}` },
    });
    const json = await res.json();
    if (json.success && json.data.length) {
      orderSelect.innerHTML =
        '<option value="">Select an eligible order</option>' +
        json.data.map((o) => `<option value="${o.id}">Order #${o.id.substring(0, 8)} (₹${o.grandTotal})</option>`).join('');
    }
  } catch (err) {
    console.error('Error populating return orders:', err);
  }
}

function populateReturnItems() {
  const orderId = document.getElementById('return-order-select').value;
  const itemSelect = document.getElementById('return-item-select');
  if (!itemSelect) return;

  if (!orderId) {
    itemSelect.innerHTML = '<option value="">Select an item from the order</option>';
    return;
  }

  // Populate placeholder or real item
  itemSelect.innerHTML = `
    <option value="item_1">Handcrafted Silk Couture Garment (Standard Fit)</option>
    <option value="item_2">Entire Multi-Garment Commission Package</option>
  `;
}

function submitReturnRequest(e) {
  e.preventDefault();
  alert('Your artisanal return request has been submitted to the ICM Concierge. A pickup agent will be dispatched within 48 hours.');
  navigateTo('/account');
}

// --------------------------------------------------------------------------
// SELLER & ADMIN CONSOLE HANDLERS
// --------------------------------------------------------------------------
function switchSellerSubRoute(sub) {
  document.querySelectorAll('.seller-sub-tab').forEach((el) => (el.style.display = 'none'));
  const target = document.getElementById(`seller-tab-${sub}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('#view-seller .tab-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('#view-seller .tab-btn')).find((b) =>
    b.getAttribute('onclick')?.includes(sub)
  );
  if (activeBtn) activeBtn.classList.add('active');

  initSellerWorkspace();
}

async function initSellerWorkspace() {
  if (!state.sellerToken) {
    try {
      const res = await fetch('/api/v1/auth/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'weaver@banaras.local', password: 'WeaverPass2026!#' }),
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

async function loadSellerOrders() {
  if (!state.sellerToken) return;
  try {
    const res = await fetch('/api/v1/seller/orders', {
      headers: { Authorization: `Bearer ${state.sellerToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('seller-orders-table-body');
    if (json.success && tbody) {
      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No orders currently awaiting fulfillment.</td></tr>';
      } else {
        tbody.innerHTML = json.data
          .map(
            (o) => `
          <tr>
            <td><code>${o.id}</code></td>
            <td>${o.parentOrderId.substring(0, 8)}...</td>
            <td>Domestic India</td>
            <td><span class="status-pill ${o.fulfilmentStatus.toLowerCase()}">${o.fulfilmentStatus}</span></td>
            <td>₹${o.payoutAmount.toLocaleString('en-IN')}</td>
            <td>
              ${
                o.fulfilmentStatus === 'PENDING'
                  ? `<button class="btn btn-gold btn-sm" onclick="fulfillOrder('${o.id}')">Fulfill</button>`
                  : 'Fulfilled'
              }
            </td>
          </tr>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('Error loading seller orders:', err);
  }
}

async function fulfillOrder(subOrderId) {
  if (!state.sellerToken) return;
  try {
    const res = await fetch(`/api/v1/seller/orders/${subOrderId}/fulfill`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.sellerToken}`,
      },
      body: JSON.stringify({
        trackingNumber: `EXP-${Math.floor(100000 + Math.random() * 900000)}`,
        carrierName: 'Handloom Express Air',
      }),
    });
    if (res.ok) {
      showToast('Order successfully marked as dispatched with tracking number.');
      loadSellerOrders();
    }
  } catch (err) {
    console.error('Fulfill order error:', err);
  }
}

async function loadSellerCatalog() {
  const tbody = document.getElementById('seller-catalog-table-body');
  if (tbody) {
    if (!state.products || state.products.length === 0) {
      await loadAllProducts();
    }
    const catMap = {};
    (state.categories || []).forEach((c) => {
      catMap[c.id] = c.name;
    });

    tbody.innerHTML = (state.products || [])
      .map(
        (p) => `
      <tr>
        <td><strong>${p.product.title}</strong></td>
        <td>${catMap[p.product.categoryId] || p.product.categoryId}</td>
        <td>${p.product.fabricMaterial}</td>
        <td><span class="status-pill paid">${p.product.moderationStatus}</span></td>
        <td>${p.product.isActive ? 'Active' : 'Unpublished'}</td>
        <td>
          <button class="btn btn-outline-dark btn-sm" onclick="toggleProductActive('${p.product.id}', ${!p.product.isActive})">
            ${p.product.isActive ? 'Unpublish' : 'Publish'}
          </button>
        </td>
      </tr>
    `
      )
      .join('');
  }
}

async function loadSellerInventory() {
  const tbody = document.getElementById('seller-inventory-table-body');
  if (!tbody) return;

  if (!state.products || state.products.length === 0) {
    await loadAllProducts();
  }

  const allVariants = [];
  (state.products || []).forEach((p) => {
    (p.variants || []).forEach((v) => {
      allVariants.push({
        ...v,
        productTitle: p.product.title,
      });
    });
  });

  if (allVariants.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No inventory variants found.</td></tr>';
    return;
  }

  tbody.innerHTML = allVariants
    .map(
      (v) => `
    <tr>
      <td><code>${v.sku}</code></td>
      <td>${v.colorName}</td>
      <td><strong>${v.sizeName}</strong></td>
      <td>₹${v.price.toLocaleString('en-IN')}</td>
      <td>
        <span class="${v.availableStock > 0 ? 'text-success' : 'text-danger'}" style="font-weight: 600;">
          ${v.availableStock} units
        </span>
      </td>
      <td>${v.reservedStock || 0}</td>
      <td>
        <button class="btn btn-outline-dark btn-sm" onclick="promptUpdateStock('${v.id}', ${v.availableStock})">
          Update Stock
        </button>
      </td>
    </tr>
  `
    )
    .join('');
}

function openAddProductModal() {
  const modal = document.getElementById('modal-seller-add-product');
  if (!modal) return;

  // Populate categories from active taxonomy
  const catSelect = document.getElementById('prod-category');
  if (catSelect) {
    const activeCats = (state.categories || []).filter((c) => c.isActive !== false);
    catSelect.innerHTML =
      '<option value="">-- Select from taxonomy --</option>' +
      activeCats.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  handleProductCategoryChange();
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAddProductModal() {
  const modal = document.getElementById('modal-seller-add-product');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function handleProductCategoryChange() {
  const catSelect = document.getElementById('prod-category');
  const subSelect = document.getElementById('prod-subcategory');
  if (!catSelect || !subSelect) return;

  const selectedCatId = catSelect.value;
  const category = (state.categories || []).find((c) => c.id === selectedCatId);

  if (category && category.subcategories && category.subcategories.length > 0) {
    subSelect.innerHTML =
      '<option value="">-- Select subcategory (optional) --</option>' +
      category.subcategories.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  } else {
    subSelect.innerHTML = '<option value="">-- No subcategories defined --</option>';
  }
}

async function submitSellerProduct(event) {
  event.preventDefault();
  if (!state.sellerToken) {
    showToast('Authenticating workshop session...');
    await initSellerWorkspace();
  }

  const title = document.getElementById('prod-title')?.value.trim();
  const categoryId = document.getElementById('prod-category')?.value;
  const subcategoryId = document.getElementById('prod-subcategory')?.value || undefined;
  const brandClaim = document.getElementById('prod-brand')?.value.trim() || undefined;
  const fabricMaterial = document.getElementById('prod-fabric')?.value.trim();
  const occasion = document.getElementById('prod-occasion')?.value;
  const description = document.getElementById('prod-description')?.value.trim();
  const fit = document.getElementById('prod-fit')?.value.trim() || 'Regular Fit';
  const careInstructions = document.getElementById('prod-care')?.value.trim() || 'Dry clean only';
  const tagsRaw = document.getElementById('prod-tags')?.value.trim();
  const styleTags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const imageUrl = document.getElementById('prod-image')?.value.trim() || '/assets/campaigns/campaign-main-hero.jpg';

  const colorName = document.getElementById('var-color')?.value.trim() || 'Madder Crimson';
  const sizeName = document.getElementById('var-size')?.value || 'Free Size';
  const sku = document.getElementById('var-sku')?.value.trim() || `ICM-${Date.now().toString().slice(-4)}`;
  const mrp = Number(document.getElementById('var-mrp')?.value) || 15000;
  const price = Number(document.getElementById('var-price')?.value) || 12000;
  const costPriceRaw = document.getElementById('var-cost')?.value;
  const costPrice = costPriceRaw ? Number(costPriceRaw) : undefined;
  const availableStock = Number(document.getElementById('var-stock')?.value) || 5;

  const proposedHsn = document.getElementById('prod-hsn')?.value.trim() || undefined;
  const proposedGstRate = Number(document.getElementById('prod-gst-rate')?.value) || 0.05;
  const taxClassificationNotes = document.getElementById('prod-tax-notes')?.value.trim() || undefined;
  const shippingMethod = document.getElementById('prod-shipping-method')?.value || 'PLATFORM_STANDARD';
  const sellerDeliveryCharge = Number(document.getElementById('prod-delivery-charge')?.value) || 0;
  const dispatchLeadDays = Number(document.getElementById('prod-dispatch-days')?.value) || 3;

  const payload = {
    title,
    categoryId,
    subcategoryId,
    brandClaim,
    fabricMaterial,
    occasion,
    description,
    fit,
    careInstructions,
    styleTags,
    images: [imageUrl],
    costPrice,
    proposedHsn,
    proposedGstRate,
    taxClassificationNotes,
    shippingMethod,
    sellerDeliveryCharge,
    dispatchLeadDays,
    variants: [
      {
        sku,
        colorName,
        colorHex: '#B8860B',
        sizeName,
        mrp,
        price,
        costPrice,
        availableStock,
        reservedStock: 0,
      },
    ],
  };

  try {
    const res = await fetch('/api/v1/seller/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.sellerToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Garment submitted for authenticity moderation!');
      closeAddProductModal();
      document.getElementById('seller-add-product-form')?.reset();
      await loadAllProducts();
      await loadCategories();
      loadSellerCatalog();
      loadSellerInventory();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    } else {
      alert(`Error submitting garment: ${json.error?.message || 'Submission failed'}`);
    }
  } catch (err) {
    console.error('Submit product error:', err);
    alert('Failed to submit product to server.');
  }
}

function toggleSellerDeliveryChargeInput() {
  const method = document.getElementById('prod-shipping-method')?.value;
  const input = document.getElementById('prod-delivery-charge');
  if (input) {
    if (method === 'SELLER_MANAGED') {
      input.disabled = false;
      if (Number(input.value) === 0) input.value = '150';
    } else {
      input.disabled = true;
      input.value = '0';
    }
  }
  updateSellerPricingPreview();
}

function updateSellerPricingPreview() {
  const price = Number(document.getElementById('var-price')?.value) || 0;
  const costRaw = document.getElementById('var-cost')?.value;
  const cost = costRaw ? Number(costRaw) : 0;
  const commissionRate = 0.12; // 12% immutable platform commission
  const commission = Math.round(price * commissionRate);
  const netProceeds = price - commission;
  const grossProfit = cost > 0 ? (netProceeds - cost) : 0;
  const grossMarginPct = (cost > 0 && price > 0) ? ((grossProfit / price) * 100).toFixed(1) : 'N/A';

  const elPrice = document.getElementById('prev-selling-price');
  const elComm = document.getElementById('prev-commission');
  const elNet = document.getElementById('prev-net-proceeds');
  const elCost = document.getElementById('prev-cost-price');
  const elMargin = document.getElementById('prev-gross-margin');

  if (elPrice) elPrice.textContent = `₹${price.toLocaleString('en-IN')}`;
  if (elComm) elComm.textContent = `₹${commission.toLocaleString('en-IN')}`;
  if (elNet) elNet.textContent = `₹${netProceeds.toLocaleString('en-IN')}`;
  if (elCost) elCost.textContent = cost > 0 ? `₹${cost.toLocaleString('en-IN')}` : 'Not Specified';
  if (elMargin) {
    if (cost > 0) {
      elMargin.textContent = `₹${grossProfit.toLocaleString('en-IN')} (${grossMarginPct}%)`;
      elMargin.style.color = grossProfit >= 0 ? '#1E7E34' : '#DC2626';
    } else {
      elMargin.textContent = 'Enter cost price';
      elMargin.style.color = '#7A766F';
    }
  }
}

async function toggleProductActive(productId, newStatus) {
  if (!state.sellerToken) {
    await initSellerWorkspace();
  }
  try {
    const res = await fetch(`/api/v1/seller/products/${productId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.sellerToken}`,
      },
      body: JSON.stringify({ isActive: newStatus }),
    });

    const json = await res.json();
    if (json.success) {
      showToast(`Product ${newStatus ? 'published' : 'unpublished'}.`);
      await loadAllProducts();
      await loadCategories();
      loadSellerCatalog();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    }
  } catch (err) {
    console.error('Toggle active error:', err);
  }
}

async function promptUpdateStock(variantId, currentStock) {
  const input = prompt(`Update available inventory stock (current: ${currentStock}):`, currentStock);
  if (input === null) return;
  const newStock = Number(input);
  if (isNaN(newStock) || newStock < 0) {
    alert('Please enter a valid non-negative number for stock.');
    return;
  }

  if (!state.sellerToken) {
    await initSellerWorkspace();
  }

  try {
    const res = await fetch(`/api/v1/seller/variants/${variantId}/stock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.sellerToken}`,
      },
      body: JSON.stringify({ availableStock: newStock }),
    });

    const json = await res.json();
    if (json.success) {
      showToast(`Stock updated to ${newStock} units.`);
      await loadAllProducts();
      await loadCategories();
      loadSellerInventory();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    }
  } catch (err) {
    console.error('Update stock error:', err);
  }
}

async function loadSellerSettlements() {
  if (!state.sellerToken) return;
  try {
    const res = await fetch('/api/v1/seller/settlements', {
      headers: { Authorization: `Bearer ${state.sellerToken}` },
    });
    const json = await res.json();
    if (json.success && json.data) {
      const settledEl = document.getElementById('seller-balance-settled');
      const pendingEl = document.getElementById('seller-balance-pending');
      if (settledEl) settledEl.textContent = `₹${(json.data.balance?.settledAmount || 0).toLocaleString('en-IN')}`;
      if (pendingEl) pendingEl.textContent = `₹${(json.data.balance?.unearnedEscrowBalance || 0).toLocaleString('en-IN')}`;

      const tbody = document.getElementById('seller-ledger-table-body');
      if (tbody) {
        tbody.innerHTML = json.data.ledger
          .map(
            (entry) => `
          <tr>
            <td><code>${entry.id.substring(0, 8)}</code></td>
            <td>${entry.entryType}</td>
            <td>${entry.subOrderId ? entry.subOrderId.substring(0, 8) : '-'}</td>
            <td>₹${entry.amount.toLocaleString('en-IN')}</td>
            <td>${new Date(entry.createdAt).toLocaleDateString()}</td>
          </tr>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('Error loading settlements:', err);
  }
}

function switchAdminSubRoute(sub) {
  document.querySelectorAll('.admin-sub-tab').forEach((el) => (el.style.display = 'none'));
  const target = document.getElementById(`admin-tab-${sub}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('#view-admin .tab-btn').forEach((btn) => btn.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('#view-admin .tab-btn')).find((b) =>
    b.getAttribute('onclick')?.includes(sub)
  );
  if (activeBtn) activeBtn.classList.add('active');

  initAdminConsole();
}

async function initAdminConsole() {
  if (!state.adminToken) {
    try {
      const res = await fetch('/api/v1/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@vespera.local', password: 'SuperAdminPass2026!#', totpCode: '123456' }),
      });
      if (res.ok) {
        const json = await res.json();
        state.adminToken = json.data.accessToken;
        updateAdminNavVisibility();
      }
    } catch {}
  }
  loadAdminModeration();
  loadAdminCategories();
  loadAdminSellers();
  loadAdminAuditLogs();
  loadAdminTaxProposals();
  loadAdminIntegrations();
  loadAdminIntegrationsHistory();
}

async function loadAdminModeration() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/products/moderation-queue', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('admin-moderation-table-body');
    if (json.success && tbody) {
      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No products pending moderation. All clear.</td></tr>';
      } else {
        tbody.innerHTML = json.data
          .map(
            (p) => `
          <tr>
            <td><strong>${p.product.title}</strong></td>
            <td>${p.sellerStoreName || p.product.sellerId}</td>
            <td>${p.product.categoryId}</td>
            <td>${p.product.fabricMaterial}</td>
            <td><span class="status-pill under_review">${p.product.moderationStatus}</span></td>
            <td>
              <button class="btn btn-gold btn-sm" onclick="adminApproveProduct('${p.product.id}')">Approve</button>
              <button class="btn btn-outline-dark btn-sm" onclick="adminRejectProduct('${p.product.id}')">Reject</button>
            </td>
          </tr>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('Error loading admin moderation:', err);
  }
}

async function adminApproveProduct(productId) {
  if (!state.adminToken) return;
  try {
    const res = await fetch(`/api/v1/admin/products/${productId}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Product approved and published to customer catalogue!');
      await loadAllProducts();
      await loadCategories();
      loadAdminModeration();
      loadAdminCategories();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    }
  } catch (err) {
    console.error('Approve product error:', err);
  }
}

async function adminRejectProduct(productId) {
  if (!state.adminToken) return;
  try {
    const res = await fetch(`/api/v1/admin/products/${productId}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({ status: 'REJECTED', reason: 'Authenticity standards requirement not met' }),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Product rejected.');
      loadAdminModeration();
    }
  } catch (err) {
    console.error('Reject product error:', err);
  }
}

async function loadAdminCategories() {
  const tbody = document.getElementById('admin-categories-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/v1/categories?includeInactive=true');
    const json = await res.json();
    if (json.success) {
      tbody.innerHTML = json.data
        .map(
          (c) => `
        <tr>
          <td><code>${c.id}</code></td>
          <td><strong>${c.name}</strong><br><small style="color: var(--color-ink-muted);">${c.subtitle || ''}</small></td>
          <td>${c.displayOrder}</td>
          <td><span class="badge" style="background: var(--color-surface-warm);">${c.productCount || 0} items</span></td>
          <td>${c.showOnHomepage ? '✓ Yes' : 'No'}</td>
          <td>
            <span class="status-pill ${c.isActive ? 'paid' : 'under_review'}">
              ${c.isActive ? 'Active' : 'Deactivated'}
            </span>
          </td>
          <td>
            <button class="btn btn-outline-dark btn-sm" onclick="openAdminCategoryModal('${c.id}')">Edit</button>
            <button class="btn ${c.isActive ? 'btn-outline-danger' : 'btn-gold'} btn-sm" onclick="toggleAdminCategoryStatus('${c.id}', ${!c.isActive})">
              ${c.isActive ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading admin categories:', err);
  }
}

function openAdminCategoryModal(catId) {
  const modal = document.getElementById('modal-admin-category');
  if (!modal) return;

  const form = document.getElementById('admin-category-form');
  if (form) form.reset();

  const titleEl = document.getElementById('modal-category-title');
  const idInput = document.getElementById('cat-form-id');

  if (catId) {
    const category = (state.categories || []).find((c) => c.id === catId);
    if (category) {
      if (titleEl) titleEl.textContent = 'Edit Marketplace Category';
      if (idInput) idInput.value = category.id;
      document.getElementById('cat-name').value = category.name || '';
      document.getElementById('cat-slug').value = category.slug || '';
      document.getElementById('cat-desc').value = category.description || '';
      document.getElementById('cat-subtitle').value = category.subtitle || '';
      document.getElementById('cat-tag').value = category.merchandisingTag || '';
      document.getElementById('cat-order').value = category.displayOrder || 1;
      document.getElementById('cat-image').value = category.image || '';
      document.getElementById('cat-show-home').checked = category.showOnHomepage !== false;
      const subNames = (category.subcategories || []).map((s) => s.name).join(', ');
      document.getElementById('cat-subcategories').value = subNames;
    }
  } else {
    if (titleEl) titleEl.textContent = 'Add Global Category';
    if (idInput) idInput.value = '';
    document.getElementById('cat-order').value = ((state.categories || []).length + 1).toString();
  }

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAdminCategoryModal() {
  const modal = document.getElementById('modal-admin-category');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
}

async function submitAdminCategory(event) {
  event.preventDefault();
  if (!state.adminToken) {
    await initAdminConsole();
  }

  const existingId = document.getElementById('cat-form-id')?.value;
  const name = document.getElementById('cat-name')?.value.trim();
  const slug = document.getElementById('cat-slug')?.value.trim();
  const description = document.getElementById('cat-desc')?.value.trim();
  const subtitle = document.getElementById('cat-subtitle')?.value.trim();
  const merchandisingTag = document.getElementById('cat-tag')?.value.trim();
  const displayOrder = Number(document.getElementById('cat-order')?.value) || 10;
  const image = document.getElementById('cat-image')?.value.trim() || '/assets/campaigns/campaign-accessories.jpg';
  const showOnHomepage = document.getElementById('cat-show-home')?.checked ?? true;

  const subRaw = document.getElementById('cat-subcategories')?.value.trim();
  const subcategories = subRaw
    ? subRaw.split(',').map((s) => {
        const trimmed = s.trim();
        return {
          id: `sub_${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          name: trimmed,
          slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        };
      })
    : [];

  const payload = {
    name,
    slug,
    description,
    subtitle,
    merchandisingTag,
    displayOrder,
    image,
    showOnHomepage,
    subcategories,
  };

  try {
    const url = existingId ? `/api/v1/admin/categories/${existingId}` : '/api/v1/admin/categories';
    const method = existingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Category taxonomy updated successfully!');
      closeAdminCategoryModal();
      await loadCategories();
      await loadAllProducts();
      loadAdminCategories();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderCategoryPillars();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    } else {
      alert(`Error updating category: ${json.error?.message || 'Update failed'}`);
    }
  } catch (err) {
    console.error('Submit category error:', err);
  }
}

async function toggleAdminCategoryStatus(categoryId, newStatus) {
  if (!state.adminToken) {
    await initAdminConsole();
  }
  try {
    const res = await fetch(`/api/v1/admin/categories/${categoryId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({ isActive: newStatus }),
    });

    const json = await res.json();
    if (json.success) {
      showToast(`Category ${newStatus ? 'activated' : 'deactivated'} in taxonomy.`);
      await loadCategories();
      await loadAllProducts();
      loadAdminCategories();
      if (state.currentPath === '/' || state.currentPath === '') {
        renderHeaderSubbar();
        renderMobileQuickCategories();
        renderCategoryPillars();
        renderHomepageNewArrivals();
        renderHomepageCategoryGrids();
      }
    }
  } catch (err) {
    console.error('Toggle category error:', err);
  }
}

async function loadAdminSellers() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/sellers', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('admin-sellers-table-body');
    if (json.success && tbody) {
      tbody.innerHTML = json.data
        .map(
          (s) => `
        <tr>
          <td><strong>${s.storeName}</strong></td>
          <td><code>${s.userId.substring(0, 8)}</code></td>
          <td><span class="status-pill paid">${s.verificationStatus}</span></td>
          <td>Curated Guild</td>
        </tr>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading admin sellers:', err);
  }
}

async function loadAdminAuditLogs() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/audit-logs', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('admin-audit-table-body');
    if (json.success && tbody) {
      tbody.innerHTML = json.data
        .slice(0, 10)
        .map(
          (log) => `
        <tr>
          <td><code>${log.id.substring(0, 8)}</code></td>
          <td>${log.action}</td>
          <td>${log.actorRole}</td>
          <td>${log.targetType || '-'}</td>
          <td>${new Date(log.timestamp).toLocaleTimeString()}</td>
        </tr>
      `
        )
        .join('');
    }
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

async function loadAdminTaxProposals() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/tax/proposals', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('admin-tax-table-body');
    if (json.success && tbody) {
      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No tax proposals in queue. All active products verified.</td></tr>';
      } else {
        tbody.innerHTML = json.data
          .map(
            (item) => `
          <tr>
            <td><strong>${item.product.title}</strong></td>
            <td>${item.seller?.storeName || item.product.sellerId}</td>
            <td><code>${item.product.proposedHsn || item.product.approvedTaxConfig?.hsnCode || 'N/A'}</code></td>
            <td><strong>${typeof item.product.proposedGstRate === 'number' ? (item.product.proposedGstRate * 100) + '%' : (item.product.approvedTaxConfig ? (item.product.approvedTaxConfig.approvedGstRate * 100) + '%' : '5%')}</strong></td>
            <td><span style="font-size: 0.8rem; color: #555;">${item.product.taxClassificationNotes || 'Artisanal handloom garment'}</span></td>
            <td><span class="status-pill ${item.product.taxVerificationStatus === 'APPROVED' ? 'paid' : item.product.taxVerificationStatus === 'REJECTED' ? 'cancelled' : 'under_review'}">${item.product.taxVerificationStatus || 'PENDING_REVIEW'}</span></td>
            <td>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="btn btn-gold btn-sm" onclick="adminDecideTax('${item.product.id}', 'APPROVED', ${item.product.proposedGstRate ?? 0.05})">Approve</button>
                <button class="btn btn-outline-dark btn-sm" onclick="adminDecideTax('${item.product.id}', 'CHANGES_REQUESTED')">Req. Changes</button>
                <button class="btn btn-outline-dark btn-sm" onclick="adminDecideTax('${item.product.id}', 'REJECTED')">Reject</button>
              </div>
            </td>
          </tr>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('Error loading tax proposals:', err);
  }
}

async function adminDecideTax(productId, status, approvedGstRate) {
  if (!state.adminToken) return;
  const reason = status === 'REJECTED' ? prompt('Enter reason for tax rejection:', 'Statutory classification non-compliant') : undefined;
  if (status === 'REJECTED' && !reason) return;

  try {
    const res = await fetch(`/api/v1/admin/tax/products/${productId}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({
        status,
        approvedGstRate: status === 'APPROVED' ? (approvedGstRate ?? 0.05) : undefined,
        reason,
        reviewNotes: 'Verified against platform handloom schedule',
      }),
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Tax status updated to ${status}`);
      loadAdminTaxProposals();
      loadAdminModeration();
    } else {
      alert(`Error updating tax status: ${json.error?.message || 'Action failed'}`);
    }
  } catch (err) {
    console.error('Tax decision error:', err);
    alert('Failed to record tax decision.');
  }
}

// --------------------------------------------------------------------------
// ADMIN API & INTEGRATIONS CONTROL CENTER (SETTINGS -> API & INTEGRATIONS)
// --------------------------------------------------------------------------
async function loadAdminIntegrations() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/integrations', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    if (json.success && json.data) {
      const { activePaymentProvider, integrations } = json.data;
      const paytm = integrations.find((i) => i.id === 'paytm');

      if (paytm) {
        const midInput = document.getElementById('cfg-paytm-mid');
        if (midInput) midInput.value = paytm.settings.merchantId || '';

        const envSelect = document.getElementById('cfg-paytm-env');
        if (envSelect) envSelect.value = paytm.environment || 'staging';

        const websiteInput = document.getElementById('cfg-paytm-website');
        if (websiteInput) websiteInput.value = paytm.settings.website || 'WEBSTAGING';

        const channelInput = document.getElementById('cfg-paytm-channel');
        if (channelInput) channelInput.value = paytm.settings.channelId || 'WEB';

        const statEnv = document.getElementById('stat-env-mode');
        if (statEnv) {
          statEnv.textContent = paytm.environment === 'production' ? 'Production (Live)' : 'Staging / Sandbox';
        }

        const diagStatus = document.getElementById('paytm-diag-status');
        if (diagStatus) {
          diagStatus.textContent = paytm.lastDiagnosticMessage || 'Ready for connection testing';
        }

        const diagTime = document.getElementById('paytm-diag-time');
        if (diagTime && paytm.lastTestedAt) {
          diagTime.textContent = `Last tested: ${new Date(paytm.lastTestedAt).toLocaleTimeString()}`;
        }
      }
    }
  } catch (err) {
    console.error('Error loading integrations:', err);
  }
}

async function savePaytmConfig(event) {
  event.preventDefault();
  if (!state.adminToken) return;

  const merchantId = document.getElementById('cfg-paytm-mid')?.value.trim();
  const environment = document.getElementById('cfg-paytm-env')?.value;
  const website = document.getElementById('cfg-paytm-website')?.value.trim();
  const channelId = document.getElementById('cfg-paytm-channel')?.value.trim();

  try {
    const res = await fetch('/api/v1/admin/integrations/paytm/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({
        merchantId,
        environment,
        website,
        channelId,
        isActive: true,
      }),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Paytm Gateway configuration saved successfully.');
      loadAdminIntegrations();
      loadAdminIntegrationsHistory();
    } else {
      alert(`Failed to save configuration: ${json.error?.message || 'Error occurred'}`);
    }
  } catch (err) {
    console.error('Save Paytm config error:', err);
    alert('An unexpected error occurred while saving Paytm settings.');
  }
}

async function runPaytmConnectionTest() {
  if (!state.adminToken) return;
  const diagStatus = document.getElementById('paytm-diag-status');
  const diagTime = document.getElementById('paytm-diag-time');
  if (diagStatus) diagStatus.textContent = 'Testing connection with Paytm endpoint...';

  try {
    const res = await fetch('/api/v1/admin/integrations/paytm/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
    });

    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data;
      if (diagStatus) {
        diagStatus.innerHTML = `<strong>${data.status}</strong>: ${data.diagnosticMessage}`;
        diagStatus.style.color = data.success ? '#047857' : '#B45309';
      }
      if (diagTime) {
        diagTime.textContent = `Tested at ${new Date(data.testedAt).toLocaleTimeString()}`;
      }
      showToast(`Paytm Connection Test: ${data.status}`);
      loadAdminIntegrationsHistory();
    } else {
      if (diagStatus) {
        diagStatus.textContent = `Error: ${json.error?.message || 'Connection test failed'}`;
        diagStatus.style.color = '#B91C1C';
      }
    }
  } catch (err) {
    console.error('Connection test error:', err);
    if (diagStatus) diagStatus.textContent = 'Network error while executing backend connection test.';
  }
}

function openCredentialModal(integrationId, title) {
  const modal = document.getElementById('modal-admin-credential-replace');
  if (!modal) return;

  const idInput = document.getElementById('cred-integration-id');
  if (idInput) idInput.value = integrationId;

  const titleEl = document.getElementById('modal-credential-title');
  if (titleEl) titleEl.textContent = `Replace ${title || 'Credential Secret'}`;

  const secretInput = document.getElementById('cred-new-secret');
  if (secretInput) secretInput.value = '';

  const confirmInput = document.getElementById('cred-confirm-secret');
  if (confirmInput) confirmInput.value = '';

  modal.style.display = 'flex';
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeCredentialModal() {
  const modal = document.getElementById('modal-admin-credential-replace');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    const secretInput = document.getElementById('cred-new-secret');
    if (secretInput) secretInput.value = '';
    const confirmInput = document.getElementById('cred-confirm-secret');
    if (confirmInput) confirmInput.value = '';
  }
}

async function submitCredentialReplacement(event) {
  event.preventDefault();
  if (!state.adminToken) return;

  const integrationId = document.getElementById('cred-integration-id')?.value;
  const newSecret = document.getElementById('cred-new-secret')?.value;
  const confirmSecret = document.getElementById('cred-confirm-secret')?.value;

  if (!newSecret || newSecret.length < 8) {
    alert('Merchant Key must be at least 8 characters long.');
    return;
  }

  if (newSecret !== confirmSecret) {
    alert('Secret confirmation does not match. Please re-enter carefully.');
    return;
  }

  try {
    const res = await fetch(`/api/v1/admin/integrations/${integrationId}/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({ merchantKey: newSecret }),
    });

    const json = await res.json();
    if (json.success) {
      showToast('Merchant credentials securely encrypted and stored.');
      closeCredentialModal();
      loadAdminIntegrations();
      loadAdminIntegrationsHistory();
    } else {
      alert(`Failed to replace credentials: ${json.error?.message || 'Error occurred'}`);
    }
  } catch (err) {
    console.error('Credential replacement error:', err);
    alert('An unexpected error occurred while replacing credentials.');
  }
}

async function loadAdminIntegrationsHistory() {
  if (!state.adminToken) return;
  try {
    const res = await fetch('/api/v1/admin/integrations/history', {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    });
    const json = await res.json();
    const tbody = document.getElementById('admin-integrations-history-tbody');
    if (json.success && tbody) {
      if (json.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No integration configuration events recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = json.data
          .slice(0, 15)
          .map(
            (log) => `
          <tr>
            <td><code>${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</code></td>
            <td><span class="badge" style="background: var(--color-surface-warm);">${log.action}</span></td>
            <td><strong>${log.integrationId.toUpperCase()}</strong></td>
            <td><code>${log.adminUserId}</code></td>
            <td><span style="font-size: 0.78rem; color: #555;">${(log.changedFields || []).join(', ') || 'N/A'}</span></td>
            <td><span style="font-size: 0.78rem;">${log.notes || log.testStatus || 'Success'}</span></td>
          </tr>
        `
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('Error loading integration history:', err);
  }
}

// --------------------------------------------------------------------------
// SPATIAL EXPERIENCE & ATELIER HOTSPOTS
// --------------------------------------------------------------------------
const atelierScenes = {
  mithila: {
    img: '/assets/campaigns/campaign-craft-storytelling.jpg',
    badge: 'Mithila Master Guild',
    title: 'Bamboo Quill Nib Technique',
    desc: 'Artisans slice seasoned bamboo stems into microscopic nibs wrapped in raw cotton slivers. This capillary reservoir allows continuous organic linework without mechanical drafting.',
    origin: 'Jitwarpur, Madhubani (GI Origin)',
    time: '24–36 Days per Saree',
    purity: 'Pure Hand-Drawn Natural Silk',
    captionTag: 'Master Atelier Documentation',
    captionTitle: 'Madhubani, Mithila Heritage Cluster',
  },
  varanasi: {
    img: '/assets/campaigns/campaign-sarees.jpg',
    badge: 'Varanasi Royal Handloom',
    title: 'Kadhwa Pure Zari Weaving',
    desc: 'Each booti motif is engraved individually on the pit loom using pure silver and electroplated gold zari filaments. Unlike machine cuts, the reverse shows no loose floating threads.',
    origin: 'Chowk Varanasi, UP (GI Origin)',
    time: '45–60 Days per Brocade',
    purity: 'Tested Pure Silver Metallic Thread',
    captionTag: 'GI Master Pit-Loom Weaving',
    captionTitle: 'Varanasi Heritage Handloom Looms',
  },
  jaipur: {
    img: '/assets/campaigns/campaign-menswear.jpg',
    badge: 'Jaipur Royal Bespoke',
    title: 'Imperial Bandhgala Bias Cut',
    desc: 'Handwoven raw silk canvas structured with hair-canvas interlining. Curved seams conform to the natural posture without rigid padding.',
    origin: 'Johari Bazaar, Jaipur (Royal Atelier)',
    time: '18 Days per Royal Ensemble',
    purity: 'Wild Raw Mulberry Silk Canvas',
    captionTag: 'Aristocratic Bespoke Tailoring',
    captionTitle: 'Johari Bazaar Royal Tailoring Studio',
  },
};

function switchAtelierScene(sceneKey) {
  const data = atelierScenes[sceneKey];
  if (!data) return;

  const sceneImg = document.getElementById('atelier-scene-img');
  if (sceneImg) sceneImg.src = data.img;

  const tagEl = document.getElementById('atelier-caption-tag');
  if (tagEl && data.captionTag) tagEl.textContent = data.captionTag;

  const captionTitleEl = document.getElementById('atelier-caption-title');
  if (captionTitleEl && data.captionTitle) captionTitleEl.textContent = data.captionTitle;

  document.querySelectorAll('.atelier-tab-btn').forEach((btn) => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  const targetTab = document.getElementById(`atelier-tab-${sceneKey}`);
  if (targetTab) {
    targetTab.classList.add('active');
    targetTab.setAttribute('aria-selected', 'true');
  }

  const badgeEl = document.getElementById('drawer-region-badge');
  if (badgeEl) badgeEl.textContent = data.badge;

  const titleEl = document.getElementById('drawer-feature-title');
  if (titleEl) titleEl.textContent = data.title;

  const descEl = document.getElementById('drawer-feature-desc');
  if (descEl) descEl.textContent = data.desc;

  const originEl = document.getElementById('drawer-meta-origin');
  if (originEl) originEl.textContent = data.origin;

  const timeEl = document.getElementById('drawer-meta-time');
  if (timeEl) timeEl.textContent = data.time;

  const purityEl = document.getElementById('drawer-meta-purity');
  if (purityEl) purityEl.textContent = data.purity;
}

function activateHotspot(idx) {
  document.querySelectorAll('.spatial-hotspot').forEach((el) => el.classList.remove('active'));
  const hs = document.getElementById(`atelier-hotspot-${idx}`);
  if (hs) hs.classList.add('active');

  if (idx === 1) {
    document.getElementById('drawer-feature-title').textContent = 'Bamboo Quill Nib Technique';
    document.getElementById('drawer-feature-desc').textContent =
      'Artisans slice seasoned bamboo stems into microscopic nibs wrapped in raw cotton slivers. This capillary reservoir allows continuous organic linework without mechanical drafting.';
  } else if (idx === 2) {
    document.getElementById('drawer-feature-title').textContent = 'Forest Botanicals & Turmeric Dye';
    document.getElementById('drawer-feature-desc').textContent =
      'Colors are rendered exclusively from boiled madder root, crushed Aparajita petals, turmeric rhizomes, and lamp soot mixed with pure acacia gum binder.';
  } else if (idx === 3) {
    document.getElementById('drawer-feature-title').textContent = 'Handloom Warp Tensioning';
    document.getElementById('drawer-feature-desc').textContent =
      'Master pit-loom tension ensures rhythmic density across wild Tussar fiber yarns, delivering unmatched tactile drape and longevity.';
  }
}

function initSpatialExperience() {
  const stage = document.getElementById('hero-stage');
  const card = document.getElementById('spatial-card-hero');
  if (!stage || !card) return;

  stage.addEventListener('mousemove', (e) => {
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotY = (x / (rect.width / 2)) * 9;
    const rotX = (-y / (rect.height / 2)) * 9;
    card.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
  });

  stage.addEventListener('mouseleave', () => {
    card.style.transform = 'rotateX(0deg) rotateY(0deg)';
  });
}

// --------------------------------------------------------------------------
// TOAST NOTIFICATION & UI UTILITIES
// --------------------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('atelier-toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.innerHTML = `<span style="color: var(--color-zari-gold, #C49752); margin-right: 6px;">✦</span> ${escapeHtml(message)}`;
  toast.style.display = 'block';
  toast.style.animation = 'none';
  void toast.offsetWidth; // Reflow
  toast.style.animation = 'toastFadeIn 0.3s ease-out';
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, 3200);
}

function toggleMobileNav(forceState) {
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  if (!drawer) return;

  const shouldOpen = typeof forceState === 'boolean' ? forceState : !drawer.classList.contains('active');
  if (shouldOpen) {
    drawer.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('nav-drawer-open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    const firstFocusable = drawer.querySelector('button, a, input');
    if (firstFocusable) firstFocusable.focus();
  } else {
    drawer.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('nav-drawer-open');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.focus();
    }
  }
}

function toggleDrawerAccordion(accordionId) {
  const acc = document.getElementById(accordionId);
  if (!acc) return;
  const headerBtn = acc.querySelector('.drawer-accordion-header');
  const isOpen = acc.classList.contains('active');

  if (isOpen) {
    acc.classList.remove('active');
    if (headerBtn) headerBtn.setAttribute('aria-expanded', 'false');
  } else {
    acc.classList.add('active');
    if (headerBtn) headerBtn.setAttribute('aria-expanded', 'true');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function syncCategoryNavigationCounts() {
  if (!state.categories || state.categories.length === 0) return;
  state.categories.forEach((cat) => {
    const count = cat.productCount !== undefined ? cat.productCount : 0;
    const elements = document.querySelectorAll(`.count-${cat.id}`);
    elements.forEach((el) => {
      el.textContent = count;
    });
  });
}

let searchDebounceTimer = null;
let searchLastActiveElement = null;

function trapSearchOverlayFocus(e) {
  const overlay = document.getElementById('search-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (e.key !== 'Tab') return;

  const focusables = Array.from(overlay.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), a[href]:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.offsetParent !== null && window.getComputedStyle(el).visibility !== 'hidden');

  if (focusables.length === 0) return;

  const firstFocusable = focusables[0];
  const lastFocusable = focusables[focusables.length - 1];

  if (!overlay.contains(document.activeElement)) {
    e.preventDefault();
    firstFocusable.focus();
    return;
  }

  if (e.shiftKey) {
    if (document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    }
  } else {
    if (document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }
}

function openSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-overlay-input');
  if (!overlay) return;
  searchLastActiveElement = document.activeElement;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('nav-drawer-open');
  document.addEventListener('keydown', trapSearchOverlayFocus);
  if (input) {
    input.focus();
    input.select();
  }
  setTimeout(() => {
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

function closeSearchOverlay() {
  const overlay = document.getElementById('search-overlay');
  const resultsContainer = document.getElementById('search-live-results');
  if (resultsContainer) {
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
  }
  if (!overlay) return;
  document.removeEventListener('keydown', trapSearchOverlayFocus);
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  const drawer = document.getElementById('mobile-drawer');
  if (!drawer || !drawer.classList.contains('active')) {
    document.body.classList.remove('nav-drawer-open');
  }
  if (searchLastActiveElement && typeof searchLastActiveElement.focus === 'function') {
    searchLastActiveElement.focus();
  } else {
    const trigger = document.getElementById('header-search-trigger');
    if (trigger) trigger.focus();
  }
}

function openSearchOverlayFromDrawer() {
  toggleMobileNav(false);
  setTimeout(() => {
    openSearchOverlay();
  }, 120);
}

function selectCuratedSearch(term) {
  const input = document.getElementById('search-overlay-input');
  if (input) {
    input.value = term;
    handleOverlaySearchSubmit(new Event('submit'));
  }
}

function handleSearchOverlayInput(e) {
  const val = e.target.value.trim();
  const resultsContainer = document.getElementById('search-live-results');
  if (!resultsContainer) return;

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

  if (!val || val.length < 2) {
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/v1/products?q=${encodeURIComponent(val)}`);
      const json = await res.json();
      resultsContainer.style.display = 'block';
      if (!json.success || !json.data || json.data.length === 0) {
        resultsContainer.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--color-charcoal-light); font-size: 0.88rem;">
            No handcrafted pieces matching "<strong>${escapeHtml(val)}</strong>". Try searching "silk", "zari", "kurta", or "lehenga".
          </div>
        `;
        return;
      }

      const items = json.data.slice(0, 5);
      resultsContainer.innerHTML = items
        .map(
          (item) => {
            const p = item.product || item;
            const img = Array.isArray(p.images) ? p.images[0] : (typeof p.images === 'string' ? p.images.split(' ')[0] : (p.media && p.media[0] ? p.media[0].url : '/images/placeholder.webp'));
            const price = item.variants && item.variants[0] ? item.variants[0].price : (p.variants && p.variants[0] ? p.variants[0].price : 0);
            return `
        <a href="/product/${p.id}" class="search-live-item" onclick="closeSearchOverlay()" style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border, #eee); text-decoration: none; color: inherit; transition: background 0.15s ease;">
          <img src="${img}" alt="${escapeHtml(p.title)}" style="width: 44px; height: 56px; object-fit: cover; border-radius: 2px;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-family: var(--font-serif-display, serif); font-size: 0.92rem; font-weight: 500; color: #171513; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.title)}</div>
            <div style="font-size: 0.76rem; color: #7E7B73;">${escapeHtml(p.fabricMaterial || p.fabric || 'Pure Handloom')} • ₹${price.toLocaleString('en-IN')}</div>
          </div>
        </a>
      `;
          }
        )
        .join('');
    } catch (err) {
      console.error('Search suggestion error:', err);
    }
  }, 220);
}

function handleOverlaySearchSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('search-overlay-input');
  if (!input) return;
  const q = input.value.trim();
  closeSearchOverlay();
  if (q) {
    navigateTo(`/search?q=${encodeURIComponent(q)}`);
  }
}

// Global Keyboard Accessibility (Escape key handling)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeQuickView();
    const searchOverlay = document.getElementById('search-overlay');
    if (searchOverlay && searchOverlay.classList.contains('active')) {
      closeSearchOverlay();
      return;
    }
    const drawer = document.getElementById('mobile-drawer');
    if (drawer && drawer.classList.contains('active')) {
      toggleMobileNav(false);
      return;
    }
  }
});

function updateAdminNavVisibility() {
  const isAdmin = !!state.adminToken;
  const drawerAdmin = document.getElementById('drawer-admin-section');
  const footerAdmin = document.getElementById('footer-admin-link');
  const footerSeparator = document.getElementById('footer-admin-separator');
  if (drawerAdmin) drawerAdmin.style.display = isAdmin ? 'block' : 'none';
  if (footerAdmin) footerAdmin.style.display = isAdmin ? 'inline' : 'none';
  if (footerSeparator) footerSeparator.style.display = isAdmin ? 'inline' : 'none';
}

// ==========================================================================
// INTERSECTION OBSERVER SCROLL REVEALS
// ==========================================================================
let revealObserver = null;

function initScrollReveals() {
  const elements = document.querySelectorAll('.reveal-on-scroll');
  if (!elements.length) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach((el) => el.classList.add('revealed'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('revealed'));
    return;
  }

  if (revealObserver) {
    revealObserver.disconnect();
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.08,
      rootMargin: '0px 0px -30px 0px',
    }
  );

  elements.forEach((el) => {
    if (!el.classList.contains('revealed')) {
      revealObserver.observe(el);
    }
  });
}

// ==========================================================================
// RECENTLY VIEWED STORAGE & RENDERER (PRIVACY-CONSCIOUS)
// ==========================================================================
function trackRecentlyViewed(productId) {
  if (!productId) return;
  try {
    let recent = JSON.parse(sessionStorage.getItem('icm_recently_viewed') || '[]');
    recent = recent.filter((id) => id !== productId);
    recent.unshift(productId);
    if (recent.length > 4) recent = recent.slice(0, 4);
    sessionStorage.setItem('icm_recently_viewed', JSON.stringify(recent));
  } catch (err) {
    // Session storage non-blocking
  }
}

async function renderRecentlyViewed() {
  const section = document.getElementById('recently-viewed-section');
  const grid = document.getElementById('recently-viewed-grid');
  if (!section || !grid) return;

  try {
    const raw = sessionStorage.getItem('icm_recently_viewed');
    if (!raw) {
      section.style.display = 'none';
      return;
    }
    const recentIds = JSON.parse(raw);
    if (!Array.isArray(recentIds) || recentIds.length === 0) {
      section.style.display = 'none';
      return;
    }

    if (!state.products || state.products.length === 0) {
      await loadAllProducts();
    }

    const matchedProducts = [];
    for (const id of recentIds) {
      const found = (state.products || []).find((p) => p.product.id === id);
      if (found) matchedProducts.push(found);
    }

    if (matchedProducts.length === 0) {
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = matchedProducts.map((p) => renderProductCardHtml(p)).join('');
    section.style.display = 'block';
    initScrollReveals();
  } catch (err) {
    section.style.display = 'none';
  }
}

function clearRecentlyViewed() {
  try {
    sessionStorage.removeItem('icm_recently_viewed');
  } catch (e) {}
  const section = document.getElementById('recently-viewed-section');
  if (section) section.style.display = 'none';
  showToast('Recently viewed history cleared');
}

// ==========================================================================
// PRODUCT QUICK VIEW MODAL (Lightweight Visual Inspection)
// ==========================================================================
async function openQuickView(productId) {
  const backdrop = document.getElementById('quick-view-backdrop');
  const modal = document.getElementById('quick-view-modal');
  const content = document.getElementById('quick-view-content');
  if (!backdrop || !modal || !content) return;

  let item = (state.products || []).find((p) => p.product.id === productId);
  if (!item) {
    try {
      const res = await fetch(`/api/v1/products/${productId}`);
      const json = await res.json();
      if (json.success && json.data) {
        item = json.data;
      }
    } catch (e) {}
  }
  if (!item) return;

  trackRecentlyViewed(productId);

  const prod = item.product;
  const primaryVariant = (item.variants && item.variants[0]) || {};
  const discountPct =
    primaryVariant.mrp && primaryVariant.price
      ? Math.round(((primaryVariant.mrp - primaryVariant.price) / primaryVariant.mrp) * 100)
      : 0;
  const images = (prod.images && prod.images.length > 0) ? prod.images : ['/assets/campaigns/campaign-sarees.jpg'];
  const mainImage = images[0];

  content.innerHTML = `
    <div class="quick-view-grid">
      <div class="quick-view-media-wrap">
        <div class="quick-view-media" id="quick-view-stage" onclick="toggleQuickViewZoom(this)">
          <img src="${mainImage}" alt="${prod.title}" id="quick-view-main-img">
          <span class="quick-view-zoom-hint">Click to Zoom 2×</span>
        </div>
        ${images.length > 1 ? `
          <div class="quick-view-thumbs-strip">
            ${images.map((img, idx) => `
              <div class="quick-view-thumb ${idx === 0 ? 'active' : ''}" onclick="switchQuickViewImg('${img}', this)">
                <img src="${img}" alt="${prod.title} thumbnail ${idx + 1}">
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="quick-view-details">
        <span class="quick-view-seller">By ${item.sellerStoreName || 'Master Guild'} • Verified Atelier</span>
        <h2 class="quick-view-title" id="quick-view-title">${prod.title}</h2>
        <div class="quick-view-price-row">
          <span class="quick-view-price">${formatPrice(primaryVariant.price)}</span>
          ${primaryVariant.mrp && primaryVariant.mrp > primaryVariant.price ? `<span class="quick-view-mrp">${formatPrice(primaryVariant.mrp)}</span>` : ''}
          ${discountPct > 0 ? `<span class="quick-view-discount">${discountPct}% OFF</span>` : ''}
        </div>
        <div class="quick-view-stock-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Authentic Handloom Archive • Available in Stock</span>
        </div>
        <ul class="quick-view-craft-notes">
          <li><strong>Fabric:</strong> ${prod.fabricMaterial || 'Pure Silk Handloom'}</li>
          <li><strong>Craft Tradition:</strong> ${prod.brandClaim || 'Authentic Regional Weaver Guild'}</li>
          <li><strong>Occasion & Fit:</strong> ${prod.occasion || 'Festive'} • ${prod.fit || 'Tailored'}</li>
        </ul>
        <div class="quick-view-actions-stack">
          <a href="/product/${prod.slug}" class="btn btn-gold btn-block" onclick="closeQuickView()">
            View Full Product Details →
          </a>
          <button type="button" class="btn btn-outline-dark btn-block" onclick="quickAddProductToCart('${primaryVariant.id}'); closeQuickView();">
            Quick Add to Bag (${formatPrice(primaryVariant.price)})
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach hover-pan logic when zoomed
  const qvStage = document.getElementById('quick-view-stage');
  const qvImg = document.getElementById('quick-view-main-img');
  if (qvStage && qvImg) {
    qvStage.onmousemove = (e) => {
      if (!qvStage.classList.contains('is-zoomed')) return;
      const rect = qvStage.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      qvImg.style.transformOrigin = `${x}% ${y}%`;
    };
  }

  backdrop.style.display = 'block';
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function toggleQuickViewZoom(stageEl) {
  if (!stageEl) return;
  const isZoomed = stageEl.classList.toggle('is-zoomed');
  const hint = stageEl.querySelector('.quick-view-zoom-hint');
  if (hint) {
    hint.textContent = isZoomed ? 'Click to Reset' : 'Click to Zoom 2×';
  }
  const img = stageEl.querySelector('img');
  if (img && !isZoomed) {
    img.style.transformOrigin = 'center center';
  }
}

function switchQuickViewImg(src, thumbEl) {
  const mainImg = document.getElementById('quick-view-main-img');
  if (mainImg) mainImg.src = src;
  document.querySelectorAll('.quick-view-thumb').forEach((el) => el.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
}

function closeQuickView() {
  const backdrop = document.getElementById('quick-view-backdrop');
  const modal = document.getElementById('quick-view-modal');
  if (backdrop) backdrop.style.display = 'none';
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ==========================================================================
// BACK TO TOP BUTTON
// ==========================================================================
function initBackToTop() {
  const btn = document.getElementById('back-to-top-btn');
  if (!btn) return;

  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    },
    { passive: true }
  );
}

function scrollToTop() {
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({
    top: 0,
    behavior: prefersReduced ? 'auto' : 'smooth',
  });
}

