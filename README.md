# Vespera Atelier — Multi-Vendor Fashion Marketplace Foundation

A privacy-first, approval-gated fashion e-commerce marketplace platform built with TypeScript, Next.js, and PostgreSQL.

---

## 1. Architectural Baseline (Phase 3 Foundation)

This repository implements the zero-trust security and authorization foundation for Vespera Atelier:
- **Strict Role-Based Access Control (RBAC):** Explicit roles (`CUSTOMER`, `SELLER_APPLICANT`, `APPROVED_SELLER`, `CATALOG_MODERATOR`, `FINANCE_OPERATOR`, `SUPER_ADMIN`) with server-side default-deny.
- **Tenant & Account Isolation:** Mandatory server-side ownership guards ensuring Seller A cannot access Seller B's records, and Customer A cannot access Customer B's records. Access to unowned records returns HTTP 404 (preventing ID enumeration).
- **Mass Assignment Defense:** Strict DTO whitelisting using Zod. Requests attempting to alter `role`, `verificationStatus`, or financial fields are rejected.
- **Private KYC Storage Abstraction:** Upload validation with binary magic-byte sniffing (PDF, JPEG, PNG, WEBP), 5MB size limits, opaque UUID keys, and time-limited signed URLs (TTL 60s). Transparently reports provider status (`ACTIVE` vs `BLOCKED_AWAITING_CONFIG`).
- **Sanitized Security Audit Logging:** Centralized redaction interceptor removing passwords, session tokens, OTPs, raw documents, and masking personal PII before writing audit events.
- **Controlled Super Admin Bootstrap CLI:** Zero default passwords or public setup endpoints. The first Super Admin is provisioned strictly through an interactive CLI requiring an out-of-band token and mandatory MFA setup.

---

## 2. Local Setup & Execution Guide (Privacy-Safe)

> **Important:** Never share your local passwords, production credentials, personal email, or tax documents in terminal logs or chat.

### Prerequisites
- Node.js >= 20 (Tested on Node.js v24.18.0)
- npm >= 10 (Tested on npm 11.16.0)
- PostgreSQL 16+ (Optional for local unit tests; required for persistent DB runs)

### Installation
```bash
# Clone the private repository
git clone <private-repo-url>
cd taecjlicmmadhubani

# Install dependencies
npm install
```

### Environment Configuration
Copy the sanitized environment template:
```bash
cp .env.example .env
```
Edit `.env` locally with your private database credentials and secrets. `.env` is strictly ignored by `.gitignore` and must never be committed.

### Database Setup & Migrations
The foundational schema is located in `prisma/schema.prisma`.
```bash
# Generate Prisma Client
npx prisma generate

# Apply migrations to your local PostgreSQL instance
npx prisma migrate dev --name init_foundation
```

### Running Tests, Typecheck & Build
```bash
# Execute the automated security and authorization test suite
npm test

# Run TypeScript type check
npm run typecheck

# Build TypeScript distributions
npm run build
```

---

## 3. Super Admin CLI Bootstrap Procedure

To initialize the platform owner / Super Admin account without exposing credentials:

1. Ensure `OWNER_BOOTSTRAP_INVITE_TOKEN` is set in your local `.env`.
2. Run the secure terminal bootstrap command:
   ```bash
   npm run auth:bootstrap-owner
   ```
3. Enter the bootstrap token, operational admin email, and a strong password (minimum 12 characters with uppercase, lowercase, numbers, and special symbols).
4. The CLI provisions the account with mandatory MFA enabled and records a security audit event.

---

## 4. Phase 3 Verification Status Matrix

| Control Category | Implementation & Verification Status | Evidence / Notes |
|---|---|---|
| **Identity & Passwords** | **IMPLEMENTED AND TESTED** | `PasswordService` with bcrypt rounds 12, complexity validator, verified in `foundation-security.test.ts`. |
| **RBAC Default-Deny** | **IMPLEMENTED AND TESTED** | `RbacGuard` enforces explicit roles; anonymous rejected with 401, customer denied admin with 403. |
| **Seller & Customer Isolation** | **IMPLEMENTED AND TESTED** | `OwnershipGuard` verifies subject ownership; cross-tenant access returns 404. |
| **Mass Assignment Protection** | **IMPLEMENTED AND TESTED** | `MassAssignmentGuard` & Zod DTOs reject role/status manipulation payloads. |
| **Session Revocation** | **IMPLEMENTED AND TESTED** | `SessionManager` table validates active, expired, and revoked sessions. |
| **Private KYC Storage** | **IMPLEMENTED AND TESTED** | `SafeStorageService` validates binary signatures, generates UUID keys & signed URLs. |
| **Audit Log Redaction** | **IMPLEMENTED AND TESTED** | `AuditLogger` deeply sanitizes secrets, masks email PII, and hashes IP addresses. |
| **Super Admin CLI Bootstrap** | **IMPLEMENTED AND TESTED** | `bootstrap-owner.ts` CLI tool verified against weak passwords and invalid tokens. |
| **Cloud S3 Object Storage** | **BLOCKED (Awaiting Cloud Credentials)** | `S3StorageProvider` explicitly throws `StorageUnavailableError` when cloud keys are unset; no fake uploads. |
| **Production PostgreSQL Instance** | **IMPLEMENTED, NOT FULLY TESTED** | `prisma/schema.prisma` defined for PostgreSQL; migrations ready; test suite executed on foundation repo. |
| **Marketplace Catalog & Checkout** | **SPECIFIED, NOT IMPLEMENTED** | Deferred to subsequent phases (Phase 4–8) per design roadmap. |
