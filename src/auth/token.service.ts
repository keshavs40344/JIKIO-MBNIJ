import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AuthenticatedUser, UserRole } from "../types/auth.js";

export class TokenService {
  private readonly jwtSecret: string;
  private readonly expiresIn: string;

  constructor(jwtSecret: string = process.env.JWT_SECRET || "fallback-test-secret-min-32-chars-long", expiresIn: string = "15m") {
    this.jwtSecret = jwtSecret;
    this.expiresIn = expiresIn;
  }

  public signAccessToken(payload: Omit<AuthenticatedUser, "sessionId"> & { sessionId: string }): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.expiresIn as jwt.SignOptions["expiresIn"],
      algorithm: "HS256",
    });
  }

  public verifyAccessToken(token: string): AuthenticatedUser {
    const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload & {
      userId: string;
      email: string;
      role: UserRole;
      sessionId: string;
      sellerId?: string | null;
    };

    if (!decoded.userId || !decoded.role || !decoded.sessionId) {
      throw new Error("Invalid token claims.");
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
      sellerId: decoded.sellerId,
    };
  }

  /**
   * Computes SHA-256 hash of a session token for secure database indexing.
   */
  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
