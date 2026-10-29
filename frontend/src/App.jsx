import { useEffect, useState, useCallback } from "react";
import "./App.css";
import {
  resourceService,
  bookingService,
  handoverService,
  conditionService,
  notificationService,
  auditService,
  profileService,
  supabase,
} from "./index.js";
import Auth from "./Auth";

const categories = [
  "All Equipment",
  "Electronics",
  "Fabrication",
  "Lab Equipment",
  "Machining",
];

function App() {
  // 1. Authentication & Profile State
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);

  // 2. Navigation Tab State
  const [activeTab, setActiveTab] = useState("explore"); // 'explore' | 'my-bookings' | 'owner-portal' | 'lifecycle' | 'audit'

  // 3. Equipment Catalog State
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All Equipment");
  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 4. Resource Details & Booking Submission State
  const [selectedResource, setSelectedResource] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [bookingStart, setBookingStart] = useState("");
  const [bookingEnd, setBookingEnd] = useState("");
  const [bookingPurpose, setBookingPurpose] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState("");

  // 5. My Bookings State (Student/Borrower)
  const [myBookings, setMyBookings] = useState([]);
  const [myBookingsLoading, setMyBookingsLoading] = useState(false);
  const [myBookingsError, setMyBookingsError] = useState("");

  // 6. Owner Bookings State (Equipment Owner / Admin)
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [ownerBookingsLoading, setOwnerBookingsLoading] = useState(false);
  const [ownerBookingsError, setOwnerBookingsError] = useState("");
  const [ownerActionError, setOwnerActionError] = useState("");

  // 7. Equipment Lifecycle & ProofLoop Handover State
  const [lifecycleBookings, setLifecycleBookings] = useState([]);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [incidentsList, setIncidentsList] = useState([]);
  const [activeLifecycleModal, setActiveLifecycleModal] = useState(null); // { type: 'checkout'|'return', booking }
  const [handoverGrade, setHandoverGrade] = useState("good");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [reportIncidentFlag, setReportIncidentFlag] = useState(false);
  const [incidentDescription, setIncidentDescription] = useState("");
  const [lifecycleActionLoading, setLifecycleActionLoading] = useState(false);

  // 8. Audit Ledger State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // 9. Notification Center State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);

  // --- Session & Profile Initialization ---
  useEffect(() => {
    let active = true;

    async function initializeSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Session check failed:", error.message);
        if (!active) return;
        setSession(data?.session ?? null);
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load User Profile on Auth
  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      if (!session) {
        setUserProfile(null);
        return;
      }
      try {
        const profile = await profileService.getCurrentProfile();
        if (!cancelled) setUserProfile(profile);
      } catch (err) {
        console.warn("Could not load user profile:", err.message);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [session]);

  // --- Equipment Catalog Loader ---
  const loadEquipment = useCallback(async () => {
    if (!session) return;
    try {
      setLoading(true);
      setError("");
      const result = await resourceService.getResources({
        status: "all",
        limit: 100,
      });
      setEquipmentList(result.resources || []);
    } catch (err) {
      console.error("Equipment loading failed:", err);
      setError(err.message || "Unable to load equipment.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      loadEquipment();
    }
  }, [session, loadEquipment]);

  // --- Notifications Fetcher & Polling ---
  const fetchNotifications = useCallback(async () => {
    if (!session) return;
    try {
      const [alerts, count] = await Promise.all([
        notificationService.getMyNotifications({ limit: 20 }),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(alerts || []);
      setUnreadCount(count || 0);
    } catch (err) {
      console.warn("Notification polling:", err.message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 12000);
    return () => clearInterval(interval);
  }, [session, fetchNotifications]);

  // --- Borrower Bookings Loader ---
  const loadMyBookings = useCallback(async () => {
    if (!session) return;
    try {
      setMyBookingsLoading(true);
      setMyBookingsError("");
      const data = await bookingService.getMyBookings("all");
      setMyBookings(data || []);
    } catch (err) {
      setMyBookingsError(err.message || "Unable to load your bookings.");
    } finally {
      setMyBookingsLoading(false);
    }
  }, [session]);

  // --- Owner Requests Loader ---
  const loadOwnerBookings = useCallback(async () => {
    if (!session) return;
    try {
      setOwnerBookingsLoading(true);
      setOwnerBookingsError("");
      setOwnerActionError("");
      const data = await bookingService.getOwnerBookings();
      setOwnerBookings(data || []);
    } catch (err) {
      setOwnerBookingsError(err.message || "Unable to load owner booking requests.");
    } finally {
      setOwnerBookingsLoading(false);
    }
  }, [session]);

  // --- Lifecycle & Handover Loader ---
  const loadLifecycleData = useCallback(async () => {
    if (!session) return;
    try {
      setLifecycleLoading(true);
      const [ownerData, incidents] = await Promise.all([
        bookingService.getOwnerBookings(),
        conditionService.getIncidents({ limit: 20 }),
      ]);
      // Filter bookings that are approved (ready for checkout) or checked_out (ready for return)
      const actionable = (ownerData || []).filter((b) =>
        ["approved", "checked_out"].includes(b.status)
      );
      setLifecycleBookings(actionable);
      setIncidentsList(incidents || []);
    } catch (err) {
      console.warn("Lifecycle load error:", err.message);
    } finally {
      setLifecycleLoading(false);
    }
  }, [session]);

  // --- Audit Ledger Loader ---
  const loadAuditLogs = useCallback(async () => {
    if (!session) return;
    try {
      setAuditLoading(true);
      const data = await auditService.getAuditLogs({ limit: 30 });
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.warn("Audit load error:", err.message);
    } finally {
      setAuditLoading(false);
    }
  }, [session]);

  // Refresh tab data on tab switch
  useEffect(() => {
    if (!session) return;
    if (activeTab === "explore") loadEquipment();
    else if (activeTab === "my-bookings") loadMyBookings();
    else if (activeTab === "owner-portal") loadOwnerBookings();
    else if (activeTab === "lifecycle") loadLifecycleData();
    else if (activeTab === "audit") loadAuditLogs();
  }, [activeTab, session, loadEquipment, loadMyBookings, loadOwnerBookings, loadLifecycleData, loadAuditLogs]);

  // --- Handlers: Resource Detail Modal & Booking Submission ---
  async function handleViewDetails(resourceId) {
    try {
      setDetailLoading(true);
      setDetailError("");
      setSelectedResource(null);
      setBookingMessage("");
      setBookingError("");

      const { data, error } = await supabase
        .from("resources")
        .select("*, profiles:owner_id(id, full_name, institution), resource_requirements(*)")
        .eq("id", resourceId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Equipment not found or you lack permission to view it.");

      setSelectedResource(data);
    } catch (err) {
      setDetailError(err.message || "Unable to load equipment details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRequestBooking() {
    if (!selectedResource) return;

    try {
      setBookingLoading(true);
      setBookingMessage("");
      setBookingError("");

      if (!bookingStart || !bookingEnd) {
        throw new Error("Please select both start and end dates.");
      }

      const result = await bookingService.requestBooking({
        resourceId: selectedResource.id,
        startTime: new Date(bookingStart).toISOString(),
        endTime: new Date(bookingEnd).toISOString(),
        purpose: bookingPurpose.trim() || null,
      });

      setBookingMessage(
        `Booking request submitted successfully! Status: ${result.status || "pending"}. You can track it under 'My Bookings'.`
      );
      fetchNotifications();
      loadEquipment();
    } catch (err) {
      console.error("Booking request failed:", err);
      setBookingError(err.message || "Unable to submit booking request.");
    } finally {
      setBookingLoading(false);
    }
  }

  // --- Handlers: Borrower Cancellation ---
  async function handleCancelBooking(bookingId) {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await bookingService.cancelBooking(bookingId);
      await loadMyBookings();
      fetchNotifications();
    } catch (err) {
      alert(`Cancellation failed: ${err.message}`);
    }
  }

  // --- Handlers: Owner Approval & Rejection ---
  async function handleApprove(bookingId) {
    try {
      setOwnerActionError("");
      await bookingService.approveBooking(bookingId);
      await loadOwnerBookings();
      fetchNotifications();
    } catch (err) {
      if (err.message?.includes("overlaps") || err.message?.includes("conflict")) {
        setOwnerActionError("Cannot approve: Another approved booking already occupies this time window.");
      } else {
        setOwnerActionError(err.message || "Failed to approve booking.");
      }
    }
  }

  async function handleReject(bookingId) {
    const reason = window.prompt("Please provide a rejection reason for the borrower:");
    if (!reason || !reason.trim()) return;

    try {
      setOwnerActionError("");
      await bookingService.rejectBooking(bookingId, reason.trim());
      await loadOwnerBookings();
      fetchNotifications();
    } catch (err) {
      setOwnerActionError(err.message || "Failed to reject booking.");
    }
  }

  // --- Handlers: ProofLoop Equipment Checkout & Return ---
  async function handleExecuteLifecycleAction() {
    if (!activeLifecycleModal) return;
    const { type, booking } = activeLifecycleModal;

    try {
      setLifecycleActionLoading(true);

      if (type === "checkout") {
        await handoverService.checkoutBooking({
          bookingId: booking.id,
          conditionGrade: handoverGrade,
          notes: handoverNotes.trim() || null,
        });
      } else if (type === "return") {
        await handoverService.returnBooking({
          bookingId: booking.id,
          conditionGrade: handoverGrade,
          notes: handoverNotes.trim() || null,
          reportIncident: reportIncidentFlag,
          incidentDescription: incidentDescription.trim() || null,
        });
      }

      setActiveLifecycleModal(null);
      setHandoverNotes("");
      setReportIncidentFlag(false);
      setIncidentDescription("");
      await loadLifecycleData();
      await loadEquipment();
      fetchNotifications();
    } catch (err) {
      alert(`Operation failed: ${err.message}`);
    } finally {
      setLifecycleActionLoading(false);
    }
  }

  // --- Handlers: Notifications ---
  async function handleMarkAsRead(notifId) {
    try {
      await notificationService.markAsRead(notifId);
      await fetchNotifications();
    } catch (err) {
      console.warn("Mark read failed:", err.message);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      await notificationService.markAllAsRead();
      await fetchNotifications();
    } catch (err) {
      console.warn("Mark all read failed:", err.message);
    }
  }

  // Filter equipment for catalog
  const filteredEquipment = equipmentList.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      (item.name || "").toLowerCase().includes(query) ||
      (item.location || "").toLowerCase().includes(query) ||
      (item.category || "").toLowerCase().includes(query) ||
      (item.description || "").toLowerCase().includes(query);

    const matchesCategory =
      activeCategory === "All Equipment" || item.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  // --- Auth Guard ---
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="logo-icon">E</div>
        <p>Connecting to EquipX...</p>
      </div>
    );
  }

  if (!session) {
    return <Auth onAuthSuccess={(s) => setSession(s)} />;
  }

  return (
    <div className="app">
      {/* Top Navbar */}
      <nav className="navbar">
        <a className="logo" href="#explore" onClick={() => setActiveTab("explore")}>
          <span className="logo-icon">E</span>
          Equip<span>X</span>
        </a>

        <div className="nav-links">
          <a
            href="#explore"
            onClick={(e) => { e.preventDefault(); setActiveTab("explore"); }}
            style={{ color: activeTab === "explore" ? "#F97316" : undefined }}
          >
            Explore
          </a>
          <a
            href="#my-bookings"
            onClick={(e) => { e.preventDefault(); setActiveTab("my-bookings"); }}
            style={{ color: activeTab === "my-bookings" ? "#F97316" : undefined }}
          >
            My Bookings
          </a>
          <a
            href="#owner-portal"
            onClick={(e) => { e.preventDefault(); setActiveTab("owner-portal"); }}
            style={{ color: activeTab === "owner-portal" ? "#F97316" : undefined }}
          >
            Owner Portal
          </a>
          <a
            href="#lifecycle"
            onClick={(e) => { e.preventDefault(); setActiveTab("lifecycle"); }}
            style={{ color: activeTab === "lifecycle" ? "#F97316" : undefined }}
          >
            ProofLoop Handover
          </a>
          <a
            href="#audit"
            onClick={(e) => { e.preventDefault(); setActiveTab("audit"); }}
            style={{ color: activeTab === "audit" ? "#F97316" : undefined }}
          >
            Audit Ledger
          </a>
        </div>

        <div className="nav-actions">
          {/* User Role Badge */}
          <div className="user-badge">
            <span>{userProfile?.full_name || session.user.email}</span>
            <span className="role-tag">{userProfile?.role || "student"}</span>
          </div>

          {/* In-App Notification Bell */}
          <button
            className="notification-bell-btn"
            onClick={() => setShowNotifDrawer(true)}
            aria-label="View notifications"
          >
            ≡ƒöö
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </button>

          {/* Sign Out Button */}
          <button
            className="nav-button"
            onClick={async () => {
              await supabase.auth.signOut();
              setSession(null);
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Sub-Nav Portal Tabs */}
      <div className="portal-tabs">
        <button
          className={`portal-tab-btn ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          ≡ƒöì Explore Catalog
        </button>
        <button
          className={`portal-tab-btn ${activeTab === "my-bookings" ? "active" : ""}`}
          onClick={() => setActiveTab("my-bookings")}
        >
          ≡ƒôï My Bookings ({myBookings.length})
        </button>
        <button
          className={`portal-tab-btn ${activeTab === "owner-portal" ? "active" : ""}`}
          onClick={() => setActiveTab("owner-portal")}
        >
          ≡ƒ¢í∩╕Å Owner Approvals ({ownerBookings.filter((b) => b.status === "pending").length})
        </button>
        <button
          className={`portal-tab-btn ${activeTab === "lifecycle" ? "active" : ""}`}
          onClick={() => setActiveTab("lifecycle")}
        >
          ≡ƒöä ProofLoop Handover ({lifecycleBookings.length})
        </button>
        <button
          className={`portal-tab-btn ${activeTab === "audit" ? "active" : ""}`}
          onClick={() => setActiveTab("audit")}
        >
          ≡ƒô£ Activity History
        </button>
      </div>

      {/* =========================================================================
          VIEW 1: EXPLORE CATALOG & BOOKING REQUEST (Member 1 Work Preserved)
          ========================================================================= */}
      {activeTab === "explore" && (
        <main>
          {/* Hero Section */}
          <section className="hero">
            <div className="hero-content">
              <div className="eyebrow">
                <span className="status-dot"></span>
                THE SMARTER WAY TO SHARE RESOURCES
              </div>
              <h1>
                Share resources.
                <br />
                Build bigger <span>ideas.</span>
              </h1>
              <p className="hero-description">
                Discover the equipment your next big idea needs. Connect with campus resources, book smarter, and turn your projects into reality.
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#explore">
                  Explore Equipment <span>Γåù</span>
                </a>
                <button
                  className="secondary-button"
                  onClick={() => setActiveTab("my-bookings")}
                >
                  My Reservations <span>ΓåÆ</span>
                </button>
              </div>
              <div className="hero-note">
                <span className="note-check">Γ£ô</span>
                One campus. More possibilities.
              </div>
            </div>

            <div className="hero-visual">
              <div className="visual-glow"></div>
              <div className="visual-card visual-card-back">
                <span className="card-label">RESOURCE ACCESS</span>
                <div className="resource-symbol">Γîÿ</div>
                <span className="card-number">01 / 03</span>
              </div>
              <div className="visual-card visual-card-front">
                <div className="visual-top">
                  <span className="resource-tag">EQUIPX / LABS</span>
                  <span className="live-indicator">ΓùÅ LIVE</span>
                </div>
                <div className="equipment-art">Γî¼</div>
                <div className="visual-bottom">
                  <div>
                    <span className="small-label">BUILT FOR YOUR NEXT</span>
                    <h3>Big experiment.</h3>
                  </div>
                  <div className="round-arrow">Γåù</div>
                </div>
              </div>
              <div className="floating-badge">
                <span className="badge-check">Γ£ô</span>
                <div>
                  <strong>Ready to create</strong>
                  <p>Resources within reach</p>
                </div>
              </div>
              <div className="visual-caption">
                <span>01</span> / DISCOVER ┬╖ BOOK ┬╖ BUILD
              </div>
            </div>
          </section>

          {/* Feature Strip */}
          <section className="feature-strip" id="features">
            <div>
              <span className="strip-icon">Γåù</span>
              <div>
                <strong>Discover more</strong>
                <p>Find the right equipment</p>
              </div>
            </div>
            <div>
              <span className="strip-icon">Γù╖</span>
              <div>
                <strong>FairShare Scheduling</strong>
                <p>Atomic double-booking prevention</p>
              </div>
            </div>
            <div>
              <span className="strip-icon">Γ£ô</span>
              <div>
                <strong>ProofLoop Handover</strong>
                <p>Condition verification & audit trail</p>
              </div>
            </div>
          </section>

          {/* Catalog Section */}
          <section className="explore-section" id="explore">
            <div className="section-heading">
              <div>
                <span className="section-kicker">YOUR CAMPUS RESOURCE HUB</span>
                <h2>Find your next tool.</h2>
              </div>
              <p>
                Discover equipment, explore new possibilities, and find the resources you need for your next project.
              </p>
            </div>

            <div className="equipment-search">
              <span>Γîò</span>
              <input
                type="text"
                placeholder="Search equipment, labs, or categories..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search equipment"
              />
            </div>

            <div className="category-filters">
              {categories.map((category) => (
                <button
                  key={category}
                  className={activeCategory === category ? "category-button active" : "category-button"}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {loading && <p role="status">Loading equipment catalog...</p>}
            {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

            <div className="equipment-grid">
              {filteredEquipment.map((item) => (
                <article className="equipment-card" key={item.id}>
                  <div className="equipment-card-art">
                    <span className="equipment-category">{item.category}</span>
                    <span className="equipment-card-icon">Γî¼</span>
                    {/* Fixed Availability Label Bug: uses item.status === 'available' */}
                    <span
                      className={
                        item.status === "available"
                          ? "availability available"
                          : "availability unavailable"
                      }
                    >
                      {item.status === "available"
                        ? "Available"
                        : item.status === "maintenance"
                        ? "Under Maintenance"
                        : "Decommissioned"}
                    </span>
                  </div>

                  <div className="equipment-card-content">
                    <span className="equipment-location">Γåù {item.location}</span>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <button
                      className="equipment-action"
                      onClick={() => handleViewDetails(item.id)}
                      disabled={detailLoading}
                    >
                      View details & Request <span>Γåù</span>
                    </button>
                  </div>
                </article>
              ))}

              {filteredEquipment.length === 0 && !loading && (
                <div className="equipment-empty">
                  <h3>No equipment found</h3>
                  <p>Try another search term or clear the filters.</p>
                  <button
                    className="secondary-button"
                    onClick={() => { setSearch(""); setActiveCategory("All Equipment"); }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* =========================================================================
          VIEW 2: MY BOOKINGS (Borrower History & Status Tracking)
          ========================================================================= */}
      {activeTab === "my-bookings" && (
        <section className="portal-view">
          <div className="portal-header">
            <span className="section-kicker">BORROWER DASHBOARD</span>
            <h2>My Reservations</h2>
            <p>Track your reservation requests, approved time windows, and equipment returns.</p>
          </div>

          {myBookingsLoading && <p>Loading your reservations...</p>}
          {myBookingsError && <p style={{ color: "#dc2626" }}>{myBookingsError}</p>}

          <div className="booking-grid">
            {myBookings.map((b) => (
              <div className="booking-card" key={b.id}>
                <div>
                  <div className="booking-card-top">
                    <div>
                      <h3>{b.resources?.name || "Equipment"}</h3>
                      <span className="equipment-location">Γåù {b.resources?.location}</span>
                    </div>
                    <span className={`status-pill ${b.status}`}>{b.status}</span>
                  </div>

                  <div className="booking-card-meta" style={{ marginTop: "12px" }}>
                    <div>
                      <strong>Reservation Window:</strong><br />
                      {new Date(b.start_time).toLocaleString()} ΓåÆ {new Date(b.end_time).toLocaleString()}
                    </div>

                    {b.purpose && (
                      <div className="booking-card-purpose">
                        <strong>Purpose:</strong> {b.purpose}
                      </div>
                    )}

                    {b.status === "rejected" && (
                      <p style={{ color: "#DC2626", fontSize: "13px", fontWeight: "600", margin: "6px 0 0" }}>
                        Rejection reason: {b.rejection_reason || "No reason specified."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="card-actions">
                  {["pending", "approved"].includes(b.status) && (
                    <button
                      className="btn-sm btn-cancel"
                      onClick={() => handleCancelBooking(b.id)}
                    >
                      Cancel Reservation
                    </button>
                  )}
                </div>
              </div>
            ))}

            {myBookings.length === 0 && !myBookingsLoading && (
              <div className="equipment-empty" style={{ gridColumn: "1 / -1" }}>
                <h3>No reservations yet</h3>
                <p>Browse the equipment catalog to submit your first booking request.</p>
                <button
                  className="primary-button"
                  onClick={() => setActiveTab("explore")}
                >
                  Explore Catalog <span>Γåù</span>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          VIEW 3: OWNER PORTAL (Approval, Rejection & TrustPass Review)
          ========================================================================= */}
      {activeTab === "owner-portal" && (
        <section className="portal-view">
          <div className="portal-header">
            <span className="section-kicker">EQUIPMENT OWNER DECISION CENTER</span>
            <h2>Reservation Approvals</h2>
            <p>Review student requests, verify TrustPass eligibility, and manage booking approvals.</p>
          </div>

          {ownerActionError && (
            <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "12px 16px", borderRadius: "8px", marginBottom: "20px", fontWeight: "600" }}>
              ΓÜá∩╕Å {ownerActionError}
            </div>
          )}

          {ownerBookingsLoading && <p>Loading booking requests...</p>}
          {ownerBookingsError && <p style={{ color: "#dc2626" }}>{ownerBookingsError}</p>}

          <div className="booking-grid">
            {ownerBookings.map((b) => (
              <div className="booking-card" key={b.id}>
                <div>
                  <div className="booking-card-top">
                    <div>
                      <h3>{b.resources?.name}</h3>
                      <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#4B5563" }}>
                        Borrower: <strong>{b.profiles?.full_name}</strong> ({b.profiles?.institution})
                      </p>
                    </div>
                    <span className={`status-pill ${b.status}`}>{b.status}</span>
                  </div>

                  <div className="booking-card-meta" style={{ marginTop: "12px" }}>
                    <div>
                      <strong>Requested Window:</strong><br />
                      {new Date(b.start_time).toLocaleString()} ΓåÆ {new Date(b.end_time).toLocaleString()}
                    </div>

                    {b.purpose && (
                      <div className="booking-card-purpose">
                        <strong>Project:</strong> {b.purpose}
                      </div>
                    )}

                    {/* TrustPass Eligibility Pill */}
                    <div style={{ marginTop: "8px" }}>
                      <span className={`eligibility-pill ${b.eligibility?.eligible ? "eligible" : "ineligible"}`}>
                        {b.eligibility?.eligible ? "Γ£ô TrustPass: Eligible" : "ΓÜá TrustPass: Missing Prerequisites"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="card-actions">
                  {b.status === "pending" && (
                    <>
                      <button
                        className="btn-sm btn-approve"
                        onClick={() => handleApprove(b.id)}
                      >
                        Γ£ô Approve Request
                      </button>
                      <button
                        className="btn-sm btn-reject"
                        onClick={() => handleReject(b.id)}
                      >
                        Γ£ò Reject
                      </button>
                    </>
                  )}
                  {b.status === "approved" && (
                    <span style={{ fontSize: "12px", color: "#166534", fontWeight: "600" }}>
                      Γ£ô Approved (Ready for handover in ProofLoop)
                    </span>
                  )}
                </div>
              </div>
            ))}

            {ownerBookings.length === 0 && !ownerBookingsLoading && (
              <div className="equipment-empty" style={{ gridColumn: "1 / -1" }}>
                <h3>No requests for your equipment</h3>
                <p>When students submit booking requests for equipment you own, they will appear here for your review.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          VIEW 4: PROOFLOOP HANDOVER & INCIDENTS LIFECYCLE
          ========================================================================= */}
      {activeTab === "lifecycle" && (
        <section className="portal-view">
          <div className="portal-header">
            <span className="section-kicker">PROOFLOOP EQUIPMENT LIFECYCLE</span>
            <h2>Check-out & Return Operations</h2>
            <p>Record physical equipment issuance, return condition grades, and resolve damage reports.</p>
          </div>

          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "20px", margin: "24px 0 12px" }}>
            Active Handovers & Pending Returns ({lifecycleBookings.length})
          </h3>

          <div className="booking-grid">
            {lifecycleBookings.map((b) => (
              <div className="booking-card" key={b.id}>
                <div>
                  <div className="booking-card-top">
                    <div>
                      <h3>{b.resources?.name}</h3>
                      <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#4B5563" }}>
                        Borrower: <strong>{b.profiles?.full_name}</strong>
                      </p>
                    </div>
                    <span className={`status-pill ${b.status}`}>{b.status}</span>
                  </div>

                  <div className="booking-card-meta" style={{ marginTop: "12px" }}>
                    <div>
                      <strong>Window:</strong> {new Date(b.start_time).toLocaleString()} ΓåÆ {new Date(b.end_time).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="card-actions">
                  {b.status === "approved" && (
                    <button
                      className="btn-sm btn-checkout"
                      onClick={() => {
                        setActiveLifecycleModal({ type: "checkout", booking: b });
                        setHandoverGrade("excellent");
                        setHandoverNotes("");
                      }}
                    >
                      ≡ƒÜÇ Issue Equipment (Check-out)
                    </button>
                  )}

                  {b.status === "checked_out" && (
                    <button
                      className="btn-sm btn-return"
                      onClick={() => {
                        setActiveLifecycleModal({ type: "return", booking: b });
                        setHandoverGrade("good");
                        setHandoverNotes("");
                        setReportIncidentFlag(false);
                      }}
                    >
                      ≡ƒôÑ Accept Return & Inspect
                    </button>
                  )}
                </div>
              </div>
            ))}

            {lifecycleBookings.length === 0 && !lifecycleLoading && (
              <p style={{ color: "#71717A" }}>No equipment currently awaiting check-out or return.</p>
            )}
          </div>

          {/* Incident Tickets */}
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "20px", margin: "40px 0 12px" }}>
            Incident Tickets & Condition Reports ({incidentsList.length})
          </h3>

          <div className="booking-grid">
            {incidentsList.map((inc) => (
              <div className="booking-card" key={inc.id} style={{ borderLeft: "4px solid #DC2626" }}>
                <div>
                  <div className="booking-card-top">
                    <div>
                      <h3>{inc.resources?.name || "Equipment"}</h3>
                      <span style={{ fontSize: "12px", color: "#DC2626", fontWeight: "700", textTransform: "uppercase" }}>
                        {inc.incident_type} ({inc.severity} severity)
                      </span>
                    </div>
                    <span className={`status-pill ${inc.status}`}>{inc.status}</span>
                  </div>

                  <p style={{ fontSize: "13px", color: "#374151", margin: "10px 0" }}>
                    {inc.description}
                  </p>

                  {inc.resolution_notes && (
                    <div style={{ background: "#F0FDF4", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", color: "#166534" }}>
                      <strong>Resolution:</strong> {inc.resolution_notes}
                    </div>
                  )}
                </div>

                {inc.status === "reported" && (
                  <div className="card-actions">
                    <button
                      className="btn-sm btn-approve"
                      onClick={async () => {
                        const notes = window.prompt("Enter resolution notes:");
                        if (!notes) return;
                        await conditionService.resolveIncident(inc.id, { resolutionNotes: notes });
                        loadLifecycleData();
                      }}
                    >
                      Resolve Incident
                    </button>
                  </div>
                )}
              </div>
            ))}

            {incidentsList.length === 0 && (
              <p style={{ color: "#71717A" }}>No incidents reported. All equipment returned in good standing.</p>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          VIEW 5: ACTIVITY & IMMUTABLE AUDIT LEDGER
          ========================================================================= */}
      {activeTab === "audit" && (
        <section className="portal-view">
          <div className="portal-header">
            <span className="section-kicker">ZERO-TRUST LEDGER</span>
            <h2>Activity History & Audit Trail</h2>
            <p>Append-only audit trail recorded automatically by PostgreSQL triggers. Immutable by design.</p>
          </div>

          {auditLoading && <p>Loading immutable audit records...</p>}

          <div className="audit-timeline">
            {auditLogs.map((log) => (
              <div className="audit-entry" key={log.id}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="audit-action-tag">{log.action}</span>
                  <div className="audit-details">
                    <span>
                      {log.metadata?.resource_name ? `"${log.metadata.resource_name}"` : log.entity_type}
                    </span>
                    {log.metadata?.previous_status && (
                      <span style={{ color: "#71717A", marginLeft: "8px" }}>
                        ({log.metadata.previous_status} ΓåÆ {log.metadata.new_status})
                      </span>
                    )}
                  </div>
                </div>
                <div className="audit-timestamp">
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
            ))}

            {auditLogs.length === 0 && !auditLoading && (
              <p style={{ color: "#71717A" }}>No audit records available.</p>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          RESOURCE DETAILS & BOOKING MODAL (Member 1 Work Preserved & Fixed)
          ========================================================================= */}
      {(detailLoading || detailError || selectedResource) && (
        <div
          className="resource-modal-overlay"
          onClick={() => {
            if (!detailLoading) {
              setSelectedResource(null);
              setDetailError("");
            }
          }}
        >
          <section
            className="resource-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="resource-modal-close"
              onClick={() => {
                setSelectedResource(null);
                setDetailError("");
              }}
              aria-label="Close equipment details"
            >
              ├ù
            </button>

            {detailLoading && <p>Loading equipment details...</p>}
            {detailError && (
              <p className="resource-detail-error" role="alert">{detailError}</p>
            )}

            {selectedResource && (
              <>
                <span className="section-kicker">
                  {selectedResource.category || "CAMPUS EQUIPMENT"}
                </span>

                <h2 id="resource-modal-title">{selectedResource.name}</h2>

                <p className="resource-modal-location">
                  Γåù {selectedResource.location || "Location not specified"}
                </p>

                <p>{selectedResource.description || "No description provided."}</p>

                <div className="resource-modal-info">
                  <strong>Status:</strong>{" "}
                  <span className={`status-pill ${selectedResource.status}`}>
                    {selectedResource.status}
                  </span>
                </div>

                {selectedResource.usage_rules && (
                  <div className="resource-modal-info">
                    <strong>Usage rules</strong>
                    <p>{selectedResource.usage_rules}</p>
                  </div>
                )}

                {selectedResource.profiles?.full_name && (
                  <div className="resource-modal-info">
                    <strong>Resource owner:</strong> {selectedResource.profiles.full_name} ({selectedResource.profiles.institution})
                  </div>
                )}

                {selectedResource.resource_requirements?.length > 0 && (
                  <div className="resource-modal-info">
                    <strong>TrustPass Prerequisites:</strong>
                    <ul>
                      {selectedResource.resource_requirements.map((requirement) => (
                        <li key={requirement.id}>{requirement.description}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="booking-form">
                  <h3>Request to book this equipment</h3>
                  <p>Select when you need the equipment and explain your project.</p>

                  <label htmlFor="booking-start">Start date and time</label>
                  <input
                    id="booking-start"
                    type="datetime-local"
                    value={bookingStart}
                    onChange={(event) => setBookingStart(event.target.value)}
                    disabled={bookingLoading}
                  />

                  <label htmlFor="booking-end">End date and time</label>
                  <input
                    id="booking-end"
                    type="datetime-local"
                    value={bookingEnd}
                    min={bookingStart || undefined}
                    onChange={(event) => setBookingEnd(event.target.value)}
                    disabled={bookingLoading}
                  />

                  <label htmlFor="booking-purpose">Purpose of booking</label>
                  <textarea
                    id="booking-purpose"
                    value={bookingPurpose}
                    onChange={(event) => setBookingPurpose(event.target.value)}
                    placeholder="Describe your project, academic purpose, or intended research use"
                    rows={3}
                    disabled={bookingLoading}
                  />

                  {bookingMessage && (
                    <p className="booking-success" role="status">{bookingMessage}</p>
                  )}

                  {bookingError && (
                    <p className="booking-error" role="alert">{bookingError}</p>
                  )}

                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleRequestBooking}
                    disabled={bookingLoading || selectedResource.status !== "available"}
                  >
                    {bookingLoading ? "Submitting..." : "Submit Booking Request"}
                  </button>

                  {selectedResource.status !== "available" && (
                    <p className="booking-error">
                      This equipment is currently not available for new reservations.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* =========================================================================
          PROOFLOOP HANDOVER DIALOG (Check-out & Return Form)
          ========================================================================= */}
      {activeLifecycleModal && (
        <div className="lifecycle-form-overlay" onClick={() => setActiveLifecycleModal(null)}>
          <div className="lifecycle-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>
              {activeLifecycleModal.type === "checkout"
                ? "Physical Check-out Inspection"
                : "Equipment Return Inspection"}
            </h3>
            <p style={{ margin: 0, fontSize: "14px", color: "#52525B" }}>
              Equipment: <strong>{activeLifecycleModal.booking.resources?.name}</strong>
              <br />
              Borrower: {activeLifecycleModal.booking.profiles?.full_name}
            </p>

            <div className="dialog-field">
              <label>Equipment Condition Grade</label>
              <select
                value={handoverGrade}
                onChange={(e) => setHandoverGrade(e.target.value)}
              >
                <option value="excellent">Excellent ΓÇö Like new</option>
                <option value="good">Good ΓÇö Minor cosmetic signs of normal use</option>
                <option value="fair">Fair ΓÇö Functional but noticeable wear</option>
                {activeLifecycleModal.type === "return" && (
                  <>
                    <option value="damaged">Damaged ΓÇö Needs repair or service</option>
                    <option value="unusable">Unusable ΓÇö Severe damage/inoperable</option>
                  </>
                )}
              </select>
            </div>

            <div className="dialog-field">
              <label>Inspection Notes & Accessories</label>
              <textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Document accessories included, cables, probe conditions..."
                rows={3}
              />
            </div>

            {activeLifecycleModal.type === "return" && (
              <div className="dialog-field">
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={reportIncidentFlag}
                    onChange={(e) => setReportIncidentFlag(e.target.checked)}
                  />
                  File Damage or Misuse Incident Ticket
                </label>
                {reportIncidentFlag && (
                  <textarea
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    placeholder="Describe specific damage or discrepancy..."
                    rows={2}
                    style={{ marginTop: "6px" }}
                  />
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "12px" }}>
              <button
                className="btn-sm btn-cancel"
                onClick={() => setActiveLifecycleModal(null)}
                disabled={lifecycleActionLoading}
              >
                Cancel
              </button>
              <button
                className="btn-sm btn-approve"
                onClick={handleExecuteLifecycleAction}
                disabled={lifecycleActionLoading}
              >
                {lifecycleActionLoading ? "Recording..." : "Confirm & Save Snapshot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          IN-APP NOTIFICATION DRAWER
          ========================================================================= */}
      {showNotifDrawer && (
        <div className="notif-drawer-backdrop" onClick={() => setShowNotifDrawer(false)}>
          <div className="notif-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="notif-drawer-header">
              <h3>In-App Alerts ({unreadCount} unread)</h3>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {unreadCount > 0 && (
                  <button
                    className="btn-sm btn-cancel"
                    onClick={handleMarkAllAsRead}
                    style={{ fontSize: "11px", padding: "4px 8px" }}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  className="resource-modal-close"
                  onClick={() => setShowNotifDrawer(false)}
                  style={{ position: "static" }}
                >
                  ├ù
                </button>
              </div>
            </div>

            <div className="notif-list">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.is_read ? "unread" : ""}`}
                >
                  <div className="notif-item-top">
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-time">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="notif-msg">{n.message}</p>
                  {!n.is_read && (
                    <button
                      className="btn-sm btn-cancel"
                      onClick={() => handleMarkAsRead(n.id)}
                      style={{ alignSelf: "flex-end", padding: "2px 8px", fontSize: "10px" }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}

              {notifications.length === 0 && (
                <p style={{ textAlign: "center", color: "#94A3B8", marginTop: "32px" }}>
                  No notifications yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <a className="logo" href="#">
          <span className="logo-icon">E</span>
          Equip<span>X</span>
        </a>
        <p>Share resources. Build bigger ideas.</p>
        <span className="footer-mark">CAMPUS RESOURCE EXCHANGE PLATFORM Γåù</span>
      </footer>
    </div>
  );
}

export default App;
