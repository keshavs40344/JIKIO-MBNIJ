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

export interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId?: string | null;
  displayOrder: number;
}

export interface ProductRecord {
  id: string;
  sellerId: string;
  categoryId: string;
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
}

export interface FulfilmentSubOrderRecord {
  id: string;
  parentOrderId: string;
  sellerId: string;
  sellerStoreName: string;
  subOrderNumber: string;
  subtotal: number;
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
