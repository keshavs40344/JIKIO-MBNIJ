import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import { FoundationRepository } from "../database/repository.js";
import { TokenService } from "../auth/token.service.js";
import { SessionManager } from "../auth/session-manager.js";
import { PasswordService } from "../auth/password.service.js";
import { MfaService } from "../auth/mfa.service.js";
import { SafeStorageService, LocalProtectedStorageProvider } from "../storage/storage.service.js";
import { AuditLogger } from "../audit/audit-logger.js";
import { AuthenticatedUser, DocumentType, UserRole, VerificationStatus } from "../types/auth.js";
import {
  FulfilmentStatus,
  OrderPaymentStatus,
  ProductModerationStatus,
} from "../types/marketplace.js";
import { MassAssignmentGuard } from "../guards/mass-assignment.guard.js";
import { RbacGuard, AuthorizationError, AuthenticationRequiredError } from "../guards/rbac.guard.js";
import { OwnershipGuard, ResourceNotFoundError } from "../guards/ownership.guard.js";

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

  // Serve static assets from public/
  app.use(express.static(path.resolve(process.cwd(), "public")));

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

  // Optional authentication (for guests or logged-in users)
  const optionalAuthenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = tokenService.verifyAccessToken(authHeader.substring(7));
        const sessionCheck = await sessionManager.validateSession(decoded.sessionId);
        if (sessionCheck.valid) {
          req.user = decoded;
        }
      } catch {
        // Guest mode continues
      }
    }
    next();
  };

  // --------------------------------------------------------------------------
  // HEALTH & DISCOVERY
  // --------------------------------------------------------------------------
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "vespera-atelier-api",
    });
  });

  app.get("/api/v1/categories", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await repo.listCategories();
      res.status(200).json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/products", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categoryId, occasion, fabric, q, minPrice, maxPrice, sort } = req.query;
      const products = await repo.listApprovedProducts({
        categoryId: categoryId as string | undefined,
        occasion: occasion as string | undefined,
        fabric: fabric as string | undefined,
        searchQuery: q as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        sortBy: sort as "price_asc" | "price_desc" | "newest" | undefined,
      });

      res.status(200).json({ success: true, count: products.length, data: products });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/products/:slug", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
      const result = await repo.findProductBySlug(slug);

      if (!result || result.product.moderationStatus !== ProductModerationStatus.APPROVED) {
        res.status(404).json({ success: false, error: { message: "Product not found or not approved." } });
        return;
      }

      const seller = await repo.findSellerProfileById(result.product.sellerId);
      res.status(200).json({
        success: true,
        data: {
          ...result,
          sellerStoreName: seller?.storeName || "Vespera Verified Boutique",
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CART REPRICING
  // --------------------------------------------------------------------------
  app.post("/api/v1/cart/reprice", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        res.status(400).json({ success: false, error: { message: "Request body must include 'items' array." } });
        return;
      }

      const repriced = await repo.repriceCart(items);
      res.status(200).json({ success: true, data: repriced });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // AUTHENTICATION
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

      const sellerProfile = await repo.findSellerProfileByUserId(user.id);

      const accessToken = tokenService.signAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId,
        sellerId: sellerProfile?.id || null,
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken,
          expiresIn: "15m",
          user: { id: user.id, email: user.email, role: user.role, sellerId: sellerProfile?.id || null },
        },
        meta: { requestId: req.requestId },
      });
    } catch (err) {
      next(err);
    }
  });

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

  app.post("/api/v1/auth/logout", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await sessionManager.revokeSession(req.user.sessionId);
      }
      res.status(200).json({ success: true, message: "Session successfully logged out and revoked." });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CUSTOMER PROFILE & ORDERS
  // --------------------------------------------------------------------------
  app.get("/api/v1/customer/profile", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.CUSTOMER, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
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
      MassAssignmentGuard.assertNoPrivilegedFields(req.body);
      const sanitized = MassAssignmentGuard.sanitizeCustomerProfile(req.body);

      res.status(200).json({ success: true, message: "Profile updated successfully.", data: sanitized });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/checkout/create-order", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.CUSTOMER, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
      const { items, shippingAddress } = req.body;

      if (!Array.isArray(items) || items.length === 0 || !shippingAddress) {
        res.status(400).json({ success: false, error: { message: "Items array and shippingAddress are required." } });
        return;
      }

      const order = await repo.createCustomerOrder(
        req.user!.userId,
        req.user!.email,
        items,
        shippingAddress
      );

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "ORDER_CREATED",
        targetType: "CustomerOrder",
        targetId: order.id,
        clientIp: req.ip,
        details: { orderNumber: order.orderNumber, totalAmount: order.totalAmount, subOrderCount: order.subOrders.length },
      });

      res.status(201).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/customer/orders", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.CUSTOMER, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
      const orders = await repo.listCustomerOrders(req.user!.userId);
      res.status(200).json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/customer/orders/:id", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const order = await repo.findCustomerOrderById(orderId);

      if (!order) {
        res.status(404).json({ success: false, error: { message: "Order not found." } });
        return;
      }

      // Customer ownership enforcement
      OwnershipGuard.assertCustomerOwnership(req.user!, order.customerId, "Order");

      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // SELLER PORTAL & FULFILMENT
  // --------------------------------------------------------------------------
  app.post("/api/v1/seller/onboard", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      MassAssignmentGuard.assertNoPrivilegedFields(req.body);
      const sanitized = MassAssignmentGuard.sanitizeSellerOnboarding(req.body);

      const existingProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (existingProfile) {
        res.status(409).json({ success: false, error: { message: "Seller application already exists for this account." } });
        return;
      }

      const profile = await repo.createSellerProfile({
        id: crypto.randomUUID(),
        userId: req.user!.userId,
        storeName: sanitized.storeName,
        businessGstin: sanitized.businessGstin || null,
        businessPan: sanitized.businessPan || null,
        registeredAddress: sanitized.registeredAddress,
        verificationStatus: VerificationStatus.SUBMITTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update user role to applicant
      await repo.updateUserRole(req.user!.userId, UserRole.SELLER_APPLICANT);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SELLER_APPLICANT,
        action: "SELLER_APPLICATION_SUBMITTED",
        targetType: "SellerProfile",
        targetId: profile.id,
        clientIp: req.ip,
        details: { storeName: profile.storeName },
      });

      res.status(201).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/profile", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.checkRole(req.user, [UserRole.SELLER_APPLICANT, UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
      const profile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!profile) {
        res.status(404).json({ success: false, error: { message: "No seller profile found." } });
        return;
      }
      res.status(200).json({ success: true, data: profile });
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
      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      const sellerId = sellerProfile?.id || req.user!.sellerId || req.user!.userId;

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
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Document not found." } });
        return;
      }

      // Strict seller tenant isolation check
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

  app.post("/api/v1/seller/products", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const { title, categoryId, description, fabricMaterial, occasion, fit, careInstructions, images, variants, brandClaim } = req.body;

      if (!title || !categoryId || !Array.isArray(variants) || variants.length === 0) {
        res.status(400).json({ success: false, error: { message: "Title, categoryId, and variants array are required." } });
        return;
      }

      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!sellerProfile) {
        res.status(403).json({ success: false, error: { message: "Approved seller profile required." } });
        return;
      }

      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomInt(1000, 9999)}`;
      const product = await repo.createProduct(
        {
          id: crypto.randomUUID(),
          sellerId: sellerProfile.id,
          categoryId,
          title,
          slug,
          description: description || "",
          fabricMaterial: fabricMaterial || "Silk",
          occasion: occasion || "Festive",
          fit: fit || "Regular Fit",
          careInstructions: careInstructions || "Dry clean only",
          moderationStatus: ProductModerationStatus.SUBMITTED, // Enters moderation queue
          brandClaim: brandClaim || null,
          images: Array.isArray(images) && images.length > 0 ? images : ["https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80"],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants
      );

      res.status(201).json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/orders", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!sellerProfile) {
        res.status(403).json({ success: false, error: { message: "Seller profile not found." } });
        return;
      }

      const subOrders = await repo.listSellerSubOrders(sellerProfile.id);
      res.status(200).json({ success: true, data: subOrders });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/seller/orders/:id/fulfill", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const subOrderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status, carrierName, trackingNumber } = req.body;

      const subOrder = await repo.findSubOrderById(subOrderId);
      if (!subOrder) {
        res.status(404).json({ success: false, error: { message: "Sub-order not found." } });
        return;
      }

      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      OwnershipGuard.assertSellerOwnership(req.user!, subOrder.sellerId, "SubOrder");

      await repo.updateSubOrderStatus(subOrderId, status as FulfilmentStatus, carrierName, trackingNumber);

      res.status(200).json({ success: true, message: `Sub-order updated to ${status}.` });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/settlements", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!sellerProfile) {
        res.status(403).json({ success: false, error: { message: "Seller profile not found." } });
        return;
      }

      const ledger = await repo.listSellerLedger(sellerProfile.id);
      const balance = await repo.getSellerBalance(sellerProfile.id);

      res.status(200).json({
        success: true,
        data: {
          currentBalance: balance,
          currency: "INR",
          entries: ledger,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // SUPER ADMIN VERIFICATION & MODERATION
  // --------------------------------------------------------------------------
  app.get("/api/v1/admin/sellers", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const sellers = await repo.listAllSellers();
      res.status(200).json({ success: true, data: sellers });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/sellers/:id/decision", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { status, reason } = req.body;
      const sellerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!status || !Object.values(VerificationStatus).includes(status)) {
        res.status(400).json({ success: false, error: { message: "Invalid verification status." } });
        return;
      }

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

      res.status(200).json({ success: true, message: `Seller status updated to ${status}.` });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/products/moderation-queue", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const queue = await repo.listModerationQueue();
      res.status(200).json({ success: true, data: queue });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/products/:id/moderation", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { status, reason } = req.body;
      const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!status || !Object.values(ProductModerationStatus).includes(status)) {
        res.status(400).json({ success: false, error: { message: "Invalid moderation status." } });
        return;
      }

      await repo.updateProductModerationStatus(productId, status, reason);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "PRODUCT_MODERATION_DECISION",
        targetType: "Product",
        targetId: productId,
        clientIp: req.ip,
        details: { status, reason },
      });

      res.status(200).json({ success: true, message: `Product moderation status updated to ${status}.` });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/audit-logs", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { actorId, action, limit } = req.query;
      const logs = await repo.queryEvents({
        actorId: actorId as string | undefined,
        action: action as string | undefined,
        limit: limit ? Number(limit) : 50,
      });

      res.status(200).json({ success: true, count: logs.length, data: logs });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/stats", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const sellers = await repo.listAllSellers();
      const approvedProducts = await repo.listApprovedProducts();
      const moderationQueue = await repo.listModerationQueue();

      res.status(200).json({
        success: true,
        data: {
          totalSellers: sellers.length,
          pendingSellerVerifications: sellers.filter((s) => s.verificationStatus === VerificationStatus.SUBMITTED).length,
          approvedProductsCount: approvedProducts.length,
          pendingProductModerations: moderationQueue.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // CENTRALIZED ERROR HANDLER (NO STACK TRACE LEAKAGE)
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
    } else if (err.message && (err.message.includes("Checkout failed") || err.message.includes("constraint"))) {
      statusCode = 400;
      code = "VALIDATION_FAILED";
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
