import { AuthenticatedUser, UserRole } from "../types/auth.js";

export class AuthorizationError extends Error {
  public readonly statusCode: number;

  constructor(message: string = "Access denied: insufficient permissions.", statusCode: number = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export class AuthenticationRequiredError extends Error {
  public readonly statusCode: number = 401;

  constructor(message: string = "Authentication required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class RbacGuard {
  /**
   * Enforces role requirement with strict default-deny.
   */
  public static checkRole(user: AuthenticatedUser | null | undefined, allowedRoles: UserRole[]): void {
    if (!user) {
      throw new AuthenticationRequiredError();
    }

    if (!user.role || !Object.values(UserRole).includes(user.role)) {
      throw new AuthorizationError("Default-deny: Unknown or invalid user role.", 403);
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AuthorizationError(
        `Access denied. Role '${user.role}' is not authorized for this operation.`,
        403
      );
    }
  }

  /**
   * Helper to ensure seller applicant cannot perform approved seller actions.
   */
  public static assertApprovedSeller(user: AuthenticatedUser): void {
    this.checkRole(user, [UserRole.APPROVED_SELLER, UserRole.SUPER_ADMIN]);
  }

  /**
   * Helper to ensure only Super Admin can access owner-only governance.
   */
  public static assertSuperAdmin(user: AuthenticatedUser): void {
    this.checkRole(user, [UserRole.SUPER_ADMIN]);
  }
}
