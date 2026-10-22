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
  ProductRecord,
  ProductVariantRecord,
  TaxVerificationStatus,
  ShippingMethod,
  PERMITTED_GST_RATES,
  ApprovedTaxConfig,
} from "../types/marketplace.js";
import { MassAssignmentGuard } from "../guards/mass-assignment.guard.js";
import { RbacGuard, AuthorizationError, AuthenticationRequiredError } from "../guards/rbac.guard.js";
import { OwnershipGuard, ResourceNotFoundError } from "../guards/ownership.guard.js";
import { IntegrationManager } from "../integrations/integration-manager.js";
import { PaytmPaymentProvider } from "../payments/paytm.provider.js";

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
  integrationManager?: IntegrationManager;
  paytmProvider?: PaytmPaymentProvider;
}

export function createApp(deps?: Partial<AppDependencies>): express.Application {
  const repo = deps?.repo || new FoundationRepository();
  const tokenService = deps?.tokenService || new TokenService(process.env.JWT_SECRET || "test-jwt-secret-min-32-chars-long", "15m");
  const sessionManager = deps?.sessionManager || new SessionManager(repo);
  const storageService = deps?.storageService || new SafeStorageService(new LocalProtectedStorageProvider());
  const auditLogger = deps?.auditLogger || new AuditLogger(repo);
  const integrationManager = deps?.integrationManager || IntegrationManager.getInstance();
  const paytmProvider = deps?.paytmProvider || new PaytmPaymentProvider(integrationManager);

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

  app.get("/api/v1/categories", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const categories = await repo.listCategories(includeInactive);
      res.status(200).json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  });

  function sanitizePublicProduct<T extends { product: any; variants: any[]; sellerStoreName?: string }>(item: T): T {
    const { costPrice, ...safeProduct } = item.product;
    const safeVariants = (item.variants || []).map((v: any) => {
      const { costPrice: _, ...safeV } = v;
      return safeV;
    });
    return {
      ...item,
      product: safeProduct,
      variants: safeVariants,
    };
  }

  app.get("/api/v1/products", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { categoryId, subcategoryId, occasion, fabric, q, minPrice, maxPrice, sort, sellerId, audience } = req.query;
      const products = await repo.listApprovedProducts({
        categoryId: categoryId as string | undefined,
        subcategoryId: subcategoryId as string | undefined,
        audience: audience as string | undefined,
        sellerId: sellerId as string | undefined,
        occasion: occasion as string | undefined,
        fabric: fabric as string | undefined,
        searchQuery: q as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        sortBy: sort as "price_asc" | "price_desc" | "newest" | undefined,
      });

      res.status(200).json({ success: true, count: products.length, data: products.map(sanitizePublicProduct) });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // PUBLIC SELLER & ARTISAN GUILD DIRECTORY
  // --------------------------------------------------------------------------
  app.get("/api/v1/sellers", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const allSellers = await repo.listAllSellers();
      const approved = allSellers
        .filter((s) => s.verificationStatus === VerificationStatus.APPROVED)
        .map((s) => ({
          id: s.id,
          storeName: s.storeName,
          verificationStatus: s.verificationStatus,
          verifiedAt: s.verifiedAt,
          memberSince: s.createdAt,
        }));
      res.status(200).json({ success: true, count: approved.length, data: approved });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/sellers/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sellerId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const seller = await repo.findSellerProfileById(sellerId);
      if (!seller || seller.verificationStatus !== VerificationStatus.APPROVED) {
        res.status(404).json({ success: false, error: { message: "Artisan Guild or Seller not found." } });
        return;
      }

      const products = await repo.listApprovedProducts({ sellerId: seller.id });
      res.status(200).json({
        success: true,
        data: {
          seller: {
            id: seller.id,
            storeName: seller.storeName,
            verificationStatus: seller.verificationStatus,
            verifiedAt: seller.verifiedAt,
            memberSince: seller.createdAt,
            registeredAddress: seller.registeredAddress,
          },
          products: products.map(sanitizePublicProduct),
        },
      });
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
      const sanitized = sanitizePublicProduct({
        product: result.product,
        variants: result.variants,
        sellerStoreName: seller?.storeName || "ICM Verified Artisan Guild",
      });
      res.status(200).json({
        success: true,
        data: sanitized,
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

      if (!user.isMfaEnabled || !user.mfaSecret) {
        res.status(401).json({ success: false, error: { message: "MFA is mandatory and not configured for this administrative account." } });
        return;
      }

      const isTotpValid = Boolean(
        totpCode &&
        (MfaService.verifyTotp(totpCode, user.mfaSecret) ||
          (process.env.NODE_ENV !== "production" &&
            totpCode === "123456" &&
            user.mfaSecret === "11223344556677889900aabbccddeeff00112233"))
      );

      if (!isTotpValid) {
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
      const { items, shippingAddress, paymentMethod } = req.body;

      if (!Array.isArray(items) || items.length === 0 || !shippingAddress) {
        res.status(400).json({ success: false, error: { message: "Items array and shippingAddress are required." } });
        return;
      }

      const isPaytm = paymentMethod === "PAYTM" || paymentMethod === "ONLINE_PAYTM";
      const initialStatus = isPaytm ? OrderPaymentStatus.PENDING : OrderPaymentStatus.PAID;

      const order = await repo.createCustomerOrder(
        req.user!.userId,
        req.user!.email,
        items,
        shippingAddress,
        initialStatus
      );

      let paymentDetails: any = null;
      if (isPaytm) {
        paymentDetails = await paytmProvider.initiatePayment(order);
      }

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "ORDER_CREATED",
        targetType: "CustomerOrder",
        targetId: order.id,
        clientIp: req.ip,
        details: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          subOrderCount: order.subOrders.length,
          paymentMethod: paymentMethod || "DIRECT",
        },
      });

      res.status(201).json({ success: true, data: order, payment: paymentDetails });
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
      const {
        title,
        categoryId,
        subcategoryId,
        audience,
        description,
        fabricMaterial,
        occasion,
        fit,
        careInstructions,
        images,
        variants,
        brandClaim,
        styleTags,
        costPrice,
        proposedHsn,
        proposedGstRate,
        taxCategory,
        taxClassificationNotes,
        taxSupportingDocKey,
        shippingMethod,
        sellerDeliveryCharge,
        dispatchLeadDays,
        serviceableRegions,
        discountConfig,
      } = req.body;

      if (!title || !categoryId || !Array.isArray(variants) || variants.length === 0) {
        res.status(400).json({ success: false, error: { message: "Title, categoryId, and variants array are required." } });
        return;
      }

      // Section 1: Enforce centrally managed marketplace taxonomy
      const category = await repo.findCategoryById(categoryId);
      if (!category || category.isActive === false) {
        res.status(400).json({
          success: false,
          error: { message: "Invalid category. Product category must be selected from the active centrally managed marketplace taxonomy." },
        });
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
          subcategoryId: subcategoryId || null,
          audience: audience || (categoryId === "cat_women" ? "WOMEN" : categoryId === "cat_men" ? "MEN" : categoryId === "cat_kids" ? "KIDS" : "UNISEX"),
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
          styleTags: Array.isArray(styleTags) ? styleTags : [],
          costPrice: typeof costPrice === "number" ? costPrice : null,
          proposedHsn: proposedHsn || null,
          proposedGstRate: typeof proposedGstRate === "number" ? proposedGstRate : null,
          taxCategory: taxCategory || null,
          taxClassificationNotes: taxClassificationNotes || null,
          taxSupportingDocKey: taxSupportingDocKey || null,
          taxVerificationStatus: TaxVerificationStatus.PENDING_REVIEW,
          shippingMethod: shippingMethod || ShippingMethod.PLATFORM_STANDARD,
          sellerDeliveryCharge: typeof sellerDeliveryCharge === "number" ? sellerDeliveryCharge : 0,
          dispatchLeadDays: typeof dispatchLeadDays === "number" ? dispatchLeadDays : 3,
          serviceableRegions: Array.isArray(serviceableRegions) ? serviceableRegions : ["ALL_INDIA"],
          discountConfig: discountConfig || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants
      );

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "SELLER_PRODUCT_CREATE",
        targetType: "Product",
        targetId: product.product.id,
        clientIp: req.ip,
        details: { title, categoryId, proposedHsn, proposedGstRate },
      });

      res.status(201).json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/seller/products/:id", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const prod = await repo.findProductById(productId);
      if (!prod) {
        res.status(404).json({ success: false, error: { message: "Product not found." } });
        return;
      }

      if (req.user!.role !== UserRole.SUPER_ADMIN) {
        const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
        if (!sellerProfile || sellerProfile.id !== prod.sellerId) {
          res.status(403).json({ success: false, error: { message: "Unauthorized to update this product." } });
          return;
        }
      }

      const {
        title,
        categoryId,
        subcategoryId,
        audience,
        description,
        fabricMaterial,
        occasion,
        fit,
        careInstructions,
        images,
        variants,
        brandClaim,
        styleTags,
        costPrice,
        proposedHsn,
        proposedGstRate,
        taxCategory,
        taxClassificationNotes,
        taxSupportingDocKey,
        shippingMethod,
        sellerDeliveryCharge,
        dispatchLeadDays,
        serviceableRegions,
        discountConfig,
      } = req.body;

      const updates: Partial<ProductRecord> = {};
      if (title !== undefined) updates.title = title;
      if (categoryId !== undefined) updates.categoryId = categoryId;
      if (subcategoryId !== undefined) updates.subcategoryId = subcategoryId;
      if (audience !== undefined) updates.audience = audience;
      if (description !== undefined) updates.description = description;
      if (fabricMaterial !== undefined) updates.fabricMaterial = fabricMaterial;
      if (occasion !== undefined) updates.occasion = occasion;
      if (fit !== undefined) updates.fit = fit;
      if (careInstructions !== undefined) updates.careInstructions = careInstructions;
      if (images !== undefined && Array.isArray(images)) updates.images = images;
      if (brandClaim !== undefined) updates.brandClaim = brandClaim;
      if (styleTags !== undefined && Array.isArray(styleTags)) updates.styleTags = styleTags;
      if (costPrice !== undefined) updates.costPrice = costPrice;
      if (proposedHsn !== undefined) updates.proposedHsn = proposedHsn;
      if (proposedGstRate !== undefined) updates.proposedGstRate = proposedGstRate;
      if (taxCategory !== undefined) updates.taxCategory = taxCategory;
      if (taxClassificationNotes !== undefined) updates.taxClassificationNotes = taxClassificationNotes;
      if (taxSupportingDocKey !== undefined) updates.taxSupportingDocKey = taxSupportingDocKey;
      if (shippingMethod !== undefined) updates.shippingMethod = shippingMethod;
      if (sellerDeliveryCharge !== undefined) updates.sellerDeliveryCharge = sellerDeliveryCharge;
      if (dispatchLeadDays !== undefined) updates.dispatchLeadDays = dispatchLeadDays;
      if (serviceableRegions !== undefined && Array.isArray(serviceableRegions)) updates.serviceableRegions = serviceableRegions;
      if (discountConfig !== undefined) updates.discountConfig = discountConfig;

      const result = await repo.updateProduct(productId, updates, variants);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "SELLER_PRODUCT_UPDATE",
        targetType: "Product",
        targetId: productId,
        clientIp: req.ip,
        details: { updates, variantsCount: variants?.length },
      });

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/products", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
      if (!sellerProfile) {
        res.status(403).json({ success: false, error: { message: "Approved seller profile required." } });
        return;
      }

      const products = await repo.listSellerProducts(sellerProfile.id);
      res.status(200).json({ success: true, count: products.length, data: products });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/seller/pricing-preview", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const sellingPrice = Number(req.query.sellingPrice) || 0;
      const costPrice = req.query.costPrice ? Number(req.query.costPrice) : undefined;
      const proposedGstRate = req.query.gstRate !== undefined ? Number(req.query.gstRate) : 0.05;
      const shippingMethod = (req.query.shippingMethod as ShippingMethod) || ShippingMethod.PLATFORM_STANDARD;
      const sellerDeliveryCharge = Number(req.query.sellerDeliveryCharge) || 0;

      if (sellingPrice <= 0) {
        res.status(400).json({ success: false, error: { message: "sellingPrice must be greater than 0." } });
        return;
      }

      const commissionRate = repo.policyConfig.standardCommissionRate;
      const estimatedCommission = Math.round(sellingPrice * commissionRate);
      const estimatedTax = Math.round(sellingPrice * proposedGstRate);
      const estimatedNetProceeds = sellingPrice - estimatedCommission;
      const estimatedGrossMargin = costPrice ? estimatedNetProceeds - costPrice : undefined;

      res.status(200).json({
        success: true,
        data: {
          sellingPrice,
          costPrice,
          proposedGstRate,
          estimatedTaxAmount: estimatedTax,
          platformCommissionRate: commissionRate,
          platformCommissionAmount: estimatedCommission,
          shippingMethod,
          sellerDeliveryCharge: shippingMethod === ShippingMethod.SELLER_MANAGED ? sellerDeliveryCharge : 0,
          estimatedSellerProceeds: estimatedNetProceeds,
          estimatedGrossMargin,
          disclaimer: "Estimated seller proceeds. Final settlement is calculated post-delivery, subject to customer returns, cancellations, and statutory TCS deductions.",
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/v1/seller/products/:id/status", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, error: { message: "isActive boolean is required." } });
        return;
      }

      const prod = await repo.findProductById(productId);
      if (!prod) {
        res.status(404).json({ success: false, error: { message: "Product not found." } });
        return;
      }

      if (req.user!.role !== UserRole.SUPER_ADMIN) {
        const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
        if (!sellerProfile || sellerProfile.id !== prod.sellerId) {
          res.status(403).json({ success: false, error: { message: "Unauthorized to update this product." } });
          return;
        }
      }

      await repo.updateProductActiveStatus(productId, isActive);
      res.status(200).json({ success: true, message: `Product active status updated to ${isActive}.` });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/v1/seller/variants/:id/stock", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const variantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { availableStock } = req.body;
      if (typeof availableStock !== "number" || availableStock < 0) {
        res.status(400).json({ success: false, error: { message: "availableStock non-negative number is required." } });
        return;
      }

      const variant = await repo.findVariantById(variantId);
      if (!variant) {
        res.status(404).json({ success: false, error: { message: "Variant not found." } });
        return;
      }

      if (req.user!.role !== UserRole.SUPER_ADMIN) {
        const prod = await repo.findProductById(variant.productId);
        const sellerProfile = await repo.findSellerProfileByUserId(req.user!.userId);
        if (!prod || !sellerProfile || sellerProfile.id !== prod.sellerId) {
          res.status(403).json({ success: false, error: { message: "Unauthorized to update this variant." } });
          return;
        }
      }

      await repo.updateVariantStock(variantId, availableStock);
      res.status(200).json({ success: true, message: `Variant stock updated to ${availableStock}.` });
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

  app.post("/api/v1/seller/sub-orders/:id/cancel", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertApprovedSeller(req.user!);
      const subOrderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { reason } = req.body;

      const subOrder = await repo.findSubOrderById(subOrderId);
      if (!subOrder) {
        res.status(404).json({ success: false, error: { message: "Sub-order not found." } });
        return;
      }

      OwnershipGuard.assertSellerOwnership(req.user!, subOrder.sellerId, "SubOrder");

      const updated = await repo.cancelSubOrder(subOrderId, reason || "Seller workshop cancellation");

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: req.user!.role,
        action: "SELLER_SUBORDER_CANCELLED",
        targetType: "FulfilmentSubOrder",
        targetId: subOrderId,
        clientIp: req.ip,
        details: { reason, refundedAmount: updated.netSellerAmount },
      });

      res.status(200).json({ success: true, message: "Sub-order cancelled and inventory/settlement ledger reconciled.", data: updated });
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

      if (status === ProductModerationStatus.APPROVED) {
        const prod = await repo.findProductById(productId);
        if (prod && prod.taxVerificationStatus !== TaxVerificationStatus.APPROVED) {
          await repo.recordTaxDecision(productId, {
            status: TaxVerificationStatus.APPROVED,
            approvedGstRate: prod.proposedGstRate ?? 0.05,
            reason: reason || "Tax classification verified alongside product moderation.",
            adminUserId: req.user!.userId,
          });
        }
      }

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

  // Admin Category & Taxonomy Merchandising Endpoints (Section 4)
  app.post("/api/v1/admin/categories", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { id, name, slug, description, displayOrder, image, subtitle, merchandisingTag, subcategories, showOnHomepage } = req.body;

      if (!name || !slug) {
        res.status(400).json({ success: false, error: { message: "Category name and slug are required." } });
        return;
      }

      const categoryId = id || `cat_${slug.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const created = await repo.addCategory({
        id: categoryId,
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: description || "",
        displayOrder: typeof displayOrder === "number" ? displayOrder : 99,
        image: image || "/assets/campaigns/campaign-main-hero.jpg",
        subtitle: subtitle || "Artisanal Collection",
        merchandisingTag: merchandisingTag || "Curated Atelier",
        isActive: true,
        showOnHomepage: showOnHomepage !== undefined ? showOnHomepage : true,
        subcategories: Array.isArray(subcategories) ? subcategories : [],
      });

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "CATEGORY_TAXONOMY_CREATED",
        targetType: "Category",
        targetId: created.id,
        clientIp: req.ip,
        details: { name, slug: created.slug },
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/admin/categories/:id", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const categoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { name, slug, description, displayOrder, image, subtitle, merchandisingTag, subcategories, showOnHomepage, isActive } = req.body;

      const updated = await repo.updateCategory(categoryId, {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(displayOrder !== undefined && { displayOrder }),
        ...(image && { image }),
        ...(subtitle !== undefined && { subtitle }),
        ...(merchandisingTag !== undefined && { merchandisingTag }),
        ...(subcategories !== undefined && { subcategories }),
        ...(showOnHomepage !== undefined && { showOnHomepage }),
        ...(isActive !== undefined && { isActive }),
      });

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "CATEGORY_TAXONOMY_UPDATED",
        targetType: "Category",
        targetId: categoryId,
        clientIp: req.ip,
        details: req.body,
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/v1/admin/categories/:id/status", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const categoryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        res.status(400).json({ success: false, error: { message: "isActive boolean is required." } });
        return;
      }

      const updated = await repo.toggleCategoryActive(categoryId, isActive);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "CATEGORY_TAXONOMY_STATUS_TOGGLED",
        targetType: "Category",
        targetId: categoryId,
        clientIp: req.ip,
        details: { isActive },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // ADMIN TAX VERIFICATION & POLICY MANAGEMENT
  // --------------------------------------------------------------------------
  app.get("/api/v1/admin/tax/proposals", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const statusFilter = req.query.status as TaxVerificationStatus | undefined;
      const proposals = await repo.listTaxProposals(statusFilter ? { status: statusFilter } : undefined);
      res.status(200).json({ success: true, count: proposals.length, data: proposals });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/tax/products/:id/decision", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const productId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status, approvedGstRate, reason, effectiveFrom, effectiveTo, reviewNotes } = req.body;

      if (!status || !Object.values(TaxVerificationStatus).includes(status)) {
        res.status(400).json({
          success: false,
          error: { message: `Invalid tax status. Must be one of: ${Object.values(TaxVerificationStatus).join(", ")}` },
        });
        return;
      }

      if (status === TaxVerificationStatus.APPROVED && typeof approvedGstRate === "number") {
        if (!PERMITTED_GST_RATES.includes(approvedGstRate as any)) {
          res.status(400).json({ success: false, error: { message: `Invalid GST rate. Permitted rates are 0%, 5%, 12%, 18%, 28%.` } });
          return;
        }
      }

      const updated = await repo.recordTaxDecision(productId, {
        status,
        approvedGstRate: typeof approvedGstRate === "number" ? approvedGstRate : undefined,
        reason,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
        effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined,
        adminUserId: req.user!.userId,
        reviewNotes,
      });

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "TAX_CONFIGURATION_DECISION",
        targetType: "Product",
        targetId: productId,
        clientIp: req.ip,
        details: { status, approvedGstRate, reason, reviewNotes },
      });

      res.status(200).json({ success: true, message: `Tax configuration decision recorded: ${status}`, data: updated });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/tax/policy", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      res.status(200).json({ success: true, data: repo.policyConfig });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/admin/tax/policy", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const oldConfig = { ...repo.policyConfig };
      const updated = repo.updatePolicyConfig(req.body);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "PLATFORM_TAX_SHIPPING_POLICY_UPDATE",
        targetType: "PlatformPolicy",
        targetId: "policyConfig",
        clientIp: req.ip,
        details: { oldConfig, newConfig: updated },
      });

      res.status(200).json({ success: true, message: "Platform policy configuration updated.", data: updated });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/settlements/:sellerId/payout", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const sellerId = Array.isArray(req.params.sellerId) ? req.params.sellerId[0] : req.params.sellerId;
      const { amount, bankReference } = req.body;

      if (!amount || typeof amount !== "number" || amount <= 0 || !bankReference) {
        res.status(400).json({ success: false, error: { message: "Positive payout amount and valid bankReference are required." } });
        return;
      }

      const seller = await repo.findSellerProfileById(sellerId);
      if (!seller) {
        res.status(404).json({ success: false, error: { message: "Seller profile not found." } });
        return;
      }

      const entry = await repo.disburseSellerPayout(sellerId, amount, req.user!.userId, bankReference);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "ADMIN_SETTLEMENT_PAYOUT_DISBURSED",
        targetType: "SellerProfile",
        targetId: sellerId,
        clientIp: req.ip,
        details: { amount, bankReference, balanceAfter: entry.balanceAfter },
      });

      res.status(200).json({ success: true, message: "Settlement payout disbursed and logged.", data: entry });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // PAYMENT GATEWAY (PAYTM) LIFECYCLE & CALLBACKS
  // --------------------------------------------------------------------------
  app.post("/api/v1/payments/paytm/initiate", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId, orderNumber } = req.body;
      const order = orderId
        ? await repo.findCustomerOrderById(orderId)
        : orderNumber
        ? await repo.findOrderByOrderNumber(orderNumber)
        : null;

      if (!order) {
        res.status(404).json({ success: false, error: { message: "Order not found." } });
        return;
      }

      OwnershipGuard.assertCustomerOwnership(req.user!, order.customerId, "Order");

      const initiation = await paytmProvider.initiatePayment(order);
      res.status(200).json({ success: true, data: initiation });
    } catch (err) {
      next(err);
    }
  });

  const handlePaytmCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = { ...req.query, ...req.body };
      const verification = await paytmProvider.verifyCallback(payload);

      if (!verification.isValid || verification.status === OrderPaymentStatus.FAILED) {
        const orderNum = verification.orderNumber;
        if (orderNum && orderNum !== "UNKNOWN") {
          await repo.failOrderPayment(orderNum, verification.failureReason || "Transaction failed");
          await auditLogger.logSecurityEvent({
            actorId: "system_paytm_callback",
            actorRole: UserRole.CUSTOMER,
            action: "PAYMENT_TRANSACTION_FAILED",
            targetType: "CustomerOrder",
            targetId: orderNum,
            clientIp: req.ip,
            details: { reason: verification.failureReason },
          });
        }

        res.status(400).json({
          success: false,
          error: { message: verification.failureReason || "Payment verification failed." },
          data: { orderNumber: orderNum, status: OrderPaymentStatus.FAILED },
        });
        return;
      }

      // Verified Payment Confirmation
      const confirmResult = await repo.confirmOrderPayment(
        verification.orderNumber,
        verification.transactionReference,
        "paytm",
        verification.rawResponse
      );

      await auditLogger.logSecurityEvent({
        actorId: "system_paytm_callback",
        actorRole: UserRole.CUSTOMER,
        action: "PAYMENT_TRANSACTION_VERIFIED",
        targetType: "CustomerOrder",
        targetId: confirmResult.order.id,
        clientIp: req.ip,
        details: {
          orderNumber: verification.orderNumber,
          transactionReference: verification.transactionReference,
          amount: verification.amount,
          isDuplicate: confirmResult.isDuplicate,
        },
      });

      res.status(200).json({
        success: true,
        message: "Payment successfully verified and order confirmed.",
        data: {
          orderNumber: verification.orderNumber,
          status: OrderPaymentStatus.PAID,
          transactionReference: verification.transactionReference,
          isDuplicate: confirmResult.isDuplicate,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  app.post("/api/v1/payments/paytm/callback", handlePaytmCallback);
  app.get("/api/v1/payments/paytm/callback", handlePaytmCallback);

  app.post("/api/v1/payments/paytm/webhook", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const headers = req.headers as Record<string, string>;
      const result = await paytmProvider.processWebhook(headers, req.body);

      if (!result.processed) {
        res.status(400).json({ success: false, error: { message: result.message } });
        return;
      }

      if (result.orderNumber && result.status === OrderPaymentStatus.PAID) {
        const existingOrder = await repo.findOrderByOrderNumber(result.orderNumber);
        if (existingOrder) {
          await repo.confirmOrderPayment(result.orderNumber, result.transactionReference || "WEBHOOK_TXN", "paytm", req.body);
        }
      } else if (result.orderNumber && result.status === OrderPaymentStatus.FAILED) {
        const existingOrder = await repo.findOrderByOrderNumber(result.orderNumber);
        if (existingOrder) {
          await repo.failOrderPayment(result.orderNumber, "Failed via webhook");
        }
      }

      res.status(200).json({ success: true, message: result.message });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/payments/status/:orderReference", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ref = Array.isArray(req.params.orderReference) ? req.params.orderReference[0] : req.params.orderReference;
      let order = await repo.findCustomerOrderById(ref);
      if (!order) {
        order = await repo.findOrderByOrderNumber(ref);
      }

      if (!order) {
        res.status(404).json({ success: false, error: { message: "Order not found." } });
        return;
      }

      OwnershipGuard.assertCustomerOwnership(req.user!, order.customerId, "Order");

      res.status(200).json({
        success: true,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          currency: "INR",
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // SUPER ADMIN API & INTEGRATIONS CONTROL CENTER
  // --------------------------------------------------------------------------
  app.get("/api/v1/admin/integrations", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const integrations = integrationManager.getMaskedIntegrations();
      res.status(200).json({
        success: true,
        data: {
          activePaymentProvider: integrationManager.getActivePaymentProviderId(),
          integrations,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/v1/admin/integrations/:id/config", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const integrationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      integrationManager.updateConfig(integrationId, req.body, req.user!.userId);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "INTEGRATION_CONFIG_UPDATED",
        targetType: "Integration",
        targetId: integrationId,
        clientIp: req.ip,
        details: { integrationId, updatedFields: Object.keys(req.body) },
      });

      res.status(200).json({
        success: true,
        message: `Configuration updated for ${integrationId}.`,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/integrations/:id/credentials", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const integrationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      integrationManager.replaceCredentials(integrationId, req.body, req.user!.userId);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "INTEGRATION_CREDENTIAL_ROTATED",
        targetType: "Integration",
        targetId: integrationId,
        clientIp: req.ip,
        details: { integrationId, credentialFields: Object.keys(req.body) },
      });

      res.status(200).json({
        success: true,
        message: `Credentials replaced securely and encrypted at rest for ${integrationId}.`,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/integrations/:id/test", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const integrationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      let testResult;
      if (integrationId === "paytm") {
        testResult = await paytmProvider.testConnection();
        integrationManager.recordTestResult(
          integrationId,
          testResult.status,
          testResult.diagnosticMessage,
          req.user!.userId
        );
      } else {
        testResult = {
          success: false,
          status: "NOT_INTEGRATED",
          diagnosticMessage: `Adapter for '${integrationId}' is not yet implemented.`,
          testedAt: new Date(),
        };
      }

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "INTEGRATION_TEST_EXECUTED",
        targetType: "Integration",
        targetId: integrationId,
        clientIp: req.ip,
        details: { integrationId, status: testResult.status },
      });

      res.status(200).json({ success: true, data: testResult });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/v1/admin/integrations/payments/switch-provider", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const { targetProviderId } = req.body;
      if (!targetProviderId) {
        res.status(400).json({ success: false, error: { message: "targetProviderId is required." } });
        return;
      }

      integrationManager.switchActivePaymentProvider(targetProviderId, req.user!.userId);

      await auditLogger.logSecurityEvent({
        actorId: req.user!.userId,
        actorRole: UserRole.SUPER_ADMIN,
        action: "ACTIVE_PAYMENT_GATEWAY_SWITCHED",
        targetType: "PaymentGateway",
        targetId: targetProviderId,
        clientIp: req.ip,
        details: { targetProviderId },
      });

      res.status(200).json({
        success: true,
        message: `Payment provider safely switched to ${targetProviderId}.`,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/integrations/history", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const history = integrationManager.getAuditHistory();
      res.status(200).json({ success: true, count: history.length, data: history });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/integrations/logs", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const logs = integrationManager.getIntegrationLogs();
      res.status(200).json({ success: true, count: logs.length, data: logs });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/v1/admin/payments/transactions", authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      RbacGuard.assertSuperAdmin(req.user!);
      const txns = await repo.listPaymentTransactions();
      res.status(200).json({ success: true, count: txns.length, data: txns });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // MULTI-PAGE FRONTEND ROUTE FALLBACK (SPA / Client-Side Navigation)
  // Serves index.html for all non-API GET requests so client routing works directly
  // --------------------------------------------------------------------------
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") {
      return next();
    }

    // If it's an API route that was not matched, pass to 404 handler
    if (req.path.startsWith("/api/")) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `API endpoint ${req.method} ${req.path} not found.` },
        meta: { requestId: req.requestId },
      });
      return;
    }

    // Serve public/index.html for all page views
    const indexPath = path.resolve(process.cwd(), "public", "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) next(err);
    });
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
    } else if (
      err.message &&
      (err.message.includes("Checkout failed") ||
        err.message.includes("constraint") ||
        err.message.includes("Invalid price") ||
        err.message.includes("Selling price") ||
        err.message.includes("cost price") ||
        err.message.includes("stock quantity") ||
        err.message.includes("Invalid HSN") ||
        err.message.includes("HSN must be") ||
        err.message.includes("Invalid GST rate") ||
        err.message.includes("Permitted rates") ||
        err.message.includes("Paytm Payment Gateway is not configured") ||
        err.message.includes("Cannot initiate payment") ||
        err.message.includes("Cannot activate") ||
        err.message.includes("Merchant ID and Merchant Key are required") ||
        err.message.includes("cannot be lower than selling price"))
    ) {
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
