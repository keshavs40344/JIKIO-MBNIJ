# Security Architecture & Operations Policy — Vespera Atelier

## 1. Core Principles: Defense-in-Depth & Privacy-by-Design
Security and privacy are foundational constraints, not post-launch add-ons. We do not claim absolute zero risk; we architect to minimize exposure probability and impact, enforce least privilege, verify all assumptions through automated negative testing, and transparently document residual risk.

---

## 2. Platform Owner Data Protection & Anonymity
1. **Zero Personal Data in Source Code:** The platform owner's legal name, private email, telephone, personal bank details, government IDs, and private addresses must NEVER exist in any codebase, configuration file, commit history, issue tracker, test fixture, or synthetic seed.
2. **Separation of Business and Personal Identity:** Public business identity (store name, grievance officer, contact email, GSTIN/registration) must be configured strictly through the secure Super Admin console or server environment variables, populated only with authorized business entity details.
3. **No Private Data in Client Bundles or Metadata:** Inspection of Next.js hydration data (`__NEXT_DATA__`), API responses, sitemaps, RSS feeds, HTML meta tags, error stack traces, and image EXIF metadata must never disclose administrative or personal identities.

---

## 3. Super Admin & Owner Account Protection
- **No Default Credentials or Public Setup Routes:** The platform will NEVER ship with `admin/admin`, default tokens, hardcoded master passwords, or reachable `/setup` or `/bootstrap` HTTP endpoints.
- **Controlled Bootstrap CLI:** Initial platform owner account bootstrap is performed strictly through an isolated, interactive, terminal-only CLI command (`npm run auth:bootstrap-owner`) requiring an out-of-band one-time cryptographic secret.
- **Mandatory Multi-Factor Authentication (MFA):** Super Admin access mandates TOTP (Time-based One-Time Password) or WebAuthn/FIDO2 passkeys.
- **Session Security:**
  - Cookies must be configured with: `HttpOnly; Secure; SameSite=Strict; Path=/; Priority=High`.
  - Cryptographic session rotation upon login, privilege escalation, and credential change.
  - Idle timeout (15 minutes for admin, 2 hours for seller, 7 days for customer) and absolute maximum session bounds.
  - Immediate server-side session revocation table lookup on every authenticated request.
- **Step-Up Verification:** High-risk actions (modifying bank payout destinations, adding staff roles, approving seller status, initiating bulk exports, altering platform commission rates) require password/MFA re-verification.

---

## 4. Multi-Tenant Authorization & Access Control Matrix

Every inbound request is authenticated and authorized strictly on the server:

| Role | Permitted Scope | Negative Test Constraint |
|---|---|---|
| **Anonymous Visitor** | Browse approved products, categories, search, public policies, guest cart | Cannot view draft/rejected products, cannot query seller internal endpoints. |
| **Customer** | View/edit own profile, addresses, wishlist, cart, own orders, initiate return on own items | Attempting to access `Order(id)` where `customerId != currentUser.id` returns `404 Not Found` (never `403` to prevent ID enumeration). |
| **Seller Applicant** | Complete own onboarding form, upload KYC documents to private bucket | Cannot list products or access order management until status == `APPROVED`. |
| **Approved Seller** | Manage own store profile, catalog, variants, stock, view own assigned sub-orders, request payouts | Attempting to access another seller's products, sub-orders, KYC docs, or ledger rows returns `404/403`. |
| **Catalog Moderator** | Review pending product submissions, brand authorization proofs, counterfeit flags | Cannot modify commission rules, cannot view seller bank accounts. |
| **Finance Operator** | Reconcile payment gateway transactions, verify settlement batches | Cannot edit products or access customer passwords/MFA tokens. |
| **Super Admin / Owner** | Complete system oversight, seller approval, role delegation, audit log review | Immutable audit log records every admin action. Sensitive data masked by default. |

---

## 5. File Upload & Private Storage Security
1. **Private Buckets by Default:** KYC documents, brand authorization letters, tax filings, and supplier invoices are stored in non-public, IAM-restricted object storage.
2. **Access via Ephemeral Signed URLs:** Authorized administrative staff and the respective document owner access documents exclusively via time-limited signed URLs (TTL: 60 seconds).
3. **MIME Sniffing & File Validation:**
   - File extensions are ignored for validation; binary magic bytes are inspected (`file-type` parser).
   - Only approved MIME types permitted: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
   - Max file size strictly enforced at reverse proxy and API boundary (e.g., 5MB for KYC docs, 10MB for product high-res images).
4. **Image Sanitization:** Product images are re-encoded through a Sharp processing pipeline to strip all EXIF/metadata, verify integrity, and generate optimized WebP/AVIF variants before landing in the public CDN bucket.

---

## 6. Payment Integrity & Idempotency
- **Zero Cardholder Data Path:** Credit card and debit card information is collected exclusively through tokenizer iframes/SDKs hosted by PCI-DSS compliant providers. The backend never handles raw PANs or CVVs.
- **Server-Side Repricing:** The frontend cart prices, discounts, and totals are considered untrusted suggestions. The backend recalculates every line item, active coupon validity, tax bracket, and shipping fee at checkout initialization.
- **Webhook Signature Verification:** Every incoming payment provider webhook is verified against a pre-shared cryptographic HMAC secret before processing. Unsigned or invalid requests are dropped immediately.
- **Idempotency Safeguards:** Webhook transaction IDs and checkout idempotency keys are stored in a dedicated `payment_transactions` unique constraint table to eliminate duplicate charges or double order fulfillment.

---

## 7. Logging & Telemetry Redaction Rules
Logs must adhere to the OWASP Logging Cheat Sheet:
- **Strictly Redacted:** Passwords, OTP codes, TOTP secrets, session cookie contents, Authorization header tokens, payment tokens, credit card last 4 digits, full bank account numbers, tax identification numbers (PAN/GSTIN), and government ID numbers.
- **Masking Standard:** Email addresses masked as `j***e@domain.com`; phone numbers masked as `+91-XXXXX-XX123`.
- **Structured JSON Logging:** Logs output machine-parseable JSON with correlation IDs (`x-request-id`), HTTP verb, response status, duration, and error codes (without stack traces in production).
