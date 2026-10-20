import {
  DocumentType,
  SecurityAuditEventRecord,
  SellerDocumentRecord,
  SellerProfileRecord,
  SessionRecord,
  UserRecord,
  UserRole,
  VerificationStatus,
} from "../types/auth.js";
import {
  CategoryRecord,
  CustomerOrderRecord,
  FulfilmentStatus,
  FulfilmentSubOrderRecord,
  LedgerEntryType,
  LedgerStatus,
  OrderAddress,
  OrderItemRecord,
  OrderPaymentStatus,
  PaymentTransactionRecord,
  ProductModerationStatus,
  ProductRecord,
  ProductVariantRecord,
  RepricedCart,
  RepricedCartItem,
  SettlementLedgerRecord,
} from "../types/marketplace.js";
import { ISessionRepository } from "../auth/session-manager.js";
import { IAuditRepository } from "../audit/audit-logger.js";
import crypto from "crypto";

export class FoundationRepository implements ISessionRepository, IAuditRepository {
  private users: Map<string, UserRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private sellerProfiles: Map<string, SellerProfileRecord> = new Map();
  private sellerDocuments: Map<string, SellerDocumentRecord> = new Map();
  private auditEvents: SecurityAuditEventRecord[] = [];

  // Marketplace collections
  private categories: Map<string, CategoryRecord> = new Map();
  private products: Map<string, ProductRecord> = new Map();
  private variants: Map<string, ProductVariantRecord> = new Map();
  private orders: Map<string, CustomerOrderRecord> = new Map();
  private subOrders: Map<string, FulfilmentSubOrderRecord> = new Map();
  private paymentTransactions: Map<string, PaymentTransactionRecord> = new Map();
  private settlementLedgers: Map<string, SettlementLedgerRecord[]> = new Map(); // sellerId -> entries

  constructor() {
    this.seedInitialCategories();
  }

  // ------------------- INITIAL CATEGORY SEEDING -------------------
  private seedInitialCategories(): void {
    const defaultCategories: CategoryRecord[] = [
      { id: "cat_ethnic", name: "Ethnic Wear", slug: "ethnic-wear", description: "Timeless handcrafted saris, kurtas, and traditional lehengas.", displayOrder: 1 },
      { id: "cat_wedding", name: "Wedding & Festive", slug: "wedding-festive", description: "Opulent wedding couture, sherwanis, and bridal heirlooms.", displayOrder: 2 },
      { id: "cat_women", name: "Women's Fashion", slug: "womens-fashion", description: "Contemporary luxury designer silhouettes and artisanal separates.", displayOrder: 3 },
      { id: "cat_men", name: "Men's Fashion", slug: "mens-fashion", description: "Bespoke tailoring, Bandhgalas, fine linen shirts, and Nehru jackets.", displayOrder: 4 },
      { id: "cat_kids", name: "Kids' Clothing", slug: "kids-clothing", description: "Gentle organic cottons and festive miniature ethnic attire.", displayOrder: 5 },
      { id: "cat_footwear", name: "Footwear", slug: "footwear", description: "Handcrafted leather juttis, mojaris, and contemporary evening mules.", displayOrder: 6 },
      { id: "cat_accessories", name: "Bags & Accessories", slug: "accessories", description: "Potli bags, raw silk stoles, dupattas, and handcrafted jewellery.", displayOrder: 7 },
    ];

    for (const cat of defaultCategories) {
      this.categories.set(cat.id, cat);
    }

    this.seedCuratedProducts();
  }

  private seedCuratedProducts(): void {
    const sellerAId = "seller_banaras_heritage";
    const sellerBId = "seller_jaipur_royal";

    this.sellerProfiles.set(sellerAId, {
      id: sellerAId,
      userId: "user_weaver_banaras",
      storeName: "Banaras Heritage Silks",
      businessGstin: "09ABCDE1234F1Z5",
      businessPan: "ABCDE1234F",
      registeredAddress: "Ghat Road, Varanasi, UP 221001",
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verifiedByUserId: "system_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.sellerProfiles.set(sellerBId, {
      id: sellerBId,
      userId: "user_jaipur_royal",
      storeName: "Jaipur Royal Weaves",
      businessGstin: "08XYZAB5678G2Z1",
      businessPan: "XYZAB5678G",
      registeredAddress: "Hawa Mahal Marg, Jaipur, RJ 302002",
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verifiedByUserId: "system_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const curated: { product: ProductRecord; variants: Omit<ProductVariantRecord, "id" | "productId">[] }[] = [
      {
        product: {
          id: "prod_katan_sari",
          sellerId: sellerAId,
          categoryId: "cat_ethnic",
          title: "Katan Silk Handloom Sari",
          slug: "katan-silk-handloom-sari",
          description: "Woven on traditional pit-looms in Varanasi, this pure Katan silk sari features rich gold kadhwa zari work depicting antique floral meenakari motifs.",
          fabricMaterial: "Pure Silk",
          occasion: "Wedding",
          fit: "Traditional Draped",
          careInstructions: "Strictly dry clean only. Store wrapped in pure muslin cloth.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "Banaras Heritage Loom",
          images: [
            "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "BHS-KATAN-RED-FS", colorName: "Crimson Red", colorHex: "#8A252C", sizeName: "Free Size", mrp: 18500, price: 14500, availableStock: 6, reservedStock: 0 },
          { sku: "BHS-KATAN-GOLD-FS", colorName: "Champagne Gold", colorHex: "#9E7D46", sizeName: "Free Size", mrp: 18500, price: 14500, availableStock: 4, reservedStock: 0 },
        ],
      },
      {
        product: {
          id: "prod_chanderi_angrakha",
          sellerId: sellerAId,
          categoryId: "cat_women",
          title: "Chanderi Zari Angrakha Anarkali",
          slug: "chanderi-zari-angrakha-anarkali",
          description: "Handcrafted in gossamer Chanderi silk with delicate golden tissue piping, side-tie closure, and hand-embroidered gotta patti hemline.",
          fabricMaterial: "Chanderi Silk",
          occasion: "Festive",
          fit: "Flared Silhouette",
          careInstructions: "Dry clean only. Steam iron on reverse.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "Artisanal Atelier",
          images: [
            "https://images.unsplash.com/photo-1583391733975-0027f6a70e7e?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "BHS-ANGRAKHA-IVORY-S", colorName: "Warm Ivory", colorHex: "#F7F5EE", sizeName: "S", mrp: 11000, price: 8900, availableStock: 4, reservedStock: 0 },
          { sku: "BHS-ANGRAKHA-IVORY-M", colorName: "Warm Ivory", colorHex: "#F7F5EE", sizeName: "M", mrp: 11000, price: 8900, availableStock: 8, reservedStock: 0 },
          { sku: "BHS-ANGRAKHA-IVORY-L", colorName: "Warm Ivory", colorHex: "#F7F5EE", sizeName: "L", mrp: 11000, price: 8900, availableStock: 5, reservedStock: 0 },
        ],
      },
      {
        product: {
          id: "prod_tussar_bandhgala",
          sellerId: sellerBId,
          categoryId: "cat_men",
          title: "Tussar Silk Embroidered Bandhgala",
          slug: "tussar-silk-embroidered-bandhgala",
          description: "Structured royal Bandhgala jacket crafted from textured wild Tussar silk, featuring handcrafted brass buttons and velvet trim collar.",
          fabricMaterial: "Tussar Silk",
          occasion: "Wedding",
          fit: "Tailored Royal Cut",
          careInstructions: "Professional dry clean only.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "Jaipur Bespoke",
          images: [
            "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "JRW-BANDH-NAVY-38", colorName: "Midnight Navy", colorHex: "#1B2430", sizeName: "38 (S)", mrp: 24000, price: 19500, availableStock: 3, reservedStock: 0 },
          { sku: "JRW-BANDH-NAVY-40", colorName: "Midnight Navy", colorHex: "#1B2430", sizeName: "40 (M)", mrp: 24000, price: 19500, availableStock: 5, reservedStock: 0 },
          { sku: "JRW-BANDH-NAVY-42", colorName: "Midnight Navy", colorHex: "#1B2430", sizeName: "42 (L)", mrp: 24000, price: 19500, availableStock: 4, reservedStock: 0 },
        ],
      },
      {
        product: {
          id: "prod_mulberry_lehenga",
          sellerId: sellerBId,
          categoryId: "cat_wedding",
          title: "Mulberry Silk Draped Bridal Lehenga",
          slug: "mulberry-silk-draped-bridal-lehenga",
          description: "A monumental 16-kali heirloom lehenga woven in rich Mulberry silk, embellished with real silver marodi embroidery and zardozi micro-pearls.",
          fabricMaterial: "Pure Silk",
          occasion: "Wedding",
          fit: "Flared Bridal Cut",
          careInstructions: "Preserve in archival bridal box. Specialized dry clean only.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "Vespera Signature",
          images: [
            "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "JRW-LEHENGA-RUBY-M", colorName: "Royal Ruby", colorHex: "#6B1D2F", sizeName: "Custom Fit (M)", mrp: 42000, price: 34000, availableStock: 2, reservedStock: 0 },
        ],
      },
      {
        product: {
          id: "prod_mojaris",
          sellerId: sellerBId,
          categoryId: "cat_footwear",
          title: "Handcrafted Zardozi Leather Mojaris",
          slug: "handcrafted-zardozi-leather-mojaris",
          description: "Curved-toe traditional mojaris crafted from vegetable-tanned leather, hand-embroidered with golden bullion thread and padded velvet insole.",
          fabricMaterial: "Pure Leather & Silk",
          occasion: "Festive",
          fit: "Comfort Traditional",
          careInstructions: "Wipe with damp cloth. Store away from moisture.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "Royal Footwear Guild",
          images: [
            "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "JRW-MOJARI-GOLD-8", colorName: "Antique Gold", colorHex: "#B89758", sizeName: "UK 8", mrp: 4500, price: 3400, availableStock: 7, reservedStock: 0 },
          { sku: "JRW-MOJARI-GOLD-9", colorName: "Antique Gold", colorHex: "#B89758", sizeName: "UK 9", mrp: 4500, price: 3400, availableStock: 6, reservedStock: 0 },
          { sku: "JRW-MOJARI-GOLD-10", colorName: "Antique Gold", colorHex: "#B89758", sizeName: "UK 10", mrp: 4500, price: 3400, availableStock: 5, reservedStock: 0 },
        ],
      },
    ];

    for (const item of curated) {
      this.products.set(item.product.id, item.product);
      for (const v of item.variants) {
        const variantId = `var_${v.sku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        this.variants.set(variantId, {
          id: variantId,
          productId: item.product.id,
          ...v,
        });
      }
    }
  }

  // ------------------- USER REPOSITORY -------------------
  public async createUser(user: UserRecord): Promise<UserRecord> {
    for (const existing of this.users.values()) {
      if (existing.email.toLowerCase() === user.email.toLowerCase()) {
        throw new Error(`Unique constraint violation: Email '${user.email}' already exists.`);
      }
    }
    this.users.set(user.id, { ...user });
    return user;
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) {
        return { ...user };
      }
    }
    return null;
  }

  public async updateUserRole(userId: string, role: UserRole): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found.");
    user.role = role;
    user.updatedAt = new Date();
  }

  // ------------------- SESSION REPOSITORY -------------------
  public async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  public async findSessionById(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  public async revokeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = new Date();
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.revokedAt = new Date();
      }
    }
  }

  // ------------------- SELLER PROFILE REPOSITORY -------------------
  public async createSellerProfile(profile: SellerProfileRecord): Promise<SellerProfileRecord> {
    this.sellerProfiles.set(profile.id, { ...profile });
    return profile;
  }

  public async findSellerProfileById(id: string): Promise<SellerProfileRecord | null> {
    const profile = this.sellerProfiles.get(id);
    return profile ? { ...profile } : null;
  }

  public async findSellerProfileByUserId(userId: string): Promise<SellerProfileRecord | null> {
    for (const profile of this.sellerProfiles.values()) {
      if (profile.userId === userId) {
        return { ...profile };
      }
    }
    return null;
  }

  public async listAllSellers(): Promise<SellerProfileRecord[]> {
    return Array.from(this.sellerProfiles.values());
  }

  public async updateSellerStatus(
    sellerId: string,
    status: VerificationStatus,
    reviewerId: string,
    reason?: string
  ): Promise<void> {
    const profile = this.sellerProfiles.get(sellerId);
    if (!profile) throw new Error("Seller profile not found.");
    profile.verificationStatus = status;
    profile.verifiedByUserId = reviewerId;
    profile.verifiedAt = new Date();
    profile.rejectionReason = reason || null;
    profile.updatedAt = new Date();

    // If approved, promote user role to APPROVED_SELLER
    if (status === VerificationStatus.APPROVED) {
      const user = this.users.get(profile.userId);
      if (user && user.role === UserRole.SELLER_APPLICANT) {
        user.role = UserRole.APPROVED_SELLER;
        user.updatedAt = new Date();
      }
    }
  }

  // ------------------- SELLER DOCUMENT REPOSITORY -------------------
  public async createSellerDocument(doc: SellerDocumentRecord): Promise<SellerDocumentRecord> {
    this.sellerDocuments.set(doc.id, { ...doc });
    return doc;
  }

  public async findSellerDocumentById(id: string): Promise<SellerDocumentRecord | null> {
    const doc = this.sellerDocuments.get(id);
    return doc ? { ...doc } : null;
  }

  public async listSellerDocuments(sellerId: string): Promise<SellerDocumentRecord[]> {
    const results: SellerDocumentRecord[] = [];
    for (const doc of this.sellerDocuments.values()) {
      if (doc.sellerId === sellerId) {
        results.push({ ...doc });
      }
    }
    return results;
  }

  // ------------------- CATEGORIES -------------------
  public async listCategories(): Promise<CategoryRecord[]> {
    return Array.from(this.categories.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async findCategoryById(id: string): Promise<CategoryRecord | null> {
    return this.categories.get(id) || null;
  }

  public async findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
    for (const cat of this.categories.values()) {
      if (cat.slug === slug) return { ...cat };
    }
    return null;
  }

  // ------------------- PRODUCTS & VARIANTS -------------------
  public async createProduct(product: ProductRecord, variants: Omit<ProductVariantRecord, "id" | "productId">[]): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] }> {
    // Check SKU uniqueness
    for (const v of variants) {
      for (const existing of this.variants.values()) {
        if (existing.sku.toLowerCase() === v.sku.toLowerCase()) {
          throw new Error(`SKU constraint violation: SKU '${v.sku}' is already in use.`);
        }
      }
    }

    this.products.set(product.id, { ...product });
    const createdVariants: ProductVariantRecord[] = [];

    for (const v of variants) {
      const variantRecord: ProductVariantRecord = {
        id: crypto.randomUUID(),
        productId: product.id,
        ...v,
      };
      this.variants.set(variantRecord.id, variantRecord);
      createdVariants.push(variantRecord);
    }

    return { product, variants: createdVariants };
  }

  public async findProductById(id: string): Promise<ProductRecord | null> {
    const prod = this.products.get(id);
    return prod ? { ...prod } : null;
  }

  public async findProductBySlug(slug: string): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] } | null> {
    for (const prod of this.products.values()) {
      if (prod.slug === slug) {
        const productVariants = this.findVariantsByProductId(prod.id);
        return { product: { ...prod }, variants: productVariants };
      }
    }
    return null;
  }

  public findVariantsByProductId(productId: string): ProductVariantRecord[] {
    const results: ProductVariantRecord[] = [];
    for (const v of this.variants.values()) {
      if (v.productId === productId) {
        results.push({ ...v });
      }
    }
    return results;
  }

  public async findVariantById(variantId: string): Promise<ProductVariantRecord | null> {
    const v = this.variants.get(variantId);
    return v ? { ...v } : null;
  }

  public async listApprovedProducts(filter?: {
    categoryId?: string;
    occasion?: string;
    fabric?: string;
    searchQuery?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: "price_asc" | "price_desc" | "newest";
  }): Promise<{ product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[]> {
    const list: { product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[] = [];

    for (const prod of this.products.values()) {
      if (prod.moderationStatus !== ProductModerationStatus.APPROVED || !prod.isActive) {
        continue;
      }

      if (filter?.categoryId && prod.categoryId !== filter.categoryId) continue;
      if (filter?.occasion && prod.occasion.toLowerCase() !== filter.occasion.toLowerCase()) continue;
      if (filter?.fabric && prod.fabricMaterial.toLowerCase() !== filter.fabric.toLowerCase()) continue;

      if (filter?.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        const matchesTitle = prod.title.toLowerCase().includes(q);
        const matchesDesc = prod.description.toLowerCase().includes(q);
        const matchesFabric = prod.fabricMaterial.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesFabric) continue;
      }

      const prodVariants = this.findVariantsByProductId(prod.id);
      if (prodVariants.length === 0) continue;

      // Price filtering
      if (filter?.minPrice !== undefined || filter?.maxPrice !== undefined) {
        const hasVariantInPriceRange = prodVariants.some((v) => {
          if (filter.minPrice !== undefined && v.price < filter.minPrice) return false;
          if (filter.maxPrice !== undefined && v.price > filter.maxPrice) return false;
          return true;
        });
        if (!hasVariantInPriceRange) continue;
      }

      const seller = this.sellerProfiles.get(prod.sellerId);
      const sellerStoreName = seller?.storeName || "Vespera Verified Boutique";

      list.push({ product: { ...prod }, variants: prodVariants, sellerStoreName });
    }

    // Sorting
    if (filter?.sortBy === "price_asc") {
      list.sort((a, b) => Math.min(...a.variants.map((v) => v.price)) - Math.min(...b.variants.map((v) => v.price)));
    } else if (filter?.sortBy === "price_desc") {
      list.sort((a, b) => Math.max(...b.variants.map((v) => v.price)) - Math.max(...a.variants.map((v) => v.price)));
    } else {
      list.sort((a, b) => b.product.createdAt.getTime() - a.product.createdAt.getTime());
    }

    return list;
  }

  public async listSellerProducts(sellerId: string): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] }[]> {
    const list: { product: ProductRecord; variants: ProductVariantRecord[] }[] = [];
    for (const prod of this.products.values()) {
      if (prod.sellerId === sellerId) {
        list.push({ product: { ...prod }, variants: this.findVariantsByProductId(prod.id) });
      }
    }
    return list;
  }

  public async listModerationQueue(): Promise<{ product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[]> {
    const list: { product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[] = [];
    for (const prod of this.products.values()) {
      if (prod.moderationStatus === ProductModerationStatus.SUBMITTED || prod.moderationStatus === ProductModerationStatus.UNDER_REVIEW) {
        const seller = this.sellerProfiles.get(prod.sellerId);
        list.push({
          product: { ...prod },
          variants: this.findVariantsByProductId(prod.id),
          sellerStoreName: seller?.storeName || "Unknown Seller",
        });
      }
    }
    return list;
  }

  public async updateProductModerationStatus(
    productId: string,
    status: ProductModerationStatus,
    reason?: string
  ): Promise<void> {
    const prod = this.products.get(productId);
    if (!prod) throw new Error("Product not found.");
    prod.moderationStatus = status;
    prod.rejectionReason = reason || null;
    prod.updatedAt = new Date();
  }

  public async updateVariantStock(variantId: string, availableStock: number): Promise<void> {
    const v = this.variants.get(variantId);
    if (!v) throw new Error("Variant not found.");
    v.availableStock = availableStock;
  }

  // ------------------- CART REPRICING ENGINE -------------------
  public async repriceCart(rawItems: { variantId: string; quantity: number }[]): Promise<RepricedCart> {
    const repricedItems: RepricedCartItem[] = [];
    const validationErrors: string[] = [];
    let subtotal = 0;

    for (const item of rawItems) {
      const variant = this.variants.get(item.variantId);
      if (!variant) {
        validationErrors.push(`Item variant ID '${item.variantId}' is no longer available.`);
        continue;
      }

      const product = this.products.get(variant.productId);
      if (!product || product.moderationStatus !== ProductModerationStatus.APPROVED || !product.isActive) {
        validationErrors.push(`Product '${product?.title || item.variantId}' is currently unavailable.`);
        continue;
      }

      const seller = this.sellerProfiles.get(product.sellerId);
      const isStockSufficient = variant.availableStock >= item.quantity;

      if (!isStockSufficient) {
        validationErrors.push(`Only ${variant.availableStock} units remaining for '${product.title}' (${variant.sizeName}).`);
      }

      const lineTotal = variant.price * item.quantity;
      subtotal += lineTotal;

      repricedItems.push({
        variantId: variant.id,
        productId: product.id,
        productTitle: product.title,
        sellerId: product.sellerId,
        sellerStoreName: seller?.storeName || "Boutique Atelier",
        colorName: variant.colorName,
        sizeName: variant.sizeName,
        sku: variant.sku,
        unitPrice: variant.price, // Canonical DB price
        quantity: item.quantity,
        lineTotal,
        inStock: isStockSufficient,
        availableStock: variant.availableStock,
        imageUrl: product.images[0] || undefined,
      });
    }

    const taxAmount = Math.round(subtotal * 0.05); // Standard 5% Apparel GST
    const shippingFee = subtotal > 2999 ? 0 : 250; // Free luxury delivery over ₹2,999
    const totalAmount = subtotal + taxAmount + shippingFee;

    return {
      items: repricedItems,
      subtotal,
      taxAmount,
      shippingFee,
      totalAmount,
      currency: "INR",
      isValidForCheckout: validationErrors.length === 0 && repricedItems.length > 0,
      validationErrors,
    };
  }

  // ------------------- CHECKOUT & ORDER SPLITTING -------------------
  public async createCustomerOrder(
    customerId: string,
    customerEmail: string,
    rawItems: { variantId: string; quantity: number }[],
    shippingAddress: OrderAddress
  ): Promise<CustomerOrderRecord> {
    // 1. Authoritative Repricing & Stock Verification
    const repriced = await this.repriceCart(rawItems);
    if (!repriced.isValidForCheckout) {
      throw new Error(`Checkout failed: ${repriced.validationErrors.join(" ")}`);
    }

    // 2. Transactional Stock Reservation
    for (const item of repriced.items) {
      const v = this.variants.get(item.variantId)!;
      if (v.availableStock < item.quantity) {
        throw new Error(`Inventory race: Variant '${v.sku}' ran out of stock.`);
      }
      v.availableStock -= item.quantity;
      v.reservedStock += item.quantity;
    }

    const parentOrderId = crypto.randomUUID();
    const orderNumber = `VA-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;

    // 3. Group by Seller to generate Fulfillment Sub-Orders
    const sellerGroups = new Map<string, RepricedCartItem[]>();
    for (const item of repriced.items) {
      const list = sellerGroups.get(item.sellerId) || [];
      list.push(item);
      sellerGroups.set(item.sellerId, list);
    }

    const subOrdersList: FulfilmentSubOrderRecord[] = [];
    let subOrderIndex = 1;

    for (const [sellerId, items] of sellerGroups.entries()) {
      const subOrderId = crypto.randomUUID();
      const subOrderNumber = `${orderNumber}-S${subOrderIndex++}`;
      const subtotal = items.reduce((sum, it) => sum + it.lineTotal, 0);
      const commissionRate = 0.12; // 12% standard fashion platform commission
      const commissionAmount = Math.round(subtotal * commissionRate);
      const netSellerAmount = subtotal - commissionAmount;

      const orderItems: OrderItemRecord[] = items.map((it) => ({
        id: crypto.randomUUID(),
        subOrderId,
        variantId: it.variantId,
        productName: it.productTitle,
        color: it.colorName,
        size: it.sizeName,
        sku: it.sku,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        lineTotal: it.lineTotal,
      }));

      const seller = this.sellerProfiles.get(sellerId);

      const subOrder: FulfilmentSubOrderRecord = {
        id: subOrderId,
        parentOrderId,
        sellerId,
        sellerStoreName: seller?.storeName || "Atelier Merchant",
        subOrderNumber,
        subtotal,
        commissionRate,
        commissionAmount,
        netSellerAmount,
        status: FulfilmentStatus.PLACED,
        carrierName: null,
        trackingNumber: null,
        items: orderItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.subOrders.set(subOrderId, subOrder);
      subOrdersList.push(subOrder);

      // Record accrual in seller settlement ledger
      await this.recordLedgerEntry({
        id: crypto.randomUUID(),
        sellerId,
        subOrderId,
        entryType: LedgerEntryType.SALE_CREDIT,
        amount: netSellerAmount,
        balanceAfter: (await this.getSellerBalance(sellerId)) + netSellerAmount,
        referenceNote: `Order ${subOrderNumber} placed (Gross: ₹${subtotal}, Fee: ₹${commissionAmount})`,
        status: LedgerStatus.ACCRUED,
        createdAt: new Date(),
      });
    }

    const customerOrder: CustomerOrderRecord = {
      id: parentOrderId,
      customerId,
      customerEmail,
      orderNumber,
      totalAmount: repriced.totalAmount,
      taxAmount: repriced.taxAmount,
      shippingFee: repriced.shippingFee,
      paymentStatus: OrderPaymentStatus.PAID, // Simulated sandbox authorization
      shippingAddress,
      subOrders: subOrdersList,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(parentOrderId, customerOrder);
    return customerOrder;
  }

  public async findCustomerOrderById(orderId: string): Promise<CustomerOrderRecord | null> {
    const o = this.orders.get(orderId);
    return o ? { ...o } : null;
  }

  public async listCustomerOrders(customerId: string): Promise<CustomerOrderRecord[]> {
    const list: CustomerOrderRecord[] = [];
    for (const o of this.orders.values()) {
      if (o.customerId === customerId) {
        list.push({ ...o });
      }
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async findSubOrderById(subOrderId: string): Promise<FulfilmentSubOrderRecord | null> {
    const sub = this.subOrders.get(subOrderId);
    return sub ? { ...sub } : null;
  }

  public async listSellerSubOrders(sellerId: string): Promise<FulfilmentSubOrderRecord[]> {
    const list: FulfilmentSubOrderRecord[] = [];
    for (const sub of this.subOrders.values()) {
      if (sub.sellerId === sellerId) {
        list.push({ ...sub });
      }
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  public async updateSubOrderStatus(
    subOrderId: string,
    status: FulfilmentStatus,
    carrierName?: string,
    trackingNumber?: string
  ): Promise<void> {
    const sub = this.subOrders.get(subOrderId);
    if (!sub) throw new Error("Sub-order not found.");
    sub.status = status;
    if (carrierName) sub.carrierName = carrierName;
    if (trackingNumber) sub.trackingNumber = trackingNumber;
    if (status === FulfilmentStatus.DISPATCHED) sub.dispatchedAt = new Date();
    if (status === FulfilmentStatus.DELIVERED) sub.deliveredAt = new Date();
    sub.updatedAt = new Date();
  }

  // ------------------- SETTLEMENT LEDGER -------------------
  public async recordLedgerEntry(entry: SettlementLedgerRecord): Promise<void> {
    const list = this.settlementLedgers.get(entry.sellerId) || [];
    list.push(entry);
    this.settlementLedgers.set(entry.sellerId, list);
  }

  public async getSellerBalance(sellerId: string): Promise<number> {
    const list = this.settlementLedgers.get(sellerId) || [];
    return list.reduce((bal, e) => {
      if (e.entryType === LedgerEntryType.SALE_CREDIT) return bal + e.amount;
      if (e.entryType === LedgerEntryType.COMMISSION_DEBIT || e.entryType === LedgerEntryType.RETURN_DEBIT || e.entryType === LedgerEntryType.PAYOUT_DISBURSEMENT) {
        return bal - e.amount;
      }
      return bal;
    }, 0);
  }

  public async listSellerLedger(sellerId: string): Promise<SettlementLedgerRecord[]> {
    const list = this.settlementLedgers.get(sellerId) || [];
    return [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // ------------------- AUDIT REPOSITORY -------------------
  public async recordEvent(event: SecurityAuditEventRecord): Promise<void> {
    this.auditEvents.push({ ...event });
  }

  public async queryEvents(filter: { actorId?: string; action?: string; limit?: number }): Promise<SecurityAuditEventRecord[]> {
    return this.auditEvents
      .filter((e) => {
        if (filter.actorId && e.actorId !== filter.actorId) return false;
        if (filter.action && e.action !== filter.action) return false;
        return true;
      })
      .slice(0, filter.limit || 50);
  }
}
