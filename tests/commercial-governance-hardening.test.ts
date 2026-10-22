import { describe, it, expect, beforeAll } from "vitest";
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
  LedgerEntryType,
  FulfilmentStatus,
} from "../src/types/marketplace.js";

describe("Commercial Governance, Tax Hardening & Reconciliation Test Suite", () => {
  let app: any;
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;

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
    tokenService = new TokenService("test-jwt-secret-min-32-chars-hardening-suite", "15m");
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

    // 1. Super Admin
    const adminUser = await repo.createUser({
      id: "admin_super_hardened",
      email: "superadmin_h@vespera.local",
      passwordHash: await PasswordService.hash("AdminPass2026!#"),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret: MfaService.generateTotpSecret(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    adminUserId = adminUser.id;

    const adminSessionId = "sess_admin_hardened";
    await repo.createSession({
      id: adminSessionId,
      userId: adminUser.id,
      tokenHash: "token_hash_admin_h",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    adminToken = tokenService.signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: adminSessionId,
    });

    // 2. Seller A (Handloom Silk Guild)
    const sellerAReg = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "sellerA_h@guild.local", password: "WeaverPass2026!#" });
    const sellerAUser = sellerAReg.body.data.userId;

    const sellerALogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerA_h@guild.local", password: "WeaverPass2026!#" });

    const onboardA = await request(app)
      .post("/api/v1/seller/onboard")
      .set("Authorization", `Bearer ${sellerALogin.body.data.accessToken}`)
      .send({
        storeName: "Mithila Handloom Guild",
        businessGstin: "10AAAAA0000A1Z5",
        businessPan: "AAAAA0000A",
        registeredAddress: "Madhubani, Bihar 847211",
      });
    sellerAProfileId = onboardA.body.data.id;

    await request(app)
      .post(`/api/v1/admin/sellers/${sellerAProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.APPROVED, reason: "Verified artisan weaver cluster." });

    const sellerAReLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerA_h@guild.local", password: "WeaverPass2026!#" });
    sellerAToken = sellerAReLogin.body.data.accessToken;

    // 3. Seller B (Royal Menswear Atelier)
    const sellerBReg = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "sellerB_h@atelier.local", password: "WeaverPass2026!#" });
    const sellerBUser = sellerBReg.body.data.userId;

    const sellerBLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerB_h@atelier.local", password: "WeaverPass2026!#" });

    const onboardB = await request(app)
      .post("/api/v1/seller/onboard")
      .set("Authorization", `Bearer ${sellerBLogin.body.data.accessToken}`)
      .send({
        storeName: "Jaipur Bandhgala House",
        businessGstin: "08BBBBB0000B1Z1",
        businessPan: "BBBBB0000B",
        registeredAddress: "MI Road, Jaipur, Rajasthan 302001",
      });
    sellerBProfileId = onboardB.body.data.id;

    await request(app)
      .post(`/api/v1/admin/sellers/${sellerBProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.APPROVED, reason: "Verified master tailor." });

    const sellerBReLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "sellerB_h@atelier.local", password: "WeaverPass2026!#" });
    sellerBToken = sellerBReLogin.body.data.accessToken;

    // 4. Customer
    const customerUserRecord = await repo.createUser({
      id: "cust_hardened_buyer",
      email: "buyer_h@royal.local",
      passwordHash: await PasswordService.hash("BuyerPass2026!#"),
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customerUserId = customerUserRecord.id;

    const custSessionId = "sess_customer_h";
    await repo.createSession({
      id: custSessionId,
      userId: customerUserRecord.id,
      tokenHash: "token_hash_cust_h",
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

  // ==========================================================================
  // SECTION 1 & 2: SYNTACTIC & SUBSTANTIVE HSN & TAX DATE GATING
  // ==========================================================================
  it("1. Rejects invalid HSN chapters (syntactic validation)", async () => {
    // Attempt HSN 1234 (Chapter 12: Oil seeds - not a marketplace textile/craft commodity)
    const invalidChapterRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Invalid HSN Garment",
        categoryId: "cat_ethnic",
        proposedHsn: "1234",
        proposedGstRate: 0.05,
        variants: [{ sku: "HSN-FAIL-01", colorName: "Red", colorHex: "#000", sizeName: "M", price: 15000, availableStock: 5, reservedStock: 0 }],
      });

    expect(invalidChapterRes.status).toBe(400);
    expect(invalidChapterRes.body.error.message).toMatch(/Invalid HSN chapter/);
  });

  it("2. Gating: Future effectiveFrom tax config blocks checkout until start date arrives", async () => {
    // Create product
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Future Tax Silk Saree",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "FUTURE-TAX-01", colorName: "Maroon", colorHex: "#800", sizeName: "FS", price: 12000, availableStock: 5, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;
    const variantId = createRes.body.data.variants[0].id;

    // Admin approves product moderation
    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);

    // Admin approves tax config with effectiveFrom 7 days in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: TaxVerificationStatus.APPROVED,
        approvedGstRate: 0.05,
        effectiveFrom: futureDate.toISOString(),
        reason: "Scheduled statutory rate notification",
      });

    // Customer cart repricing should block checkout
    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({ items: [{ variantId, quantity: 1 }] });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.isValidForCheckout).toBe(false);
    expect(repriceRes.body.data.validationErrors[0]).toMatch(/not yet effective/);
  });

  it("3. Gating: Expired effectiveTo tax config blocks checkout", async () => {
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Expired Tax Bandhgala",
        categoryId: "cat_men",
        proposedHsn: "6203",
        proposedGstRate: 0.12,
        variants: [{ sku: "EXPIRED-TAX-01", colorName: "Navy", colorHex: "#008", sizeName: "40", price: 16000, availableStock: 3, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;
    const variantId = createRes.body.data.variants[0].id;

    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);

    // Admin approves tax with effectiveTo in the past
    const pastDate = new Date("2025-12-31");
    await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: TaxVerificationStatus.APPROVED,
        approvedGstRate: 0.12,
        effectiveFrom: new Date("2025-01-01").toISOString(),
        effectiveTo: pastDate.toISOString(),
        reason: "Expired concession notification",
      });

    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({ items: [{ variantId, quantity: 1 }] });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.isValidForCheckout).toBe(false);
    expect(repriceRes.body.data.validationErrors[0]).toMatch(/has expired/);
  });

  // ==========================================================================
  // SECTION 3: MATERIAL CHANGE INVALIDATION
  // ==========================================================================
  it("4. Invalidation: Changing fabric material on APPROVED product resets status to PENDING_REVIEW and clears approved config", async () => {
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Authentic Pure Tussar Saree",
        categoryId: "cat_ethnic",
        fabricMaterial: "Pure Silk",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "TUSSAR-INV-01", colorName: "Gold", colorHex: "#DAA520", sizeName: "FS", price: 14000, availableStock: 4, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;
    const variantId = createRes.body.data.variants[0].id;

    // Approve tax and moderation
    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);
    await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TaxVerificationStatus.APPROVED, approvedGstRate: 0.05 });

    // Verify cart is eligible before change
    const preCheck = await request(app).post("/api/v1/cart/reprice").send({ items: [{ variantId, quantity: 1 }] });
    expect(preCheck.body.data.isValidForCheckout).toBe(true);

    // Seller modifies material attribute: fabricMaterial -> "Polyester Georgette"
    const updateRes = await request(app)
      .put(`/api/v1/seller/products/${prodId}`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({ fabricMaterial: "Polyester Georgette" });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.product.taxVerificationStatus).toBe(TaxVerificationStatus.PENDING_REVIEW);
    expect(updateRes.body.data.product.approvedTaxConfig).toBeNull();

    // Now cart repricing MUST be blocked
    const postCheck = await request(app).post("/api/v1/cart/reprice").send({ items: [{ variantId, quantity: 1 }] });
    expect(postCheck.body.data.isValidForCheckout).toBe(false);
    expect(postCheck.body.data.validationErrors[0]).toMatch(/no approved active tax configuration/);
  });

  it("5. Invalidation: Variant price change triggers tax invalidation", async () => {
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Handloom Cotton Angrakha",
        categoryId: "cat_ethnic",
        fabricMaterial: "Handloom Cotton",
        proposedHsn: "5208",
        proposedGstRate: 0.05,
        variants: [{ sku: "COTTON-VAR-01", colorName: "White", colorHex: "#FFF", sizeName: "L", price: 950, mrp: 1200, availableStock: 10, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;
    const variantId = createRes.body.data.variants[0].id;

    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);
    await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TaxVerificationStatus.APPROVED, approvedGstRate: 0.05 });

    // Seller updates price from ₹950 to ₹12,000 (crossing statutory threshold)
    await request(app)
      .put(`/api/v1/seller/products/${prodId}`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        variants: [{ sku: "COTTON-VAR-01", price: 12000, mrp: 15000, availableStock: 10 }],
      });

    const updated = await repo.findProductById(prodId);
    expect(updated?.taxVerificationStatus).toBe(TaxVerificationStatus.PENDING_REVIEW);
    expect(updated?.approvedTaxConfig).toBeNull();
  });

  it("6. Preservation: Non-material changes (care instructions, dispatch days) preserve existing tax approval", async () => {
    const createRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        title: "Mithila Handpainted Dupatta",
        categoryId: "cat_ethnic",
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        variants: [{ sku: "DUPATTA-SAFE-01", colorName: "Madder Red", colorHex: "#8B0000", sizeName: "FS", price: 6500, availableStock: 6, reservedStock: 0 }],
      });
    const prodId = createRes.body.data.product.id;

    await repo.updateProductModerationStatus(prodId, ProductModerationStatus.APPROVED);
    await request(app)
      .post(`/api/v1/admin/tax/products/${prodId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TaxVerificationStatus.APPROVED, approvedGstRate: 0.05 });

    // Seller updates non-material fields: careInstructions and dispatchLeadDays
    await request(app)
      .put(`/api/v1/seller/products/${prodId}`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({
        careInstructions: "Special gentle dry clean only. Wrap in unbleached mulmul.",
        dispatchLeadDays: 5,
      });

    const updated = await repo.findProductById(prodId);
    expect(updated?.taxVerificationStatus).toBe(TaxVerificationStatus.APPROVED);
    expect(updated?.approvedTaxConfig).not.toBeNull();
    expect(updated?.careInstructions).toBe("Special gentle dry clean only. Wrap in unbleached mulmul.");
    expect(updated?.dispatchLeadDays).toBe(5);
  });

  // ==========================================================================
  // SECTION 4: SETTLEMENT, SHIPPING RECONCILIATION & CANCELLATION
  // ==========================================================================
  it("7. Mixed shipping modes: Reconciles seller-managed delivery charges and platform standard shipping", async () => {
    // Seller A: SELLER_MANAGED (₹150 delivery charge)
    const prodARes = await repo.createProduct(
      {
        id: "prod_mix_A",
        sellerId: sellerAProfileId,
        categoryId: "cat_ethnic",
        title: "Seller A Workshop Saree",
        slug: "seller-a-workshop-saree",
        description: "Silk Saree",
        fabricMaterial: "Silk",
        occasion: "Festive",
        fit: "Traditional",
        careInstructions: "Dry clean",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/campaign-hero.jpg"],
        isActive: true,
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: {
          id: "cfg_mix_A",
          productId: "prod_mix_A",
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
      [{ sku: "MIX-A-SKU", colorName: "Red", colorHex: "#F00", sizeName: "FS", price: 10000, mrp: 12000, availableStock: 5, reservedStock: 0 }]
    );

    // Seller B: PLATFORM_STANDARD (Price: ₹1,500 < ₹2,999 threshold -> Platform Flat Shipping: ₹250 / policy fee)
    const prodBRes = await repo.createProduct(
      {
        id: "prod_mix_B",
        sellerId: sellerBProfileId,
        categoryId: "cat_accessories",
        title: "Seller B Silk Stole",
        slug: "seller-b-silk-stole",
        description: "Silk Stole",
        fabricMaterial: "Silk",
        occasion: "Evening",
        fit: "Standard",
        careInstructions: "Dry clean",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/campaign-hero.jpg"],
        isActive: true,
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: {
          id: "cfg_mix_B",
          productId: "prod_mix_B",
          hsnCode: "5007",
          approvedGstRate: 0.05,
          taxCategory: "Silk",
          effectiveFrom: new Date("2026-01-01"),
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
          version: 1,
        },
        shippingMethod: ShippingMethod.PLATFORM_STANDARD,
        sellerDeliveryCharge: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [{ sku: "MIX-B-SKU", colorName: "Gold", colorHex: "#D4AF37", sizeName: "FS", price: 1500, mrp: 2000, availableStock: 5, reservedStock: 0 }]
    );

    const varA = prodARes.variants[0];
    const varB = prodBRes.variants[0];

    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({
        items: [
          { variantId: varA.id, quantity: 1 }, // 10000 + 500 tax + 150 seller ship
          { variantId: varB.id, quantity: 1 }, // 1500 + 75 tax + 250 platform ship (subtotal 1500 < 2999)
        ],
      });

    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.subtotal).toBe(11500);
    expect(repriceRes.body.data.taxAmount).toBe(575); // 500 + 75
    expect(repriceRes.body.data.shippingFee).toBe(400); // 150 (seller A) + 250 (platform std)
    expect(repriceRes.body.data.totalAmount).toBe(12475); // 11500 + 575 + 400

    // Place Order
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [
          { variantId: varA.id, quantity: 1 },
          { variantId: varB.id, quantity: 1 },
        ],
        shippingAddress: {
          recipientName: "Gayatri Devi",
          street: "8 Civil Lines",
          city: "Varanasi",
          state: "Uttar Pradesh",
          postalCode: "221002",
          country: "India",
          phone: "+91-9876543210",
        },
      });

    expect(orderRes.status).toBe(201);
    const subOrders = orderRes.body.data.subOrders;
    expect(subOrders.length).toBe(2);

    const subOrderA = subOrders.find((s: any) => s.sellerId === sellerAProfileId);
    const subOrderB = subOrders.find((s: any) => s.sellerId === sellerBProfileId);

    // Seller A: Subtotal 10000, 12% commission = 1200, Shipping Reimbursement = 150 -> Net = 8950
    expect(subOrderA.subtotal).toBe(10000);
    expect(subOrderA.commissionAmount).toBe(1200);
    expect(subOrderA.shippingFee).toBe(150);
    expect(subOrderA.netSellerAmount).toBe(8950);

    // Seller B: Subtotal 1500, 12% commission = 180, Platform Standard (No seller reimbursement) -> Net = 1320
    expect(subOrderB.subtotal).toBe(1500);
    expect(subOrderB.commissionAmount).toBe(180);
    expect(subOrderB.netSellerAmount).toBe(1320);
  });

  it("8. Sub-order cancellation restores variant inventory and records RETURN_DEBIT reversal in seller ledger", async () => {
    // 1. Create a product with stock = 5
    const createRes = await repo.createProduct(
      {
        id: "prod_cancel_test",
        sellerId: sellerAProfileId,
        categoryId: "cat_ethnic",
        title: "Cancellable Silk Saree",
        slug: "cancellable-silk-saree",
        description: "Silk Saree",
        fabricMaterial: "Silk",
        occasion: "Festive",
        fit: "Traditional",
        careInstructions: "Dry clean",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/campaign-hero.jpg"],
        isActive: true,
        proposedHsn: "5007",
        proposedGstRate: 0.05,
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: {
          id: "cfg_canc",
          productId: "prod_cancel_test",
          hsnCode: "5007",
          approvedGstRate: 0.05,
          taxCategory: "Silk",
          effectiveFrom: new Date("2026-01-01"),
          approvedByUserId: adminUserId,
          approvedAt: new Date(),
          version: 1,
        },
        shippingMethod: ShippingMethod.PLATFORM_STANDARD,
        sellerDeliveryCharge: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [{ sku: "CANCEL-SKU-01", colorName: "Crimson", colorHex: "#C00", sizeName: "FS", price: 10000, mrp: 12000, availableStock: 5, reservedStock: 0 }]
    );
    const variant = createRes.variants[0];

    // Initial seller balance
    const balanceBefore = await repo.getSellerBalance(sellerAProfileId);

    // Customer places order for 2 units
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: variant.id, quantity: 2 }],
        shippingAddress: {
          recipientName: "Anita Sharma",
          street: "15 Temple Road",
          city: "Varanasi",
          state: "UP",
          postalCode: "221001",
          country: "India",
          phone: "+91-9876543210",
        },
      });

    const subOrder = orderRes.body.data.subOrders[0];
    const subOrderId = subOrder.id;

    // Check inventory reduced: 5 - 2 = 3
    const varAfterOrder = await repo.findVariantById(variant.id);
    expect(varAfterOrder?.availableStock).toBe(3);

    // Accrued balance increased by netSellerAmount (20000 - 2400 = 17600)
    const balanceAfterOrder = await repo.getSellerBalance(sellerAProfileId);
    expect(balanceAfterOrder).toBe(balanceBefore + 17600);

    // Seller cancels sub-order due to fabric damage in workshop
    const cancelRes = await request(app)
      .post(`/api/v1/seller/sub-orders/${subOrderId}/cancel`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({ reason: "Workshop yarn damage prior to dispatch." });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(FulfilmentStatus.CANCELLED);

    // Verify inventory restored: 3 + 2 = 5
    const varAfterCancel = await repo.findVariantById(variant.id);
    expect(varAfterCancel?.availableStock).toBe(5);

    // Verify balance reversed back to balanceBefore
    const balanceAfterCancel = await repo.getSellerBalance(sellerAProfileId);
    expect(balanceAfterCancel).toBe(balanceBefore);

    // Verify reversal entry in settlement ledger
    const ledger = await repo.listSellerLedger(sellerAProfileId);
    const returnEntry = ledger.find((e: any) => e.subOrderId === subOrderId && e.entryType === LedgerEntryType.RETURN_DEBIT);
    expect(returnEntry).toBeDefined();
    expect(returnEntry?.amount).toBe(17600);
  });

  // ==========================================================================
  // SECTION 5: SUPER ADMIN AUTHORIZATION & FINANCE OPERATIONS
  // ==========================================================================
  it("9. Super Admin disburses verified payout, reducing accrued balance with bank reference", async () => {
    // Current balance of Seller A
    const currentBalance = await repo.getSellerBalance(sellerAProfileId);
    expect(currentBalance).toBeGreaterThan(0);

    const payoutAmount = Math.floor(currentBalance / 2);

    // Seller attempts to disburse own payout (HTTP 403 Forbidden)
    const selfPayout = await request(app)
      .post(`/api/v1/admin/settlements/${sellerAProfileId}/payout`)
      .set("Authorization", `Bearer ${sellerAToken}`)
      .send({ amount: payoutAmount, bankReference: "NEFT-UNAUTHORIZED" });
    expect(selfPayout.status).toBe(403);

    // Super Admin executes verified payout
    const adminPayout = await request(app)
      .post(`/api/v1/admin/settlements/${sellerAProfileId}/payout`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: payoutAmount, bankReference: "NEFT-HDFC-9876543210" });

    expect(adminPayout.status).toBe(200);
    expect(adminPayout.body.data.balanceAfter).toBe(currentBalance - payoutAmount);

    const newBalance = await repo.getSellerBalance(sellerAProfileId);
    expect(newBalance).toBe(currentBalance - payoutAmount);
  });
});
