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
import { ISessionRepository } from "../auth/session-manager.js";
import { IAuditRepository } from "../audit/audit-logger.js";

export class FoundationRepository implements ISessionRepository, IAuditRepository {
  private users: Map<string, UserRecord> = new Map();
  private sessions: Map<string, SessionRecord> = new Map();
  private sellerProfiles: Map<string, SellerProfileRecord> = new Map();
  private sellerDocuments: Map<string, SellerDocumentRecord> = new Map();
  private auditEvents: SecurityAuditEventRecord[] = [];

  // ------------------- USER REPOSITORY -------------------
  public async createUser(user: UserRecord): Promise<UserRecord> {
    // Unique email enforcement
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
