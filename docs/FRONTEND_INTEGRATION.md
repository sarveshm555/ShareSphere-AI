# EquipX — Frontend Integration Guide for Member 1 (React.js)

Welcome to the EquipX Backend API. You do not need to construct raw Supabase REST queries, write SQL, or parse database schemas. All backend capabilities are exposed as asynchronous JavaScript functions that return clean JavaScript objects and throw predictable, catchable error classes.

---

## 1. Quick Setup in React

### Installation
Ensure the project has `@supabase/supabase-js` installed:
\`\`\`bash
npm install @supabase/supabase-js
\`\`\`

### Environment Variables
In your Vite `.env` file, include:
\`\`\`env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
\`\`\`

### Single Import Rule
All services and error classes are imported from a single location:
\`\`\`javascript
import {
  resourceService,
  bookingService,
  eligibilityService,
  handoverService,
  conditionService,
  notificationService,
  storageService,
  profileService,
  AppError,
  ValidationError
} from './src/index.js';
\`\`\`

---

## 2. Authentication Contract (Coordination with Member 3)

You do **not** need to manually attach Bearer tokens or manage authorization headers in service calls. 

When Member 3 logs in a user via `supabase.auth.signInWithPassword()` or OAuth, the shared `supabase` client automatically attaches the active session token to all backend queries. PostgreSQL Row Level Security (RLS) inspects `auth.uid()` on every call.

---

## 3. Service Reference & React Examples

### Module A: Resource Discovery & Listings (`resourceService`)

#### 1. `resourceService.getResources(options)`
* **Description:** Retrieves equipment catalog with real-time search, filters, pagination, and owner details.
* **Access:** Any authenticated user.
* **Parameters (`options` object):**
  * `category` *(string, optional)*: Filter by exact category (e.g. `'Electronics'`).
  * `location` *(string, optional)*: Substring match (e.g. `'Lab 304'`).
  * `status` *(string, default: `'available'`)*: `'available'`, `'maintenance'`, `'decommissioned'`, or `'all'`.
  * `search` *(string, optional)*: Keyword query matching equipment name or description.
  * `page` *(number, default: `1`)*: Page number.
  * `limit` *(number, default: `20`)*: Records per page.
* **Returns:**
  \`\`\`json
  {
    "resources": [
      {
        "id": "uuid",
        "name": "Rigol DS1054Z Oscilloscope",
        "description": "4-channel 50MHz digital oscilloscope",
        "category": "Electronics",
        "location": "EE Lab 304",
        "status": "available",
        "image_url": "https://...public-url...",
        "profiles": { "full_name": "Dr. Vance", "institution": "Engineering" },
        "resource_requirements": [
          { "id": "uuid", "requirement_type": "training", "description": "EE Safety 101" }
        ]
      }
    ],
    "pagination": { "totalItems": 15, "totalPages": 1, "currentPage": 1, "limit": 20 }
  }
  \`\`\`

* **React Component Example (Equipment Catalog with Live Search):**
\`\`\`jsx
import React, { useState, useEffect } from 'react';
import { resourceService } from '../src/index.js';

export function ResourceCatalog() {
  const [resources, setResources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        const data = await resourceService.getResources({ search: searchTerm, status: 'available' });
        setResources(data.resources);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(loadCatalog, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [searchTerm]);

  return (
    <div className="p-6">
      <input
        type="text"
        placeholder="Search equipment..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="border p-2 rounded w-full mb-4"
      />
      {loading && <p>Loading equipment catalog...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {resources.map((item) => (
          <div key={item.id} className="border rounded p-4 shadow">
            <img src={item.image_url || '/placeholder.png'} alt={item.name} className="h-40 w-full object-cover mb-2" />
            <h3 className="font-bold text-lg">{item.name}</h3>
            <p className="text-sm text-gray-600">{item.location}</p>
            <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-2">{item.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
\`\`\`

---

### Module C: TrustPass Eligibility Verification (`eligibilityService`)

#### 1. `eligibilityService.checkResourceEligibility(userId, resourceId)`
* **Description:** Pre-checks if the student has valid, unexpired credentials before allowing booking submission.
* **Returns:**
  \`\`\`json
  {
    "eligible": false,
    "reason": "User is missing 1 prerequisite(s) required to reserve this equipment.",
    "missing": [{ "requirement_type": "training", "description": "Laser Safety Training" }],
    "passed": []
  }
  \`\`\`

---

### Module D: FairShare Booking System (`bookingService`)

#### 1. `bookingService.requestBooking({ resourceId, startTime, endTime, purpose })`
* **Description:** Creates a booking request. Automatically verifies TrustPass eligibility before inserting.
* **Throws:** `ValidationError` (400) if ineligible or if dates are invalid.

#### 2. `bookingService.approveBooking(bookingId)`
* **Description:** Resource owner approves a pending request. Enforces atomic database locks against double-booking.
* **Throws:** `AppError` if an overlapping reservation was already approved.

* **React Component Example (Owner Booking Approval with Concurrency Lock Handling):**
\`\`\`jsx
import React, { useState } from 'react';
import { bookingService } from '../src/index.js';

export function BookingApprovalCard({ booking, onActionComplete }) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleApprove = async () => {
    try {
      setSubmitting(true);
      setErrorMessage('');
      await bookingService.approveBooking(booking.id);
      alert('Booking approved successfully!');
      onActionComplete();
    } catch (err) {
      // Handles PostgreSQL Exclusion Constraint error gracefully
      if (err.message.includes('already overlaps')) {
        setErrorMessage('Cannot approve: Another approved booking already occupies this time window.');
      } else {
        setErrorMessage(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Please enter rejection reason for the student:');
    if (!reason) return;
    try {
      setSubmitting(true);
      await bookingService.rejectBooking(booking.id, reason);
      alert('Booking request rejected.');
      onActionComplete();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border p-4 rounded bg-white shadow mb-3">
      <h4 className="font-semibold">{booking.resources?.name}</h4>
      <p className="text-sm text-gray-600">Borrower: {booking.profiles?.full_name}</p>
      <p className="text-sm text-gray-500">
        Window: {new Date(booking.start_time).toLocaleString()} - {new Date(booking.end_time).toLocaleString()}
      </p>
      {errorMessage && <p className="text-red-600 text-sm mt-2 font-medium">{errorMessage}</p>}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Processing...' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={submitting}
          className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
\`\`\`

---

### Module E & F: ProofLoop Handover & Incidents (`handoverService`, `conditionService`)

#### 1. `handoverService.checkoutBooking({ bookingId, conditionGrade, notes, photoPaths })`
* **Allowed Grades:** `'excellent'`, `'good'`, `'fair'`, `'damaged'`, `'unusable'`
* **Effect:** Sets booking to `'checked_out'`, stores initial inspection snapshot in `condition_reports`.

#### 2. `handoverService.returnBooking({ bookingId, conditionGrade, notes, photoPaths, reportIncident, incidentDescription })`
* **Effect:** Sets booking to `'returned'`. If `'damaged'` or `'unusable'`, automatically files an incident ticket and shifts equipment status to `'maintenance'`.

---

### Module G: In-App Notifications (`notificationService`)

#### 1. `notificationService.getMyNotifications({ unreadOnly: false })`
#### 2. `notificationService.getUnreadCount()`
#### 3. `notificationService.markAsRead(notificationId)`

* **React Live Notification Badge Example:**
\`\`\`jsx
import React, { useState, useEffect } from 'react';
import { notificationService } from '../src/index.js';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchBadge() {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    }
    fetchBadge();
    const interval = setInterval(fetchBadge, 15000); // Polling every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative cursor-pointer">
      <span className="text-xl">🔔</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </div>
  );
}
\`\`\`

---

### Module H: Supabase Storage (`storageService`)

#### 1. `storageService.uploadResourceImage(file, fileName, resourceId)`
* **Bucket:** `resource-images` (Public).
* **Returns:** `{ publicUrl: string, path: string }`. Store `publicUrl` directly into `resources.image_url`.

#### 2. `storageService.uploadConditionPhoto(file, fileName, bookingId, stage)`
* **Bucket:** `condition-photos` (Strictly Private).
* **Returns:** `{ path: string }`. Add `path` to the `photoPaths` array passed to `checkoutBooking` or `returnBooking`.

#### 3. `storageService.getConditionPhotoSignedUrl(path, expiresInSeconds)`
* **Description:** Resolves private storage path into a temporary viewable image URL for authorized inspectors.
\`\`\`jsx
// Example loading private damage photo in React
useEffect(() => {
  async function loadEvidence() {
    const url = await storageService.getConditionPhotoSignedUrl(report.photo_paths[0], 3600);
    setEvidenceUrl(url);
  }
  loadEvidence();
}, [report]);
\`\`\`