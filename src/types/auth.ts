export enum UserRole {
  CUSTOMER = "CUSTOMER",
  SELLER_APPLICANT = "SELLER_APPLICANT",
  APPROVED_SELLER = "APPROVED_SELLER",
  CATALOG_MODERATOR = "CATALOG_MODERATOR",
  FINANCE_OPERATOR = "FINANCE_OPERATOR",
  SUPER_ADMIN = "SUPER_ADMIN",
}

export enum VerificationStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  MORE_INFO_REQUIRED = "MORE_INFO_REQUIRED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum DocumentType {
  GST_CERTIFICATE = "GST_CERTIFICATE",
  BUSINESS_PAN = "BUSINESS_PAN",
  BANK_CANCELLED_CHEQUE = "BANK_CANCELLED_CHEQUE",
  BRAND_AUTHORIZATION_LETTER = "BRAND_AUTHORIZATION_LETTER",
  SUPPLIER_INVOICE = "SUPPLIER_INVOICE",
}

export interface UserRecord {
  id: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  isMfaEnabled: boolean;
  mfaSecret?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  ipHash?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

export interface SellerProfileRecord {
  id: string;
  userId: string;
  storeName: string;
  businessGstin?: string | null;
  businessPan?: string | null;
  registeredAddress?: string | null;
  verificationStatus: VerificationStatus;
  rejectionReason?: string | null;
  verifiedAt?: Date | null;
  verifiedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SellerDocumentRecord {
  id: string;
  sellerId: string;
  documentType: DocumentType;
  privateStorageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  verificationStatus: VerificationStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
}

export interface SecurityAuditEventRecord {
  id: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  ipHash?: string | null;
  detailsSanitized: Record<string, unknown>;
  createdAt: Date;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  sellerId?: string | null;
}
