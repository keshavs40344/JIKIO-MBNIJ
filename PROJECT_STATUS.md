# Project Status & Architectural Log — Vespera Atelier Marketplace

## 1. Executive Summary
- **Project Name:** Vespera Atelier (Privacy-First Multi-Vendor Fashion Marketplace)
- **Architecture Model:** Modular Monolith (Next.js 14/15 App Router Frontend + NestJS/Node Domain Backend + PostgreSQL with Prisma ORM)
- **Current Phase:** Phase 0 (Workspace Audit & Safety Scan) & Phase 2 (Architecture, PRD, Data Map, Threat Model, Spec Delivery)
- **Status Date:** October 2026

## 2. Phase Checklist & Progress

| Phase | Description | Status | Evidence / Artifact |
|---|---|---|---|
| **Phase 0** | Workspace Audit, Safety Scan, Git Init & Gitignore | **COMPLETED** | Verified clean repository, `.gitignore`, `.env.example`, zero secret leaks. |
| **Phase 1** | Competitor Feature Research (Myntra, Amazon, Raymond, Manyavar analysis) | **COMPLETED** | Documented in `master_architecture_and_audit.md` (Observed/Inferred/Proposed/Unknown). |
| **Phase 2** | PRD, Security Architecture, Threat Model, ERD, API Spec, Privacy Data Map | **COMPLETED** | `SECURITY.md`, `PRIVACY_DATA_MAP.md`, `THREAT_MODEL.md`, `DEPLOYMENT.md`, `API_SPEC.md`. |
| **Phase 3** | Foundations: Next.js/NestJS Skeleton, Auth, Roles, RBAC/ABAC, Session Management | **PENDING** | Foundation slices planned with negative test suites. |
| **Phase 4** | Seller Onboarding & Private Owner Verification Workflow | **PENDING** | Gated registration with private document storage & admin decision audit. |
| **Phase 5** | Fashion Catalogue, Variant Engine (Size/Color/Fabric), SKU Matrix & Moderation | **PENDING** | Configurable categories, multi-image gallery, server-side validation. |
| **Phase 6** | Customer Discovery: Search, Dynamic Facets, Mega-Menu, Cart & Repricing | **PENDING** | Server-side price recalculation, stock reservation. |
| **Phase 7** | Multi-Seller Checkout, Sub-Order Fulfilment, Split Shipping & State Machine | **PENDING** | Parent order -> Seller Fulfilment Unit transitions. |
| **Phase 8** | Payment Gateway Integration, Idempotent Webhooks & Ledger Accrual | **PENDING** | Signature validation, replay prevention, double-entry ledger. |
| **Phase 9** | Seller Settlements, Commission Versioning, Return/Refund Escalations | **PENDING** | Audit trail, cooling-off periods, manual payout reconciliation. |
| **Phase 10** | End-to-End Hardening, DPDP Compliance Verification, Load & Penetration Tests | **PENDING** | Automated security regression & accessibility validation. |

## 3. Toolchain & Environment Baseline
- **Runtime:** Node.js v24.18.0 / npm 11.16.0
- **Version Control:** Git 2.53.0 with neutral local committer identity
- **Repository Visibility:** Private repository mandatory
- **Local Secret Policy:** Zero hardcoded credentials; all secrets injected via environment variables and checked against `.gitignore`

## 4. Key Open Decisions for Platform Owner
1. **Business Contact Details:** Explicit public business entity name, contact email, grievance officer details, and registered operating address to be configured via secure admin settings (never using personal details).
2. **Payment Gateway Provider Selection:** Sandbox testing targets standard tokenized providers (Razorpay / Stripe) with server-side webhook signing.
3. **Logistics Partner Integration:** Standardized schema supports Shiprocket/Delhivery/Bluedart or manual dispatch fallback.
