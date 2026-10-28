-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 4 - PROOFLOOP HANDOVER & INCIDENTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE: handover_records
-- Tracks physical equipment issuance and return timestamps
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handover_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID UNIQUE NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
    borrower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    checkout_by UUID NOT NULL REFERENCES public.profiles(id),
    checkout_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_return_time TIMESTAMPTZ NOT NULL,
    return_by UUID REFERENCES public.profiles(id),
    return_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handover_booking ON public.handover_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_handover_borrower ON public.handover_records(borrower_id);
CREATE INDEX IF NOT EXISTS idx_handover_status ON public.handover_records(status);

ALTER TABLE public.handover_records ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. TABLE: condition_reports
-- ProofLoop equipment condition snapshots at checkout and return
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.condition_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES public.profiles(id),
    stage TEXT NOT NULL CHECK (stage IN ('checkout', 'return', 'audit')),
    condition_grade TEXT NOT NULL CHECK (condition_grade IN ('excellent', 'good', 'fair', 'damaged', 'unusable')),
    notes TEXT,
    photo_paths TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_condition_booking ON public.condition_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_condition_resource ON public.condition_reports(resource_id);

ALTER TABLE public.condition_reports ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. TABLE: incidents
-- Discrepancies, physical damage, missing components, or overdue tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES public.profiles(id),
    incident_type TEXT NOT NULL CHECK (incident_type IN ('damage', 'missing_item', 'late_return', 'misuse', 'other')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'under_review', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_resource ON public.incidents(resource_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- HANDOVER RECORDS
CREATE POLICY "Handover records viewable by borrower, owner, or admin"
ON public.handover_records FOR SELECT
TO authenticated
USING (
    borrower_id = auth.uid()
    OR checkout_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = handover_records.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "Owners and admins can create and update handover records"
ON public.handover_records FOR ALL
TO authenticated
USING (
    public.is_owner_or_admin()
)
WITH CHECK (
    public.is_owner_or_admin()
);

-- CONDITION REPORTS
CREATE POLICY "Condition reports viewable by borrower, owner, or admin"
ON public.condition_reports FOR SELECT
TO authenticated
USING (
    inspector_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = condition_reports.booking_id AND b.borrower_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = condition_reports.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "Authorized users can insert condition reports"
ON public.condition_reports FOR INSERT
TO authenticated
WITH CHECK (
    inspector_id = auth.uid()
);

-- INCIDENTS
CREATE POLICY "Incidents viewable by reporter, owner, or admin"
ON public.incidents FOR SELECT
TO authenticated
USING (
    reporter_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "Authenticated users can report incidents"
ON public.incidents FOR INSERT
TO authenticated
WITH CHECK (
    reporter_id = auth.uid()
);

CREATE POLICY "Owners and admins can resolve and update incidents"
ON public.incidents FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.resources r
        WHERE r.id = incidents.resource_id AND r.owner_id = auth.uid()
    )
    OR public.is_admin()
);

-- ----------------------------------------------------------------------------
-- 5. ATOMIC CHECKOUT & RETURN PROCEDURES (RPCs)
-- ----------------------------------------------------------------------------

-- Procedure: Atomic Equipment Checkout
CREATE OR REPLACE FUNCTION public.process_checkout_atomic(
    p_booking_id UUID,
    p_condition_grade TEXT,
    p_notes TEXT DEFAULT NULL,
    p_photo_paths TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_handover_id UUID;
BEGIN
    -- 1. Lock and validate booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking with ID % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'approved' THEN
        RAISE EXCEPTION 'Cannot checkout: Booking is "%", expected "approved".', v_booking.status;
    END IF;

    -- 2. Verify caller is owner or admin
    SELECT * INTO v_resource
    FROM public.resources
    WHERE id = v_booking.resource_id;

    IF v_resource.owner_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the resource owner or an admin can issue equipment.';
    END IF;

    -- 3. Update booking status
    UPDATE public.bookings
    SET status = 'checked_out', updated_at = NOW()
    WHERE id = p_booking_id;

    -- 4. Create handover record
    INSERT INTO public.handover_records (
        booking_id,
        resource_id,
        borrower_id,
        checkout_by,
        checkout_time,
        expected_return_time,
        status
    ) VALUES (
        v_booking.id,
        v_booking.resource_id,
        v_booking.borrower_id,
        auth.uid(),
        NOW(),
        v_booking.end_time,
        'active'
    )
    RETURNING id INTO v_handover_id;

    -- 5. Record checkout condition report
    INSERT INTO public.condition_reports (
        booking_id,
        resource_id,
        inspector_id,
        stage,
        condition_grade,
        notes,
        photo_paths
    ) VALUES (
        v_booking.id,
        v_booking.resource_id,
        auth.uid(),
        'checkout',
        p_condition_grade,
        p_notes,
        p_photo_paths
    );

    RETURN jsonb_build_object(
        'success', true,
        'handover_id', v_handover_id,
        'booking_id', p_booking_id,
        'status', 'checked_out'
    );
END;
$$;

-- Procedure: Atomic Equipment Return
CREATE OR REPLACE FUNCTION public.process_return_atomic(
    p_booking_id UUID,
    p_condition_grade TEXT,
    p_notes TEXT DEFAULT NULL,
    p_photo_paths TEXT[] DEFAULT '{}',
    p_report_incident BOOLEAN DEFAULT FALSE,
    p_incident_desc TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_resource public.resources%ROWTYPE;
    v_handover public.handover_records%ROWTYPE;
    v_incident_id UUID := NULL;
BEGIN
    -- 1. Lock and validate booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking with ID % not found.', p_booking_id;
    END IF;

    IF v_booking.status <> 'checked_out' THEN
        RAISE EXCEPTION 'Cannot return: Booking is "%", expected "checked_out".', v_booking.status;
    END IF;

    -- 2. Verify caller is owner or admin
    SELECT * INTO v_resource
    FROM public.resources
    WHERE id = v_booking.resource_id;

    IF v_resource.owner_id <> auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only the resource owner or an admin can accept returned equipment.';
    END IF;

    -- 3. Update handover record
    UPDATE public.handover_records
    SET return_by = auth.uid(),
        return_time = NOW(),
        status = 'completed',
        updated_at = NOW()
    WHERE booking_id = p_booking_id;

    -- 4. Record return condition report
    INSERT INTO public.condition_reports (
        booking_id,
        resource_id,
        inspector_id,
        stage,
        condition_grade,
        notes,
        photo_paths
    ) VALUES (
        v_booking.id,
        v_booking.resource_id,
        auth.uid(),
        'return',
        p_condition_grade,
        p_notes,
        p_photo_paths
    );

    -- 5. File incident if damage or violation was flagged
    IF p_report_incident OR p_condition_grade IN ('damaged', 'unusable') THEN
        INSERT INTO public.incidents (
            booking_id,
            resource_id,
            reporter_id,
            incident_type,
            severity,
            description,
            status
        ) VALUES (
            v_booking.id,
            v_booking.resource_id,
            auth.uid(),
            CASE WHEN p_condition_grade IN ('damaged', 'unusable') THEN 'damage' ELSE 'other' END,
            CASE WHEN p_condition_grade = 'unusable' THEN 'critical' ELSE 'medium' END,
            COALESCE(p_incident_desc, 'Damage identified during return inspection.'),
            'reported'
        )
        RETURNING id INTO v_incident_id;

        -- Put resource into maintenance if severely damaged
        IF p_condition_grade IN ('damaged', 'unusable') THEN
            UPDATE public.resources
            SET status = 'maintenance', updated_at = NOW()
            WHERE id = v_booking.resource_id;
        END IF;
    END IF;

    -- 6. Update booking status to returned
    UPDATE public.bookings
    SET status = 'returned', updated_at = NOW()
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'status', 'returned',
        'incident_id', v_incident_id
    );
END;
$$;