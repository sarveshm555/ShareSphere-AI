-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 7 - SECURITY & NOTIFICATION REFINEMENTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURITY HARDENING: Restrict dev_assign_role to Administrators
-- Prevents unauthenticated/student callers from escalating their own privileges
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dev_assign_role(target_email TEXT, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_id UUID;
BEGIN
    -- Security guard: strictly restrict role assignment to administrators or service_role
    IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only system administrators can assign or alter user roles.';
    END IF;

    IF new_role NOT IN ('student', 'owner', 'admin') THEN
        RAISE EXCEPTION 'Invalid role: %', new_role;
    END IF;

    SELECT id INTO target_id FROM auth.users WHERE email = target_email;
    IF target_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found.', target_email;
    END IF;

    UPDATE public.profiles
    SET role = new_role, updated_at = NOW()
    WHERE id = target_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. NOTIFICATIONS & AUDIT REFINEMENT: Include Booking Cancellation Alerts
-- Ensures resource owners are alerted when borrowers cancel bookings
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
        ELSIF NEW.status = 'cancelled' THEN
            INSERT INTO public.notifications (user_id, title, message, type, metadata)
            VALUES (
                v_owner_id,
                'Booking Cancelled',
                format('Reservation for "%s" was cancelled by %s.', v_resource_name, COALESCE(v_borrower_name, 'the borrower')),
                'booking_cancelled',
                jsonb_build_object('booking_id', NEW.id, 'resource_id', NEW.resource_id)
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
