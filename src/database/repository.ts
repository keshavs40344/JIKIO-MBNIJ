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
  TaxVerificationStatus,
  ShippingMethod,
  PERMITTED_GST_RATES,
  ApprovedTaxConfig,
  validateHsnSyntax,
} from "../types/marketplace.js";
import { ISessionRepository } from "../auth/session-manager.js";
import { IAuditRepository } from "../audit/audit-logger.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface MarketplacePolicyConfig {
  gstRate: number;
  freeShippingThreshold: number;
  standardShippingFee: number;
  standardCommissionRate: number;
}

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

  public readonly policyConfig: MarketplacePolicyConfig;

  constructor(config?: Partial<MarketplacePolicyConfig>) {
    this.policyConfig = {
      gstRate: config?.gstRate ?? (Number(process.env.GST_RATE) || 0.05),
      freeShippingThreshold: config?.freeShippingThreshold ?? (Number(process.env.FREE_SHIPPING_THRESHOLD) || 2999),
      standardShippingFee: config?.standardShippingFee ?? (Number(process.env.STANDARD_SHIPPING_FEE) || 250),
      standardCommissionRate: config?.standardCommissionRate ?? (Number(process.env.STANDARD_COMMISSION_RATE) || 0.12),
    };
    this.seedInitialCategories();
  }

  // ------------------- INITIAL DEMO USERS SEEDING -------------------
  public seedDemoUsers(): void {
    const sellerPasswordHash = bcrypt.hashSync("WeaverPass2026!#", 10);
    const adminPasswordHash = bcrypt.hashSync("SuperAdminPass2026!#", 10);
    const customerPasswordHash = bcrypt.hashSync("PatronPass2026!#", 10);

    const demoSeller: UserRecord = {
      id: "user_weaver_banaras",
      email: "weaver@banaras.local",
      phone: "+919876543210",
      passwordHash: sellerPasswordHash,
      role: UserRole.APPROVED_SELLER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const demoAdmin: UserRecord = {
      id: "admin_owner_vespera",
      email: "owner@vespera.local",
      phone: "+919876500001",
      passwordHash: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isMfaEnabled: true,
      mfaSecret: "11223344556677889900aabbccddeeff00112233",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const demoCustomer: UserRecord = {
      id: "customer_patron_demo",
      email: "patron@heritage.local",
      phone: "+919876599999",
      passwordHash: customerPasswordHash,
      role: UserRole.CUSTOMER,
      isActive: true,
      isMfaEnabled: false,
      mfaSecret: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!this.users.has(demoSeller.id)) this.users.set(demoSeller.id, demoSeller);
    if (!this.users.has(demoAdmin.id)) this.users.set(demoAdmin.id, demoAdmin);
    if (!this.users.has(demoCustomer.id)) this.users.set(demoCustomer.id, demoCustomer);
  }

  // ------------------- INITIAL CATEGORY SEEDING -------------------
  private seedInitialCategories(): void {
    const defaultCategories: CategoryRecord[] = [
      {
        id: "cat_ethnic",
        name: "Ethnic Wear",
        slug: "ethnic-wear",
        description: "Timeless handcrafted saris, kurtas, and traditional lehengas.",
        displayOrder: 1,
        subtitle: "Mithila Tussar & Banarasi Weaves",
        merchandisingTag: "Ancestral Looms",
        image: "/assets/campaigns/campaign-sarees.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_sarees_tussar", name: "Tussar Silk Sarees", slug: "tussar-silk-sarees" },
          { id: "sub_sarees_katan", name: "Banarasi Katan Sarees", slug: "banarasi-katan-sarees" },
          { id: "sub_kurtas", name: "Handcrafted Kurtas", slug: "handcrafted-kurtas" },
        ],
      },
      {
        id: "cat_wedding",
        name: "Wedding & Festive",
        slug: "wedding-festive",
        description: "Opulent wedding couture, sherwanis, and bridal heirlooms.",
        displayOrder: 2,
        subtitle: "Mulberry Silk Bridal Lehengas",
        merchandisingTag: "Ceremonial Splendor",
        image: "/assets/campaigns/campaign-bridal.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_bridal_lehengas", name: "Bridal Lehengas", slug: "bridal-lehengas" },
          { id: "sub_sherwanis", name: "Groom Sherwanis", slug: "groom-sherwanis" },
          { id: "sub_festive_dupatta", name: "Ceremonial Odhnas & Dupattas", slug: "ceremonial-dupattas" },
        ],
      },
      {
        id: "cat_women",
        name: "Women's Fashion",
        slug: "womens-fashion",
        description: "Contemporary luxury designer silhouettes and artisanal separates.",
        displayOrder: 3,
        subtitle: "Handcrafted Zari Angrakhas",
        merchandisingTag: "Artisanal Silhouettes",
        image: "/assets/campaigns/campaign-womens-couture.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_angrakha", name: "Angrakha Anarkalis", slug: "angrakha-anarkalis" },
          { id: "sub_separates", name: "Couture Tunics & Trousers", slug: "couture-tunics" },
        ],
      },
      {
        id: "cat_men",
        name: "Men's Fashion",
        slug: "mens-fashion",
        description: "Bespoke tailoring, Bandhgalas, fine linen shirts, and Nehru jackets.",
        displayOrder: 4,
        subtitle: "Bespoke Silk Bandhgalas",
        merchandisingTag: "Bespoke Atelier",
        image: "/assets/campaigns/campaign-menswear.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_bandhgalas", name: "Royal Bandhgalas", slug: "royal-bandhgalas" },
          { id: "sub_nehru_jackets", name: "Nehru Waistcoats", slug: "nehru-waistcoats" },
          { id: "sub_kurtas_men", name: "Raw Silk Kurtas", slug: "raw-silk-kurtas" },
        ],
      },
      {
        id: "cat_kids",
        name: "Kids' Clothing",
        slug: "kids-clothing",
        description: "Gentle organic cottons and festive miniature ethnic attire.",
        displayOrder: 5,
        subtitle: "Miniature Festive Ensembles",
        merchandisingTag: "Pure & Gentle",
        image: "/assets/campaigns/campaign-craft-storytelling.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_boys_kurta", name: "Boys' Festive Kurtas", slug: "boys-festive-kurtas" },
          { id: "sub_girls_lehenga", name: "Girls' Miniature Pattu Pavadai", slug: "girls-pattu-pavadai" },
        ],
      },
      {
        id: "cat_footwear",
        name: "Footwear",
        slug: "footwear",
        description: "Handcrafted leather juttis, mojaris, and contemporary evening mules.",
        displayOrder: 6,
        subtitle: "Zardozi Bullion Mojaris",
        merchandisingTag: "Artisanal Details",
        image: "/assets/campaigns/campaign-accessories.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_mojaris", name: "Zardozi Mojaris", slug: "zardozi-mojaris" },
          { id: "sub_juttis", name: "Embroidered Juttis", slug: "embroidered-juttis" },
        ],
      },
      {
        id: "cat_accessories",
        name: "Bags & Accessories",
        slug: "accessories",
        description: "Potli bags, raw silk stoles, dupattas, and handcrafted jewellery.",
        displayOrder: 7,
        subtitle: "Handpainted Silk Stoles & Potlis",
        merchandisingTag: "Craft Accents",
        image: "/assets/campaigns/campaign-accessories.jpg",
        isActive: true,
        showOnHomepage: true,
        subcategories: [
          { id: "sub_stoles", name: "Handpainted Silk Stoles", slug: "handpainted-silk-stoles" },
          { id: "sub_potlis", name: "Embroidered Potli Bags", slug: "embroidered-potli-bags" },
        ],
      },
    ];

    for (const cat of defaultCategories) {
      this.categories.set(cat.id, cat);
    }

    this.seedCuratedProducts();
  }

  private seedCuratedProducts(): void {
    const sellerAId = "seller_banaras_heritage";
    const sellerBId = "seller_jaipur_royal";
    const sellerCId = "seller_mithila_guild";

    this.sellerProfiles.set(sellerCId, {
      id: sellerCId,
      userId: "user_artisan_mithila",
      storeName: "Mithila Master Weavers & Art Guild",
      businessGstin: "10MITHI9988H1Z4",
      businessPan: "MITHI9988H",
      registeredAddress: "Madhubani Artists Quarter, Madhubani, Bihar 847211",
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verifiedByUserId: "system_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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
          subcategoryId: "sub_sarees_katan",
          audience: "WOMEN",
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
            "/assets/campaigns/campaign-sarees.jpg",
            "/images/campaign-hero.jpg",
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
          subcategoryId: "sub_angrakha",
          audience: "WOMEN",
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
            "/assets/campaigns/campaign-womens-couture.jpg",
            "/assets/campaigns/campaign-main-hero.jpg",
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
          subcategoryId: "sub_bandhgalas",
          audience: "MEN",
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
            "/assets/campaigns/campaign-menswear.jpg",
            "/assets/campaigns/campaign-craft-storytelling.jpg",
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
          subcategoryId: "sub_bridal_lehengas",
          audience: "WOMEN",
          title: "Mulberry Silk Draped Bridal Lehenga",
          slug: "mulberry-silk-draped-bridal-lehenga",
          description: "A monumental 16-kali heirloom lehenga woven in rich Mulberry silk, embellished with real silver marodi embroidery and zardozi micro-pearls.",
          fabricMaterial: "Pure Silk",
          occasion: "Wedding",
          fit: "Flared Bridal Cut",
          careInstructions: "Preserve in archival bridal box. Specialized dry clean only.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "ICM Madhubani Signature",
          images: [
            "/assets/campaigns/campaign-bridal.jpg",
            "/assets/campaigns/campaign-sarees.jpg",
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
          subcategoryId: "sub_mojaris",
          audience: "MEN",
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
            "/assets/campaigns/campaign-accessories.jpg",
            "/assets/campaigns/campaign-menswear.jpg",
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
      {
        product: {
          id: "prod_madhubani_tussar_sari",
          sellerId: sellerCId,
          categoryId: "cat_ethnic",
          subcategoryId: "sub_sarees_tussar",
          audience: "WOMEN",
          title: "Handpainted Madhubani Tussar Silk Saree",
          slug: "handpainted-madhubani-tussar-silk-saree",
          description: "Authentic handspun Bhagalpuri Tussar silk saree adorned with freehand Kohbar and Tree of Life motifs handpainted using natural organic pigments by master Mithila women artisans.",
          fabricMaterial: "Tussar Silk",
          occasion: "Festive",
          fit: "Traditional Draped",
          careInstructions: "Dry clean only. Roll in muslin cloth.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "ICM Mithila Master Guild",
          images: [
            "/images/campaign-hero.jpg",
            "/assets/campaigns/campaign-craft-storytelling.jpg",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "ICM-TUSSAR-NATURAL-FS", colorName: "Natural Tussar Ecru", colorHex: "#EFE6D8", sizeName: "Free Size", mrp: 19500, price: 15200, availableStock: 5, reservedStock: 0 },
          { sku: "ICM-TUSSAR-MADDER-FS", colorName: "Mithila Madder Red", colorHex: "#8A2127", sizeName: "Free Size", mrp: 19500, price: 15200, availableStock: 3, reservedStock: 0 },
        ],
      },
      {
        product: {
          id: "prod_madhubani_dupatta",
          sellerId: sellerCId,
          categoryId: "cat_accessories",
          subcategoryId: "sub_stoles",
          audience: "WOMEN",
          title: "Mithila Handpainted Pure Silk Stole",
          slug: "mithila-handpainted-pure-silk-stole",
          description: "Handwoven pure silk stole with fine nib-and-bamboo brushwork depicting traditional Matsya (fish) and Kamal (lotus) motifs symbolizing prosperity and auspicious grace.",
          fabricMaterial: "Pure Silk",
          occasion: "Festive",
          fit: "Standard Drape (2.5m)",
          careInstructions: "Dry clean recommended.",
          moderationStatus: ProductModerationStatus.APPROVED,
          brandClaim: "ICM Madhubani Signature",
          images: [
            "/assets/campaigns/campaign-accessories.jpg",
            "/assets/campaigns/campaign-sarees.jpg",
          ],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        variants: [
          { sku: "ICM-STOLE-OCHRE-FS", colorName: "Royal Ochre", colorHex: "#B8860B", sizeName: "Free Size", mrp: 7500, price: 5800, availableStock: 8, reservedStock: 0 },
        ],
      },
    ];

    const hsnTaxMap: Record<string, { hsn: string; rate: number; category: string }> = {
      prod_katan_sari: { hsn: "5007", rate: 0.05, category: "Handloom Pure Silk Sari" },
      prod_chanderi_angrakha: { hsn: "6204", rate: 0.05, category: "Handcrafted Women's Ensemble" },
      prod_tussar_bandhgala: { hsn: "6203", rate: 0.05, category: "Men's Tailored Royal Jacket" },
      prod_mulberry_lehenga: { hsn: "6204", rate: 0.05, category: "Bridal Heirloom Couture" },
      prod_mojaris: { hsn: "6403", rate: 0.05, category: "Handcrafted Leather Footwear" },
      prod_madhubani_tussar_sari: { hsn: "5007", rate: 0.05, category: "Handpainted Tussar Silk Sari" },
      prod_madhubani_dupatta: { hsn: "6214", rate: 0.05, category: "Handpainted Silk Stole" },
    };

    for (const item of curated) {
      const taxInfo = hsnTaxMap[item.product.id] || { hsn: "5007", rate: 0.05, category: "Handloom Heritage Apparel" };
      const primaryPrice = item.variants[0]?.price || 10000;
      const approvedConfig: ApprovedTaxConfig = {
        id: `tax_cfg_${item.product.id}`,
        productId: item.product.id,
        hsnCode: taxInfo.hsn,
        approvedGstRate: taxInfo.rate,
        taxCategory: taxInfo.category,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
        approvedByUserId: "system_admin",
        approvedAt: new Date("2026-01-01"),
        decisionReason: "Centrally approved initial artisanal catalog classification.",
        version: 1,
      };

      const enrichedProduct: ProductRecord = {
        ...item.product,
        costPrice: Math.round(primaryPrice * 0.55),
        proposedHsn: taxInfo.hsn,
        proposedGstRate: taxInfo.rate,
        taxCategory: taxInfo.category,
        taxClassificationNotes: "Pit-loom woven textile under HSN classification.",
        taxVerificationStatus: TaxVerificationStatus.APPROVED,
        approvedTaxConfig: approvedConfig,
        shippingMethod: ShippingMethod.PLATFORM_STANDARD,
        sellerDeliveryCharge: 0,
        dispatchLeadDays: 3,
        serviceableRegions: ["ALL_INDIA"],
      };

      this.products.set(enrichedProduct.id, enrichedProduct);
      for (const v of item.variants) {
        const variantId = `var_${v.sku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        this.variants.set(variantId, {
          id: variantId,
          productId: item.product.id,
          costPrice: Math.round(v.price * 0.55),
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
  public async listCategories(includeInactive = false): Promise<CategoryRecord[]> {
    const counts = await this.getCategoryProductCounts();
    return Array.from(this.categories.values())
      .filter((c) => includeInactive || c.isActive !== false)
      .map((c) => ({
        ...c,
        productCount: counts[c.id] || 0,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public async getCategoryProductCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const cat of this.categories.values()) {
      counts[cat.id] = 0;
    }

    for (const prod of this.products.values()) {
      if (prod.moderationStatus !== ProductModerationStatus.APPROVED || !prod.isActive) {
        continue;
      }
      const prodVariants = this.findVariantsByProductId(prod.id);
      const totalStock = prodVariants.reduce((sum, v) => sum + v.availableStock, 0);
      if (totalStock <= 0) continue;

      if (counts[prod.categoryId] !== undefined) {
        counts[prod.categoryId]++;
      }
    }

    return counts;
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

  public async addCategory(cat: CategoryRecord): Promise<CategoryRecord> {
    if (this.categories.has(cat.id)) {
      throw new Error(`Category ID '${cat.id}' already exists.`);
    }
    for (const existing of this.categories.values()) {
      if (existing.slug.toLowerCase() === cat.slug.toLowerCase()) {
        throw new Error(`Category slug '${cat.slug}' already exists.`);
      }
    }
    const record: CategoryRecord = {
      ...cat,
      isActive: cat.isActive !== undefined ? cat.isActive : true,
      showOnHomepage: cat.showOnHomepage !== undefined ? cat.showOnHomepage : true,
      subcategories: cat.subcategories || [],
    };
    this.categories.set(record.id, record);
    return record;
  }

  public async updateCategory(id: string, updates: Partial<CategoryRecord>): Promise<CategoryRecord> {
    const cat = this.categories.get(id);
    if (!cat) throw new Error("Category not found.");
    const updated: CategoryRecord = {
      ...cat,
      ...updates,
      id: cat.id, // Immutable ID
    };
    this.categories.set(id, updated);
    return updated;
  }

  public async toggleCategoryActive(id: string, isActive: boolean): Promise<CategoryRecord> {
    const cat = this.categories.get(id);
    if (!cat) throw new Error("Category not found.");
    cat.isActive = isActive;
    return cat;
  }

  // ------------------- PRODUCTS & VARIANTS -------------------
  public async createProduct(
    product: ProductRecord,
    variants: Omit<ProductVariantRecord, "id" | "productId">[]
  ): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] }> {
    // Validate variants pricing, cost, stock, and SKU
    for (const v of variants) {
      if (typeof v.price !== "number" || isNaN(v.price) || v.price <= 0) {
        throw new Error(`Invalid price for SKU '${v.sku}': Selling price must be a positive number.`);
      }
      if (typeof v.mrp === "number" && v.mrp < v.price) {
        throw new Error(`MRP constraint violation for SKU '${v.sku}': MRP (${v.mrp}) cannot be lower than selling price (${v.price}).`);
      }
      if (typeof v.costPrice === "number" && v.costPrice <= 0) {
        throw new Error(`Invalid cost price for SKU '${v.sku}': Cost price must be a positive number.`);
      }
      if (typeof v.availableStock !== "number" || v.availableStock < 0) {
        throw new Error(`Invalid stock quantity for SKU '${v.sku}': Available stock cannot be negative.`);
      }
      for (const existing of this.variants.values()) {
        if (existing.sku.toLowerCase() === v.sku.toLowerCase()) {
          throw new Error(`SKU constraint violation: SKU '${v.sku}' is already in use.`);
        }
      }
    }

    // Syntactic HSN validation (format + chapter)
    if (product.proposedHsn) {
      const hsnVal = validateHsnSyntax(product.proposedHsn);
      if (!hsnVal.valid) {
        throw new Error(`Invalid HSN code '${product.proposedHsn}': ${hsnVal.reason}`);
      }
    }

    // Validate proposed GST rate if provided
    if (typeof product.proposedGstRate === "number") {
      if (!PERMITTED_GST_RATES.includes(product.proposedGstRate as any)) {
        throw new Error(`Invalid GST rate '${product.proposedGstRate}': Permitted rates are 0%, 5%, 12%, 18%, 28%.`);
      }
    }

    // Ensure taxVerificationStatus defaults to PENDING_REVIEW if not set
    if (!product.taxVerificationStatus) {
      product.taxVerificationStatus = TaxVerificationStatus.PENDING_REVIEW;
    }

    // Ensure shipping defaults
    if (!product.shippingMethod) {
      product.shippingMethod = ShippingMethod.PLATFORM_STANDARD;
    }
    if (product.sellerDeliveryCharge === undefined) {
      product.sellerDeliveryCharge = 0;
    }
    if (!product.dispatchLeadDays) {
      product.dispatchLeadDays = 3;
    }
    if (!product.serviceableRegions || product.serviceableRegions.length === 0) {
      product.serviceableRegions = ["ALL_INDIA"];
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

  public async updateProduct(
    productId: string,
    updates: Partial<ProductRecord>,
    variantsUpdates?: { id?: string; sku: string; price: number; mrp?: number; costPrice?: number | null; availableStock: number; colorName?: string; colorHex?: string; sizeName?: string }[]
  ): Promise<{ product: ProductRecord; variants: ProductVariantRecord[] }> {
    const existing = this.products.get(productId);
    if (!existing) {
      throw new Error(`Product '${productId}' not found.`);
    }

    // Syntactic HSN validation if updated
    if (updates.proposedHsn !== undefined && updates.proposedHsn !== null) {
      const hsnVal = validateHsnSyntax(updates.proposedHsn);
      if (!hsnVal.valid) {
        throw new Error(`Invalid HSN code '${updates.proposedHsn}': ${hsnVal.reason}`);
      }
    }

    // Validate proposed GST rate if updated
    if (typeof updates.proposedGstRate === "number") {
      if (!PERMITTED_GST_RATES.includes(updates.proposedGstRate as any)) {
        throw new Error(`Invalid GST rate '${updates.proposedGstRate}': Permitted rates are 0%, 5%, 12%, 18%, 28%.`);
      }
    }

    // Validate shipping fields
    if (updates.sellerDeliveryCharge !== undefined && (typeof updates.sellerDeliveryCharge !== "number" || updates.sellerDeliveryCharge < 0)) {
      throw new Error("Invalid seller delivery charge: Must be a non-negative number.");
    }
    if (updates.dispatchLeadDays !== undefined && (typeof updates.dispatchLeadDays !== "number" || updates.dispatchLeadDays < 1 || updates.dispatchLeadDays > 30)) {
      throw new Error("Invalid dispatch preparation time: Must be between 1 and 30 days.");
    }

    // Explicit field-presence and material change detection for tax reapproval
    let materialTaxAttributesChanged = false;

    // Check material product-level attributes
    if (updates.proposedHsn !== undefined && updates.proposedHsn !== existing.proposedHsn) {
      materialTaxAttributesChanged = true;
    }
    if (updates.proposedGstRate !== undefined && updates.proposedGstRate !== existing.proposedGstRate) {
      materialTaxAttributesChanged = true;
    }
    if (updates.taxCategory !== undefined && updates.taxCategory !== existing.taxCategory) {
      materialTaxAttributesChanged = true;
    }
    if (updates.fabricMaterial !== undefined && updates.fabricMaterial !== existing.fabricMaterial) {
      materialTaxAttributesChanged = true;
    }
    if (updates.title !== undefined && updates.title !== existing.title) {
      materialTaxAttributesChanged = true;
    }
    if (updates.categoryId !== undefined && updates.categoryId !== existing.categoryId) {
      materialTaxAttributesChanged = true;
    }
    if (updates.subcategoryId !== undefined && updates.subcategoryId !== existing.subcategoryId) {
      materialTaxAttributesChanged = true;
    }

    // Check variant updates for price changes or variant additions
    if (Array.isArray(variantsUpdates)) {
      for (const vUp of variantsUpdates) {
        if (typeof vUp.price !== "number" || isNaN(vUp.price) || vUp.price <= 0) {
          throw new Error(`Invalid price for SKU '${vUp.sku}': Selling price must be a positive number.`);
        }
        if (typeof vUp.mrp === "number" && vUp.mrp < vUp.price) {
          throw new Error(`MRP constraint violation for SKU '${vUp.sku}': MRP (${vUp.mrp}) cannot be lower than selling price (${vUp.price}).`);
        }
        if (typeof vUp.costPrice === "number" && vUp.costPrice <= 0) {
          throw new Error(`Invalid cost price for SKU '${vUp.sku}': Cost price must be a positive number.`);
        }
        if (typeof vUp.availableStock !== "number" || vUp.availableStock < 0) {
          throw new Error(`Invalid stock quantity for SKU '${vUp.sku}': Available stock cannot be negative.`);
        }

        let existingVar = vUp.id ? this.variants.get(vUp.id) : null;
        if (!existingVar) {
          for (const ev of this.variants.values()) {
            if (ev.productId === productId && ev.sku.toLowerCase() === vUp.sku.toLowerCase()) {
              existingVar = ev;
              break;
            }
          }
        }

        if (!existingVar) {
          // New variant added to existing product requires tax review
          materialTaxAttributesChanged = true;
        } else {
          if (typeof vUp.price === "number" && vUp.price !== existingVar.price) {
            materialTaxAttributesChanged = true;
          }
          existingVar.price = vUp.price;
          if (vUp.mrp !== undefined) existingVar.mrp = vUp.mrp;
          if (vUp.costPrice !== undefined) existingVar.costPrice = vUp.costPrice;
          if (vUp.availableStock !== undefined) existingVar.availableStock = vUp.availableStock;
          if (vUp.colorName) existingVar.colorName = vUp.colorName;
          if (vUp.colorHex) existingVar.colorHex = vUp.colorHex;
          if (vUp.sizeName) existingVar.sizeName = vUp.sizeName;
        }
      }
    }

    let newTaxStatus = existing.taxVerificationStatus;
    let newApprovedTaxConfig = existing.approvedTaxConfig;

    // If material fields changed on an already-approved product, invalidate approval
    if (materialTaxAttributesChanged && existing.taxVerificationStatus === TaxVerificationStatus.APPROVED) {
      newTaxStatus = TaxVerificationStatus.PENDING_REVIEW;
      newApprovedTaxConfig = null;
    }

    const updatedProduct: ProductRecord = {
      ...existing,
      ...updates,
      taxVerificationStatus: newTaxStatus,
      approvedTaxConfig: newApprovedTaxConfig,
      updatedAt: new Date(),
    };

    this.products.set(productId, updatedProduct);

    const currentVariants = this.findVariantsByProductId(productId);
    return { product: updatedProduct, variants: currentVariants };
  }

  public async recordTaxDecision(
    productId: string,
    decision: {
      status: TaxVerificationStatus;
      approvedGstRate?: number;
      reason?: string;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
      adminUserId: string;
      reviewNotes?: string;
    }
  ): Promise<ProductRecord> {
    const product = this.products.get(productId);
    if (!product) {
      throw new Error(`Product '${productId}' not found.`);
    }

    if (decision.status === TaxVerificationStatus.APPROVED) {
      const rate = decision.approvedGstRate ?? product.proposedGstRate;
      if (typeof rate !== "number" || !PERMITTED_GST_RATES.includes(rate as any)) {
        throw new Error(`Cannot approve tax configuration: Invalid GST rate '${rate}'. Permitted rates are 0%, 5%, 12%, 18%, 28%.`);
      }

      const version = (product.approvedTaxConfig?.version || 0) + 1;
      const approvedConfig: ApprovedTaxConfig = {
        id: crypto.randomUUID(),
        productId: product.id,
        hsnCode: product.proposedHsn || "5007",
        approvedGstRate: rate,
        taxCategory: product.taxCategory || "Handloom Apparel",
        effectiveFrom: decision.effectiveFrom || new Date(),
        effectiveTo: decision.effectiveTo || null,
        approvedByUserId: decision.adminUserId,
        approvedAt: new Date(),
        decisionReason: decision.reason || "Approved by Super Admin",
        reviewNotes: decision.reviewNotes,
        version,
      };

      product.approvedTaxConfig = approvedConfig;
      product.taxVerificationStatus = TaxVerificationStatus.APPROVED;
      product.taxRejectionReason = null;
      product.taxRequestedChanges = null;
    } else if (decision.status === TaxVerificationStatus.REJECTED) {
      product.taxVerificationStatus = TaxVerificationStatus.REJECTED;
      product.taxRejectionReason = decision.reason || "Tax configuration rejected.";
    } else if (decision.status === TaxVerificationStatus.CHANGES_REQUESTED) {
      product.taxVerificationStatus = TaxVerificationStatus.CHANGES_REQUESTED;
      product.taxRequestedChanges = decision.reason || "Additional tax details requested.";
    } else if (decision.status === TaxVerificationStatus.REVERIFICATION_REQUIRED) {
      product.taxVerificationStatus = TaxVerificationStatus.REVERIFICATION_REQUIRED;
    } else if (decision.status === TaxVerificationStatus.TEMPORARILY_RESTRICTED) {
      product.taxVerificationStatus = TaxVerificationStatus.TEMPORARILY_RESTRICTED;
    }

    product.updatedAt = new Date();
    this.products.set(productId, product);
    return { ...product };
  }

  public async listTaxProposals(filter?: { status?: TaxVerificationStatus }): Promise<{ product: ProductRecord; seller: SellerProfileRecord }[]> {
    const list: { product: ProductRecord; seller: SellerProfileRecord }[] = [];
    for (const prod of this.products.values()) {
      if (filter?.status && prod.taxVerificationStatus !== filter.status) {
        continue;
      }
      const seller = this.sellerProfiles.get(prod.sellerId);
      if (seller) {
        list.push({ product: { ...prod }, seller: { ...seller } });
      }
    }
    return list;
  }

  public updatePolicyConfig(newConfig: Partial<MarketplacePolicyConfig>): MarketplacePolicyConfig {
    if (newConfig.gstRate !== undefined) {
      if (typeof newConfig.gstRate !== "number" || newConfig.gstRate < 0) {
        throw new Error("Invalid gstRate: Must be a non-negative number.");
      }
      this.policyConfig.gstRate = newConfig.gstRate;
    }
    if (newConfig.freeShippingThreshold !== undefined) {
      if (typeof newConfig.freeShippingThreshold !== "number" || newConfig.freeShippingThreshold < 0) {
        throw new Error("Invalid freeShippingThreshold: Must be a non-negative number.");
      }
      this.policyConfig.freeShippingThreshold = newConfig.freeShippingThreshold;
    }
    if (newConfig.standardShippingFee !== undefined) {
      if (typeof newConfig.standardShippingFee !== "number" || newConfig.standardShippingFee < 0) {
        throw new Error("Invalid standardShippingFee: Must be a non-negative number.");
      }
      this.policyConfig.standardShippingFee = newConfig.standardShippingFee;
    }
    if (newConfig.standardCommissionRate !== undefined) {
      if (typeof newConfig.standardCommissionRate !== "number" || newConfig.standardCommissionRate < 0 || newConfig.standardCommissionRate > 1) {
        throw new Error("Invalid standardCommissionRate: Must be between 0 and 1.");
      }
      this.policyConfig.standardCommissionRate = newConfig.standardCommissionRate;
    }
    return { ...this.policyConfig };
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
    subcategoryId?: string;
    audience?: string;
    occasion?: string;
    fabric?: string;
    searchQuery?: string;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: "price_asc" | "price_desc" | "newest";
    sellerId?: string;
  }): Promise<{ product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[]> {
    const list: { product: ProductRecord; variants: ProductVariantRecord[]; sellerStoreName: string }[] = [];

    for (const prod of this.products.values()) {
      if (prod.moderationStatus !== ProductModerationStatus.APPROVED || !prod.isActive) {
        continue;
      }

      if (filter?.categoryId) {
        let catMatches = prod.categoryId === filter.categoryId;
        if (!catMatches) {
          const cat = this.categories.get(prod.categoryId);
          if (cat && (cat.slug === filter.categoryId || cat.id === filter.categoryId)) {
            catMatches = true;
          }
        }
        if (!catMatches) continue;
      }
      if (filter?.subcategoryId) {
        let subMatches = prod.subcategoryId === filter.subcategoryId;
        if (!subMatches && prod.subcategoryId) {
          for (const cat of this.categories.values()) {
            const sub = (cat.subcategories || []).find((s) => s.id === prod.subcategoryId);
            if (sub && (sub.slug === filter.subcategoryId || sub.id === filter.subcategoryId)) {
              subMatches = true;
              break;
            }
          }
        }
        if (!subMatches) continue;
      }
      if (filter?.audience && prod.audience && prod.audience.toLowerCase() !== filter.audience.toLowerCase()) continue;
      if (filter?.sellerId && prod.sellerId !== filter.sellerId) continue;
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

      // Requirement 2: Exclude products when out of stock
      const totalStock = prodVariants.reduce((sum, v) => sum + v.availableStock, 0);
      if (totalStock <= 0) continue;

      // Requirement 2: Exclude products if their category has been deactivated
      const category = this.categories.get(prod.categoryId);
      if (category && category.isActive === false) continue;

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
      const sellerStoreName = seller?.storeName || "ICM Verified Artisan Guild";

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

  public async updateProductActiveStatus(productId: string, isActive: boolean): Promise<void> {
    const prod = this.products.get(productId);
    if (!prod) throw new Error("Product not found.");
    prod.isActive = isActive;
    prod.updatedAt = new Date();
  }

  // ------------------- CART REPRICING ENGINE -------------------
  public async repriceCart(rawItems: { variantId: string; quantity: number }[]): Promise<RepricedCart> {
    const repricedItems: RepricedCartItem[] = [];
    const validationErrors: string[] = [];
    let subtotal = 0;
    let totalTaxAmount = 0;

    // Track shipping by seller
    const sellerShippingGroups = new Map<string, { method: ShippingMethod; charge: number; itemsSubtotal: number }>();

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

      // Authoritative Tax Configuration Check
      if (
        product.taxVerificationStatus !== TaxVerificationStatus.APPROVED ||
        !product.approvedTaxConfig
      ) {
        validationErrors.push(
          `Product '${product.title}' has no approved active tax configuration and is temporarily restricted from checkout.`
        );
      } else if (
        product.approvedTaxConfig.effectiveFrom &&
        new Date() < new Date(product.approvedTaxConfig.effectiveFrom)
      ) {
        validationErrors.push(
          `Tax configuration for '${product.title}' is not yet effective (starts ${new Date(product.approvedTaxConfig.effectiveFrom).toISOString().split('T')[0]}). Checkout is restricted.`
        );
      } else if (
        product.approvedTaxConfig.effectiveTo &&
        new Date() > new Date(product.approvedTaxConfig.effectiveTo)
      ) {
        validationErrors.push(
          `Tax configuration for '${product.title}' has expired. Administrator review required.`
        );
      }

      const seller = this.sellerProfiles.get(product.sellerId);
      const isStockSufficient = variant.availableStock >= item.quantity;

      if (!isStockSufficient) {
        validationErrors.push(`Only ${variant.availableStock} units remaining for '${product.title}' (${variant.sizeName}).`);
      }

      const lineTotal = variant.price * item.quantity;
      subtotal += lineTotal;

      // Authoritative Item Tax Calculation
      const appliedTaxRate = product.approvedTaxConfig ? product.approvedTaxConfig.approvedGstRate : 0;
      const itemTaxAmount = Math.round(lineTotal * appliedTaxRate);
      totalTaxAmount += itemTaxAmount;

      // Shipping track
      const shippingMethod = product.shippingMethod || ShippingMethod.PLATFORM_STANDARD;
      const sellerDeliveryCharge = product.sellerDeliveryCharge || 0;

      if (!sellerShippingGroups.has(product.sellerId)) {
        sellerShippingGroups.set(product.sellerId, {
          method: shippingMethod,
          charge: sellerDeliveryCharge,
          itemsSubtotal: lineTotal,
        });
      } else {
        const group = sellerShippingGroups.get(product.sellerId)!;
        group.itemsSubtotal += lineTotal;
        if (shippingMethod === ShippingMethod.SELLER_MANAGED && sellerDeliveryCharge > group.charge) {
          group.charge = sellerDeliveryCharge;
        }
      }

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
        imageUrl: product.images?.[0] || undefined,
        hsnCode: product.approvedTaxConfig?.hsnCode || product.proposedHsn || undefined,
        appliedGstRate: appliedTaxRate,
        itemTaxAmount,
        shippingMethod,
        sellerDeliveryCharge,
      });
    }

    // Shipping Fee Calculation (supporting mixed shipping modes)
    let sellerManagedShippingFee = 0;
    let standardItemsSubtotal = 0;
    let hasStandardItems = false;

    for (const item of repricedItems) {
      if (item.shippingMethod === ShippingMethod.PLATFORM_STANDARD) {
        standardItemsSubtotal += item.lineTotal;
        hasStandardItems = true;
      }
    }

    for (const [, group] of sellerShippingGroups.entries()) {
      if (group.method === ShippingMethod.SELLER_MANAGED && group.charge > 0) {
        sellerManagedShippingFee += group.charge;
      }
    }

    let platformShippingFee = 0;
    if (hasStandardItems) {
      platformShippingFee = standardItemsSubtotal >= this.policyConfig.freeShippingThreshold
        ? 0
        : this.policyConfig.standardShippingFee;
    }

    const shippingFee = sellerManagedShippingFee + platformShippingFee;
    const totalAmount = subtotal + totalTaxAmount + shippingFee;

    return {
      items: repricedItems,
      subtotal,
      taxAmount: totalTaxAmount,
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
    shippingAddress: OrderAddress,
    initialPaymentStatus: OrderPaymentStatus = OrderPaymentStatus.PAID
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
      if (initialPaymentStatus === OrderPaymentStatus.PENDING) {
        v.reservedStock += item.quantity;
      }
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
      const subOrderTax = items.reduce((sum, it) => sum + (it.itemTaxAmount || 0), 0);
      const isSellerManaged = items.some((it) => it.shippingMethod === ShippingMethod.SELLER_MANAGED);
      const subOrderShipping = isSellerManaged
        ? Math.max(...items.map((it) => it.sellerDeliveryCharge || 0))
        : (repriced.shippingFee > 0 ? Math.round(repriced.shippingFee / sellerGroups.size) : 0);

      const commissionRate = this.policyConfig.standardCommissionRate; // Configurable platform commission rate
      const commissionAmount = Math.round(subtotal * commissionRate);
      const shippingReimbursement = isSellerManaged ? subOrderShipping : 0;
      const netSellerAmount = subtotal - commissionAmount + shippingReimbursement;

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
        hsnCode: it.hsnCode,
        gstRate: it.appliedGstRate,
        taxAmount: it.itemTaxAmount,
      }));

      const seller = this.sellerProfiles.get(sellerId);

      const subOrder: FulfilmentSubOrderRecord = {
        id: subOrderId,
        parentOrderId,
        sellerId,
        sellerStoreName: seller?.storeName || "Atelier Merchant",
        subOrderNumber,
        subtotal,
        taxAmount: subOrderTax,
        shippingFee: subOrderShipping,
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

      // Record accrual in seller settlement ledger only if payment is confirmed
      if (initialPaymentStatus === OrderPaymentStatus.PAID) {
        await this.recordLedgerEntry({
          id: crypto.randomUUID(),
          sellerId,
          subOrderId,
          entryType: LedgerEntryType.SALE_CREDIT,
          amount: netSellerAmount,
          balanceAfter: (await this.getSellerBalance(sellerId)) + netSellerAmount,
          referenceNote: `Net settlement for order ${subOrderNumber} (Subtotal ₹${subtotal} - ${commissionRate * 100}% commission ₹${commissionAmount})`,
          status: LedgerStatus.ACCRUED,
          createdAt: new Date(),
        });
      }
    }

    const customerOrder: CustomerOrderRecord = {
      id: parentOrderId,
      customerId,
      customerEmail,
      orderNumber,
      totalAmount: repriced.totalAmount,
      taxAmount: repriced.taxAmount,
      shippingFee: repriced.shippingFee,
      paymentStatus: initialPaymentStatus,
      shippingAddress,
      subOrders: subOrdersList,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.orders.set(parentOrderId, customerOrder);
    return customerOrder;
  }

  public async confirmOrderPayment(
    orderIdOrNumber: string,
    transactionRef: string,
    provider: string = "paytm",
    paymentDetails?: any
  ): Promise<{ order: CustomerOrderRecord; isDuplicate: boolean }> {
    let order = this.orders.get(orderIdOrNumber);
    if (!order) {
      for (const o of this.orders.values()) {
        if (o.orderNumber === orderIdOrNumber) {
          order = o;
          break;
        }
      }
    }

    if (!order) {
      throw new Error(`Order not found for reference: ${orderIdOrNumber}`);
    }

    // Idempotent duplicate protection
    if (order.paymentStatus === OrderPaymentStatus.PAID) {
      return { order: { ...order }, isDuplicate: true };
    }

    order.paymentStatus = OrderPaymentStatus.PAID;
    order.updatedAt = new Date();

    // 1. Commit inventory (release reserved hold)
    for (const sub of order.subOrders) {
      for (const item of sub.items) {
        const v = this.variants.get(item.variantId);
        if (v && v.reservedStock >= item.quantity) {
          v.reservedStock -= item.quantity;
        }
      }
    }

    // 2. Accrue seller settlements
    for (const sub of order.subOrders) {
      await this.recordLedgerEntry({
        id: crypto.randomUUID(),
        sellerId: sub.sellerId,
        subOrderId: sub.id,
        entryType: LedgerEntryType.SALE_CREDIT,
        amount: sub.netSellerAmount,
        balanceAfter: (await this.getSellerBalance(sub.sellerId)) + sub.netSellerAmount,
        referenceNote: `Net settlement for verified order ${sub.subOrderNumber} (Subtotal ₹${sub.subtotal} - ${sub.commissionRate * 100}% commission ₹${sub.commissionAmount})`,
        status: LedgerStatus.ACCRUED,
        createdAt: new Date(),
      });
    }

    // 3. Record verified payment transaction
    const txnRecord: PaymentTransactionRecord = {
      id: crypto.randomUUID(),
      orderId: order.id,
      paymentProvider: provider,
      transactionReference: transactionRef,
      amount: order.totalAmount,
      currency: "INR",
      status: OrderPaymentStatus.PAID,
      webhookSignature: paymentDetails?.signature || null,
      isReconciled: true,
      createdAt: new Date(),
    };
    this.paymentTransactions.set(txnRecord.id, txnRecord);

    this.orders.set(order.id, order);
    return { order: { ...order }, isDuplicate: false };
  }

  public async failOrderPayment(
    orderIdOrNumber: string,
    reason: string
  ): Promise<CustomerOrderRecord> {
    let order = this.orders.get(orderIdOrNumber);
    if (!order) {
      for (const o of this.orders.values()) {
        if (o.orderNumber === orderIdOrNumber) {
          order = o;
          break;
        }
      }
    }

    if (!order) {
      throw new Error(`Order not found for reference: ${orderIdOrNumber}`);
    }

    if (order.paymentStatus === OrderPaymentStatus.PAID) {
      return { ...order }; // Cannot fail a paid order
    }

    order.paymentStatus = OrderPaymentStatus.FAILED;
    order.updatedAt = new Date();

    // Release reserved inventory back to available
    for (const sub of order.subOrders) {
      for (const item of sub.items) {
        const v = this.variants.get(item.variantId);
        if (v) {
          v.availableStock += item.quantity;
          if (v.reservedStock >= item.quantity) {
            v.reservedStock -= item.quantity;
          }
        }
      }
    }

    this.orders.set(order.id, order);
    return { ...order };
  }

  public async findOrderByOrderNumber(orderNumber: string): Promise<CustomerOrderRecord | null> {
    for (const o of this.orders.values()) {
      if (o.orderNumber === orderNumber) {
        return { ...o };
      }
    }
    return null;
  }

  public async listPaymentTransactions(orderId?: string): Promise<PaymentTransactionRecord[]> {
    const list: PaymentTransactionRecord[] = [];
    for (const txn of this.paymentTransactions.values()) {
      if (!orderId || txn.orderId === orderId) {
        list.push({ ...txn });
      }
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  public async cancelSubOrder(
    subOrderId: string,
    reason: string
  ): Promise<FulfilmentSubOrderRecord> {
    const sub = this.subOrders.get(subOrderId);
    if (!sub) throw new Error("Sub-order not found.");
    if (sub.status === FulfilmentStatus.CANCELLED) {
      throw new Error("Sub-order is already cancelled.");
    }
    if (sub.status === FulfilmentStatus.DELIVERED) {
      throw new Error("Delivered sub-orders cannot be directly cancelled. Returns process must be initiated.");
    }

    sub.status = FulfilmentStatus.CANCELLED;
    sub.updatedAt = new Date();

    // 1. Restore reserved/available inventory
    for (const item of sub.items) {
      const v = this.variants.get(item.variantId);
      if (v) {
        v.availableStock += item.quantity;
        if (v.reservedStock >= item.quantity) {
          v.reservedStock -= item.quantity;
        }
      }
    }

    // 2. Reverse seller accrual in settlement ledger
    const balanceBefore = await this.getSellerBalance(sub.sellerId);
    await this.recordLedgerEntry({
      id: crypto.randomUUID(),
      sellerId: sub.sellerId,
      subOrderId,
      entryType: LedgerEntryType.RETURN_DEBIT,
      amount: sub.netSellerAmount,
      balanceAfter: balanceBefore - sub.netSellerAmount,
      referenceNote: `Cancellation & reversal for sub-order ${sub.subOrderNumber}. Reason: ${reason}`,
      status: LedgerStatus.SETTLED,
      createdAt: new Date(),
    });

    return { ...sub };
  }

  public async disburseSellerPayout(
    sellerId: string,
    amount: number,
    adminUserId: string,
    bankReference: string
  ): Promise<SettlementLedgerRecord> {
    const currentBalance = await this.getSellerBalance(sellerId);
    if (amount <= 0) throw new Error("Payout amount must be a positive number.");
    if (amount > currentBalance) {
      throw new Error(`Insufficient accrued balance (₹${currentBalance}) for requested payout of ₹${amount}.`);
    }

    const entry: SettlementLedgerRecord = {
      id: crypto.randomUUID(),
      sellerId,
      subOrderId: null,
      entryType: LedgerEntryType.PAYOUT_DISBURSEMENT,
      amount,
      balanceAfter: currentBalance - amount,
      referenceNote: `Verified bank payout disburse ref: ${bankReference}. Authorized by admin: ${adminUserId}`,
      status: LedgerStatus.SETTLED,
      createdAt: new Date(),
    };

    await this.recordLedgerEntry(entry);
    return entry;
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
