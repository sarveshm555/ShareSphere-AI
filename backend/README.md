Markdown
# EquipX ΓÇö Smart Resource Sharing Platform (Backend Services)

EquipX is a serverless, database-first resource-sharing platform engineered for college laboratories, maker spaces, and departmental equipment centers. It manages the complete equipment-borrowing lifecycleΓÇöfrom discovery and TrustPass eligibility checks to atomic reservation scheduling, physical handover verification, and immutable audit logs.

---

## Architecture Overview

EquipX replaces traditional API middle-layers with direct, secure PostgreSQL integration powered by Supabase.

ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé               React Frontend (Member 1)                Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû▓ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
Γöé                              Γöé

Client Operations            4. Live Data Streams
Γöé                              Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû╝ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé                  Supabase Platform                     Γöé
Γöé                                                        Γöé
Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ         ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ  Γöé
Γöé  Γöé  Supabase Auth   Γö£ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓû║  PostgreSQL Engine  Γöé  Γöé
Γöé  Γöé (JWT Validation) Γöé         Γöé  - Row Level Sec.   Γöé  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ         Γöé  - Atomic RPC Funcs Γöé  Γöé
Γöé                               Γöé  - Exclusion Locks  Γöé  Γöé
Γöé  ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ         Γöé  - Audit Triggers   Γöé  Γöé
Γöé  Γöé Supabase Storage Γöé         ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ  Γöé
Γöé  Γöé (Public/Signed)  Γöé                                  Γöé
Γöé  ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ                                  Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ


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
### Integration Contracts
* **Frontend Integration (Member 1):** Refer to [`docs/FRONTEND_INTEGRATION.md`](docs/FRONTEND_INTEGRATION.md) for complete function signatures, React hook examples, and error-handling patterns.
* **Deployment & Auth Checklist (Member 3):** Refer to [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md) for production hosting, authentication redirect URLs, and environment variables.
