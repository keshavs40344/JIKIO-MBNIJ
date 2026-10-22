import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { FoundationRepository } from "../src/database/repository.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { PasswordService } from "../src/auth/password.service.js";
import { MfaService } from "../src/auth/mfa.service.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import { UserRole, VerificationStatus } from "../src/types/auth.js";
import {
  ProductModerationStatus,
  TaxVerificationStatus,
  ShippingMethod,
  PERMITTED_GST_RATES,
} from "../src/types/marketplace.js";

describe("Seller Pricing, Tax Configuration & Shipping Management Integration Suite", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;
  let app: any;

  let adminToken: string;
  let adminUserId: string;

  let sellerAToken: string;
  let sellerAProfileId: string;

  let sellerBToken: string;
  let sellerBProfileId: string;

  let customerToken: string;
  let customerUserId: string;

  beforeAll(async () => {
    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-min-32-chars-pricing-tax-suite", "15m");
    sessionManager = new SessionManager(repo);
    storageService = new SafeStorageService(new LocalProtectedStorageProvider());
    auditLogger = new AuditLogger(repo);

    app = createApp({
      repo,
      tokenService,
      sessionManager,
      storageService,
      auditLogger,
    });

    // 1. Setup Super Admin
    const adminUser = await repo.createUser({
      id: "admin_super_pricing",
      email: "superadmin@vespera.local",
      passwordHash: await PasswordService.hash("AdminPass2026!#"),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret: MfaService.generateTotpSecret(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    adminUserId = adminUser.id;

    const adminSessionId = "sess_admin_pricing";
    await repo.createSession({
      id: adminSessionId,
      userId: adminUser.id,
      tokenHash: "token_hash_admin",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    adminToken = tokenService.signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: adminSessionId,
    });

    // 2. Setup Seller A (Varanasi Weavers)
    const sellerAReg = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "sellerA@weavers.local", password: "WeaverPass2026!#" });
    const sellerAUser = sellerAReg.body.data.userId;

    const sellerALogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerA@weavers.local", password: "WeaverPass2026!#" });

    const onboardA = await request(app)
      .post("/api/v1/seller/onboard")
      .set("Authorization", `Bearer ${sellerALogin.body.data.accessToken}`)
      .send({
        storeName: "Varanasi Heritage Weaves",
        businessGstin: "09AAAAA0000A1Z5",
        businessPan: "AAAAA0000A",
        registeredAddress: "Ghat Marg, Varanasi, UP 221001",
      });
    sellerAProfileId = onboardA.body.data.id;

    await request(app)
      .post(`/api/v1/admin/sellers/${sellerAProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.APPROVED, reason: "Verified GSTIN" });

    const sellerAReLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerA@weavers.local", password: "WeaverPass2026!#" });
    sellerAToken = sellerAReLogin.body.data.accessToken;

    // 3. Setup Seller B (Jaipur Royal Silks)
    const sellerBReg = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "sellerB@jaipur.local", password: "JaipurPass2026!#" });

    const sellerBLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerB@jaipur.local", password: "JaipurPass2026!#" });

    const onboardB = await request(app)
      .post("/api/v1/seller/onboard")
      .set("Authorization", `Bearer ${sellerBLogin.body.data.accessToken}`)
      .send({
        storeName: "Jaipur Royal Silks",
        businessGstin: "08BBBBB0000B1Z1",
        businessPan: "BBBBB0000B",
        registeredAddress: "Palace Road, Jaipur, RJ 302001",
      });
    sellerBProfileId = onboardB.body.data.id;

    await request(app)
      .post(`/api/v1/admin/sellers/${sellerBProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.APPROVED, reason: "Verified KYC" });

    const sellerBReLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerB@jaipur.local", password: "JaipurPass2026!#" });
    sellerBToken = sellerBReLogin.body.data.accessToken;

    // 4. Setup Customer
    const customerUserRecord = await repo.createUser({
      id: "cust_buyer_test",
      email: "buyer@royal.local",
      passwordHash: await PasswordService.hash("BuyerPass2026!#"),
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customerUserId = customerUserRecord.id;

    const custSessionId = "sess_customer_pricing";
    await repo.createSession({
      id: custSessionId,
      userId: customerUserRecord.id,
      tokenHash: "token_hash_cust",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    customerToken = tokenService.signAccessToken({
      userId: customerUserRecord.id,
      email: customerUserRecord.email,
      role: customerUserRecord.role,
      sessionId: custSessionId,
    });
  }, 30000);

  it("1. Seller creates product with cost price, HSN, proposed GST rate, and custom shipping", async () => {
    const res = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Tussar Kadhwa Brocade Sari",
        categoryId: "cat_ethnic",
        description: "Pure Tussar silk woven with intricate antique bullion kadhwa zari.",
        fabricMaterial: "Pure Silk",
        occasion: "Wedding",
        costPrice: 9500, // Private cost
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        taxCategory: "Handloom Pure Silk",
        taxClassificationNotes: "Pit-loom silk saree under HSN 5007 schedule.",
        shippingMethod: ShippingMethod.SELLER_MANAGED,
        sellerDeliveryCharge: 150,
        dispatchLeadDays: 4,
        serviceableRegions: ["ALL_INDIA"],
        images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c"],
        variants: [
          {
            sku: "TEST-TUSSAR-CRIMSON",
            colorName: "Crimson Red",
            colorHex: "#8A252C",
            sizeName: "Free Size",
            price: 18000,
            mrp: 22000,
            costPrice: 9500,
            availableStock: 5,
            reservedStock: 0,
          },
        ],
      });

    expect(res.status).toBe(201);
    const prod = res.body.data.product;
    expect(prod.title).toBe("Tussar Kadhwa Brocade Sari");
    expect(prod.costPrice).toBe(9500);
    expect(prod.proposedHsn).toBe("5007");
    expect(prod.proposedGstRate).toBe(0.05);
    expect(prod.taxVerificationStatus).toBe(TaxVerificationStatus.PENDING_REVIEW);
    expect(prod.shippingMethod).toBe(ShippingMethod.SELLER_MANAGED);
    expect(prod.sellerDeliveryCharge).toBe(150);
  });

  it("2. Private Product Cost is strictly shielded from public responses", async () => {
    // Product created by seller A
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Privacy Shield Test Sari",
        categoryId: "cat_ethnic",
        costPrice: 8200,
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [
          { sku: "PRIV-TEST-01", colorName: "Gold", colorHex: "#C5A059", sizeName: "Free Size", price: 16000, mrp: 20000, costPrice: 8200, availableStock: 3, reservedStock: 0 },
        ],
      });
    expect(createRes.status).toBe(201);
    const prodId = createRes.body.data.product.id;
    const slug = createRes.body.data.product.slug;

    // Super Admin approves moderation
    await request(app)
      .post(`/api/v1/admin/products/${prodId}/moderation`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: ProductModerationStatus.APPROVED, reason: "Verified." });

    // Public list endpoint: costPrice must NOT exist
    const publicList = await request(app).get("/api/v1/products");
    expect(publicList.status).toBe(200);
    const foundInList = publicList.body.data.find((p: any) => p.product.id === prodId);
    expect(foundInList).toBeDefined();
    expect(foundInList.product.costPrice).toBeUndefined();
    expect(foundInList.variants[0].costPrice).toBeUndefined();

    // Public single slug endpoint: costPrice must NOT exist
    const publicSingle = await request(app).get(`/api/v1/products/${slug}`);
    expect(publicSingle.status).toBe(200);
    expect(publicSingle.body.data.product.costPrice).toBeUndefined();
    expect(publicSingle.body.data.variants[0].costPrice).toBeUndefined();

    // Seller authenticated endpoint: costPrice MUST be accessible to owner
    const sellerList = await request(app)
      .get("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`);
    expect(sellerList.status).toBe(200);
    const foundInSeller = sellerList.body.data.find((p: any) => p.product.id === prodId);
    expect(foundInSeller).toBeDefined();
    expect(foundInSeller.product.costPrice).toBe(8200);
    expect(foundInSeller.variants[0].costPrice).toBe(8200);
  });

  it("3. Rejects invalid commercial values (negative price, mrp < price, invalid HSN, invalid GST rate)", async () => {
    // 3.1 Negative price
    const negPriceRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Negative Price Garment",
        categoryId: "cat_ethnic",
        variants: [{ sku: "NEG-01", colorName: "Red", colorHex: "#000", sizeName: "M", price: -500, availableStock: 5, reservedStock: 0 }],
      });
    expect(negPriceRes.status).toBe(400);
    expect(negPriceRes.body.error.message).toMatch(/Selling price must be a positive number/);

    // 3.2 MRP lower than price
    const mrpRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Invalid MRP Garment",
        categoryId: "cat_ethnic",
        variants: [{ sku: "MRP-01", colorName: "Red", colorHex: "#000", sizeName: "M", price: 15000, mrp: 12000, availableStock: 5, reservedStock: 0 }],
      });
    expect(mrpRes.status).toBe(400);
    expect(mrpRes.body.error.message).toMatch(/cannot be lower than selling price/);

    // 3.3 Invalid non-numeric HSN
    const hsnRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Invalid HSN Garment",
        categoryId: "cat_ethnic",
        proposedHsn: "INVALID_HSN",
        variants: [{ sku: "HSN-01", colorName: "Red", colorHex: "#000", sizeName: "M", price: 15000, availableStock: 5, reservedStock: 0 }],
      });
    expect(hsnRes.status).toBe(400);
    expect(hsnRes.body.error.message).toMatch(/HSN must be a 2 to 8 digit numeric code/);

    // 3.4 Non-permitted GST rate (e.g. 0.07 or 0.25)
    const gstRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Invalid GST Rate Garment",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.09, // Not permitted
        variants: [{ sku: "GST-01", colorName: "Red", colorHex: "#000", sizeName: "M", price: 15000, availableStock: 5, reservedStock: 0 }],
      });
    expect(gstRes.status).toBe(400);
    expect(gstRes.body.error.message).toMatch(/Permitted rates are 0%, 5%, 12%, 18%, 28%/);
  });

  it("4. Enforces RBAC & Ownership: Sellers cannot approve tax rates or edit another seller's products", async () => {
    // Seller A creates a product
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Ownership Test Saree",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "OWN-01", colorName: "Blue", colorHex: "#00F", sizeName: "Free Size", price: 12000, availableStock: 5, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;

    // Seller A attempts to approve their own tax configuration (HTTP 403)
    const selfApprove = await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({ status: TaxVerificationStatus.APPROVED, approvedGstRate: 0.05 });
    expect(selfApprove.status).toBe(403);

    // Seller B attempts to edit Seller A's product (HTTP 403)
    const hijackRes = await request(app)
      .put(`/api/v1/seller/products/${prodId}`)
      .set("Authorization", `Bearer ${sellerBToken}`)
      .send({ title: "Hijacked Title By Seller B" });
    expect(hijackRes.status).toBe(403);
    expect(hijackRes.body.error.message).toMatch(/Unauthorized to update this product/);
  });

  it("5. Gating: Unapproved or pending tax configuration blocks checkout", async () => {
    // Create product in PENDING_REVIEW
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Unapproved Tax Garment",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "UNAPPR-01", colorName: "Crimson", colorHex: "#A00", sizeName: "Free Size", price: 10000, availableStock: 5, reservedStock: 0 }],
      });
    const prod = createRes.body.data.product;
    const variant = createRes.body.data.variants[0];

    // Approve moderation only, but explicitly mark tax as REJECTED
    await repo.updateProductModerationStatus(prod.id, ProductModerationStatus.APPROVED);
    await repo.recordTaxDecision(prod.id, {
      status: TaxVerificationStatus.REJECTED,
      reason: "HSN documentation missing",
      adminUserId,
    });

    // Cart repricing detects lack of approved tax configuration
    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({ items: [{ variantId: variant.id, quantity: 1 }] });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.isValidForCheckout).toBe(false);
    expect(repriceRes.body.data.validationErrors[0]).toMatch(/no approved active tax configuration/);

    // Checkout attempt is rejected
    const checkoutRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: variant.id, quantity: 1 }],
        shippingAddress: {
          recipientName: "Aditi Rao",
          street: "12 Heritage Lane",
          city: "Patna",
          state: "Bihar",
          postalCode: "800001",
          country: "India",
          phone: "+91-9876543210",
        },
      });
    expect(checkoutRes.status).toBe(400);
    expect(checkoutRes.body.error.message).toMatch(/no approved active tax configuration/);
  });

  it("6. Admin approves tax configuration; repricing & order creation use authoritative approved rate", async () => {
    // 1. Seller creates product with proposed 12% GST and seller-managed shipping (₹120)
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Bespoke Royal Sherwani",
        categoryId: "cat_men",
        proposedHsn: "6203",
        proposedGstRate: 0.12,
        taxCategory: "Men's Luxury Sherwani",
        shippingMethod: ShippingMethod.SELLER_MANAGED,
        sellerDeliveryCharge: 120,
        variants: [{ sku: "ROYAL-SHER-01", colorName: "Ivory", colorHex: "#FFF", sizeName: "40", price: 20000, availableStock: 4, reservedStock: 0 }],
      });
    const prod = createRes.body.data.product;
    const variant = createRes.body.data.variants[0];

    // Approve moderation
    await repo.updateProductModerationStatus(prod.id, ProductModerationStatus.APPROVED);

    // 2. Admin reviews proposal in queue
    const proposals = await request(app)
      .get("/api/v1/admin/tax/proposals?status=PENDING_REVIEW")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(proposals.status).toBe(200);
    expect(proposals.body.data.some((p: any) => p.product.id === prod.id)).toBe(true);

    // 3. Super Admin approves tax proposal with 12% rate
    const decisionRes = await request(app)
      .post(`/api/v1/admin/tax/products/${prod.id}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: TaxVerificationStatus.APPROVED,
        approvedGstRate: 0.12,
        reason: "HSN 6203 schedule verified for tailored apparel.",
        effectiveFrom: new Date("2026-01-01"),
      });
    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.data.approvedTaxConfig.approvedGstRate).toBe(0.12);
    expect(decisionRes.body.data.taxVerificationStatus).toBe(TaxVerificationStatus.APPROVED);

    // 4. Cart repricing verifies 12% GST calculation:
    // Subtotal: 20000 * 2 = 40000
    // Tax (12%): 40000 * 0.12 = 4800
    // Shipping (Seller-Managed): 120
    // Total: 40000 + 4800 + 120 = 44920
    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({ items: [{ variantId: variant.id, quantity: 2 }] });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.subtotal).toBe(40000);
    expect(repriceRes.body.data.taxAmount).toBe(4800);
    expect(repriceRes.body.data.shippingFee).toBe(120);
    expect(repriceRes.body.data.totalAmount).toBe(44920);
    expect(repriceRes.body.data.isValidForCheckout).toBe(true);

    // 5. Checkout order creation
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: variant.id, quantity: 2 }],
        shippingAddress: {
          recipientName: "Aditi Rao",
          street: "12 Heritage Lane",
          city: "Patna",
          state: "Bihar",
          postalCode: "800001",
          country: "India",
          phone: "+91-9876543210",
        },
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.totalAmount).toBe(44920);
    expect(order.taxAmount).toBe(4800);
    expect(order.shippingFee).toBe(120);

    // Verify sub-order item preserved historical tax & HSN
    const subOrder = order.subOrders[0];
    expect(subOrder.taxAmount).toBe(4800);
    expect(subOrder.shippingFee).toBe(120);
    expect(subOrder.items[0].hsnCode).toBe("6203");
    expect(subOrder.items[0].gstRate).toBe(0.12);
    expect(subOrder.items[0].taxAmount).toBe(4800);
  });

  it("7. Modifying material tax fields automatically reverts status to PENDING_REVIEW", async () => {
    // Product initially approved with 5%
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Reverification Test Garment",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "REVERIF-01", colorName: "Crimson", colorHex: "#A00", sizeName: "Free Size", price: 10000, availableStock: 5, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;

    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);
    await repo.recordTaxDecision(prodId, { status: TaxVerificationStatus.APPROVED, approvedGstRate: 0.05, adminUserId });

    const before = await repo.findProductById(prodId);
    expect(before?.taxVerificationStatus).toBe(TaxVerificationStatus.APPROVED);

    // Seller edits proposed GST rate to 12%
    const updateRes = await request(app)
      .put(`/api/v1/seller/products/${prodId}`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        proposedHsn: "6204",
        proposedGstRate: 0.12,
      });

    expect(updateRes.status).toBe(200);
    const after = await repo.findProductById(prodId);
    expect(after?.taxVerificationStatus).toBe(TaxVerificationStatus.PENDING_REVIEW);
  });

  it("8. Seller Earnings Preview accurately computes commission and net proceeds", async () => {
    const previewRes = await request(app)
      .get("/api/v1/seller/pricing-preview?sellingPrice=25000&costPrice=12000&gstRate=0.05&shippingMethod=SELLER_MANAGED&sellerDeliveryCharge=180")
      .set("Authorization", `Bearer ${sellerAToken}`);

    expect(previewRes.status).toBe(200);
    const data = previewRes.body.data;
    expect(data.sellingPrice).toBe(25000);
    expect(data.costPrice).toBe(12000);
    expect(data.platformCommissionRate).toBe(0.12);
    expect(data.platformCommissionAmount).toBe(3000); // 25000 * 0.12
    expect(data.estimatedSellerProceeds).toBe(22000); // 25000 - 3000
    expect(data.estimatedGrossMargin).toBe(10000); // 22000 - 12000
    expect(data.disclaimer).toMatch(/Estimated seller proceeds/);
  });

  it("9. Multi-seller order splits correctly with respective commissions and shipping charges", async () => {
    // Seller A product (Seller-managed shipping ₹150)
    const prodARes = await repo.createProduct(
      {
        id: "prod_multi_A",
        sellerId: sellerAProfileId,
        categoryId: "cat_ethnic",
        title: "Seller A Silk Saree",
        slug: "seller-a-silk-saree",
        description: "Pure Silk",
        fabricMaterial: "Silk",
        occasion: "Festive",
        fit: "Regular",
        careInstructions: "Dry clean",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/campaign-hero.jpg"],
        isActive: true,
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: {
          id: "cfg_A",
          productId: "prod_multi_A",
          hsnCode: "5007",
          approvedGstRate: 0.05,
          taxCategory: "Silk",
          effectiveFrom: new Date("2026-01-01"),
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
          version: 1,
        },
        shippingMethod: ShippingMethod.SELLER_MANAGED,
        sellerDeliveryCharge: 150,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [{ sku: "MULTI-A-SKU", colorName: "Red", colorHex: "#F00", sizeName: "FS", price: 10000, mrp: 12000, availableStock: 5, reservedStock: 0 }]
    );

    // Seller B product (Seller-managed shipping ₹200)
    const prodBRes = await repo.createProduct(
      {
        id: "prod_multi_B",
        sellerId: sellerBProfileId,
        categoryId: "cat_men",
        title: "Seller B Bandhgala",
        slug: "seller-b-bandhgala",
        description: "Silk Bandhgala",
        fabricMaterial: "Silk",
        occasion: "Wedding",
        fit: "Royal",
        careInstructions: "Dry clean",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/campaign-hero.jpg"],
        isActive: true,
        proposedHsn: "6203",
        proposedGstRate: 0.05,
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: {
          id: "cfg_B",
          productId: "prod_multi_B",
          hsnCode: "6203",
          approvedGstRate: 0.05,
          taxCategory: "Menswear",
          effectiveFrom: new Date("2026-01-01"),
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
          version: 1,
        },
        shippingMethod: ShippingMethod.SELLER_MANAGED,
        sellerDeliveryCharge: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [{ sku: "MULTI-B-SKU", colorName: "Navy", colorHex: "#008", sizeName: "40", price: 15000, mrp: 18000, availableStock: 3, reservedStock: 0 }]
    );

    const varA = prodARes.variants[0];
    const varB = prodBRes.variants[0];

    // Reprice cart with items from both sellers
    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({
        items: [
          { variantId: varA.id, quantity: 1 }, // 10000 + 500 tax + 150 ship
          { variantId: varB.id, quantity: 1 }, // 15000 + 750 tax + 200 ship
        ],
      });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.subtotal).toBe(25000);
    expect(repriceRes.body.data.taxAmount).toBe(1250); // 500 + 750
    expect(repriceRes.body.data.shippingFee).toBe(350); // 150 + 200
    expect(repriceRes.body.data.totalAmount).toBe(26600); // 25000 + 1250 + 350

    // Create Order
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [
          { variantId: varA.id, quantity: 1 },
          { variantId: varB.id, quantity: 1 },
        ],
        shippingAddress: {
          recipientName: "Devika Rathore",
          street: "14 Palace Enclave",
          city: "Jaipur",
          state: "Rajasthan",
          postalCode: "302006",
          country: "India",
          phone: "+91-9876543210",
        },
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.subOrders.length).toBe(2);

    const subOrderA = order.subOrders.find((s: any) => s.sellerId === sellerAProfileId);
    expect(subOrderA).toBeDefined();
    expect(subOrderA.subtotal).toBe(10000);
    expect(subOrderA.commissionAmount).toBe(1200); // 12% of 10000
    expect(subOrderA.netSellerAmount).toBe(8950); // 10000 - 1200 + 150 shipping reimbursement
    expect(subOrderA.shippingFee).toBe(150);

    const subOrderB = order.subOrders.find((s: any) => s.sellerId === sellerBProfileId);
    expect(subOrderB).toBeDefined();
    expect(subOrderB.subtotal).toBe(15000);
    expect(subOrderB.commissionAmount).toBe(1800); // 12% of 15000
    expect(subOrderB.netSellerAmount).toBe(13400); // 15000 - 1800 + 200 shipping reimbursement
    expect(subOrderB.shippingFee).toBe(200);
  });
});
