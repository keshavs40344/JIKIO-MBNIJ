import crypto from "crypto";
import { SecurityAuditEventRecord, UserRole } from "../types/auth.js";

export interface IAuditRepository {
  recordEvent(event: SecurityAuditEventRecord): Promise<void>;
  queryEvents(filter: { actorId?: string; action?: string; limit?: number }): Promise<SecurityAuditEventRecord[]>;
}

// Sensitive keys that must NEVER be written to audit logs
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /otp/i,
  /pan/i,
  /accountnumber/i,
  /cvv/i,
  /cardnumber/i,
  /rawfile/i,
  /documentcontent/i,
];

export class AuditLogger {
  constructor(private readonly auditRepo: IAuditRepository) {}

  /**
   * Deeply sanitizes an object, replacing sensitive keys and high-risk PII with [REDACTED].
   */
  public static sanitizePayload(obj: unknown): Record<string, unknown> {
    if (!obj || typeof obj !== "object") {
      return {};
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      if (isSensitiveKey) {
        sanitized[key] = "[REDACTED]";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        sanitized[key] = this.sanitizePayload(value);
      } else if (typeof value === "string") {
        // Redact email addresses to j***e@domain.com
        if (value.includes("@") && value.includes(".")) {
          const [user, domain] = value.split("@");
          sanitized[key] = `${user[0]}***${user[user.length - 1]}@${domain}`;
        } else {
          sanitized[key] = value;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Hashes client IP to ensure GDPR/DPDP pseudonymization.
   */
  public static hashIp(ip: string | undefined): string | null {
    if (!ip) return null;
    return crypto.createHash("sha256").update(ip + "vespera_salt").digest("hex").substring(0, 16);
  }

  /**
   * Records an audit event with sanitized details.
   */
  public async logSecurityEvent(params: {
    actorId: string | null;
    actorRole: UserRole | string;
    action: string;
    targetType: string;
    targetId: string | null;
    clientIp?: string;
    details?: Record<string, unknown>;
  }): Promise<SecurityAuditEventRecord> {
    const record: SecurityAuditEventRecord = {
      id: crypto.randomUUID(),
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      ipHash: AuditLogger.hashIp(params.clientIp),
      detailsSanitized: AuditLogger.sanitizePayload(params.details),
      createdAt: new Date(),
    };

    await this.auditRepo.recordEvent(record);
    return record;
  }
}
