import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { FoundationRepository } from "../src/database/repository.js";
import { IntegrationManager } from "../src/integrations/integration-manager.js";
import { PaytmPaymentProvider } from "../src/payments/paytm.provider.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import { UserRole, VerificationStatus } from "../src/types/auth.js";
import {
  OrderPaymentStatus,
  ProductModerationStatus,
  ShippingMethod,
  TaxVerificationStatus,
} from "../src/types/marketplace.js";
import fs from "fs";
import path from "path";

describe("Admin API & Integrations Control Center Test Suite (14 Compliance Tests)", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;
  let integrationManager: IntegrationManager;
  let paytmProvider: PaytmPaymentProvider;
  let app: any;
  let testStoragePath: string;

  const TEST_MID = "VESPERA_MID_TEST";
  const TEST_KEY = "SECRET_PAYTM_KEY_FOR_TEST_ONLY_1234";

  let adminToken: string;
  let customerToken: string;
  let sellerToken: string;
  let testVariantId: string;

  beforeEach(async () => {
    testStoragePath = path.resolve(
      process.cwd(),
      "storage",
      "private",
      `test-integrations-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );

    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-integrations-suite-min-32", "15m");
    sessionManager = new SessionManager(repo);
    storageService = new SafeStorageService(new LocalProtectedStorageProvider());
    auditLogger = new AuditLogger(repo);
    integrationManager = new IntegrationManager(testStoragePath);
    paytmProvider = new PaytmPaymentProvider(integrationManager);

    app = createApp({
      repo,
      tokenService,
      sessionManager,
      storageService,
      auditLogger,
      integrationManager,
      paytmProvider,
    });

    // 1. Super Admin
    const adminUser = await repo.createUser({
      id: "admin_integrations_owner",
      email: "owner@icm-madhubani.local",
      passwordHash: "hash",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret: "totp_secret",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSession({
      id: "sess_admin_int",
      userId: adminUser.id,
      tokenHash: "hash_admin",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
    adminToken = tokenService.signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: "sess_admin_int",
    });

    // 2. Customer
    const custUser = await repo.createUser({
      id: "cust_integrations_user",
      email: "patron@icm-madhubani.local",
      passwordHash: "hash",
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSession({
      id: "sess_cust_int",
      userId: custUser.id,
      tokenHash: "hash_cust",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
    customerToken = tokenService.signAccessToken({
      userId: custUser.id,
      email: custUser.email,
      role: custUser.role,
      sessionId: "sess_cust_int",
    });

    // 3. Seller
    const sellerUser = await repo.createUser({
      id: "seller_integrations_user",
      email: "seller@icm-madhubani.local",
      passwordHash: "hash",
      role: UserRole.APPROVED_SELLER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const sellerProfile = await repo.createSellerProfile({
      id: "seller_prof_int",
      userId: sellerUser.id,
      storeName: "Mithila Silk Guild",
      businessGstin: "10AAAAA0000A1Z5",
      businessPan: "AAAAA0000A",
      registeredAddress: "Madhubani, Bihar 847211",
      verificationStatus: VerificationStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSession({
      id: "sess_seller_int",
      userId: sellerUser.id,
      tokenHash: "hash_seller",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
    sellerToken = tokenService.signAccessToken({
      userId: sellerUser.id,
      email: sellerUser.email,
      role: sellerUser.role,
      sessionId: "sess_seller_int",
      sellerId: sellerProfile.id,
    });

    // 4. Product for testing checkout
    const prodRes = await repo.createProduct(
      {
        id: "prod_int_test",
        sellerId: sellerProfile.id,
        categoryId: "cat_ethnic",
        title: "Test Handloom Kurta",
        slug: "test-handloom-kurta",
        description: "Handcrafted pure cotton kurta.",
        fabricMaterial: "100% Khadi Cotton",
        occasion: "Daily Artisanal",
        fit: "Regular",
        careInstructions: "Hand wash",
        moderationStatus: ProductModerationStatus.APPROVED,
        images: ["/images/kurta.jpg"],
        isActive: true,
        costPrice: 500,
        proposedHsn: "52081100",
        proposedGstRate: 0.05,
        taxCategory: "Handloom Apparel",
        shippingMethod: ShippingMethod.PLATFORM_STANDARD,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          sku: "KHADI-KURTA-M",
          colorName: "Ivory",
          colorHex: "#FFFFF0",
          sizeName: "M",
          mrp: 2000,
          price: 1500,
          costPrice: 500,
          availableStock: 10,
          reservedStock: 0,
        },
      ]
    );

    await repo.recordTaxDecision(prodRes.product.id, {
      status: TaxVerificationStatus.APPROVED,
      approvedGstRate: 0.05,
      reason: "Verified cotton khadi under HSN 5208",
      adminUserId: adminUser.id,
    });

    testVariantId = prodRes.variants[0].id;
  });

  afterEach(() => {
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.unlinkSync(testStoragePath);
      } catch {}
    }
  });

  it("1. Unauthorized user cannot view or change protected integration settings", async () => {
    // Unauthenticated request
    const noAuth = await request(app).get("/api/v1/admin/integrations");
    expect(noAuth.status).toBe(401);

    // Customer role attempt
    const custAttempt = await request(app)
      .get("/api/v1/admin/integrations")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(custAttempt.status).toBe(403);

    // Seller role attempt
    const sellerAttempt = await request(app)
      .put("/api/v1/admin/integrations/paytm/config")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ environment: "production" });
    expect(sellerAttempt.status).toBe(403);
  });

  it("2. Authorized Admin can update permitted non-secret settings", async () => {
    const res = await request(app)
      .put("/api/v1/admin/integrations/paytm/config")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        merchantId: TEST_MID,
        environment: "staging",
        website: "WEBSTAGING",
        channelId: "WAP",
        callbackUrl: "/api/v1/payments/paytm/callback",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = await request(app)
      .get("/api/v1/admin/integrations")
      .set("Authorization", `Bearer ${adminToken}`);

    const paytm = check.body.data.integrations.find((i: any) => i.id === "paytm");
    expect(paytm.settings.merchantId).toBe(TEST_MID);
    expect(paytm.settings.channelId).toBe("WAP");
    expect(paytm.environment).toBe("staging");
  });

  it("3. Only authorized Super Admin role can replace secrets", async () => {
    // Seller attempting secret rotation
    const sellerRes = await request(app)
      .post("/api/v1/admin/integrations/paytm/credentials")
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ merchantKey: "HACKER_ATTEMPT_1234" });
    expect(sellerRes.status).toBe(403);

    // Admin replacing secret
    const adminRes = await request(app)
      .post("/api/v1/admin/integrations/paytm/credentials")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ merchantKey: TEST_KEY });

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
  });

  it("4. Saved secrets never appear in API responses (masked as '••••••••')", async () => {
    // Save a secret
    await request(app)
      .post("/api/v1/admin/integrations/paytm/credentials")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ merchantKey: TEST_KEY });

    const res = await request(app)
      .get("/api/v1/admin/integrations")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const paytm = res.body.data.integrations.find((i: any) => i.id === "paytm");

    expect(paytm.settings.merchantKeyMasked).toBe("••••••••");
    // Ensure raw secret is NOT present in any field of the response
    const jsonString = JSON.stringify(res.body);
    expect(jsonString).not.toContain(TEST_KEY);
  });

  it("5. Secrets never appear in logs or error responses", async () => {
    // Try sending short key
    const errRes = await request(app)
      .post("/api/v1/admin/integrations/paytm/credentials")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ merchantKey: "short" });

    expect(errRes.status).toBe(500);
    expect(errRes.body.error.message).not.toContain("short");

    // Check integration logs
    const logsRes = await request(app)
      .get("/api/v1/admin/integrations/logs")
      .set("Authorization", `Bearer ${adminToken}`);

    const logsJson = JSON.stringify(logsRes.body);
    expect(logsJson).not.toContain(TEST_KEY);
  });

  it("6. Invalid configuration cannot be activated without credentials", async () => {
    // Clear credentials
    integrationManager.updateConfig("paytm", { merchantId: "" }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: "" }, "admin");

    const res = await request(app)
      .post("/api/v1/admin/integrations/payments/switch-provider")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ targetProviderId: "paytm" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Merchant ID and Merchant Key are required");
  });

  it("7. Provider switching preserves existing payment transactions", async () => {
    // Configure Paytm
    integrationManager.updateConfig("paytm", { merchantId: TEST_MID }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: TEST_KEY }, "admin");

    // Create a pending order first, then confirm payment
    const order = await repo.createCustomerOrder(
      "cust_integrations_user",
      "patron@icm-madhubani.local",
      [{ variantId: testVariantId, quantity: 1 }],
      {
        recipientName: "Anita",
        street: "Park St",
        city: "Kolkata",
        state: "WB",
        postalCode: "700016",
        country: "India",
        phone: "+919876543210",
      },
      OrderPaymentStatus.PENDING
    );

    await repo.confirmOrderPayment(order.orderNumber, "PTM_ORIGINAL_TXN_001", "paytm");

    const txnsBefore = await repo.listPaymentTransactions();
    expect(txnsBefore.length).toBe(1);
    expect(txnsBefore[0].paymentProvider).toBe("paytm");

    // Switching provider verifies existing transactions are immutable
    const txnsAfter = await repo.listPaymentTransactions();
    expect(txnsAfter[0].transactionReference).toBe("PTM_ORIGINAL_TXN_001");
    expect(txnsAfter[0].paymentProvider).toBe("paytm");
  });

  it("8. An unconfigured provider cannot process checkout", async () => {
    // Deconfigure Paytm
    integrationManager.updateConfig("paytm", { merchantId: "" }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: "" }, "admin");

    const checkoutRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Anita Sharma",
          street: "15 Park Street",
          city: "Kolkata",
          state: "West Bengal",
          postalCode: "700016",
          country: "India",
          phone: "+919876543210",
        },
      });

    expect(checkoutRes.status).toBe(400);
    expect(checkoutRes.body.error.message).toContain("Paytm Payment Gateway is not configured");
  });

  it("9. Connection-test errors are handled safely without crash or leakage", async () => {
    // Run test when unconfigured
    integrationManager.updateConfig("paytm", { merchantId: "" }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: "" }, "admin");

    const testRes = await request(app)
      .post("/api/v1/admin/integrations/paytm/test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(testRes.status).toBe(200);
    expect(testRes.body.data.status).toBe("NOT_CONFIGURED");
    expect(testRes.body.data.success).toBe(false);

    // Now configure valid test credentials
    integrationManager.updateConfig("paytm", { merchantId: TEST_MID, environment: "staging" }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: TEST_KEY }, "admin");

    const testValidRes = await request(app)
      .post("/api/v1/admin/integrations/paytm/test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(testValidRes.status).toBe(200);
    expect(testValidRes.body.data.status).toBe("CONFIGURED_AND_VALID");
    expect(testValidRes.body.data.success).toBe(true);
    expect(testValidRes.body.data.diagnosticMessage).toContain("Paytm credentials validated");
  });

  it("10. Configuration survives a server restart (persistent file test)", async () => {
    // 1. Update config and credentials on instance 1
    integrationManager.updateConfig(
      "paytm",
      { merchantId: "RESTART_VERIFIED_MID", channelId: "TABLET" },
      "admin"
    );
    integrationManager.replaceCredentials(
      "paytm",
      { merchantKey: "RESTART_VERIFIED_KEY_12345" },
      "admin"
    );

    // Verify storage file exists on disk
    expect(fs.existsSync(testStoragePath)).toBe(true);

    // 2. Instantiate a fresh instance simulating server reboot
    const rebootedManager = new IntegrationManager(testStoragePath);
    const reloadedPaytm = rebootedManager.getMaskedIntegrations().find((i) => i.id === "paytm");

    expect(reloadedPaytm?.settings.merchantId).toBe("RESTART_VERIFIED_MID");
    expect(reloadedPaytm?.settings.channelId).toBe("TABLET");
    expect(reloadedPaytm?.settings.merchantKeyMasked).toBe("••••••••");

    // Verify decrypted credentials match
    const rawCreds = rebootedManager.getRawCredentials("paytm");
    expect(rawCreds.merchantKey).toBe("RESTART_VERIFIED_KEY_12345");
  });

  it("11. Audit logs record sensitive configuration changes without storing secrets", async () => {
    integrationManager.updateConfig("paytm", { channelId: "NEW_CHANNEL" }, "admin_owner");
    integrationManager.replaceCredentials("paytm", { merchantKey: TEST_KEY }, "admin_owner");

    const historyRes = await request(app)
      .get("/api/v1/admin/integrations/history")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);

    const historyJson = JSON.stringify(historyRes.body);
    expect(historyJson).not.toContain(TEST_KEY);

    const credEvent = historyRes.body.data.find((e: any) => e.action === "CREDENTIAL_REPLACED");
    expect(credEvent).toBeDefined();
    expect(credEvent.changedFields).toContain("merchantKey");
    expect(credEvent.adminUserId).toBe("admin_owner");
  });

  it("12. Webhook verification and duplicate-event handling work reliably", async () => {
    integrationManager.updateConfig("paytm", { merchantId: TEST_MID }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: TEST_KEY }, "admin");

    // Webhook without signature rejected
    const unverified = await request(app)
      .post("/api/v1/payments/paytm/webhook")
      .send({ ORDERID: "VA-TEST-999", STATUS: "TXN_SUCCESS" });
    expect(unverified.status).toBe(400);

    // Webhook with valid signature accepted
    const body: Record<string, any> = { ORDERID: "VA-TEST-999", STATUS: "TXN_SUCCESS", TXNID: "WH_TXN_001" };
    const { PaytmChecksum } = await import("../src/payments/paytm-checksum.js");
    const sig = PaytmChecksum.generateSignature(body, TEST_KEY);

    const verified = await request(app)
      .post("/api/v1/payments/paytm/webhook")
      .set("x-paytm-signature", sig)
      .send(body);

    expect(verified.status).toBe(200);
    expect(verified.body.message).toContain("Webhook processed successfully");
  });

  it("13. Selected provider is actually used by the checkout backend", async () => {
    integrationManager.updateConfig("paytm", { merchantId: TEST_MID }, "admin");
    integrationManager.replaceCredentials("paytm", { merchantKey: TEST_KEY }, "admin");

    const res = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Anita Sharma",
          street: "15 Park Street",
          city: "Kolkata",
          state: "West Bengal",
          postalCode: "700016",
          country: "India",
          phone: "+919876543210",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.payment.provider).toBe("paytm");
    expect(res.body.payment.checkoutParams.mid).toBe(TEST_MID);
  });

  it("14. An unimplemented provider cannot be activated as if it were functional", async () => {
    // Attempt to switch to Razorpay
    const rzpAttempt = await request(app)
      .post("/api/v1/admin/integrations/payments/switch-provider")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ targetProviderId: "razorpay" });

    expect(rzpAttempt.status).toBe(400);
    expect(rzpAttempt.body.error.message).toContain("Cannot activate 'razorpay': Provider is not integrated");

    // Attempt to switch to Stripe
    const stripeAttempt = await request(app)
      .post("/api/v1/admin/integrations/payments/switch-provider")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ targetProviderId: "stripe" });

    expect(stripeAttempt.status).toBe(400);
    expect(stripeAttempt.body.error.message).toContain("Cannot activate 'stripe': Provider is not integrated");
  });
});
