
import { useEffect, useState } from "react";
import "./App.css";
import { resourceService } from "./services/resourceService";
import { supabase } from "./lib/supabase";
import Auth from "./Auth";
import { bookingService } from "./services/bookingService";




const categories = [
  "All Equipment",
  "Electronics",
  "Fabrication",
  "Lab Equipment",
];


function App() {
  // 1. All state hooks must be declared first
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All Equipment");

  const [equipmentList, setEquipmentList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedResource, setSelectedResource] = useState(null);
const [detailLoading, setDetailLoading] = useState(false);
const [detailError, setDetailError] = useState("");


const [bookingStart, setBookingStart] = useState("");
const [bookingEnd, setBookingEnd] = useState("");
const [bookingPurpose, setBookingPurpose] = useState("");
const [bookingLoading, setBookingLoading] = useState(false);
const [bookingMessage, setBookingMessage] = useState("");
const [bookingError, setBookingError] = useState("");

  // 2. Authentication session listener
  useEffect(() => {
    let active = true;

    async function initializeSession() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        console.error("Session check failed:", error.message);
      }

      setSession(data?.session ?? null);
      setAuthLoading(false);
    }

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;

      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // 3. Load equipment only after authentication
  useEffect(() => {
    let cancelled = false;

    async function loadEquipment() {
      if (!session) {
        setEquipmentList([]);
        setLoading(false);
        setError("");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const result = await resourceService.getResources({
          status: "all",
          limit: 100,
        });

        if (!cancelled) {
          setEquipmentList(result.resources || []);
        }
      } catch (err) {
        console.error("Equipment loading failed:", err);

        if (!cancelled) {
          setError(err.message || "Unable to load equipment.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEquipment();

    return () => {
      cancelled = true;
    };
  }, [session]);

async function handleViewDetails(resourceId) {
  try {
    setDetailLoading(true);
    setDetailError("");
    setSelectedResource(null);

    const { data, error } = await supabase
      .from("resources")
      .select(
        "*, profiles:owner_id(id, full_name, institution), resource_requirements(*)"
      )
      .eq("id", resourceId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Equipment not found or you do not have permission to view it.");
    }

    setSelectedResource(data);
  } catch (err) {
    console.error("Failed to load equipment details:", err);
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
      `Booking request submitted successfully. Status: ${result.status || "pending"}.`
    );
  } catch (err) {
    console.error("Booking request failed:", err);
    setBookingError(err.message || "Unable to submit booking request.");
  } finally {
    setBookingLoading(false);
  }
}



const filteredEquipment = equipmentList.filter((item) => {
  const query = search.trim().toLowerCase();

  const matchesSearch =
    (item.name || "").toLowerCase().includes(query) ||
    (item.location || "").toLowerCase().includes(query) ||
    (item.category || "").toLowerCase().includes(query) ||
    (item.description || "").toLowerCase().includes(query);

  const matchesCategory =
    activeCategory === "All Equipment" ||
    item.category === activeCategory;

  return matchesSearch && matchesCategory;
});



  // Keep your existing main page return (...) below this line.


  return (
    <div className="app">
      <nav className="navbar">
        <a className="logo" href="#">
          <span className="logo-icon">E</span>
          Equip<span>X</span>
        </a>

        <div className="nav-links">
          <a href="#explore">Explore Equipment</a>
          <a href="#how-it-works">How It Works</a>
          <a href="#features">Features</a>
        </div>

        
<div className="nav-actions">
  <a className="nav-button" href="#explore">
    Explore Resources <span>↗</span>
  </a>

  <button
    className="nav-button"
    onClick={async () => {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout failed:", error.message);
      }
    }}
  >
    Sign out
  </button>
</div>

      </nav>

      
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
        ×
      </button>

      {detailLoading && <p>Loading equipment details...</p>}

      {detailError && (
        <p className="resource-detail-error" role="alert">
          {detailError}
        </p>
      )}

      {selectedResource && (
        <>
          <span className="section-kicker">
            {selectedResource.category || "CAMPUS EQUIPMENT"}
          </span>

          <h2 id="resource-modal-title">{selectedResource.name}</h2>

          <p className="resource-modal-location">
            ↗ {selectedResource.location || "Location not specified"}
          </p>

          <p>
            {selectedResource.description || "No description provided."}
          </p>

          <div className="resource-modal-info">
            <strong>Status:</strong> {selectedResource.status || "Unknown"}
          </div>

          {selectedResource.usage_rules && (
            <div className="resource-modal-info">
              <strong>Usage rules</strong>
              <p>{selectedResource.usage_rules}</p>
            </div>  
          )}

          {selectedResource.profiles?.full_name && (
            <div className="resource-modal-info">
              <strong>Resource owner:</strong>{" "}
              {selectedResource.profiles.full_name}
            </div>
          )}

          {selectedResource.resource_requirements?.length > 0 && (
            <div className="resource-modal-info">
              <strong>Requirements</strong>
              <ul>
                {selectedResource.resource_requirements.map((requirement) => (
                  <li key={requirement.id}>
                    {requirement.description}
                  </li>
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
    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)}
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
    placeholder="Describe your project or intended use"
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
    {bookingLoading ? "Submitting..." : "Request Booking"}
  </button>

  {selectedResource.status !== "available" && (
    <p className="booking-error">
      This equipment is not currently available for booking.
    </p>
  )}
</div>

        </>
      )}
    </section>
  </div>
)}


      <main>
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
              Discover the equipment your next big idea needs.
              Connect with campus resources, book smarter, and
              turn your projects into reality.
            </p>

            <div className="hero-actions">
              <a className="primary-button" href="#explore">
                Explore Equipment <span>↗</span>
              </a>
              <a className="secondary-button" href="#how-it-works">
                See how it works <span>→</span>
              </a>
            </div>

            <div className="hero-note">
              <span className="note-check">✓</span>
              One campus. More possibilities.
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow"></div>

            <div className="visual-card visual-card-back">
              <span className="card-label">RESOURCE ACCESS</span>
              <div className="resource-symbol">⌘</div>
              <span className="card-number">01 / 03</span>
            </div>

            <div className="visual-card visual-card-front">
              <div className="visual-top">
                <span className="resource-tag">EQUIPX / LABS</span>
                <span className="live-indicator">● LIVE</span>
              </div>

              <div className="equipment-art">⌬</div>

              <div className="visual-bottom">
                <div>
                  <span className="small-label">BUILT FOR YOUR NEXT</span>
                  <h3>Big experiment.</h3>
                </div>
                <div className="round-arrow">↗</div>
              </div>
            </div>

            <div className="floating-badge">
              <span className="badge-check">✓</span>
              <div>
                <strong>Ready to create</strong>
                <p>Resources within reach</p>
              </div>
            </div>

            <div className="visual-caption">
              <span>01</span> / DISCOVER · BOOK · BUILD
            </div>
          </div>
        </section>

        <section className="feature-strip" id="features">
          <div>
            <span className="strip-icon">↗</span>
            <div>
              <strong>Discover more</strong>
              <p>Find the right equipment</p>
            </div>
          </div>

          <div>
            <span className="strip-icon">◷</span>
            <div>
              <strong>Book smarter</strong>
              <p>Manage your resource requests</p>
            </div>
          </div>

          <div>
            <span className="strip-icon">✓</span>
            <div>
              <strong>Share responsibly</strong>
              <p>Track equipment condition</p>
            </div>
          </div>
        </section>

        
<section className="explore-section" id="explore">
  <div className="section-heading">
    <div>
      <span className="section-kicker">YOUR CAMPUS RESOURCE HUB</span>
      <h2>Find your next tool.</h2>
    </div>
    <p>
      Discover equipment, explore new possibilities, and find
      the resources you need for your next project.
    </p>
  </div>

  <div className="equipment-search">
    <span>⌕</span>
    <input
      type="text"
      placeholder="Search equipment or laboratory..."
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      aria-label="Search equipment or laboratory"
    />
  </div>

  <div className="category-filters">
    {categories.map((category) => (
      <button
        key={category}
        className={
          activeCategory === category
            ? "category-button active"
            : "category-button"
        }
        onClick={() => setActiveCategory(category)}
      >
        {category}
      </button>
    ))}
  </div>

  {loading && (
  <p role="status">Loading equipment from Supabase...</p>
)}

{error && (
  <p role="alert" style={{ color: "#dc2626" }}>
    {error}
  </p>
)}

  <div className="equipment-grid">
    {filteredEquipment.map((item) => (
      <article className="equipment-card" key={item.id}>
        <div className="equipment-card-art">
          <span className="equipment-category">{item.category}</span>
          <span className="equipment-card-icon">{item.icon}</span>
          <span
            className={
              item.available
                ? "availability available"
                : "availability unavailable"
            }
          >
            {item.available ? "Available" : "Currently booked"}
          </span>
        </div>

        <div className="equipment-card-content">
          <span className="equipment-location">
            ↗ {item.location}
          </span>
          <h3>{item.name}</h3>
          <p>{item.description}</p>

          <button
  className="equipment-action"
  onClick={() => handleViewDetails(item.id)}
  disabled={detailLoading}
>
  View details <span>↗</span>
</button>
        </div>
      </article>
    ))}

    {filteredEquipment.length === 0 && (
      <div className="equipment-empty">
        <h3>No equipment found</h3>
        <p>Try another search term or select a different category.</p>
        <button
          className="secondary-button"
          onClick={() => {
            setSearch("");
            setActiveCategory("All Equipment");
          }}
        >
          Clear filters
        </button>
      </div>
    )}
  </div>
</section>


        <section className="how-section" id="how-it-works">
          <span className="section-kicker">SIMPLE BY DESIGN</span>
          <h2>From idea to reality.</h2>

          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span>
              <h3>Discover</h3>
              <p>Find the equipment and facilities your project requires.</p>
            </article>

            <article className="step-card">
              <span className="step-number">02</span>
              <h3>Request</h3>
              <p>Check requirements and submit a booking request.</p>
            </article>

            <article className="step-card">
              <span className="step-number">03</span>
              <h3>Create</h3>
              <p>Use resources responsibly and document their condition.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="footer">
        <a className="logo" href="#">
          <span className="logo-icon">E</span>
          Equip<span>X</span>
        </a>
        <p>Share resources. Build bigger ideas.</p>
        <span className="footer-mark">MADE FOR CAMPUS INNOVATION ↗</span>
      </footer>
    </div>
  );
}

export default App;
