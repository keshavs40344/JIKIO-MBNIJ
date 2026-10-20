# Threat Model & Attack Surface Analysis — Vespera Atelier
*Frameworks: STRIDE, OWASP Top 10 (2021), OWASP API Security Top 10 (2023)*

---

## 1. System Attack Surface & Assets Under Protection

### High-Value Targets (Assets)
1. **Platform Owner Anonymity & Account Access:** Elevation of privilege to Super Admin, hijacking platform policy, altering payout routes.
2. **Seller Tenant Isolation & Business Data:** Competitor reconnaissance (accessing competitor sales velocity, price margins, customer names).
3. **Customer Personal Data & Order Records:** BOLA/IDOR leakage of customer shipping addresses, phone numbers, purchase histories.
4. **Financial Integrity:** Price tampering in checkout, coupon stacking abuse, fake webhook injections marking orders paid without payment, settlement ledger inflation.
5. **Inventory Consistency:** Race conditions causing stock overselling during flash sales or festive promotions.

---

## 2. STRIDE Threat Analysis & Mitigation Controls

| STRIDE Category | Threat Scenario | Impact | Mitigation Engineering Control | Automated Test Verification |
|---|---|---|---|---|
| **Spoofing** | Attacker impersonates payment gateway webhook to mark unpaid orders as `PAID`. | Financial loss, unauthorized shipment. | Enforce HMAC-SHA256 signature verification over raw request body; replay timestamp tolerance window (<5 mins). | Send forged webhook payload with invalid signature -> assert HTTP 401. |
| **Tampering** | Customer modifies product price or discount percentage in client-side payload before order placement. | Fraudulent orders placed at discount/zero cost. | Zero client trust. Reprice every SKU from authoritative database at the moment of order creation. | Submit checkout request with price altered to `1.00` -> assert backend charges canonical DB price. |
| **Repudiation** | Seller claims platform admin changed their bank account or withheld payout. | Dispute, legal liability. | Cryptographically signed, immutable audit log table recording `actor_id`, `actor_role`, `ip_hash`, `timestamp`, `before_state`, `after_state`. | Trigger sensitive setting change -> assert audit log entry generated with matching actor. |
| **Information Disclosure** | Seller A queries `/api/v1/seller/orders/:id` for an order belonging to Seller B (BOLA/IDOR). | Competitive intelligence breach, privacy violation. | Mandatory multi-tenant scoped SQL queries (`WHERE order_id = :id AND seller_id = :authenticated_seller_id`). | Authenticate as Seller A, request Seller B's sub-order -> assert HTTP 404 (Not Found). |
| **Denial of Service** | Botnet floods product search or login endpoint with brute-force attempts. | Server exhaustion, account takeover. | In-memory / Redis sliding-window rate limiting; per-IP and per-account thresholds; CAPTCHA step-up on failed attempts. | Exceed 5 failed login attempts in 1 minute -> assert HTTP 429 Too Many Requests. |
| **Elevation of Privilege** | Normal customer adds `"role": "SUPER_ADMIN"` or `"role": "SELLER"` in profile update payload (Mass Assignment). | Full platform compromise. | Strict DTO allowlists using `class-validator` / Zod (`whitelist: true, forbidNonWhitelisted: true`). Roles are immutable via user APIs. | Send PUT `/api/v1/customer/profile` with extra `role` field -> assert field is stripped/rejected. |

---

## 3. High-Risk Fashion Marketplace Specific Vectors

### A. Inventory Overselling & Concurrency Race Conditions
- **Attack / Failure Mode:** Multiple buyers simultaneously checkout the final unit of a limited-edition designer bridal lehenga.
- **Mitigation:** Transactional inventory decrement using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) or atomic SQL decrement (`UPDATE product_variants SET stock = stock - :qty WHERE id = :id AND stock >= :qty`). If rows affected == 0, rollback order and return out-of-stock notification.

### B. Counterfeit Goods & Brand Misrepresentation
- **Attack / Failure Mode:** Unverified seller lists unauthorized replicas of luxury designer garments or uses misleading brand claims.
- **Mitigation:**
  - Decoupled onboarding: Seller verification != Listing permission.
  - Mandatory brand authorization document upload for curated/luxury fashion tiers.
  - Gated publication pipeline: Status must progress through `DRAFT` -> `SUBMITTED` -> `UNDER_REVIEW` -> `APPROVED_BY_ADMIN` before appearing on the public customer storefront.

### C. Insecure Direct Object References (IDOR) on Verification Documents
- **Attack / Failure Mode:** Attacker enumerates URLs to download competitor tax certificates or identity proofs.
- **Mitigation:** Non-sequential UUIDv4 file identifiers stored in private non-public S3 buckets. Endpoints generating pre-signed download URLs require strict owner or admin authorization checks.
