# Privacy Threat Model & Data Protection Analysis — Vespera Atelier
*Document Version: 1.0 — Phase 3 Foundation Baseline*

---

## 1. Data Minimization & Sensitivity Tiers

Vespera Atelier enforces data minimization at every layer. Only data strictly required for marketplace operation, tax compliance, and order fulfillment is collected. Highly sensitive government identity documents (e.g., Aadhaar) are **NOT** collected by default.

### Data Inventory & Handling Specification

| Data Subject & Asset | Specific Elements Collected | Purpose & Justification | Access Control Boundary | Storage Location & Encryption | Retention Period | Deletion & Anonymization Strategy |
|---|---|---|---|---|---|---|
| **Platform Owner Identity** | System administrative alias, secure contact channel reference. *(No personal legal name, private home address, or personal bank details).* | Platform administration, emergency break-glass alerts. | Super Admin internal scope only. | Out-of-band environment variables / Key Vault; never stored in public DB tables. | Operational lifespan. | Revoked upon platform shutdown or admin handover. |
| **Customer Identity & Auth** | Email address, mobile number (for OTP verification), Argon2id/bcrypt password hash. | Account creation, login, order confirmation, security notifications. | Customer (own), Auth Service. | PostgreSQL `users` table; encrypted at rest; salted and hashed credentials. | Active account tenure + 180 days after deletion request. | Hard delete of credentials and sessions; email/phone pseudonymous hash retained to prevent reuse abuse. |
| **Customer Delivery & PII** | Full name, delivery address, postal PIN code, contact phone. | Physical order dispatch, courier coordination, GST invoice generation. | Customer (own), Assigned Seller (order-specific), Logistics Carrier. | PostgreSQL `addresses` and `orders` tables; encrypted at rest. | 7 years (statutory requirement under Indian GST and Companies Act). | Customer PII anonymized post-retention; order monetary amounts retained for financial ledgers. |
| **Seller Business & KYC** | Entity trade name, business registration certificate, Business PAN (Permanent Account Number), GSTIN, cancelled bank cheque. | Legal onboarding, merchant authenticity verification, Tax Collected at Source (TCS) reporting. | Super Admin, Authorized Finance Ops, Seller (own). | Private S3-compatible Object Storage (`marketplace-private-kyc`) with non-guessable UUID keys. | Duration of active merchant relationship + 8 years post-termination (audit requirement). | Physical document files purged via automated bucket lifecycle policy; metadata tombstoned. |
| **Seller Payout & Bank Data** | Bank account number, IFSC code, account holder/beneficiary name. | Disbursement of approved sales settlements after commission deductions. | Seller (own), Finance Operator, Super Admin. | PostgreSQL `seller_bank_profiles` table; column-level AES-256 encryption. | 8 years (statutory banking and financial ledger audit rules). | Masked upon seller account termination; ledger transaction IDs preserved. |
| **Payment Provider Data** | Payment intent ID, transaction reference, payment status, payment method category (e.g., UPI, Card token). *(Zero raw card numbers, expiry dates, or CVVs).* | Reconcile payment status, process refunds, idempotency verification. | Customer (own order status), Finance Operator, Super Admin. | PostgreSQL `payment_transactions` table; encrypted at rest. | 8 years (statutory audit requirement). | Retained in financial ledger. |
| **System & Security Logs** | IP address (pseudonymized), User-Agent, endpoint accessed, HTTP status, request correlation ID, timestamp. | Abuse detection, rate limiting, security auditing, incident forensics. | Security Operations, Infrastructure Admins. | Encrypted log aggregator / append-only file storage. | 90 days active retention; 1 year archived. | Automated rotation and rolling purge. |
| **Database Backups** | Full encrypted database snapshots and Write-Ahead Logs (WAL). | Disaster recovery, business continuity. | Restricted Cloud DevOps Engineers only. | Encrypted cloud backup bucket with strict IAM and object locking. | 30 days rolling snapshots; 7 days point-in-time recovery. | Automated automated retention expiration. |

---

## 2. Threat Analysis & Vector Assessment

### Threat 1: Accidental Git Exposure of Secrets or PII
- **Description:** Developer or build script commits `.env` files, production database connection strings, payment gateway keys, or test fixtures containing real personal data to Git.
- **Mitigation:**
  - Comprehensive `.gitignore` pattern blocking all variations of `.env*` (except sanitized `.env.example`).
  - Pre-commit and CI automated secret scanners (e.g., Gitleaks, TruffleHog).
  - Explicit rule prohibiting synthetic test fixtures from using real human names, real phone numbers, or real government ID formats.
- **Verification Test:** Automated CI script scanning git history and repository files for secret patterns and high-entropy strings.
- **Residual Risk:** Low, assuming pre-commit hooks and CI gates are maintained.

### Threat 2: Broken Object-Level Authorization (BOLA / IDOR)
- **Description:** A customer modifies the order ID in `GET /api/v1/customer/orders/:id` to inspect another customer's delivery address and phone number, or Seller A queries `GET /api/v1/seller/orders/:id` to inspect Seller B's sales data.
- **Mitigation:**
  - Mandatory server-side ownership filters on all database queries:
    - Customer query: `WHERE id = :orderId AND customer_id = :authUserId`
    - Seller query: `WHERE id = :subOrderId AND seller_id = :authSellerId`
  - Endpoint returns generic `404 Not Found` (never `403 Forbidden`) when resource does not belong to the caller, preventing resource existence enumeration.
- **Verification Test:** Automated negative integration test where Customer A attempts to fetch Customer B's order, and Seller A attempts to fetch Seller B's sub-order.
- **Residual Risk:** Minimal, verified through mandatory negative regression tests.

### Threat 3: Mass Assignment / Privilege Escalation
- **Description:** An attacker submits `"role": "SUPER_ADMIN"`, `"verification_status": "APPROVED"`, or `"commission_rate": 0` in public profile or onboarding update payloads.
- **Mitigation:**
  - Strict Data Transfer Object (DTO) validation using schema validation (`whitelist: true`, `forbidNonWhitelisted: true`).
  - Separation of mutation models: User profile update DTO only accepts display name and preferences. Role, status, and financial fields are omitted entirely from public update schemas.
- **Verification Test:** Send `PATCH /api/v1/customer/profile` with `{ "role": "SUPER_ADMIN" }` and assert HTTP 400 rejection or role field silently stripped with role unmodified.
- **Residual Risk:** Negligible with strict DTO whitelisting.

### Threat 4: Unauthorized Access to Private KYC Documents
- **Description:** Competitor or unauthorized actor guesses or traverses file paths to view another seller's uploaded business registration or bank cheque.
- **Mitigation:**
  - Private storage bucket with zero public read permissions.
  - Server-generated opaque UUIDv4 storage keys (e.g., `kyc/e892c5a1-77e4-4d76-8f2c-9a0d8e87483d.pdf`).
  - Download access requires an ephemeral, time-limited signed URL (TTL <= 60 seconds) generated only after server verifies caller is Super Admin or the document owner.
- **Verification Test:** Unauthenticated request to document URL returns HTTP 401; non-owner seller request returns HTTP 404/403.
- **Residual Risk:** Depends on storage provider credentials staying confidential.

### Threat 5: Telemetry & Log Leakage
- **Description:** Backend error handlers dump full stack traces, SQL queries, authorization headers, or request bodies containing passwords, OTPs, or KYC metadata into application logs.
- **Mitigation:**
  - Global logging interceptor with strict allowlist and regex-based redaction filters for fields named `password`, `token`, `secret`, `authorization`, `otp`, `pan`, `accountNumber`.
  - Generic production error responses masking internal database details.
- **Verification Test:** Submit failed login with sample password; inspect log output and assert password string is replaced with `[REDACTED]`.
- **Residual Risk:** Low with centralized redaction interceptor.

### Threat 6: Compromised Administrative Accounts
- **Description:** An attacker acquires Super Admin credentials via phishing or credential stuffing, accessing all marketplace records.
- **Mitigation:**
  - Super Admin accounts strictly require Multi-Factor Authentication (MFA / TOTP) before granting session tokens.
  - No default administrative accounts or setup routes. Initial account created strictly via interactive CLI bootstrap.
  - Privileged actions (seller approval, bank changes, bulk data exports) generate immutable audit log records.
- **Verification Test:** Attempting admin login without MFA token fails with HTTP 401/403; failed admin logins trigger security audit alerts.
- **Residual Risk:** Medium, mitigated by mandatory MFA and rapid session revocation.

---

## 3. Incident Response & Breach Management Runbook

In the event of a suspected privacy breach or security incident:

1. **Identification & Containment (Immediate):**
   - Isolate affected services or rotate compromised credentials immediately.
   - Revoke active sessions for affected accounts via server-side session revocation table (`REVOKED_SESSIONS`).
   - If an API key or storage credential is leaked, immediately revoke it in the cloud provider console and redeploy rotated secrets.
2. **Investigation & Scope Assessment (Within 24 Hours):**
   - Analyze immutable security audit logs to determine the precise data records accessed, modified, or exported.
   - Confirm whether personal data was exposed and identify the category of affected data principals (customers, sellers).
3. **Notification & Legal Escalation (Within 72 Hours):**
   - In accordance with the Digital Personal Data Protection Act, 2023, notify the Data Protection Board of India and affected data principals in the prescribed form and manner if personal data is breached.
   - Maintain a complete incident log detailing timeline, root cause, containment actions, and remediation.
4. **Post-Mortem & Control Hardening:**
   - Implement regression test cases replicating the attack vector to prevent recurrence.
   - Update threat model and conduct dependency/security audit before resuming regular operations.
