# Deployment & Infrastructure Operations Runbook — Vespera Atelier

## 1. Architecture Topography & Topology

```
+-----------------------------------------------------------------------------------+
|                                  PUBLIC CLIENTS                                    |
|  [ Customer Web / Mobile ]       [ Seller Portal UI ]      [ Super Admin UI ]     |
+--------------------------+-------------------+--------------------+---------------+
                           |                   |                    |
                           +---------> [ CLOUDFLARE WAF / EDGE ] <--+
                                               |
                                     (HTTPS / TLS 1.3 Strict)
                                               |
                                               v
+-----------------------------------------------------------------------------------+
|                        APPLICATION LAYER (Vercel / Railway / Render)              |
|                                                                                   |
|  [ Next.js 14/15 App Router Frontend ]    [ NestJS / Express Domain API Engine ]   |
|   - Server-Side Rendering (SSR)             - Modular Monolith Architecture       |
|   - Clean Component Architecture            - Domain Boundaries (Auth, Catalog,   |
|   - Zero secrets exposed to client            Orders, Settlements, Webhooks)      |
|   - Strict Content Security Policy (CSP)    - Zero-Trust Authorization Middleware |
+------------------------------------------------------+----------------------------+
                                                       |
                             (Private VPC / SSL Encrypted Pool)
                                                       |
                                                       v
+-----------------------------------------------------------------------------------+
|                        MANAGED DATA & STORAGE TIER (Private VPC)                   |
|                                                                                   |
|  [ Managed PostgreSQL 16+ ]                 [ Private S3-Compatible Object Store ]|
|   - Row-level transactions                  - Bucket 1: Private KYC / Tax Docs    |
|   - Parameterized Queries via Prisma        - Bucket 2: Public Stripped Images    |
|   - Point-in-time recovery (PITR)           - Ephemeral signed URLs (60s TTL)     |
|   - Isolated DB user privileges                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Infrastructure Hosting Evaluation & Recommended Profiles

### A. Modular Monolith Deployment Topology (Recommended Phase 1-3)
- **Frontend & Public API:** Next.js deployed on Vercel OR Containerized NestJS + Next.js on Railway / Render.
  - *Rationale:* Avoids microservice network complexity, latency, and distributed transaction pitfalls (2PC/Sagas) while preserving clean internal domain boundaries.
- **Database:** Managed PostgreSQL (Railway, Supabase, Neon, or AWS RDS).
  - *Connection Security:* Connection strings enforce `sslmode=require` and use pooled connections. No public port exposure in production (bind to private network or IP allowlist).
- **Object Storage:** Cloudflare R2 or AWS S3 with private bucket policies and Cloudflare CDN caching for processed product images.

---

## 3. Secret Management & CI/CD Pipeline Controls

1. **Zero Repository Secrets:** No `.env` files with real keys are ever stored in Git.
2. **Provider Secret Injection:** Secrets are injected directly via Railway/Vercel encrypted dashboard environment variables.
3. **Automated Pre-Commit / Pre-Push Checks:**
   - Scan for API keys, private keys (`BEGIN PRIVATE KEY`), and JWT secrets using Git hooks or TruffleHog/Gitleaks.
   - Run linter and type-checker before allowing push.
4. **Isolated Environments:**
   - `development`: Local SQLite/PostgreSQL with mock payment gateway.
   - `staging`: Railway staging environment with sandbox credentials (Razorpay Test Mode).
   - `production`: Strictly isolated production database and live API keys; manual deployment approval gate required.

---

## 4. Database Migrations, Backup, and Disaster Recovery (DR)

### Migration Protocol
- All database modifications are executed via Prisma Migrations (`npx prisma migrate deploy`).
- Destructive operations (`DROP COLUMN`, `DROP TABLE`) are strictly prohibited in forward migrations. Schema evolution follows the **Expand and Contract pattern**:
  1. Expand: Add new nullable column.
  2. Deploy application code reading both, writing to new.
  3. Backfill data.
  4. Contract: Mark old column deprecated and clean up in subsequent release.

### Backup Strategy & Recovery Targets
- **Automated Daily Backups:** Automated full database snapshots taken daily with 30-day retention.
- **Point-In-Time Recovery (PITR):** Write-Ahead Logs (WAL) archived to permit recovery to any specific second in the preceding 7 days.
- **Recovery Time Objective (RTO):** < 1 hour.
- **Recovery Point Objective (RPO):** < 5 minutes of transaction data.
- **Verification Drill:** Quarterly non-production restore test to verify database snapshot integrity.

---

## 5. Cost Categories & Budget Forecasting (Production Baseline)

| Service Category | Provider Option | Tier / Usage Profile | Est. Monthly Cost (USD) |
|---|---|---|---|
| **Web & API Compute** | Railway / Render / Vercel Pro | 2-4 vCPU, 4GB RAM Container instance | $20 - $40 |
| **Managed Database** | PostgreSQL 16 (Railway / Neon / RDS) | High-availability, 10GB SSD, Daily Backups | $15 - $35 |
| **Object Storage & CDN** | Cloudflare R2 + Cloudflare CDN | Free egress; storage ~$0.015/GB/mo | $5 - $15 |
| **Transactional Email** | Resend / Postmark / Amazon SES | 10,000 emails/month | $0 - $10 |
| **Transactional SMS / OTP** | Twilio / MSG91 (India) | OTP verification & dispatch alerts | $10 - $25 (usage-based) |
| **Payment Gateway** | Razorpay / Stripe | Standard transaction fees (no fixed monthly) | ~2% per transaction |
| **Total Baseline Running Cost** | | | **~$50 - $125 / month** |
