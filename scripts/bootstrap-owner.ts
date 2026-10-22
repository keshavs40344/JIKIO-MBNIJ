#!/usr/bin/env tsx
import crypto from "crypto";
import readline from "readline";
import { PasswordService } from "../src/auth/password.service.js";
import { MfaService } from "../src/auth/mfa.service.js";
import { FoundationRepository } from "../src/database/repository.js";
import { UserRole } from "../src/types/auth.js";

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function bootstrapSuperAdmin(
  repo: FoundationRepository,
  providedToken?: string,
  providedEmail?: string,
  providedPassword?: string
): Promise<{ success: boolean; message: string; userId?: string; totpSecret?: string }> {
  const expectedToken = process.env.OWNER_BOOTSTRAP_INVITE_TOKEN;

  if (!expectedToken || expectedToken.includes("placeholder")) {
    return {
      success: false,
      message: "Bootstrap failed: OWNER_BOOTSTRAP_INVITE_TOKEN must be securely configured in environment.",
    };
  }

  const token = providedToken || (await prompt("Enter Owner Bootstrap Secret Token: "));

  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))) {
    return {
      success: false,
      message: "Bootstrap failed: Invalid bootstrap token. Access denied.",
    };
  }

  const email = providedEmail || (await prompt("Enter Super Admin operational email (e.g. ops@domain.com): "));
  if (!email || !email.includes("@")) {
    return { success: false, message: "Bootstrap failed: Valid email is required." };
  }

  // Check if super admin already exists
  const existing = await repo.findUserByEmail(email);
  if (existing) {
    return { success: false, message: "Bootstrap failed: Account already exists." };
  }

  const password = providedPassword || (await prompt("Enter Super Admin initial password (min 12 chars, upper, lower, digit, symbol): "));
  const validation = PasswordService.validateComplexity(password, true);
  if (!validation.valid) {
    return { success: false, message: `Bootstrap failed: ${validation.message}` };
  }

  const passwordHash = await PasswordService.hash(password);
  const totpSecret = MfaService.generateTotpSecret();

  const user = await repo.createUser({
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    phone: null,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    isActive: true,
    isMfaEnabled: true,
    mfaSecret: totpSecret,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    success: true,
    message: "Super Admin account successfully bootstrapped with mandatory MFA enabled.",
    userId: user.id,
    totpSecret,
  };
}

// Direct execution from CLI
if (process.argv[1]?.endsWith("bootstrap-owner.ts")) {
  const repo = new FoundationRepository();
  bootstrapSuperAdmin(repo)
    .then((result) => {
      if (result.success) {
        console.log(`[BOOTSTRAP SUCCESS] ${result.message}`);
        console.log(`User ID: ${result.userId}`);
        process.exit(0);
      } else {
        console.error(`[BOOTSTRAP ERROR] ${result.message}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[BOOTSTRAP FATAL]", err.message);
      process.exit(1);
    });
}
