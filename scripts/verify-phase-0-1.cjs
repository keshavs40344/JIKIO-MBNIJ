const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\HP\\.gemini\\antigravity\\brain\\7f683954-1724-40c8-9e58-1db0ee3ac6ee';

const VIEWPORTS = [
  { name: 'mobile-360', label: '360px Compact Mobile', width: 360, height: 800 },
  { name: 'mobile-390', label: '390px Standard Mobile', width: 390, height: 844 },
  { name: 'mobile-430', label: '430px Large Mobile', width: 430, height: 932 },
  { name: 'tablet-768', label: '768px Tablet Portrait', width: 768, height: 1024 },
  { name: 'laptop-1024', label: '1024px Tablet/Laptop', width: 1024, height: 768 },
  { name: 'desktop-1280', label: '1280px Desktop', width: 1280, height: 800 },
  { name: 'desktop-1440', label: '1440px Large Desktop', width: 1440, height: 900 }
];

(async () => {
  console.log('====================================================');
  console.log('  STARTING PHASE 0 & 1 VERIFICATION SUITE');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const results = {
    viewports: {},
    searchOverlay: {},
    megaMenu: {},
    productCards: {},
    touchTargets: {},
    routesVerified: {}
  };

  // 1. VIEWPORT TESTING
  console.log('--> 1. Testing all 7 Viewports...');
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 400));

    const metrics = await page.evaluate((vpWidth) => {
      const docW = document.documentElement.scrollWidth;
      const bodyW = document.body.scrollWidth;
      const maxScroll = Math.max(docW, bodyW);
      const header = document.querySelector('.site-header');
      const utility = document.querySelector('.utility-strip');
      const brand = document.querySelector('.brand-main');
      const brandLink = document.querySelector('.brand-link');
      const actions = document.querySelector('.header-right-actions');

      return {
        hasOverflow: maxScroll > vpWidth,
        scrollWidth: maxScroll,
        headerHeight: header ? header.offsetHeight : 0,
        utilityHeight: utility ? utility.offsetHeight : 0,
        totalTopHeight: (utility && window.getComputedStyle(utility).display !== 'none' ? utility.offsetHeight : 0) + (header ? header.offsetHeight : 0),
        brandWidth: brand ? brand.getBoundingClientRect().width : 0,
        brandFontSize: brand ? window.getComputedStyle(brand).fontSize : '',
        actionsLeft: actions ? actions.getBoundingClientRect().left : 0,
        brandRight: brandLink ? brandLink.getBoundingClientRect().right : 0
      };
    }, vp.width);

    results.viewports[vp.name] = {
      label: vp.label,
      width: vp.width,
      ...metrics,
      passed: !metrics.hasOverflow
    };

    // Capture screenshot
    const screenshotPath = path.join(ARTIFACT_DIR, `phase-0-1-${vp.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  ✓ ${vp.label}: overflow=${metrics.hasOverflow}, topHeight=${metrics.totalTopHeight}px, brandFont=${metrics.brandFontSize}`);
  }

  // 2. MOBILE DRAWER TOUCH TARGETS (at 390px)
  console.log('\n--> 2. Testing Mobile Drawer Touch Targets (at 390px)...');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await page.click('#mobile-menu-toggle');
  await new Promise(r => setTimeout(r, 400));

  // Open all accordions to inspect nested links
  await page.evaluate(() => {
    document.querySelectorAll('.drawer-accordion-btn').forEach(btn => btn.click());
  });
  await new Promise(r => setTimeout(r, 200));

  const touchTargets = await page.evaluate(() => {
    const targets = [];
    document.querySelectorAll('.drawer-accordion-btn, .drawer-accordion-content a, .drawer-direct-link, .btn-close-drawer').forEach(el => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 35);
      targets.push({
        text,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        meets44px: rect.height >= 44
      });
    });
    return targets;
  });

  const allMet = touchTargets.every(t => t.meets44px);
  results.touchTargets = {
    totalInspected: touchTargets.length,
    allMet44px: allMet,
    sampleTargets: touchTargets.slice(0, 8)
  };
  console.log(`  ✓ Inspected ${touchTargets.length} mobile drawer touch targets. All >= 44px: ${allMet}`);

  // Screenshot drawer
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase-0-1-mobile-drawer.png'), fullPage: false });

  // Close drawer
  await page.click('.btn-close-drawer');
  await new Promise(r => setTimeout(r, 300));

  // 3. SEARCH OVERLAY ACCESSIBILITY & FOCUS TRAP
  console.log('\n--> 3. Testing Search Overlay Accessibility & Focus Trap...');
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

  // Open search overlay
  await page.click('#header-search-trigger');
  await new Promise(r => setTimeout(r, 200));

  const searchInitCheck = await page.evaluate(() => {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-overlay-input');
    return {
      isActive: overlay.classList.contains('active'),
      ariaHidden: overlay.getAttribute('aria-hidden'),
      role: overlay.getAttribute('role'),
      ariaModal: overlay.getAttribute('aria-modal'),
      inputFocused: document.activeElement === input
    };
  });
  console.log('  ✓ Search Open State:', searchInitCheck);

  // Test focus trapping: Press Tab 10 times and verify focus never escapes #search-overlay
  let focusEscaped = false;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const isInside = await page.evaluate(() => {
      const overlay = document.getElementById('search-overlay');
      return overlay.contains(document.activeElement);
    });
    if (!isInside) focusEscaped = true;
  }
  console.log(`  ✓ Focus trap test (10 Tabs): focus escaped = ${focusEscaped}`);

  // Test Escape key dismissal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 200));

  const searchCloseCheck = await page.evaluate(() => {
    const overlay = document.getElementById('search-overlay');
    const trigger = document.getElementById('header-search-trigger');
    return {
      isClosed: !overlay.classList.contains('active'),
      ariaHidden: overlay.getAttribute('aria-hidden'),
      focusRestored: document.activeElement === trigger
    };
  });
  console.log('  ✓ Search Close State & Focus Restoration:', searchCloseCheck);
  results.searchOverlay = {
    ...searchInitCheck,
    focusTrapped: !focusEscaped,
    ...searchCloseCheck
  };

  // 4. DESKTOP MEGA-MENU HOVER & POINTER INTERACTION
  console.log('\n--> 4. Testing Desktop Mega-Menu Hover Interaction...');
  await page.hover('.has-megamenu');
  await new Promise(r => setTimeout(r, 250));

  const megaMenuState = await page.evaluate(() => {
    const item = document.querySelector('.has-megamenu');
    const panel = item.querySelector('.megamenu-panel');
    const rect = panel ? panel.getBoundingClientRect() : null;
    return {
      hasOpenClass: item.classList.contains('megamenu-open'),
      panelVisible: panel ? window.getComputedStyle(panel).visibility === 'visible' : false,
      panelOpacity: panel ? window.getComputedStyle(panel).opacity : '0',
      panelTop: rect ? rect.top : 0,
      panelWidth: rect ? rect.width : 0
    };
  });
  console.log('  ✓ Mega-Menu Active State:', megaMenuState);
  results.megaMenu = megaMenuState;

  // Screenshot mega menu
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase-0-1-megamenu.png'), fullPage: false });

  // 5. PRODUCT CARD CONSOLIDATION & HOVER
  console.log('\n--> 5. Testing Consolidated Product Card System...');
  await page.goto(`${BASE_URL}/women`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 400));

  const cardCheck = await page.evaluate(() => {
    const card = document.querySelector('.product-card');
    const imgWrap = card ? card.querySelector('.product-card-img-wrap') : null;
    const primaryImg = card ? card.querySelector('.product-card-img-primary') : null;
    const secondaryImg = card ? card.querySelector('.product-card-img-secondary') : null;
    const badge = card ? card.querySelector('.card-badge-top-left') : null;
    const seller = card ? card.querySelector('.product-card-seller') : null;
    const price = card ? card.querySelector('.card-price') : null;
    const btn = card ? card.querySelector('.btn-card-quick-add') : null;

    const cStyle = card ? window.getComputedStyle(card) : null;
    const wStyle = imgWrap ? window.getComputedStyle(imgWrap) : null;

    return {
      cardCount: document.querySelectorAll('.product-card').length,
      aspectRatio: wStyle ? wStyle.aspectRatio : '',
      borderRadius: cStyle ? cStyle.borderRadius : '',
      hasPrimaryImg: !!primaryImg,
      hasSecondaryImg: !!secondaryImg,
      badgeText: badge ? badge.textContent.trim() : '',
      sellerColor: seller ? window.getComputedStyle(seller).color : '',
      priceText: price ? price.textContent.trim() : '',
      btnText: btn ? btn.textContent.trim() : ''
    };
  });
  console.log('  ✓ Product Card Inspection:', cardCheck);
  results.productCards = cardCheck;

  // Screenshot women catalog
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'phase-0-1-catalog-grid.png'), fullPage: false });

  // 6. REGRESSION VERIFICATION OF ROUTES
  console.log('\n--> 6. Verifying Essential Navigation Routes...');
  const routesToTest = [
    { url: '/men', expectedView: 'view-shop', titleSub: 'Men' },
    { url: '/product/handpainted-madhubani-tussar-silk-saree', expectedView: 'view-product-detail', titleSub: 'Madhubani' },
    { url: '/cart', expectedView: 'view-cart', titleSub: 'Shopping Bag' },
    { url: '/checkout', expectedView: 'view-checkout', titleSub: 'Checkout' },
    { url: '/seller/orders', expectedView: 'view-seller', titleSub: 'Artisan' },
    { url: '/admin/overview', expectedView: 'view-admin', titleSub: 'Super Admin' }
  ];

  for (const r of routesToTest) {
    await page.goto(`${BASE_URL}${r.url}`, { waitUntil: 'networkidle2' });
    const viewActive = await page.evaluate((expView) => {
      const v = document.getElementById(expView);
      return v && v.classList.contains('active') && window.getComputedStyle(v).display !== 'none';
    }, r.expectedView);
    results.routesVerified[r.url] = { expectedView: r.expectedView, passed: viewActive };
    console.log(`  ✓ Route ${r.url} -> ${r.expectedView}: active=${viewActive}`);
  }

  await browser.close();

  // Save report data
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'phase-0-1-verification-data.json'), JSON.stringify(results, null, 2));
  console.log('\n====================================================');
  console.log('  PHASE 0 & 1 VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
})();
