-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 2 - TRUSTPASS ELIGIBILITY VERIFICATION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE: eligibility_verifications
-- Tracks student training, certifications, and departmental approvals
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eligibility_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requirement_type TEXT NOT NULL CHECK (requirement_type IN ('training', 'certification', 'department_approval', 'membership')),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'pending', 'rejected', 'expired')),
    issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning-fast requirement lookup during booking requests
CREATE INDEX IF NOT EXISTS idx_verifications_user ON public.eligibility_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_verifications_lookup ON public.eligibility_verifications(user_id, requirement_type, status);

-- Enable RLS
ALTER TABLE public.eligibility_verifications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- Borrowers can view only their own verifications; Owners/Admins can inspect all verifications
CREATE POLICY "Users can view own verifications or staff can view all"
ON public.eligibility_verifications FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR public.is_owner_or_admin()
);

-- Only owners and admins can issue or grant verifications
CREATE POLICY "Owners and admins can grant verifications"
ON public.eligibility_verifications FOR INSERT
TO authenticated
WITH CHECK (
    public.is_owner_or_admin()
);

-- Only owners and admins can modify or revoke verifications
CREATE POLICY "Owners and admins can update verifications"
ON public.eligibility_verifications FOR UPDATE
TO authenticated
USING (
    public.is_owner_or_admin()
)
WITH CHECK (
    public.is_owner_or_admin()
);

-- ----------------------------------------------------------------------------
-- 3. HACKATHON CONVENIENCE FUNCTION: Assign Role
-- Allows elevating a test user to 'owner' or 'admin' during development
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