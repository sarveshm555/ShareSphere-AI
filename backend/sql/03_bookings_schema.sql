-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 3 - FAIRSHARE BOOKING SYSTEM
-- ============================================================================

-- Enable btree_gist extension for range-based exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ----------------------------------------------------------------------------
-- 1. TABLE: bookings
-- Tracks reservation requests, approved windows, and status transitions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'waitlisted', 'checked_out', 'returned', 'cancelled', 'overdue')
    ),
    purpose TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Chronological integrity constraint
    CONSTRAINT check_booking_time_order CHECK (end_time > start_time)
);

-- ----------------------------------------------------------------------------
-- 2. CRITICAL CONSTRAINT: Prevent Overlapping Approved Reservations
-- Enforces concurrency safety at the PostgreSQL engine level
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS prevent_overlapping_approved_bookings;

ALTER TABLE public.bookings
ADD CONSTRAINT prevent_overlapping_approved_bookings
EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time) WITH &&
) WHERE (status IN ('approved', 'checked_out'));

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_bookings_resource ON public.bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_borrower ON public.bookings(borrower_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);

-- Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- SELECT: Borrowers see their own bookings; Owners see requests for their items; Admins see all
CREATE POLICY "Bookings viewable by borrower, resource owner, or admin"
ON public.bookings FOR SELECT
TO authenticated
USING (
    borrower_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

-- INSERT: Authenticated users can create pending bookings for themselves
CREATE POLICY "Borrowers can create booking requests"
ON public.bookings FOR INSERT
TO authenticated
WITH CHECK (
    borrower_id = auth.uid()
    AND status = 'pending'
);

-- UPDATE: Borrowers can only cancel their own pending/approved bookings
CREATE POLICY "Borrowers can cancel their own bookings"
ON public.bookings FOR UPDATE
TO authenticated
USING (
    borrower_id = auth.uid()
)
WITH CHECK (
    borrower_id = auth.uid()
    AND status = 'cancelled'
);

-- UPDATE: Resource owners and admins can approve, reject, or update bookings
CREATE POLICY "Resource owners and admins can manage booking status"
ON public.bookings FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = bookings.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC APPROVAL TRANSACTION (RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_booking_atomic(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_owner_id UUID;
BEGIN
    -- Fetch the booking record with a row-level lock
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking with ID % not found.', p_booking_id;
    END IF;

    -- Verify authorization: Caller must be the resource owner or an admin
    SELECT owner_id INTO v_owner_id
    FROM public.resources
    WHERE id = v_booking.resource_id;

    IF v_owner_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: You are not the owner of this resource.';
    END IF;

    -- Validate status transition
    IF v_booking.status NOT IN ('pending', 'waitlisted') THEN
        RAISE EXCEPTION 'Cannot approve booking: current status is "%".', v_booking.status;
    END IF;

    -- Transition to approved (triggers PostgreSQL exclusion constraint if conflict exists)
    UPDATE public.bookings
    SET status = 'approved', updated_at = NOW()
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'status', 'approved'
    );
EXCEPTION
    WHEN exclusion_violation THEN
        RAISE EXCEPTION 'Booking conflict: An approved reservation already overlaps this time window.';
END;
$$;