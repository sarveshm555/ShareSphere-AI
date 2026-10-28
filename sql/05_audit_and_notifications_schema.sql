-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 5 - AUDIT TRAIL & IN-APP NOTIFICATIONS (PATCHED)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE: audit_logs
-- Append-only ledger recording all security and state mutations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. TABLE: notifications
-- User-specific alert center
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'booking_request', 'booking_approved', 'booking_rejected', 
        'booking_cancelled', 'checkout', 'return', 'incident', 'system'
    )),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    link_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. AUDIT IMMUTABILITY TRIGGER (DEFENSE-IN-DEPTH)
-- Enforces that rows can NEVER be modified or erased, even by privileged roles
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are strictly immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_audit_tampering ON public.audit_logs;
CREATE TRIGGER tr_prevent_audit_tampering
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_tampering();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- AUDIT LOGS: SELECT
-- Admins view all. Users view logs where they are the actor OR are party to the booking/resource.
DROP POLICY IF EXISTS "Users can view relevant audit logs, Admins view all" ON public.audit_logs;
CREATE POLICY "Users can view relevant audit logs, Admins view all"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
    actor_id = auth.uid() 
    OR public.is_admin()
    OR (
        entity_type = 'booking' AND EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = audit_logs.entity_id
              AND (
                  b.borrower_id = auth.uid() 
                  OR EXISTS (
                      SELECT 1 FROM public.resources r 
                      WHERE r.id = b.resource_id AND r.owner_id = auth.uid()
                  )
              )
        )
    )
);

-- AUDIT LOGS: INSERT
DROP POLICY IF EXISTS "Authenticated users can insert audit records" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit records"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
    actor_id = auth.uid() OR public.is_admin()
);

-- AUDIT LOGS: UPDATE (Explicitly forbidden via RLS check to trigger immediate client error)
DROP POLICY IF EXISTS "Prevent updates on audit_logs" ON public.audit_logs;
CREATE POLICY "Prevent updates on audit_logs"
ON public.audit_logs FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (false);

-- AUDIT LOGS: DELETE (Explicitly forbidden via RLS)
DROP POLICY IF EXISTS "Prevent deletes on audit_logs" ON public.audit_logs;
CREATE POLICY "Prevent deletes on audit_logs"
ON public.audit_logs FOR DELETE
TO authenticated
USING (false);

-- NOTIFICATIONS: RLS POLICIES
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow notification creation" ON public.notifications;
CREATE POLICY "Allow notification creation"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. AUTOMATIC AUDIT & NOTIFICATION DATABASE TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tr_sync_booking_audit_and_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resource_name TEXT;
    v_owner_id UUID;
    v_borrower_name TEXT;
BEGIN
    SELECT name, owner_id INTO v_resource_name, v_owner_id
    FROM public.resources
    WHERE id = NEW.resource_id;

    SELECT full_name INTO v_borrower_name
    FROM public.profiles
    WHERE id = NEW.borrower_id;

    -- 1. INSERT OPERATION: New booking request created
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (
            NEW.borrower_id,
            'BOOKING_REQUESTED',
            'booking',
            NEW.id,
            jsonb_build_object(
                'resource_id', NEW.resource_id,
                'resource_name', v_resource_name,
                'start_time', NEW.start_time,
                'end_time', NEW.end_time
            )
        );

        INSERT INTO public.notifications (user_id, title, message, type, metadata)
        VALUES (
            v_owner_id,
            'New Booking Request',
            format('%s has requested to borrow "%s".', COALESCE(v_borrower_name, 'A student'), v_resource_name),
            'booking_request',
            jsonb_build_object('booking_id', NEW.id, 'resource_id', NEW.resource_id)
        );

    -- 2. UPDATE OPERATION: Booking status transition
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (
            COALESCE(auth.uid(), NEW.borrower_id),
            format('BOOKING_%s', UPPER(NEW.status)),
            'booking',
            NEW.id,
            jsonb_build_object(
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'resource_id', NEW.resource_id,
                'resource_name', v_resource_name
            )
        );

        IF NEW.status = 'approved' THEN
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (
                NEW.borrower_id,
                'Booking Approved',
                format('Your reservation for "%s" has been approved!', v_resource_name),
                'booking_approved',
                jsonb_build_object('booking_id', NEW.id, 'resource_id', NEW.resource_id)
            );
        ELSIF NEW.status = 'rejected' THEN
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (
                NEW.borrower_id,
                'Booking Rejected',
                format('Your reservation for "%s" was rejected. Reason: %s', v_resource_name, COALESCE(NEW.rejection_reason, 'No reason specified.')),
                'booking_rejected',
                jsonb_build_object('booking_id', NEW.id, 'rejection_reason', NEW.rejection_reason)
            );
        ELSIF NEW.status = 'checked_out' THEN
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (
                NEW.borrower_id,
                'Equipment Checked Out',
                format('You have successfully checked out "%s". Please return on time.', v_resource_name),
                'checkout',
                jsonb_build_object('booking_id', NEW.id, 'resource_id', NEW.resource_id)
            );
        ELSIF NEW.status = 'returned' THEN
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (
                v_owner_id,
                'Equipment Returned',
                format('"%s" has been returned by %s.', v_resource_name, COALESCE(v_borrower_name, 'borrower')),
                'return',
                jsonb_build_object('booking_id', NEW.id, 'resource_id', NEW.resource_id)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bookings_audit_and_notify ON public.bookings;
CREATE TRIGGER tr_bookings_audit_and_notify
    AFTER INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.tr_sync_booking_audit_and_notify();