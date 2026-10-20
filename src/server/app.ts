import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { FoundationRepository } from "../database/repository.js";
import { TokenService } from "../auth/token.service.js";
import { SessionManager } from "../auth/session-manager.js";
import { PasswordService } from "../auth/password.service.js";
import { MfaService } from "../auth/mfa.service.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../storage/storage.service.js";
import { AuditLogger } from "../audit/audit-logger.js";
import { AuthenticatedUser, DocumentType, UserRole, VerificationStatus } from "../types/auth.js";
import { MassAssignmentGuard } from "../guards/mass-assignment.guard.js";
import { RbacGuard, AuthorizationError, AuthenticationRequiredError } from "../guards/rbac.guard.js";
import { OwnershipGuard, ResourceNotFoundError } from "../guards/ownership.guard.js";

// Extend Express Request to include authenticated user context and requestId
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}

export interface AppDependencies {
  repo: FoundationRepository;
  tokenService: TokenService;
  sessionManager: SessionManager;
  storageService: SafeStorageService;
  auditLogger: AuditLogger;
}

export function createApp(deps?: Partial<AppDependencies>): express.Application {
  const repo = deps?.repo || new FoundationRepository();
  const tokenService = deps?.tokenService || new TokenService(process.env.JWT_SECRET || "test-jwt-secret-min-32-chars-long", "15m");
  const sessionManager = deps?.sessionManager || new SessionManager(repo);
  const storageService = deps?.storageService || new SafeStorageService(new LocalProtectedStorageProvider());
  const auditLogger = deps?.auditLogger || new AuditLogger(repo);

  const app = express();

  // Basic security middleware & body limits
  app.use(express.json({ limit: "1mb" }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  // Authentication Middleware
  const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_REQUIRED", message: "Bearer token required in Authorization header." },
        meta: { requestId: req.requestId },
      });
      return;
    }

    const token = authHeader.substring(7);
    try {
      const decoded = tokenService.verifyAccessToken(token);

      // Verify session in active revocation table
      const sessionCheck = await sessionManager.validateSession(decoded.sessionId);
      if (!sessionCheck.valid) {
        res.status(401).json({
          success: false,
          error: { code: "SESSION_INVALID", message: sessionCheck.reason || "Session expired or revoked." },
          meta: { requestId: req.requestId },
        });
        return;
      }

      req.user = decoded;
      next();
    } catch {
      res.status(401).json({
        success: false,
        error: { code: "TOKEN_INVALID", message: "Invalid or expired access token." },
        meta: { requestId: req.requestId },
      });
    }
  };

  // --------------------------------------------------------------------------
  // HEALTH CHECK
  // --------------------------------------------------------------------------
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "vespera-atelier-api",
    });
  });

  // --------------------------------------------------------------------------
  // CUSTOMER AUTHENTICATION
  // --------------------------------------------------------------------------
  app.post("/api/v1/auth/customer/register", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, phone } = req.body;
      if (!email || !password) {
        res.status(400).json({ success: false, error: { message: "Email and password are required." } });
        return;
      }

      const existing = await repo.findUserByEmail(email);
      if (existing) {
        res.status(409).json({ success: false, error: { message: "Account with this email already exists." } });
        return;
      }

      const val = PasswordService.validateComplexity(password, false);
      if (!val.valid) {
        res.status(400).json({ success: false, error: { message: val.message } });
        return;
      }

      const passwordHash = await PasswordService.hash(password);
      const user = await repo.createUser({
        id: crypto.randomUUID(),
        email: email.toLowerCase(),
        phone: phone || null,
        passwordHash,
        role: UserRole.CUSTOMER,
        isActive: true,
        isMfaEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        data: { userId: user.id, email: user.email, role: user.role },
        meta: { requestId: req.requestId },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/auth/customer/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const user = await repo.findUserByEmail(email || "");

      if (!user || !(await PasswordService.verify(password || "", user.passwordHash))) {
        await auditLogger.logSecurityEvent({
          actorId: null,
          actorRole: "ANONYMOUS",
          action: "LOGIN_FAILED",
          targetType: "User",
          targetId: null,
          clientIp: req.ip,
          details: { emailAttempt: email },
        });

        res.status(401).json({ success: false, error: { message: "Invalid email or password." } });
        return;
      }

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15m

      await repo.createSession({
        id: sessionId,
        userId: user.id,
        tokenHash: TokenService.hashToken(sessionId),
        expiresAt,
        ipHash: AuditLogger.hashIp(req.ip),
        userAgent: req.headers["user-agent"] || null,
        createdAt: new Date(),
      });

      const accessToken = tokenService.signAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken,
          expiresIn: "15m",
          user: { id: user.id, email: user.email, role: user.role },
        },
        meta: { requestId: req.requestId },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // ADMIN AUTHENTICATION (MANDATORY MFA)
  // --------------------------------------------------------------------------
  app.post("/api/v1/auth/admin/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, totpCode } = req.body;
      const user = await repo.findUserByEmail(email || "");

      if (!user || user.role !== UserRole.SUPER_ADMIN || !(await PasswordService.verify(password || "", user.passwordHash))) {
        await auditLogger.logSecurityEvent({
          actorId: null,
          actorRole: "ANONYMOUS",
          action: "ADMIN_LOGIN_FAILED",
          targetType: "User",
          targetId: user?.id || null,
          clientIp: req.ip,
          details: { emailAttempt: email },
        });

        res.status(401).json({ success: false, error: { message: "Invalid admin credentials." } });
        return;
      }

      // Mandatory MFA TOTP verification
      if (!totpCode || !MfaService.verifyTotp(totpCode, "vespera_mfa_secret")) {
        await auditLogger.logSecurityEvent({
          actorId: user.id,
          actorRole: UserRole.SUPER_ADMIN,
          action: "ADMIN_MFA_CHALLENGE_FAILED",
          targetType: "User",
          targetId: user.id,
          clientIp: req.ip,
        });

        res.status(401).json({ success: false, error: { message: "Invalid MFA verification code." } });
        return;
      }

      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await repo.createSession({
        id: sessionId,
        userId: user.id,
        tokenHash: TokenService.hashToken(sessionId),
        expiresAt,
        ipHash: AuditLogger.hashIp(req.ip),
        userAgent: req.headers["user-agent"] || null,
        createdAt: new Date(),
      });

      await auditLogger.logSecurityEvent({
        actorId: user.id,
        actorRole: UserRole.SUPER_ADMIN,
        action: "ADMIN_LOGIN_SUCCESS",
        targetType: "Session",
        targetId: sessionId,
        clientIp: req.ip,
      });

      const accessToken = tokenService.signAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken,
          expiresIn: "15m",
          user: { id: user.id, email: user.email, role: user.role },
        },
        meta: { requestId: req.requestId },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // LOGOUT & SESSION REVOCATION
  // --------------------------------------------------------------------------
  app.post("/api/v1/auth/logout", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await sessionManager.revokeSession(req.user.sessionId);
        await auditLogger.logSecurityEvent({
          actorId: req.user.userId,
          actorRole: req.user.role,
          action: "LOGOUT_SESSION_REVOKED",
          targetType: "Session",
          targetId: req.user.sessionId,
          clientIp: req.ip,
        });
      }
      res.status(200).json({ success: true, message: "Session successfully logged out and revoked." });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CUSTOMER PROFILE (WITH MASS ASSIGNMENT GUARD)
  // --------------------------------------------------------------------------
  app.get("/api/v1/customer/profile", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.CUSTOMER, UserRole.SUPER_ADMIN]);
      const user = await repo.findUserById(req.user!.userId);
      if (!user) {
        res.status(404).json({ success: false, error: { message: "Customer profile not found." } });
        return;
      }

      res.status(200).json({
        success: true,
        data: { id: user.id, email: user.email, phone: user.phone, role: user.role },
      });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/customer/profile", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.CUSTOMER]);
      // Mass assignment protection
      MassAssignmentGuard.assertNoPrivilegedFields(req.body);
      const sanitized = MassAssignmentGuard.sanitizeCustomerProfile(req.body);

      res.status(200).json({
        success: true,
        message: "Profile updated successfully.",
        data: sanitized,
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // SELLER APPLICATION & DOCUMENTS (TENANT ISOLATED)
  // --------------------------------------------------------------------------
  app.get("/api/v1/seller/application-status", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.SELLER_APPLICANT, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
      const profile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!profile) {
        res.status(404).json({ success: false, error: { message: "No seller application found." } });
        return;
      }
      res.status(200).json({
        success: true,
        data: {
          storeName: profile.storeName,
          verificationStatus: profile.verificationStatus,
          rejectionReason: profile.rejectionReason,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/seller/documents/upload", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.SELLER_APPLICANT, UserRole.APPROVED_SELLER]);
      const { documentType, base64Content, fileName, declaredMimeType } = req.body;

      if (!base64Content || !fileName || !declaredMimeType || !documentType) {
        res.status(400).json({ success: false, error: { message: "Missing required document upload fields." } });
        return;
      }

      const buffer = Buffer.from(base64Content, "base64");
      const sellerId = req.user!.sellerId || req.user!.userId;

      const uploadResult = await storageService.uploadPrivateKycDocument(
        sellerId,
        buffer,
        fileName,
        declaredMimeType
      );

      const doc = await repo.createSellerDocument({
        id: crypto.randomUUID(),
        sellerId,
        documentType: documentType as DocumentType,
        privateStorageKey: uploadResult.storageKey,
        originalFileName: uploadResult.originalFileName,
        mimeType: uploadResult.mimeType,
        fileSizeBytes: uploadResult.fileSizeBytes,
        verificationStatus: VerificationStatus.SUBMITTED,
        createdAt: new Date(),
      });

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "SELLER_DOCUMENT_UPLOADED",
        targetType: "SellerDocument",
        targetId: doc.id,
        clientIp: req.ip,
        details: { documentType, fileName: uploadResult.originalFileName, fileSizeBytes: uploadResult.fileSizeBytes },
      });

      res.status(201).json({
        success: true,
        data: { documentId: doc.id, verificationStatus: doc.verificationStatus },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/documents/:id", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.SELLER_APPLICANT, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
      const docId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const doc = await repo.findSellerDocumentById(docId);

      if (!doc) {
        res.status(404).json({ success: false, error: { message: "Document not found." } });
        return;
      }

      // Strict seller tenant isolation check
      const callingSellerId = req.user!.sellerId || req.user!.userId;
      OwnershipGuard.assertSellerOwnership(req.user!, doc.sellerId, "Document");

      const signedUrl = await storageService.getEphemeralDownloadUrl(doc.privateStorageKey, 60);

      res.status(200).json({
        success: true,
        data: {
          documentId: doc.id,
          documentType: doc.documentType,
          downloadUrl: signedUrl,
          expiresInSeconds: 60,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // SUPER ADMIN SELLER REVIEW & DECISION
  // --------------------------------------------------------------------------
  app.post("/api/v1/admin/sellers/:id/decision", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { status, reason } = req.body;

      if (!status || !Object.values(VerificationStatus).includes(status)) {
        res.status(400).json({ success: false, error: { message: "Invalid verification status." } });
        return;
      }

      const sellerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await repo.updateSellerStatus(sellerId, status, req.user!.userId, reason);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "SELLER_VERIFICATION_DECISION",
        targetType: "SellerProfile",
        targetId: sellerId,
        clientIp: req.ip,
        details: { newStatus: status, reason },
      });

      res.status(200).json({
        success: true,
        message: `Seller status updated to ${status}.`,
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CENTRALIZED ERROR HANDLER (ZERO STACK TRACE LEAKAGE)
  // --------------------------------------------------------------------------
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    let statusCode = 500;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "An internal server error occurred.";

    if (err instanceof AuthenticationRequiredError) {
      statusCode = 401;
      code = "AUTHENTICATION_REQUIRED";
      message = err.message;
    } else if (err instanceof AuthorizationError) {
      statusCode = 403;
      code = "FORBIDDEN";
      message = err.message;
    } else if (err instanceof ResourceNotFoundError) {
      statusCode = 404;
      code = "NOT_FOUND";
      message = err.message;
    } else if ("statusCode" in err && typeof (err as any).statusCode === "number") {
      statusCode = (err as any).statusCode;
      code = err.name.toUpperCase();
      message = err.message;
    }

    res.status(statusCode).json({
      success: false,
      error: { code, message },
      meta: { requestId: req.requestId },
    });
  });

  return app;
}
