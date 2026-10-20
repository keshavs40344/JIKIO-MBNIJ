# REST API Specification & Endpoint Inventory — Vespera Atelier (v1)

## 1. API Conventions
- **Base URL:** `/api/v1`
- **Content-Type:** `application/json` (Multipart for uploads)
- **Authentication:** Bearer JWT in `Authorization` header OR Secure HttpOnly session cookies
- **Response Format:**
  ```json
  {
    "success": true,
    "data": {},
    "meta": { "requestId": "req_uuid_v4", "timestamp": "2026-10-20T15:00:00Z" }
  }
  ```
- **Standard Error Format:**
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human readable summary",
      "details": []
    },
    "meta": { "requestId": "req_uuid_v4", "timestamp": "2026-10-20T15:00:00Z" }
  }
  ```

---

## 2. Endpoint Inventory & Access Control Matrix

### A. Public & Discovery Endpoints (Customer / Anonymous)
| Method | Endpoint | Access | Description & Security Controls |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Safe health probe (status only, zero environment or internal diagnostic leakage). |
| `GET` | `/api/v1/categories` | Public | Fetch active category taxonomy tree (Men, Women, Ethnic, Wedding, Footwear, etc.). |
| `GET` | `/api/v1/products` | Public | Search and browse approved products with query filters (size, color, occasion, price range, sort). Only status=`APPROVED` returned. |
| `GET` | `/api/v1/products/:slug` | Public | Product details with active variants, stock availability, size chart, care details. |
| `POST` | `/api/v1/cart/reprice` | Public / Guest | Server-side recalculation of guest cart items against current database prices and stock. |

### B. Customer Account & Checkout Endpoints
| Method | Endpoint | Access | Description & Security Controls |
|---|---|---|---|
| `POST` | `/api/v1/auth/customer/register` | Public | Customer registration with email/phone verification. |
| `POST` | `/api/v1/auth/customer/login` | Public | Customer login (rate limited to 5 attempts/min; returns session cookie/JWT). |
| `GET` | `/api/v1/customer/profile` | Customer | Fetch current customer profile and communication preferences. |
| `PUT` | `/api/v1/customer/profile` | Customer | Update customer name/preferences (Strict DTO validation, role manipulation rejected). |
| `GET` | `/api/v1/customer/addresses` | Customer | List customer delivery addresses (Scoped by `customer_id`). |
| `POST` | `/api/v1/customer/addresses` | Customer | Add new delivery address. |
| `POST` | `/api/v1/checkout/create-order` | Customer | Atomic order creation: reprices line items, reserves inventory, splits into seller sub-orders, generates payment order ID. |
| `GET` | `/api/v1/customer/orders` | Customer | List customer order history with status tracking. |
| `GET` | `/api/v1/customer/orders/:id` | Customer | Fetch order detail (Strict ownership check: `customer_id == auth.userId`). |
| `POST` | `/api/v1/customer/orders/:id/cancel` | Customer | Request cancellation of unfulfilled order item (Permitted states only). |
| `POST` | `/api/v1/customer/orders/:id/return` | Customer | Request return of delivered order item within allowed policy window (7-14 days). |

### C. Seller Portal Endpoints
| Method | Endpoint | Access | Description & Security Controls |
|---|---|---|---|
| `POST` | `/api/v1/seller/onboard` | Seller Applicant | Submit seller application (store name, business contact, GSTIN, PAN). |
| `POST` | `/api/v1/seller/documents/upload` | Seller Applicant | Upload verification proof (GST, PAN, Cancelled Cheque) to private bucket; returns opaque file ID. |
| `GET` | `/api/v1/seller/application-status` | Seller Applicant | Check application review state (`DRAFT`, `SUBMITTED`, `MORE_INFO`, `APPROVED`, `REJECTED`). |
| `GET` | `/api/v1/seller/store/profile` | Approved Seller | Fetch own store details, banner, policy settings. |
| `GET` | `/api/v1/seller/products` | Approved Seller | List seller's own catalog items with moderation status (`WHERE seller_id = auth.sellerId`). |
| `POST` | `/api/v1/seller/products` | Approved Seller | Create new fashion product listing with variants (Status initializes as `DRAFT` or `SUBMITTED`). |
| `PUT` | `/api/v1/seller/products/:id` | Approved Seller | Update product details / inventory (Ownership enforced). |
| `GET` | `/api/v1/seller/orders` | Approved Seller | List sub-orders assigned specifically to this seller. Competitor items masked. |
| `PUT` | `/api/v1/seller/orders/:id/fulfill` | Approved Seller | Update order state to `PACKED` / `SHIPPED` with tracking number and carrier details. |
| `GET` | `/api/v1/seller/settlements` | Approved Seller | View settlement ledger statements, commission deductions, payout history. |

### D. Private Owner & Super Admin Endpoints
| Method | Endpoint | Access | Description & Security Controls |
|---|---|---|---|
| `POST` | `/api/v1/admin/auth/login` | Public (Admin) | Admin login with mandatory second-factor TOTP verification. |
| `GET` | `/api/v1/admin/sellers/review-queue` | Super Admin / Staff | List pending seller verification applications. |
| `GET` | `/api/v1/admin/sellers/:id/kyc-doc/:docId` | Super Admin / Staff | Generate short-lived signed URL (60s TTL) for private KYC document inspection. |
| `POST` | `/api/v1/admin/sellers/:id/decision` | Super Admin | Action seller application (`APPROVE`, `REJECT`, `REQUEST_MORE_INFO`, `SUSPEND`) with mandatory audit reason. |
| `GET` | `/api/v1/admin/products/moderation-queue` | Moderator / Admin | List submitted products awaiting authenticity and content review. |
| `POST` | `/api/v1/admin/products/:id/moderation` | Moderator / Admin | Approve or reject product listing with recorded compliance notes. |
| `GET` | `/api/v1/admin/reports/reconciliation` | Finance / Admin | View financial settlement reconciliations and platform commission accruals. |
| `GET` | `/api/v1/admin/audit-logs` | Super Admin | Query immutable administrative audit logs with filtering and rate-limited export. |

### E. Payment & Partner Webhook Endpoints
| Method | Endpoint | Access | Description & Security Controls |
|---|---|---|---|
| `POST` | `/api/v1/webhooks/payment` | Gateway Provider | Receives payment capture/failure events. Verified via raw HMAC signature; idempotent transition. |
| `POST` | `/api/v1/webhooks/logistics` | Logistics Partner | Receives dispatch, out-for-delivery, and delivery events with signature verification. |
