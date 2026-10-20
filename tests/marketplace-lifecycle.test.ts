import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { FoundationRepository } from "../src/database/repository.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { PasswordService } from "../src/auth/password.service.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import { UserRole, VerificationStatus } from "../src/types/auth.js";
import { FulfilmentStatus, ProductModerationStatus } from "../src/types/marketplace.js";

describe("Milestones B, C, D, E: Marketplace Lifecycle Integration Test Suite", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;
  let app: any;

  beforeEach(async () => {
    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-min-32-chars-vespera-lifecycle", "15m");
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
  });

  it("executes complete lifecycle: Seller onboarding -> Admin approval -> Product moderation -> Customer discovery -> Cart repricing -> Multi-seller order splitting -> Inventory deduction -> Settlement ledger accrual", async () => {
    // ------------------------------------------------------------------------
    // 1. SETUP SUPER ADMIN ACCOUNT
    // ------------------------------------------------------------------------
    const adminPass = "VesperaAdmin2026!#";
    const adminUser = await repo.createUser({
      id: "admin_user_id",
      email: "admin@vespera.local",
      passwordHash: await PasswordService.hash(adminPass),
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const adminSessionId = "sess_admin_lifecycle";
    await repo.createSession({
      id: adminSessionId,
      userId: adminUser.id,
      tokenHash: "token_hash_admin",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const adminToken = tokenService.signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: adminSessionId,
    });

    // ------------------------------------------------------------------------
    // 2. SELLER REGISTRATION & ONBOARDING
    // ------------------------------------------------------------------------
    const sellerRegRes = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "weaver@banaras.local", password: "WeaverPass2026!#" });
    expect(sellerRegRes.status).toBe(201);
    const sellerUserId = sellerRegRes.body.data.userId;

    const sellerLoginRes = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "weaver@banaras.local", password: "WeaverPass2026!#" });
    expect(sellerLoginRes.status).toBe(200);
    let sellerToken = sellerLoginRes.body.data.accessToken;

    // Seller submits onboarding details
    const onboardRes = await request(app)
      .post("/api/v1/seller/onboard")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        storeName: "Banaras Heritage Silks",
        businessGstin: "09ABCDE1234F1Z5",
        businessPan: "ABCDE1234F",
        registeredAddress: "Ghat Road, Varanasi, UP 221001",
      });
    expect(onboardRes.status).toBe(201);
    const sellerProfileId = onboardRes.body.data.id;
    expect(onboardRes.body.data.verificationStatus).toBe(VerificationStatus.SUBMITTED);

    // ------------------------------------------------------------------------
    // 3. SUPER ADMIN VERIFIES & APPROVES SELLER
    // ------------------------------------------------------------------------
    const approvalRes = await request(app)
      .post(`/api/v1/admin/sellers/${sellerProfileId}/decision`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: VerificationStatus.APPROVED, reason: "Verified GSTIN and business credentials." });
    expect(approvalRes.status).toBe(200);

    // Re-login to get updated APPROVED_SELLER token
    const sellerReLogin = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "weaver@banaras.local", password: "WeaverPass2026!#" });
    sellerToken = sellerReLogin.body.data.accessToken;
    expect(sellerReLogin.body.data.user.role).toBe(UserRole.APPROVED_SELLER);

    // ------------------------------------------------------------------------
    // 4. APPROVED SELLER CREATES FASHION PRODUCT WITH VARIANTS
    // ------------------------------------------------------------------------
    const productCreateRes = await request(app)
      .post("/api/v1/seller/products")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        title: "Katan Silk Handloom Sari",
        categoryId: "cat_ethnic",
        description: "Pure Katan silk sari with intricate gold zari brocade work.",
        fabricMaterial: "Pure Silk",
        occasion: "Wedding",
        fit: "Traditional Draped",
        careInstructions: "Dry Clean Only",
        brandClaim: "Banaras Heritage Loom",
        images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c"],
        variants: [
          { sku: "TEST-KATAN-RED-FS", colorName: "Crimson Red", colorHex: "#8A252C", sizeName: "Free Size", mrp: 18000, price: 14500, availableStock: 5, reservedStock: 0 },
          { sku: "TEST-KATAN-GOLD-FS", colorName: "Champagne Gold", colorHex: "#9E7D46", sizeName: "Free Size", mrp: 18000, price: 14500, availableStock: 3, reservedStock: 0 },
        ],
      });
    expect(productCreateRes.status).toBe(201);
    const createdProduct = productCreateRes.body.data.product;
    const redVariant = productCreateRes.body.data.variants[0];
    expect(createdProduct.moderationStatus).toBe(ProductModerationStatus.SUBMITTED);

    // Verify product does NOT appear in public catalog yet (gated by moderation)
    const publicPreCheck = await request(app).get("/api/v1/products");
    expect(publicPreCheck.body.data.some((p: any) => p.product.id === createdProduct.id)).toBe(false);

    // ------------------------------------------------------------------------
    // 5. SUPER ADMIN APPROVES PRODUCT MODERATION
    // ------------------------------------------------------------------------
    const modDecisionRes = await request(app)
      .post(`/api/v1/admin/products/${createdProduct.id}/moderation`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: ProductModerationStatus.APPROVED, reason: "Authenticity verified." });
    expect(modDecisionRes.status).toBe(200);

    // ------------------------------------------------------------------------
    // 6. CUSTOMER DISCOVERY & FACETED SEARCH
    // ------------------------------------------------------------------------
    const catalogRes = await request(app).get("/api/v1/products?fabric=Pure Silk&occasion=Wedding");
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(catalogRes.body.data[0].product.title).toBe("Katan Silk Handloom Sari");
    expect(catalogRes.body.data[0].sellerStoreName).toBe("Banaras Heritage Silks");

    // ------------------------------------------------------------------------
    // 7. CART REPRICING ENGINE
    // ------------------------------------------------------------------------
    const repriceRes = await request(app)
      .post("/api/v1/cart/reprice")
      .send({
        items: [{ variantId: redVariant.id, quantity: 2 }],
      });
    expect(repriceRes.status).toBe(200);
    expect(repriceRes.body.data.subtotal).toBe(29000); // 14500 * 2
    expect(repriceRes.body.data.taxAmount).toBe(1450); // 5% GST
    expect(repriceRes.body.data.shippingFee).toBe(0); // Free shipping over 2999
    expect(repriceRes.body.data.totalAmount).toBe(30450);
    expect(repriceRes.body.data.isValidForCheckout).toBe(true);

    // ------------------------------------------------------------------------
    // 8. CUSTOMER CHECKOUT & ATOMIC STOCK DEDUCTION
    // ------------------------------------------------------------------------
    const customerUser = await repo.createUser({
      id: "cust_shopper_id",
      email: "buyer@royalty.local",
      passwordHash: await PasswordService.hash("BuyerPass2026!#"),
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const custSessionId = "sess_shopper";
    await repo.createSession({
      id: custSessionId,
      userId: customerUser.id,
      tokenHash: "token_hash_shopper",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const customerToken = tokenService.signAccessToken({
      userId: customerUser.id,
      email: customerUser.email,
      role: customerUser.role,
      sessionId: custSessionId,
    });

    const checkoutRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: redVariant.id, quantity: 2 }],
        shippingAddress: {
          recipientName: "Devika Rathore",
          street: "14 Palace Enclave, Civil Lines",
          city: "Jaipur",
          state: "Rajasthan",
          postalCode: "302006",
          country: "India",
          phone: "+91-9876543210",
        },
      });

    expect(checkoutRes.status).toBe(201);
    const order = checkoutRes.body.data;
    expect(order.subOrders.length).toBe(1);
    const subOrder = order.subOrders[0];
    expect(subOrder.sellerId).toBe(sellerProfileId);
    expect(subOrder.subtotal).toBe(29000);
    expect(subOrder.commissionAmount).toBe(3480); // 12% commission
    expect(subOrder.netSellerAmount).toBe(25520); // 29000 - 3480

    // Verify inventory decrement (was 5, ordered 2 -> remaining 3)
    const updatedVariant = await repo.findVariantById(redVariant.id);
    expect(updatedVariant?.availableStock).toBe(3);

    // ------------------------------------------------------------------------
    // 9. OVERSELLING PREVENTION (ATTEMPTING TO ORDER MORE THAN AVAILABLE STOCK)
    // ------------------------------------------------------------------------
    const oversellAttempt = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: redVariant.id, quantity: 10 }], // Only 3 left
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
    expect(oversellAttempt.status).toBe(400);
    expect(oversellAttempt.body.error.message).toMatch(/remaining for 'Katan Silk Handloom Sari'/);

    // ------------------------------------------------------------------------
    // 10. SELLER FULFILMENT & TRACKING
    // ------------------------------------------------------------------------
    const fulfillRes = await request(app)
      .put(`/api/v1/seller/orders/${subOrder.id}/fulfill`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({
        status: FulfilmentStatus.DISPATCHED,
        carrierName: "BlueDart Express",
        trackingNumber: "BD982734190IN",
      });
    expect(fulfillRes.status).toBe(200);

    // Verify sub-order status
    const verifiedSub = await repo.findSubOrderById(subOrder.id);
    expect(verifiedSub?.status).toBe(FulfilmentStatus.DISPATCHED);
    expect(verifiedSub?.carrierName).toBe("BlueDart Express");
    expect(verifiedSub?.trackingNumber).toBe("BD982734190IN");

    // ------------------------------------------------------------------------
    // 11. SELLER SETTLEMENT LEDGER ACCRUAL
    // ------------------------------------------------------------------------
    const settlementRes = await request(app)
      .get("/api/v1/seller/settlements")
      .set("Authorization", `Bearer ${sellerToken}`);
    expect(settlementRes.status).toBe(200);
    expect(settlementRes.body.data.currentBalance).toBe(25520);
    expect(settlementRes.body.data.entries.length).toBe(1);
    expect(settlementRes.body.data.entries[0].subOrderId).toBe(subOrder.id);
  });
});
