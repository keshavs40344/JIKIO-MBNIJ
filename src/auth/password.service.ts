import bcrypt from "bcryptjs";

export class PasswordService {
  private static readonly BCRYPT_ROUNDS = 12;

  /**
   * Hashes a plaintext password using bcrypt with salt factor 12.
   */
  public static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  /**
   * Timing-safe password verification.
   */
  public static async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates password strength policy.
   * Privileged accounts (Owner/Admin) require min 12 characters and complexity.
   */
  public static validateComplexity(password: string, isPrivileged: boolean = false): { valid: boolean; message?: string } {
    if (!password || password.length < 8) {
      return { valid: false, message: "Password must be at least 8 characters long." };
    }

    if (isPrivileged) {
      if (password.length < 12) {
        return { valid: false, message: "Privileged accounts require a minimum password length of 12 characters." };
      }
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);

      if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        return {
          valid: false,
          message: "Privileged passwords must contain uppercase, lowercase, number, and special character.",
        };
      }
    }

    return { valid: true };
  }
}
