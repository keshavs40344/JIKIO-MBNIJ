import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { FoundationRepository } from "../src/database/repository.js";
import { IntegrationManager } from "../src/integrations/integration-manager.js";
import { PaytmPaymentProvider } from "../src/payments/paytm.provider.js";
import { PaytmChecksum } from "../src/payments/paytm-checksum.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import {
  FulfilmentStatus,
  OrderPaymentStatus,
  ProductModerationStatus,
  ShippingMethod,
  TaxVerificationStatus,
} from "../src/types/marketplace.js";
import { UserRole, VerificationStatus } from "../src/types/auth.js";
import fs from "fs";
import path from "path";

describe("Paytm Payment Gateway & Lifecycle Verification Suite", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;
  let integrationManager: IntegrationManager;
  let paytmProvider: PaytmPaymentProvider;
  let app: any;
  let testStoragePath: string;

  const TEST_MID = "VESPERA_MID_2026";
  const TEST_KEY = "MITHILA_SECRET_KEY_2026_TEST";

  let customerToken: string;
  let adminToken: string;
  let testVariantId: string;
  let sellerProfileId: string;

  beforeEach(async () => {
    testStoragePath = path.resolve(
      process.cwd(),
      "storage",
      "private",
      `test-paytm-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );

    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-min-32-chars-paytm-suite", "15m");
    sessionManager = new SessionManager(repo);
    storageService = new SafeStorageService(new LocalProtectedStorageProvider());
    auditLogger = new AuditLogger(repo);
    integrationManager = new IntegrationManager(testStoragePath);
    paytmProvider = new PaytmPaymentProvider(integrationManager);

    // Configure test Paytm credentials
    integrationManager.updateConfig(
      "paytm",
      {
        merchantId: TEST_MID,
        environment: "staging",
        website: "WEBSTAGING",
        callbackUrl: "/api/v1/payments/paytm/callback",
      },
      "admin_owner_vespera"
    );
    integrationManager.replaceCredentials(
      "paytm",
      { merchantKey: TEST_KEY },
      "admin_owner_vespera"
    );

    app = createApp({
      repo,
      tokenService,
      sessionManager,
      storageService,
      auditLogger,
      integrationManager,
      paytmProvider,
    });

    // 1. Create Super Admin User & Session
    const adminUser = await repo.createUser({
      id: "admin_paytm_test",
      email: "owner_paytm@vespera.local",
      passwordHash: "hash",
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret: "secret",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSession({
      id: "sess_admin_paytm",
      userId: adminUser.id,
      tokenHash: "token_hash_admin",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
    adminToken = tokenService.signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: "sess_admin_paytm",
    });

    // 2. Create Customer User & Session
    const customerUser = await repo.createUser({
      id: "customer_paytm_patron",
      email: "patron_paytm@vespera.local",
      passwordHash: "hash",
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.createSession({
      id: "sess_customer_paytm",
      userId: customerUser.id,
      tokenHash: "token_hash_cust",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
    customerToken = tokenService.signAccessToken({
      userId: customerUser.id,
      email: customerUser.email,
      role: customerUser.role,
      sessionId: "sess_customer_paytm",
    });

    // 3. Create Approved Seller & Store Profile
    const sellerUser = await repo.createUser({
      id: "seller_paytm_weaver",
      email: "weaver_paytm@banaras.local",
      passwordHash: "hash",
      role: UserRole.APPROVED_SELLER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sellerProf = await repo.createSellerProfile({
      id: "seller_prof_paytm",
      userId: sellerUser.id,
      storeName: "Varanasi Heritage Silks",
      businessGstin: "09AAAAA0000A1Z5",
      businessPan: "AAAAA0000A",
      registeredAddress: "Ghats of Varanasi, UP 221001",
      verificationStatus: VerificationStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    sellerProfileId = sellerProf.id;

    // 4. Create an approved, in-stock product with valid tax configuration
    const prodRes = await repo.createProduct(
      {
        id: "prod_paytm_katan",
        sellerId: sellerProfileId,
        categoryId: "cat_ethnic",
        title: "Crimson Bridal Katan Saree",
        slug: "crimson-bridal-katan-saree",
        description: "Handwoven pure katan silk with Kadwa zari floral jaal.",
        fabricMaterial: "100% Pure Katan Silk",
        occasion: "Bridal",
        fit: "Traditional Drape",
        careInstructions: "Dry clean only",
        moderationStatus: ProductModerationStatus.DRAFT,
        images: ["/images/saree1.jpg"],
        isActive: true,
        costPrice: 8000,
        proposedHsn: "50072010",
        proposedGstRate: 0.05,
        taxCategory: "Handloom Apparel",
        taxClassificationNotes: "GI tagged Varanasi handloom silk.",
        shippingMethod: ShippingMethod.PLATFORM_STANDARD,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          sku: "CRIMSON-KATAN-FREE",
          colorName: "Crimson Red",
          colorHex: "#8B0000",
          sizeName: "Free Size",
          mrp: 18000,
          price: 15000,
          costPrice: 8000,
          availableStock: 5,
          reservedStock: 0,
        },
      ]
    );

    // Super Admin approves product & tax
    await repo.updateProductModerationStatus(prodRes.product.id, ProductModerationStatus.APPROVED);
    await repo.recordTaxDecision(prodRes.product.id, {
      status: TaxVerificationStatus.APPROVED,
      approvedGstRate: 0.05,
      reason: "Verified handloom silk under HSN 5007",
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

  it("1. Successfully initiates Paytm transaction and signs payload with HMAC-SHA256", async () => {
    const res = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const order = res.body.data;
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PENDING);
    expect(order.orderNumber).toMatch(/^VA-/);

    // Verify stock was RESERVED (available 4, reserved 1)
    const variant = await repo.findVariantById(testVariantId);
    expect(variant?.availableStock).toBe(4);
    expect(variant?.reservedStock).toBe(1);

    // Verify payment initiation payload
    const payment = res.body.payment;
    expect(payment).toBeDefined();
    expect(payment.provider).toBe("paytm");
    expect(payment.status).toBe("INITIATED");
    expect(payment.checkoutParams.mid).toBe(TEST_MID);
    expect(payment.checkoutParams.orderId).toBe(order.orderNumber);
    expect(payment.checkoutParams.signature).toBeDefined();

    // Verify signature validity
    const isValidSig = PaytmChecksum.verifySignature(
      {
        requestType: "Payment",
        mid: TEST_MID,
        orderId: order.orderNumber,
        websiteName: "WEBSTAGING",
        txnAmount: { value: order.totalAmount.toFixed(2), currency: "INR" },
        userInfo: { custId: order.customerId, email: order.customerEmail },
        callbackUrl: "/api/v1/payments/paytm/callback",
      },
      TEST_KEY,
      payment.checkoutParams.signature
    );
    expect(isValidSig).toBe(true);
  });

  it("2. Blocks transaction initiation when Paytm credentials are not configured", async () => {
    // Remove credentials
    integrationManager.updateConfig("paytm", { merchantId: "" }, "admin_owner_vespera");
    integrationManager.replaceCredentials("paytm", { merchantKey: "" }, "admin_owner_vespera");

    const res = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Paytm Payment Gateway is not configured");
  });

  it("3. Successfully confirms payment, commits stock, and accrues ledger on valid Paytm callback", async () => {
    // Step 1: Create pending order
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const order = orderRes.body.data;
    const orderNumber = order.orderNumber;
    const amountStr = order.totalAmount.toFixed(2);

    // Verify initial balance is 0
    expect(await repo.getSellerBalance(sellerProfileId)).toBe(0);

    // Step 2: Construct valid Paytm callback payload
    const callbackPayload: Record<string, any> = {
      MID: TEST_MID,
      ORDERID: orderNumber,
      TXNAMOUNT: amountStr,
      CURRENCY: "INR",
      TXNID: "PTM_TXN_987654321",
      STATUS: "TXN_SUCCESS",
      RESPCODE: "01",
      RESPMSG: "Txn Successful",
      BANKTXNID: "BANK_11223344",
    };
    callbackPayload.CHECKSUMHASH = PaytmChecksum.generateSignature(callbackPayload, TEST_KEY);

    // Step 3: Deliver callback to server
    const callbackRes = await request(app)
      .post("/api/v1/payments/paytm/callback")
      .send(callbackPayload);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.data.status).toBe("PAID");
    expect(callbackRes.body.data.transactionReference).toBe("PTM_TXN_987654321");

    // Verify order is now PAID
    const verifiedOrder = await repo.findCustomerOrderById(order.id);
    expect(verifiedOrder?.paymentStatus).toBe(OrderPaymentStatus.PAID);

    // Verify stock is committed (reserved is 0, available is 4)
    const variant = await repo.findVariantById(testVariantId);
    expect(variant?.availableStock).toBe(4);
    expect(variant?.reservedStock).toBe(0);

    // Verify seller settlement ledger is now accrued
    const balance = await repo.getSellerBalance(sellerProfileId);
    expect(balance).toBeGreaterThan(0);
    expect(balance).toBe(order.subOrders[0].netSellerAmount);
  });

  it("4. Rejects Paytm callback with forged or invalid checksum signature", async () => {
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const orderNumber = orderRes.body.data.orderNumber;

    const forgedPayload = {
      MID: TEST_MID,
      ORDERID: orderNumber,
      TXNAMOUNT: "15750.00",
      STATUS: "TXN_SUCCESS",
      TXNID: "FORGED_TXN_123",
      CHECKSUMHASH: "FORGED_INVALID_BASE64_SIGNATURE_HERE==",
    };

    const res = await request(app)
      .post("/api/v1/payments/paytm/callback")
      .send(forgedPayload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("cryptographic checksum verification failed");

    // Ensure order is not paid and ledger has no accrual
    const order = await repo.findOrderByOrderNumber(orderNumber);
    expect(order?.paymentStatus).not.toBe(OrderPaymentStatus.PAID);
    expect(await repo.getSellerBalance(sellerProfileId)).toBe(0);
  });

  it("5. Rejects Paytm callback with Merchant ID mismatch", async () => {
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const orderNumber = orderRes.body.data.orderNumber;

    const roguePayload: Record<string, any> = {
      MID: "ROGUE_MERCHANT_MID_999",
      ORDERID: orderNumber,
      TXNAMOUNT: "15750.00",
      STATUS: "TXN_SUCCESS",
      TXNID: "ROGUE_TXN_001",
    };
    roguePayload.CHECKSUMHASH = PaytmChecksum.generateSignature(roguePayload, TEST_KEY);

    const res = await request(app)
      .post("/api/v1/payments/paytm/callback")
      .send(roguePayload);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Merchant ID mismatch");
  });

  it("6. Handles failed payment: marks order FAILED and releases reserved stock back to available", async () => {
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 2 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const orderNumber = orderRes.body.data.orderNumber;

    // Initially 5 available, 2 reserved -> 3 available, 2 reserved
    let variant = await repo.findVariantById(testVariantId);
    expect(variant?.availableStock).toBe(3);
    expect(variant?.reservedStock).toBe(2);

    // Deliver TXN_FAILURE callback
    const failurePayload: Record<string, any> = {
      MID: TEST_MID,
      ORDERID: orderNumber,
      TXNAMOUNT: "31500.00",
      STATUS: "TXN_FAILURE",
      RESPCODE: "2271",
      RESPMSG: "User cancelled transaction at bank page.",
      TXNID: "FAILED_TXN_7788",
    };
    failurePayload.CHECKSUMHASH = PaytmChecksum.generateSignature(failurePayload, TEST_KEY);

    const res = await request(app)
      .post("/api/v1/payments/paytm/callback")
      .send(failurePayload);

    expect(res.status).toBe(400);
    expect(res.body.data.status).toBe("FAILED");

    // Verify order marked FAILED
    const order = await repo.findOrderByOrderNumber(orderNumber);
    expect(order?.paymentStatus).toBe(OrderPaymentStatus.FAILED);

    // Verify reserved stock was released back to available! (was 3+2 = 5)
    variant = await repo.findVariantById(testVariantId);
    expect(variant?.availableStock).toBe(5);
    expect(variant?.reservedStock).toBe(0);

    // Verify no ledger accrual
    expect(await repo.getSellerBalance(sellerProfileId)).toBe(0);
  });

  it("7. Ensures idempotency: duplicate callbacks do not duplicate stock deductions or ledger accruals", async () => {
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const order = orderRes.body.data;
    const orderNumber = order.orderNumber;

    const payload: Record<string, any> = {
      MID: TEST_MID,
      ORDERID: orderNumber,
      TXNAMOUNT: order.totalAmount.toFixed(2),
      STATUS: "TXN_SUCCESS",
      TXNID: "TXN_DUPLICATE_CHECK_001",
    };
    payload.CHECKSUMHASH = PaytmChecksum.generateSignature(payload, TEST_KEY);

    // Callback 1
    const res1 = await request(app).post("/api/v1/payments/paytm/callback").send(payload);
    expect(res1.status).toBe(200);
    expect(res1.body.data.isDuplicate).toBe(false);

    const initialBalance = await repo.getSellerBalance(sellerProfileId);
    expect(initialBalance).toBeGreaterThan(0);

    // Callback 2 (duplicate replay)
    const res2 = await request(app).post("/api/v1/payments/paytm/callback").send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.data.isDuplicate).toBe(true);

    // Verify balance was NOT duplicated!
    const secondBalance = await repo.getSellerBalance(sellerProfileId);
    expect(secondBalance).toBe(initialBalance);

    // Verify stock remains intact
    const variant = await repo.findVariantById(testVariantId);
    expect(variant?.availableStock).toBe(4);
    expect(variant?.reservedStock).toBe(0);
  });

  it("8. Protects against browser redirect tampering: direct status modification without server verification is rejected", async () => {
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const orderNumber = orderRes.body.data.orderNumber;

    // Attacker tries to post directly to callback without valid Paytm signature
    const tamperedReq = await request(app)
      .post("/api/v1/payments/paytm/callback")
      .send({
        ORDERID: orderNumber,
        STATUS: "TXN_SUCCESS",
        TXNAMOUNT: "15750.00",
      });

    expect(tamperedReq.status).toBe(400);

    // Check authoritative status endpoint: must not be marked PAID
    const statusRes = await request(app)
      .get(`/api/v1/payments/status/${orderNumber}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.paymentStatus).not.toBe(OrderPaymentStatus.PAID);
    expect(statusRes.body.data.paymentStatus).toBe(OrderPaymentStatus.FAILED);
  });

  it("9. Super Admin can view payment transactions in the financial control center", async () => {
    // Complete one verified order payment
    const orderRes = await request(app)
      .post("/api/v1/checkout/create-order")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: "PAYTM",
        shippingAddress: {
          recipientName: "Meenakshi Sundaram",
          street: "12 Temple Road",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
          country: "India",
          phone: "+919876543210",
        },
      });

    const orderNumber = orderRes.body.data.orderNumber;
    const payload: Record<string, any> = {
      MID: TEST_MID,
      ORDERID: orderNumber,
      TXNAMOUNT: orderRes.body.data.totalAmount.toFixed(2),
      STATUS: "TXN_SUCCESS",
      TXNID: "TXN_ADMIN_VIS_101",
    };
    payload.CHECKSUMHASH = PaytmChecksum.generateSignature(payload, TEST_KEY);
    await request(app).post("/api/v1/payments/paytm/callback").send(payload);

    // Admin views transactions
    const adminTxnsRes = await request(app)
      .get("/api/v1/admin/payments/transactions")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminTxnsRes.status).toBe(200);
    expect(adminTxnsRes.body.count).toBeGreaterThanOrEqual(1);

    const txn = adminTxnsRes.body.data.find((t: any) => t.transactionReference === "TXN_ADMIN_VIS_101");
    expect(txn).toBeDefined();
    expect(txn.paymentProvider).toBe("paytm");
    expect(txn.status).toBe(OrderPaymentStatus.PAID);
    expect(txn.isReconciled).toBe(true);

    // Customer or Seller cannot access admin transactions
    const unauthRes = await request(app)
      .get("/api/v1/admin/payments/transactions")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(unauthRes.status).toBe(403);
  });
});
