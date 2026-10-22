import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { createApp } from "../src/server/app.js";
import { FoundationRepository } from "../src/database/repository.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { PasswordService } from "../src/auth/password.service.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import { MfaService } from "../src/auth/mfa.service.js";
import { DocumentType, UserRole, VerificationStatus } from "../src/types/auth.js";

describe("Phase 3 HTTP API Endpoints & Security Integration Tests", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;
  let app: any;

  beforeEach(async () => {
    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-min-32-chars-vespera-http-test", "15m");
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

  // --------------------------------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------------------------------
  it("GET /api/v1/health returns 200 with minimal status and zero PII or topology leakage", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("vespera-atelier-api");
    expect(res.body.env).toBeUndefined();
    expect(res.body.database).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // ANONYMOUS ACCESS REJECTION
  // --------------------------------------------------------------------------
  it("GET /api/v1/customer/profile rejects anonymous request with 401", async () => {
    const res = await request(app).get("/api/v1/customer/profile");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  // --------------------------------------------------------------------------
  // CUSTOMER REGISTRATION & LOGIN
  // --------------------------------------------------------------------------
  it("POST /api/v1/auth/customer/register validates password complexity and creates account", async () => {
    // 1. Weak password rejected
    const weakRes = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "shopper@test.local", password: "short" });
    expect(weakRes.status).toBe(400);

    // 2. Valid registration
    const validRes = await request(app)
      .post("/api/v1/auth/customer/register")
      .send({ email: "shopper@test.local", password: "ValidCustomerPass123!" });
    expect(validRes.status).toBe(201);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.email).toBe("shopper@test.local");
    expect(validRes.body.data.role).toBe(UserRole.CUSTOMER);

    // 3. Login returns JWT token
    const loginRes = await request(app)
      .post("/api/v1/auth/customer/login")
      .send({ email: "shopper@test.local", password: "ValidCustomerPass123!" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();

    // 4. Access protected profile using token
    const token = loginRes.body.data.accessToken;
    const profileRes = await request(app)
      .get("/api/v1/customer/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.email).toBe("shopper@test.local");
  });

  // --------------------------------------------------------------------------
  // ROLE-BASED ACCESS CONTROL (CUSTOMER CANNOT ACCESS ADMIN)
  // --------------------------------------------------------------------------
  it("denies Customer from calling Super Admin decision endpoints (HTTP 403)", async () => {
    const customerUser = await repo.createUser({
      id: "cust_123",
      email: "customer@test.local",
      passwordHash: await PasswordService.hash("Pass12345678!"),
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sessionId = "sess_cust_123";
    await repo.createSession({
      id: sessionId,
      userId: customerUser.id,
      tokenHash: "token_hash_cust",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const customerToken = tokenService.signAccessToken({
      userId: customerUser.id,
      email: customerUser.email,
      role: customerUser.role,
      sessionId,
    });

    const adminRes = await request(app)
      .post("/api/v1/admin/sellers/seller_target_id/decision")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ status: VerificationStatus.APPROVED });

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe("FORBIDDEN");
  });

  // --------------------------------------------------------------------------
  // MASS ASSIGNMENT REJECTION
  // --------------------------------------------------------------------------
  it("PUT /api/v1/customer/profile rejects mass assignment of privileged role field", async () => {
    const customer = await repo.createUser({
      id: "cust_mass_assign",
      email: "shopper_ma@test.local",
      passwordHash: "dummy_hash",
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sessionId = "sess_ma";
    await repo.createSession({
      id: sessionId,
      userId: customer.id,
      tokenHash: "hash_ma",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const token = tokenService.signAccessToken({
      userId: customer.id,
      email: customer.email,
      role: customer.role,
      sessionId,
    });

    const attempt = await request(app)
      .put("/api/v1/customer/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        displayName: "Legit Name",
        role: "SUPER_ADMIN", // Malicious field injection
      });

    expect(attempt.status).toBe(400);
    expect(attempt.body.error.message).toMatch(/Mass assignment rejected/);
  });

  // --------------------------------------------------------------------------
  // LOGOUT AND SESSION REVOCATION
  // --------------------------------------------------------------------------
  it("POST /api/v1/auth/logout revokes session; subsequent requests fail with 401", async () => {
    const user = await repo.createUser({
      id: "user_logout_test",
      email: "logout@test.local",
      passwordHash: "dummy",
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sessionId = "sess_to_revoke";
    await repo.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: "hash_to_revoke",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const token = tokenService.signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    });

    // Verify session works before logout
    const preLogout = await request(app)
      .get("/api/v1/customer/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(preLogout.status).toBe(200);

    // Call logout
    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // Attempt request with revoked session token
    const postLogout = await request(app)
      .get("/api/v1/customer/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(postLogout.status).toBe(401);
    expect(postLogout.body.error.code).toBe("SESSION_INVALID");
  });

  // --------------------------------------------------------------------------
  // ADMIN LOGIN WITH MANDATORY TOTP MFA
  // --------------------------------------------------------------------------
  it("POST /api/v1/auth/admin/login enforces mandatory MFA challenge", async () => {
    const adminPassword = "SuperAdminPassword2026!#";
    const passwordHash = await PasswordService.hash(adminPassword);
    const mfaSecret = MfaService.generateTotpSecret();

    await repo.createUser({
      id: "admin_mfa_user",
      email: "owner@vespera.local",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Missing or invalid TOTP code fails with 401
    const failRes = await request(app)
      .post("/api/v1/auth/admin/login")
      .send({ email: "owner@vespera.local", password: adminPassword, totpCode: "000000" });
    expect(failRes.status).toBe(401);

    // 2. Real RFC 6238 TOTP computation succeeds
    const realTotpCode = MfaService.generateCurrentTotp(mfaSecret);
    const successRes = await request(app)
      .post("/api/v1/auth/admin/login")
      .send({ email: "owner@vespera.local", password: adminPassword, totpCode: realTotpCode });
    expect(successRes.status).toBe(200);
    expect(successRes.body.data.accessToken).toBeDefined();
    expect(successRes.body.data.user.role).toBe(UserRole.SUPER_ADMIN);
  });

  // --------------------------------------------------------------------------
  // SELLER TENANT ISOLATION ON PRIVATE DOCUMENTS
  // --------------------------------------------------------------------------
  it("enforces seller tenant isolation: Seller A cannot access Seller B's document (returns 404)", async () => {
    // 1. Create Seller A and Seller B profiles
    const sellerAUser = await repo.createUser({
      id: "user_sel_a",
      email: "seller_a@test.local",
      passwordHash: "hash_a",
      role: UserRole.APPROVED_SELLER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sellerBUser = await repo.createUser({
      id: "user_sel_b",
      email: "seller_b@test.local",
      passwordHash: "hash_b",
      role: UserRole.APPROVED_SELLER,
      isActive: true,
      isMfaEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sellerAProfile = await repo.createSellerProfile({
      id: "seller_profile_A",
      userId: sellerAUser.id,
      storeName: "Atelier A",
      verificationStatus: VerificationStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const sellerBProfile = await repo.createSellerProfile({
      id: "seller_profile_B",
      userId: sellerBUser.id,
      storeName: "Atelier B",
      verificationStatus: VerificationStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Upload document belonging to Seller B
    const docB = await repo.createSellerDocument({
      id: "doc_b_secret_gst",
      sellerId: sellerBProfile.id,
      documentType: DocumentType.GST_CERTIFICATE,
      privateStorageKey: "kyc/seller_profile_B/secret_gst.pdf",
      originalFileName: "gst_b.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      verificationStatus: VerificationStatus.APPROVED,
      createdAt: new Date(),
    });

    // 3. Authenticate as Seller A
    const sessionAId = "sess_sel_a";
    await repo.createSession({
      id: sessionAId,
      userId: sellerAUser.id,
      tokenHash: "hash_sess_a",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });

    const sellerAToken = tokenService.signAccessToken({
      userId: sellerAUser.id,
      email: sellerAUser.email,
      role: sellerAUser.role,
      sessionId: sessionAId,
      sellerId: sellerAProfile.id,
    });

    // 4. Seller A attempts to access Seller B's document
    const breachAttempt = await request(app)
      .get(`/api/v1/seller/documents/${docB.id}`)
      .set("Authorization", `Bearer ${sellerAToken}`);

    // Must return 404 (not 403) to prevent ID enumeration
    expect(breachAttempt.status).toBe(404);
    expect(breachAttempt.body.error.code).toBe("NOT_FOUND");
  });
});
