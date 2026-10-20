import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { FoundationRepository } from "../src/database/repository.js";
import { UserRole, VerificationStatus, DocumentType } from "../src/types/auth.js";
import { RbacGuard, AuthenticationRequiredError, AuthorizationError } from "../src/guards/rbac.guard.js";
import { OwnershipGuard, ResourceNotFoundError } from "../src/guards/ownership.guard.js";
import { MassAssignmentGuard, ValidationError } from "../src/guards/mass-assignment.guard.js";
import { TokenService } from "../src/auth/token.service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { PasswordService } from "../src/auth/password.service.js";
import { SafeStorageService, LocalProtectedStorageProvider, StorageValidationError } from "../src/storage/storage.service.js";
import { AuditLogger } from "../src/audit/audit-logger.js";
import { bootstrapSuperAdmin } from "../scripts/bootstrap-owner.js";

describe("Phase 3 Foundation Security & Authorization Test Suite", () => {
  let repo: FoundationRepository;
  let tokenService: TokenService;
  let sessionManager: SessionManager;
  let storageService: SafeStorageService;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    repo = new FoundationRepository();
    tokenService = new TokenService("test-jwt-secret-min-32-chars-vespera-auth", "15m");
    sessionManager = new SessionManager(repo);
    storageService = new SafeStorageService(new LocalProtectedStorageProvider());
    auditLogger = new AuditLogger(repo);
  });

  // --------------------------------------------------------------------------
  // TEST 1: Anonymous user denied access to protected endpoints
  // --------------------------------------------------------------------------
  it("denies access to anonymous (unauthenticated) requests with AuthenticationRequiredError (401)", () => {
    expect(() => RbacGuard.checkRole(null, [UserRole.CUSTOMER])).toThrowError(AuthenticationRequiredError);
    expect(() => RbacGuard.checkRole(undefined, [UserRole.APPROVED_SELLER])).toThrowError(AuthenticationRequiredError);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Customer denied access to owner/admin APIs
  // --------------------------------------------------------------------------
  it("denies Customer from accessing Super Admin only endpoints (403 AuthorizationError)", () => {
    const customerUser = {
      userId: "cust_uuid_1001",
      email: "shopper@test.local",
      role: UserRole.CUSTOMER,
      sessionId: "session_1001",
    };

    expect(() => RbacGuard.assertSuperAdmin(customerUser)).toThrowError(AuthorizationError);
    expect(() => RbacGuard.checkRole(customerUser, [UserRole.SUPER_ADMIN])).toThrowError(
      /Access denied. Role 'CUSTOMER' is not authorized/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 3: Seller applicant denied product publication before approval
  // --------------------------------------------------------------------------
  it("denies Seller Applicant from performing Approved Seller operations before verification", () => {
    const applicantUser = {
      userId: "seller_user_2001",
      email: "applicant@boutique.local",
      role: UserRole.SELLER_APPLICANT,
      sessionId: "session_2001",
      sellerId: "seller_org_2001",
    };

    // Attempting to publish or manage catalog as applicant must fail
    expect(() => RbacGuard.assertApprovedSeller(applicantUser)).toThrowError(AuthorizationError);
    expect(() => RbacGuard.checkRole(applicantUser, [UserRole.APPROVED_SELLER])).toThrowError(
      /Access denied. Role 'SELLER_APPLICANT' is not authorized/
    );
  });

  // --------------------------------------------------------------------------
  // TEST 4: Seller A denied access to Seller B's resources (Tenant Isolation)
  // --------------------------------------------------------------------------
  it("enforces seller tenant isolation: Seller A cannot access Seller B's records (returns 404)", () => {
    const sellerA = {
      userId: "user_seller_a",
      email: "seller_a@atelier.local",
      role: UserRole.APPROVED_SELLER,
      sessionId: "session_a",
      sellerId: "seller_profile_A",
    };

    const sellerBResourceId = "seller_profile_B";

    // Attempt to access Seller B's order or catalog record
    expect(() =>
      OwnershipGuard.assertSellerOwnership(sellerA, sellerBResourceId, "SubOrder")
    ).toThrowError(ResourceNotFoundError);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Customer A denied access to Customer B's resources (Account Isolation)
  // --------------------------------------------------------------------------
  it("enforces customer isolation: Customer A cannot access Customer B's orders (returns 404)", () => {
    const customerA = {
      userId: "cust_id_alice",
      email: "alice@test.local",
      role: UserRole.CUSTOMER,
      sessionId: "session_alice",
    };

    const customerBOwnerId = "cust_id_bob";

    // Attempt to view Bob's order details
    expect(() =>
      OwnershipGuard.assertCustomerOwnership(customerA, customerBOwnerId, "Order")
    ).toThrowError(ResourceNotFoundError);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Mass assignment privilege escalation attempts are rejected
  // --------------------------------------------------------------------------
  it("rejects attempts to inject 'role' or 'verificationStatus' via mass assignment", () => {
    const maliciousProfilePayload = {
      displayName: "Honest Shopper",
      role: "SUPER_ADMIN", // Attacker attempts role escalation
    };

    expect(() =>
      MassAssignmentGuard.assertNoPrivilegedFields(maliciousProfilePayload)
    ).toThrowError(ValidationError);

    const maliciousSellerPayload = {
      storeName: "Royal Silks",
      registeredAddress: "42 Heritage Lane, Jaipur",
      verificationStatus: "APPROVED", // Attacker attempts auto-approval
    };

    expect(() =>
      MassAssignmentGuard.assertNoPrivilegedFields(maliciousSellerPayload)
    ).toThrowError(ValidationError);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Expired / revoked sessions cannot access protected endpoints
  // --------------------------------------------------------------------------
  it("rejects revoked and expired sessions upon server validation", async () => {
    const sessionId = "sess_active_123";
    const now = new Date();

    // 1. Create active session
    await repo.createSession({
      id: sessionId,
      userId: "user_test_99",
      tokenHash: "hash_token_abc",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000), // +1 hour
      createdAt: now,
    });

    let check = await sessionManager.validateSession(sessionId);
    expect(check.valid).toBe(true);

    // 2. Revoke session
    await sessionManager.revokeSession(sessionId);
    check = await sessionManager.validateSession(sessionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/revoked/i);

    // 3. Expired session check
    const expiredSessionId = "sess_expired_456";
    await repo.createSession({
      id: expiredSessionId,
      userId: "user_test_99",
      tokenHash: "hash_token_def",
      expiresAt: new Date(now.getTime() - 1000), // In the past
      createdAt: new Date(now.getTime() - 3600000),
    });

    check = await sessionManager.validateSession(expiredSessionId);
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/expired/i);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Private documents are inaccessible to unauthorized sellers & safe upload
  // --------------------------------------------------------------------------
  it("enforces binary validation and opaque non-guessable storage paths for private KYC uploads", async () => {
    // 1. Invalid file content (executable disguised as pdf)
    const fakePdfBuffer = Buffer.from("MZ_EXECUTABLE_HEADER_CONTENT_NOT_A_REAL_PDF");
    await expect(
      storageService.uploadPrivateKycDocument("seller_123", fakePdfBuffer, "tax.pdf", "application/pdf")
    ).rejects.toThrowError(StorageValidationError);

    // 2. Valid PDF upload with magic bytes '%PDF'
    const validPdfBuffer = Buffer.from("%PDF-1.4 real simulated tax document binary bytes");
    const result = await storageService.uploadPrivateKycDocument(
      "seller_123",
      validPdfBuffer,
      "gst_certificate.pdf",
      "application/pdf"
    );

    expect(result.storageKey).toMatch(/^kyc\/seller_123\/[0-9a-f-]{36}\.pdf$/);
    expect(result.fileSizeBytes).toBe(validPdfBuffer.length);

    // 3. Ephemeral signed download link generation
    const signedUrl = await storageService.getEphemeralDownloadUrl(result.storageKey, 60);
    expect(signedUrl).toContain("sig=");
    expect(signedUrl).toContain("expires=");
  });

  // --------------------------------------------------------------------------
  // TEST 9: Logs and API errors do not reveal secrets or private document contents
  // --------------------------------------------------------------------------
  it("redacts sensitive fields (passwords, tokens, OTPs, raw contents) from security audit logs", async () => {
    const rawPayload = {
      email: "buyer.testing@atelier.com",
      password: "SuperSecretPassword123!",
      sessionToken: "jwt.secret.token.here",
      otp: "948201",
      documentContent: "RAW_KYC_BASE64_BYTES",
      legitimateMetadata: "Cart repriced successfully",
    };

    const sanitized = AuditLogger.sanitizePayload(rawPayload);

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.sessionToken).toBe("[REDACTED]");
    expect(sanitized.otp).toBe("[REDACTED]");
    expect(sanitized.documentContent).toBe("[REDACTED]");
    expect(sanitized.email).toBe("b***g@atelier.com"); // PII masked
    expect(sanitized.legitimateMetadata).toBe("Cart repriced successfully");

    // Verify stored event in audit logger
    const event = await auditLogger.logSecurityEvent({
      actorId: "actor_1",
      actorRole: UserRole.SUPER_ADMIN,
      action: "ADMIN_LOGIN_SUCCESS",
      targetType: "User",
      targetId: "user_admin_1",
      clientIp: "192.168.1.50",
      details: rawPayload,
    });

    expect(event.detailsSanitized.password).toBe("[REDACTED]");
    expect(event.ipHash).not.toBe("192.168.1.50"); // Pseudonymized
  });

  // --------------------------------------------------------------------------
  // TEST 10: Secure CLI Bootstrap prevents default credentials & enforces MFA
  // --------------------------------------------------------------------------
  it("enforces strong password policy and token gating during Super Admin bootstrap", async () => {
    process.env.OWNER_BOOTSTRAP_INVITE_TOKEN = "test-bootstrap-token-vespera-super-secure-32";

    // 1. Weak password rejected
    const weakAttempt = await bootstrapSuperAdmin(
      repo,
      "test-bootstrap-token-vespera-super-secure-32",
      "admin@vespera.local",
      "weakpass"
    );
    expect(weakAttempt.success).toBe(false);
    expect(weakAttempt.message).toMatch(/minimum password length of 12 characters/);

    // 2. Strong password with valid token succeeds
    const successAttempt = await bootstrapSuperAdmin(
      repo,
      "test-bootstrap-token-vespera-super-secure-32",
      "admin@vespera.local",
      "VesperaSecure2026!#"
    );
    expect(successAttempt.success).toBe(true);
    expect(successAttempt.userId).toBeDefined();

    const createdAdmin = await repo.findUserById(successAttempt.userId!);
    expect(createdAdmin?.role).toBe(UserRole.SUPER_ADMIN);
    expect(createdAdmin?.isMfaEnabled).toBe(true);

    // Verify password hash is stored, never plaintext
    expect(createdAdmin?.passwordHash).not.toBe("VesperaSecure2026!#");
    const isPasswordValid = await PasswordService.verify("VesperaSecure2026!#", createdAdmin!.passwordHash);
    expect(isPasswordValid).toBe(true);
  });
});
