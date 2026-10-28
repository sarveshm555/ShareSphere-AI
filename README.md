Markdown
# EquipX — Smart Resource Sharing Platform (Backend Services)

EquipX is a serverless, database-first resource-sharing platform engineered for college laboratories, maker spaces, and departmental equipment centers. It manages the complete equipment-borrowing lifecycle—from discovery and TrustPass eligibility checks to atomic reservation scheduling, physical handover verification, and immutable audit logs.

---

## Architecture Overview

EquipX replaces traditional API middle-layers with direct, secure PostgreSQL integration powered by Supabase.

┌────────────────────────────────────────────────────────┐
│               React Frontend (Member 1)                │
└────────────┬──────────────────────────────▲────────────┘
│                              │

Client Operations            4. Live Data Streams
│                              │
┌────────────▼──────────────────────────────┴────────────┐
│                  Supabase Platform                     │
│                                                        │
│  ┌──────────────────┐         ┌─────────────────────┐  │
│  │  Supabase Auth   ├─────────►  PostgreSQL Engine  │  │
│  │ (JWT Validation) │         │  - Row Level Sec.   │  │
│  └──────────────────┘         │  - Atomic RPC Funcs │  │
│                               │  - Exclusion Locks  │  │
│  ┌──────────────────┐         │  - Audit Triggers   │  │
│  │ Supabase Storage │         └─────────────────────┘  │
│  │ (Public/Signed)  │                                  │
│  └──────────────────┘                                  │
└────────────────────────────────────────────────────────┘


### Technology Stack
* **Language & Runtime:** JavaScript (ES Modules), Node.js (v18+)
* **Database & Platform:** Supabase (PostgreSQL 15+)
* **Database Client:** `@supabase/supabase-js` (v2.45+)
* **Concurrency Engine:** PostgreSQL `btree_gist` Exclusion Constraints & Stored Procedures
* **Storage Engine:** Supabase Storage (Public bucket + Private tokenized Signed URLs)

---

## Implemented Services & Modules

All services are exported through a single barrel entry point (`src/index.js`):

| Module | Service File | Key Responsibilities |
| :--- | :--- | :--- |
| **Module A: Resources** | `src/services/resourceService.js` | Catalog CRUD, keyword search, category/location filters, owner-restricted mutations. |
| **Module B: Profiles & Roles** | `src/services/profileService.js` | User metadata, role queries, database-level privilege escalation prevention. |
| **Module C: TrustPass** | `src/services/eligibilityService.js` | Verification check against equipment prerequisites, expiration date evaluation. |
| **Module D: FairShare** | `src/services/bookingService.js` | Atomic reservation approvals, cancellation, PostgreSQL exclusion race-condition guard. |
| **Module E: ProofLoop** | `src/services/handoverService.js` | Check-in/check-out lifecycle, physical issuance timestamps, condition state transitions. |
| **Module F: Conditions** | `src/services/conditionService.js` | Inspection snapshots, damage/misuse incident tickets, owner dispute resolution. |
| **Module G: Audit Ledger** | `src/services/auditService.js` | Zero-trust immutable audit query interface, automatic database-level event triggers. |
| **Module H: Notifications** | `src/services/notificationService.js` | In-app notification center, live unread counters, auto-triggered booking status updates. |
| **Module I: AI Matching** | `src/services/aiMatchingService.js` | Natural language project parsing, weighted relevance ranking, real-time eligibility check. |
| **Storage Adapter** | `src/services/storageService.js` | Public listing images, private condition evidence, 1-hour signed URL generator. |

---

## Security Model & Zero-Trust Guarantees

1. **Role Protection (`tr_protect_profile_roles`):** Newly registered users default to `student`. The `role` column cannot be updated by client sessions. Any unauthorized promotion attempt raises an immediate PostgreSQL exception.
2. **Double-Booking Prevention (`prevent_overlapping_approved_bookings`):** Uses an engine-level exclusion constraint (`EXCLUDE USING gist`) over `tstzrange(start_time, end_time)`. Conflicting reservations submitted at the exact same millisecond cannot both be approved.
3. **Audit Immutability (`tr_prevent_audit_tampering`):** The `audit_logs` table disallows `UPDATE` and `DELETE` through both database triggers and RLS policies (`WITH CHECK (false)`), making event history permanent.
4. **Private Storage Isolation:** The `condition-photos` bucket is non-public. Private evidence images can only be viewed via time-limited cryptographic Signed URLs.

---

## Quickstart & Local Setup

### 1. Clone & Install
```powershell
git clone [https://github.com/YOUR_TEAM/equipx-backend.git](https://github.com/YOUR_TEAM/equipx-backend.git)
cd equipx-backend
npm install
2. Configure Environment Variables
Create a .env file in the project root:

Code snippet
SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
SUPABASE_ANON_KEY=eyJhbGciOi...
3. Apply Database Migrations
Execute the SQL files located in sql/ sequentially in the Supabase Dashboard SQL Editor:

sql/01_core_schema.sql (Profiles, Resources, Requirements, Base Triggers)

sql/02_eligibility_schema.sql (TrustPass Verifications)

sql/03_bookings_schema.sql (FairShare Bookings & Atomic Exclusion Locks)

sql/04_handover_schema.sql (ProofLoop Check-in/out, Condition Reports, Incidents)

sql/05_audit_and_notifications_schema.sql (Audit Ledger & In-App Alerts)

sql/06_storage_policies.sql (Storage Buckets & Access Rules)

Test Suite Execution
Run individual service tests or execute the complete 12-step acceptance test:

PowerShell
# 1. Verify Supabase connection
npm run test:connection

# 2. Verify schema and table availability
node scripts/verifySchema.js

# 3. Test individual domain services
node scripts/testResourceService.js
node scripts/testEligibilityService.js
node scripts/testBookingService.js
node scripts/testHandoverService.js
node scripts/testAuditAndNotificationService.js
node scripts/testStorageService.js
node scripts/testAiMatching.js

# 4. Run the complete 12-step End-to-End Acceptance Test
node scripts/runAcceptanceTest.js
Integration Contracts
Frontend Integration (Member 1): Refer to docs/FRONTEND_INTEGRATION.md for complete function signatures, React hook examples, and error-handling patterns.

Deployment & Auth Checklist (Member 3): Refer to docs/DEPLOYMENT_CHECKLIST.md for production hosting, authentication redirect URLs, and environment variables.


#### `docs/DEPLOYMENT_CHECKLIST.md`
Open `docs/DEPLOYMENT_CHECKLIST.md` in VS Code and paste:

```markdown
# EquipX — Deployment & Production Checklist (Member 3)

This checklist outlines the responsibilities and verification steps for **Member 3 (Authentication & Deployment)** to launch EquipX to production on Vercel/Netlify with Supabase.

---

## 1. Supabase Production Settings

### Authentication & Redirect URLs
* [ ] **Site URL:** Configure your production frontend domain (e.g., `https://equipx.vercel.app`) under **Authentication -> URL Configuration -> Site URL**.
* [ ] **Redirect URLs:** Add local and preview deployment wildcards to **Redirect URLs**:
  * `http://localhost:5173/**`
  * `https://equipx.vercel.app/**`
  * `https://*-your-team.vercel.app/**`
* [ ] **Disable Debug Rate Limits:** If needed for the hackathon showcase, adjust **Authentication -> Rate Limits** so multiple judges can sign up simultaneously.
* [ ] **Email Confirmations:** Keep **Confirm email** toggled **OFF** unless you have configured a custom SMTP provider (e.g., SendGrid/Resend) to prevent onboarding drop-off.

---

## 2. Frontend Hosting Configuration (Vercel / Netlify)

### Environment Variables
Inject the following environment variables into the production hosting dashboard:

| Variable Name | Environment | Value Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Production & Preview | Remote Supabase project URL (`https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Production & Preview | Public `anon` API key (safe for browser exposure) |

*DO NOT inject `SUPABASE_SERVICE_ROLE_KEY` into the frontend build.*

---

## 3. Database & Storage Production Audit

* [ ] **Exclusion Constraint Active:** Confirm `btree_gist` is enabled and `prevent_overlapping_approved_bookings` constraint is listed under `public.bookings`.
* [ ] **Storage Buckets Active:**
  * `resource-images`: Public bucket for equipment photos.
  * `condition-photos`: Private bucket for ProofLoop condition snapshots.
* [ ] **Profiles Trigger Active:** Verify `on_auth_user_created` trigger automatically provisions new accounts as `student`.

---

## 4. Production Smoke Test

Before demoing to hackathon judges, verify this sequence on the live production URL:
1. Register a new user (`judge.test@example.com`).
2. Verify role defaults to `student` without admin permissions.
3. Browse equipment catalog and test keyword search.
4. Submit a reservation request.
5. Log in with the owner account and approve the request.
6. Verify live notification banner and badge count.