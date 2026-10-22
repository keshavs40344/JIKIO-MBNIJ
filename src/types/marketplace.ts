export enum ProductModerationStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum OrderPaymentStatus {
  PENDING = "PENDING",
  AUTHORIZED = "AUTHORIZED",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum FulfilmentStatus {
  PLACED = "PLACED",
  PROCESSING = "PROCESSING",
  DISPATCHED = "DISPATCHED",
  IN_TRANSIT = "IN_TRANSIT",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  RETURN_REQUESTED = "RETURN_REQUESTED",
  RETURNED = "RETURNED",
}

export enum LedgerEntryType {
  SALE_CREDIT = "SALE_CREDIT",
  COMMISSION_DEBIT = "COMMISSION_DEBIT",
  TAX_TCS_DEBIT = "TAX_TCS_DEBIT",
  RETURN_DEBIT = "RETURN_DEBIT",
  PAYOUT_DISBURSEMENT = "PAYOUT_DISBURSEMENT",
}

export enum LedgerStatus {
  ACCRUED = "ACCRUED",
  SETTLED = "SETTLED",
  ON_HOLD = "ON_HOLD",
}

export interface SubcategoryRecord {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId?: string | null;
  displayOrder: number;
  image?: string;
  subtitle?: string;
  merchandisingTag?: string;
  isActive: boolean;
  showOnHomepage: boolean;
  subcategories?: SubcategoryRecord[];
  productCount?: number;
}

export const STANDARDIZED_KIDS_AGE_GROUPS = [
  "2-3Y",
  "4-5Y",
  "6-7Y",
  "8-9Y",
  "10-12Y",
  "13-14Y",
] as const;

export enum TaxVerificationStatus {
  DRAFT = "DRAFT",
  PENDING_REVIEW = "PENDING_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CHANGES_REQUESTED = "CHANGES_REQUESTED",
  REVERIFICATION_REQUIRED = "REVERIFICATION_REQUIRED",
  TEMPORARILY_RESTRICTED = "TEMPORARILY_RESTRICTED",
}

export enum ShippingMethod {
  PLATFORM_STANDARD = "PLATFORM_STANDARD",
  SELLER_MANAGED = "SELLER_MANAGED",
  EXPRESS_COURIER = "EXPRESS_COURIER",
}

export const PERMITTED_GST_RATES = [0, 0.05, 0.12, 0.18, 0.28] as const;
export type PermittedGstRate = (typeof PERMITTED_GST_RATES)[number];

export const VALID_HSN_CHAPTERS = [
  "42", // Leather goods, travel ware, handbags
  "50", // Silk
  "51", // Wool & animal hair
  "52", // Cotton
  "53", // Other vegetable textile fibres, linen, jute
  "54", // Man-made filaments
  "55", // Man-made staple fibres
  "56", // Wadding, felt, special yarns
  "57", // Carpets & textile floor coverings
  "58", // Special woven fabrics, lace, tapestries, embroidery
  "59", // Impregnated/coated textile fabrics
  "60", // Knitted or crocheted fabrics
  "61", // Articles of apparel and clothing accessories (knitted/crocheted)
  "62", // Articles of apparel and clothing accessories (not knitted/crocheted)
  "63", // Other made up textile articles, sets
  "64", // Footwear, gaiters, mojaris
  "65", // Headgear, turbans, safas
  "71", // Pearls, precious stones, jewellery
  "97", // Works of art, collectors' pieces (handpainted Mithila art)
] as const;

export function validateHsnSyntax(hsn: string): { valid: boolean; reason?: string } {
  if (!hsn || !/^\d{2,8}$/.test(hsn)) {
    return { valid: false, reason: "HSN must be a 2 to 8 digit numeric code." };
  }
  const chapter = hsn.substring(0, 2);
  if (!VALID_HSN_CHAPTERS.includes(chapter as any)) {
    return {
      valid: false,
      reason: `Invalid HSN chapter '${chapter}'. Code must correspond to recognized fashion, textile, leather, jewelry, or artwork chapters (Chapters 42, 50-65, 71, 97).`,
    };
  }
  return { valid: true };
}

export interface ApprovedTaxConfig {
  id: string;
  productId: string;
  hsnCode: string;
  approvedGstRate: number; // 0, 0.05, 0.12, 0.18, 0.28
  taxCategory: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  approvedByUserId: string;
  approvedAt: Date;
  decisionReason?: string | null;
  reviewNotes?: string | null;
  substantiveReviewNotes?: string | null;
  statutoryScheduleReference?: string | null;
  supportingDocRef?: string | null;
  version: number;
}

export type KidsAgeGroup = (typeof STANDARDIZED_KIDS_AGE_GROUPS)[number];

export type ProductAudience = "WOMEN" | "MEN" | "KIDS" | "UNISEX";

export interface ProductRecord {
  id: string;
  sellerId: string;
  categoryId: string;
  subcategoryId?: string | null;
  audience?: ProductAudience;
  title: string;
  slug: string;
  description: string;
  fabricMaterial: string;
  occasion: string;
  fit: string;
  careInstructions: string;
  moderationStatus: ProductModerationStatus;
  rejectionReason?: string | null;
  brandClaim?: string | null;
  brandAuthorizationDocKey?: string | null;
  images: string[];
  isActive: boolean;
  styleTags?: string[];
  // Private Commercial & Pricing Inputs (Confidential to seller & admin)
  costPrice?: number | null;
  // Seller-Proposed Tax Configuration
  proposedHsn?: string | null;
  proposedGstRate?: number | null;
  taxCategory?: string | null;
  taxClassificationNotes?: string | null;
  taxSupportingDocKey?: string | null;
  taxVerificationStatus?: TaxVerificationStatus;
  taxRejectionReason?: string | null;
  taxRequestedChanges?: string | null;
  approvedTaxConfig?: ApprovedTaxConfig | null;
  // Shipping & Dispatch Configuration
  shippingMethod?: ShippingMethod;
  sellerDeliveryCharge?: number;
  dispatchLeadDays?: number;
  serviceableRegions?: string[];
  discountConfig?: { maxDiscountPct?: number; discountNote?: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariantRecord {
  id: string;
  productId: string;
  sku: string;
  colorName: string;
  colorHex: string;
  sizeName: string; // e.g. S, M, L, XL, XXL, Free Size
  mrp: number;
  price: number;
  costPrice?: number | null; // Private variant cost
  availableStock: number;
  reservedStock: number;
}

export interface CartItemDto {
  variantId: string;
  quantity: number;
}

export interface RepricedCartItem {
  variantId: string;
  productId: string;
  productTitle: string;
  sellerId: string;
  sellerStoreName: string;
  colorName: string;
  sizeName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  inStock: boolean;
  availableStock: number;
  imageUrl?: string;
  hsnCode?: string;
  appliedGstRate?: number;
  itemTaxAmount?: number;
  shippingMethod?: ShippingMethod;
  sellerDeliveryCharge?: number;
}

export interface RepricedCart {
  items: RepricedCartItem[];
  subtotal: number;
  taxAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: string;
  isValidForCheckout: boolean;
  validationErrors: string[];
}

export interface OrderAddress {
  recipientName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface OrderItemRecord {
  id: string;
  subOrderId: string;
  variantId: string;
  productName: string;
  color: string;
  size: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  hsnCode?: string;
  gstRate?: number;
  taxAmount?: number;
  approvedTaxConfigId?: string;
}

export interface FulfilmentSubOrderRecord {
  id: string;
  parentOrderId: string;
  sellerId: string;
  sellerStoreName: string;
  subOrderNumber: string;
  subtotal: number;
  taxAmount?: number;
  shippingFee?: number;
  commissionRate: number; // e.g. 0.12 for 12%
  commissionAmount: number;
  netSellerAmount: number;
  status: FulfilmentStatus;
  carrierName?: string | null;
  trackingNumber?: string | null;
  dispatchedAt?: Date | null;
  deliveredAt?: Date | null;
  items: OrderItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerOrderRecord {
  id: string;
  customerId: string;
  customerEmail: string;
  orderNumber: string;
  totalAmount: number;
  taxAmount: number;
  shippingFee: number;
  paymentStatus: OrderPaymentStatus;
  shippingAddress: OrderAddress;
  subOrders: FulfilmentSubOrderRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTransactionRecord {
  id: string;
  orderId: string;
  paymentProvider: string;
  transactionReference: string;
  amount: number;
  currency: string;
  status: OrderPaymentStatus;
  webhookSignature?: string | null;
  isReconciled: boolean;
  createdAt: Date;
}

export interface SettlementLedgerRecord {
  id: string;
  sellerId: string;
  subOrderId?: string | null;
  entryType: LedgerEntryType;
  amount: number;
  balanceAfter: number;
  referenceNote: string;
  status: LedgerStatus;
  createdAt: Date;
}
