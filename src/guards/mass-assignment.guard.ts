import { z } from "zod";

export class ValidationError extends Error {
  public readonly statusCode: number = 400;
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

// Protected system fields that must NEVER be accepted in public update schemas
const FORBIDDEN_PRIVILEGED_FIELDS = [
  "role",
  "verificationStatus",
  "sellerId",
  "commissionRate",
  "payoutDetails",
  "isMfaEnabled",
  "rejectionReason",
  "verifiedByUserId",
  "passwordHash",
] as const;

/**
 * Customer Profile Update Schema — strict whitelist.
 */
export const CustomerProfileUpdateSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone format").optional(),
    preferences: z
      .object({
        receiveTransactionalSms: z.boolean().optional(),
        receiveEmailAlerts: z.boolean().optional(),
      })
      .optional(),
  })
  .strict(); // Rejects any unlisted keys

/**
 * Seller Onboarding DTO Schema — strict whitelist.
 */
export const SellerOnboardingSchema = z
  .object({
    storeName: z.string().min(2).max(100),
    businessGstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format").optional(),
    businessPan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format").optional(),
    registeredAddress: z.string().min(5).max(300),
  })
  .strict(); // Rejects any unlisted keys (e.g. status cannot be injected)

export class MassAssignmentGuard {
  /**
   * Scans a raw request body for attempts to manipulate forbidden privileged fields.
   */
  public static assertNoPrivilegedFields(payload: Record<string, unknown>): void {
    if (!payload || typeof payload !== "object") return;

    for (const key of Object.keys(payload)) {
      if ((FORBIDDEN_PRIVILEGED_FIELDS as readonly string[]).includes(key)) {
        throw new ValidationError(`Mass assignment rejected: field '${key}' is prohibited in public requests.`);
      }
    }
  }

  /**
   * Sanitizes and parses customer profile update payload.
   */
  public static sanitizeCustomerProfile(payload: unknown): z.infer<typeof CustomerProfileUpdateSchema> {
    const result = CustomerProfileUpdateSchema.safeParse(payload);
    if (!result.success) {
      throw new ValidationError("Invalid customer profile payload.", result.error.format());
    }
    return result.data;
  }

  /**
   * Sanitizes and parses seller onboarding payload.
   */
  public static sanitizeSellerOnboarding(payload: unknown): z.infer<typeof SellerOnboardingSchema> {
    const result = SellerOnboardingSchema.safeParse(payload);
    if (!result.success) {
      throw new ValidationError("Invalid seller onboarding payload.", result.error.format());
    }
    return result.data;
  }
}
