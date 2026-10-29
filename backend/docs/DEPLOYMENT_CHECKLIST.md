# EquipX ΓÇö Deployment & Production Checklist (Member 3)

This checklist outlines the responsibilities and verification steps for **Member 3 (Backend Integration & Deployment)** to launch EquipX to production on Vercel/Netlify with Supabase.

---

## 1. Supabase Production Settings

### Authentication & Redirect URLs
* [ ] **Site URL:** Configure your production frontend domain (e.g., `https://equipx.vercel.app`) under **Authentication -> URL Configuration -> Site URL**.
* [ ] **Redirect URLs:** Add local and preview deployment wildcards to **Redirect URLs**:
  * `http://localhost:5173/**`
  * `https://equipx.vercel.app/**`
  * `https://*-your-team.vercel.app/**`
* [ ] **Disable Debug Rate Limits:** Under **Authentication -> Rate Limits**, ensure signup and email thresholds support concurrent judge evaluation.
* [ ] **Email Confirmations:** Keep **Confirm email** toggled **OFF** for seamless hackathon judge onboarding, or configure custom SMTP.

---

## 2. Database Migrations Order

Apply the SQL migration scripts sequentially in the Supabase Dashboard SQL Editor:

1. `sql/01_core_schema.sql` ΓÇö Profiles, resources, requirements, base triggers, role escalation protection.
2. `sql/02_eligibility_schema.sql` ΓÇö TrustPass eligibility verifications table and RLS policies.
3. `sql/03_bookings_schema.sql` ΓÇö Bookings table, GiST exclusion lock (`prevent_overlapping_approved_bookings`), atomic approval RPC.
4. `sql/04_handover_schema.sql` ΓÇö Handover records, condition reports, incidents, atomic checkout & return RPCs.
5. `sql/05_audit_and_notifications_schema.sql` ΓÇö Audit ledger immutability trigger, in-app notifications, and auto-sync triggers.
6. `sql/06_storage_policies.sql` ΓÇö Public `resource-images` bucket, private `condition-photos` bucket, and storage RLS.
7. `sql/07_security_and_notification_fixes.sql` ΓÇö Security hardening of role assignment RPC (`public.is_admin()` check) and booking cancellation notification alerts.

---

## 3. Storage Buckets & Policies

* [ ] **`resource-images` Bucket:**
  * Public bucket for equipment listings photos.
  * Upload restricted to resource owners and admins.
  * File size limit: 5MB (JPG, PNG, WEBP).
* [ ] **`condition-photos` Bucket:**
  * Strictly private bucket for condition snapshots.
  * Access restricted to authenticated inspectors via time-limited cryptographic Signed URLs.
  * File size limit: 5MB (JPG, PNG, WEBP).

---

## 4. Frontend Hosting Configuration (Vercel / Netlify)

### Environment Variables
Configure the following in the production hosting dashboard:

| Variable Name | Environment | Value Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Production & Preview | Remote Supabase project URL (`https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Production & Preview | Public `anon` API key (safe for browser exposure) |

> **Security Rule:** Never inject `SUPABASE_SERVICE_ROLE_KEY` or any private credentials into frontend builds or public repositories.

### Build Settings
* **Build Command:** `npm run build` (or `vite build`)
* **Output Directory:** `dist`
* **Node Version:** 18+ (tested on Node 20 & 24)

---

## 5. End-to-End Production Verification (Judge Demo Walkthrough)

Verify the complete user journey on the deployed production site:
1. **Registration & Role Security:** Register a new user (`judge.test@example.com`). Confirm role defaults to `student` without elevation permissions.
2. **Resource Discovery:** Browse the equipment catalog, test real-time search, and category filters.
3. **TrustPass Verification:** Check eligibility requirements on specialized equipment.
4. **Booking Submission:** Submit a reservation request with start date, end date, and purpose.
5. **Owner Decision:** Log in with owner credentials (`equipx.test.owner@gmail.com`), review borrower eligibility, and approve the request.
6. **Concurrency Lock Test:** Attempt to approve an overlapping reservation on the same time slot; verify atomic exclusion rejection.
7. **ProofLoop Check-out:** Issue equipment, recording condition grade and initial inspection notes.
8. **ProofLoop Return & Damage Logging:** Accept equipment return, record final condition, and file damage ticket if needed.
9. **In-App Notifications:** Verify live notifications and unread badge count updates on both student and owner accounts.
10. **Immutable Audit Ledger:** Inspect the activity history to confirm permanent, tamper-proof logging of all workflow transitions.
