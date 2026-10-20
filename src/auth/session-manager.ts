import { SessionRecord } from "../types/auth.js";

export interface ISessionRepository {
  createSession(session: SessionRecord): Promise<void>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeAllUserSessions(userId: string): Promise<void>;
}

export class SessionManager {
  constructor(private readonly sessionRepo: ISessionRepository) {}

  public async validateSession(sessionId: string): Promise<{ valid: boolean; reason?: string }> {
    const session = await this.sessionRepo.findSessionById(sessionId);

    if (!session) {
      return { valid: false, reason: "Session not found." };
    }

    if (session.revokedAt) {
      return { valid: false, reason: "Session has been revoked." };
    }

    if (new Date() > new Date(session.expiresAt)) {
      return { valid: false, reason: "Session has expired." };
    }

    return { valid: true };
  }

  public async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepo.revokeSession(sessionId);
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionRepo.revokeAllUserSessions(userId);
  }
}
