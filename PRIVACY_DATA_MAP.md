# Privacy Data Map & Regulatory Compliance Plan — Vespera Atelier
*Prepared under Privacy-by-Design Principles and the Digital Personal Data Protection Act (DPDP), 2023 & DPDP Rules, 2025.*

---

## 1. Regulatory Context & Legal Basis
Vespera Atelier acts as a **Data Fiduciary** for customer data and marketplace operations. In compliance with the Digital Personal Data Protection Act, 2023, personal data is processed strictly for:
1. **Consent-based processing:** Specific, informed, unconditional, and unambiguous consent captured via clear affirmative action (e.g., account registration, opt-in communication).
2. **Specified legitimate uses:** Fulfillment of orders, processing returns, issuing invoices, fraud prevention, and complying with statutory tax obligations under Indian taxation/company laws.

> **Legal Disclaimer:** This privacy data map and its accompanying policy templates are structural engineering controls. Final legal validity must be audited by qualified Indian legal counsel prior to commercial launch.

---

## 2. Personal Data Inventory & Lifecycle Mapping

| Data Category | Specific Elements | Data Principal | Purpose of Collection | Mandatory / Optional | Storage & Encryption | Access Boundary | Retention Period | Deletion / Anonymization Workflow |
|---|---|---|---|---|---|---|---|---|
| **Identity & Authentication** | Email address, mobile number, password hash (Argon2id), MFA seed | Customer, Seller, Staff, Owner | Authentication, account recovery, security alerts | Mandatory for registration | PostgreSQL (`users`, `mfa_factors`), encrypted at rest, hashes salted | Self, Auth Service | Duration of active account + 180 days post-deletion request (security log) | Hard delete of credentials; email & phone hashed for duplicate account prevention |
| **Customer Contact & Delivery** | Full Name, delivery addresses, postal PIN, recipient phone | Customer | Order dispatch, delivery logistics, status SMS/WhatsApp | Mandatory for checkout | PostgreSQL (`addresses`, `orders`), encrypted at rest | Customer, Assigned Seller (order specific), Logistics Partner API | 7 years (statutory tax & sales invoice record keeping) | PII anonymized post-retention; order financial amounts retained for ledger |
| **Seller Business & Verification (KYC)** | Authorized representative name, business PAN, GSTIN, cancelled cheque, business registration proof | Seller Applicant / Approved Seller | Seller onboarding, authenticity verification, tax compliance (TCS under GST) | Mandatory for selling | Private Object Storage (Bucket: `marketplace-private-kyc`) with ephemeral signed URLs | Authorized Owner/Admin, Finance Ops | Active seller tenure + 8 years post-termination (statutory audit requirement) | Hard deletion of uploaded ID proofs post-retention; ledger summary retained |
| **Financial & Payout Data** | Bank Account Number (masked), IFSC Code, Beneficiary Name, Settlement Ledger | Approved Seller | Payout disbursement, reconciliation | Mandatory for settlements | PostgreSQL (`seller_bank_profiles`), AES-256 encrypted columns | Seller (own), Finance Admin, Platform Owner | 8 years (Reserve Bank of India & statutory audit compliance) | Masked retention |
| **Customer Behavior & Discovery** | Wishlist, Saved Bag, Recent Views, Search queries | Customer (logged-in or guest) | Shopping convenience, catalog discovery | Optional | Redis / LocalStorage (guest), PostgreSQL (`wishlist`, `cart`) | Customer only | Inactive carts expire after 30 days; search logs anonymized after 14 days | Automated TTL purge script |
| **Platform Owner Identity** | Administrative public alias (e.g., "Operations Desk"), authorized escalation contact | Platform Owner | Platform governance, high-risk approvals | Mandatory for system integrity | Out-of-band environment configuration; zero database exposure | Internal bootstrap system | Active operational lifespan | Not stored in public database |

---

## 3. Data Minimization & Negative Boundaries
1. **No Invasive Behavioral Trackers:** No third-party ad retargeting pixels (e.g., Meta Pixel, Google Remarketing) or invasive session replay recorders (e.g., FullStory, Hotjar) are bundled by default.
2. **Zero Inlined KYC in Database:** Document images/PDFs are never stored as Base64 strings or BLOBs in relational tables. Only opaque UUID keys pointing to private S3 buckets are retained.
3. **No Unnecessary Telemetry:** IP addresses in web server logs are truncated/pseudonymized (`192.168.xxx.xxx`) after 14 days of security retention.

---

## 4. Data Principal Rights & Self-Service Workflows
Under the DPDP Act 2023, data principals are provided with direct digital controls:
1. **Right to Access & Portability:** Customers and sellers can request an automated export of their profile, orders, and addresses in structured JSON format via their account dashboard.
2. **Right to Correction:** Direct self-service editing for addresses, profile names, and store details.
3. **Right to Erasure (Account Deletion):**
   - Customer initiates deletion via Account Settings.
   - 30-day grace/cooling-off period (cancelable by user).
   - Validation check ensures no pending active orders, open disputes, or unfulfilled returns.
   - Upon execution: Profile PII is wiped; active sessions are invalidated; order line items are pseudonymized to `Customer-ANON-[UUID]` to preserve legal tax invoices.
4. **Grievance Redressal Mechanism:** Clear designated Grievance Officer details published in statutory policies, providing a tracked support ticket category with a guaranteed response window (72 hours).
