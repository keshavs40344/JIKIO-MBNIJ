import { AuthenticatedUser, UserRole } from "../types/auth.js";

export class ResourceNotFoundError extends Error {
  public readonly statusCode: number = 404;

  constructor(message: string = "Resource not found.") {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

export class OwnershipGuard {
  /**
   * Enforces customer isolation.
   * If the resource does not belong to the calling customer, throws 404
   * (never 403 to prevent resource ID enumeration).
   */
  public static assertCustomerOwnership(
    user: AuthenticatedUser,
    resourceOwnerCustomerId: string,
    resourceName: string = "Record"
  ): void {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Platform Owner authorized for escalation & dispute resolution
    }

    if (user.userId !== resourceOwnerCustomerId) {
      // Intentionally return 404 instead of 403 to prevent existence probing
      throw new ResourceNotFoundError(`${resourceName} not found.`);
    }
  }

  /**
   * Enforces seller tenant isolation.
   * If the resource does not belong to the calling seller, throws 404.
   */
  public static assertSellerOwnership(
    user: AuthenticatedUser,
    resourceOwnerSellerId: string,
    resourceName: string = "Resource"
  ): void {
    if (user.role === UserRole.SUPER_ADMIN) {
      return; // Platform Owner authorized for moderation & review
    }

    if (!user.sellerId || user.sellerId !== resourceOwnerSellerId) {
      // Intentionally return 404 instead of 403 to prevent cross-seller enumeration
      throw new ResourceNotFoundError(`${resourceName} not found.`);
    }
  }
}
