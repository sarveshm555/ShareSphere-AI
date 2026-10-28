-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 1 - CORE PROFILES & RESOURCES
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. TABLE: profiles
-- Linked 1:1 with Supabase auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT 'EquipX University',
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'owner', 'admin')),
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. TABLE: resources
-- Equipment items available for borrowing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'decommissioned')),
    usage_rules TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for search & filtering
CREATE INDEX IF NOT EXISTS idx_resources_category ON public.resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_status ON public.resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_owner ON public.resources(owner_id);

-- Enable RLS
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. TABLE: resource_requirements
-- Specific prerequisites a borrower must satisfy
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
    requirement_type TEXT NOT NULL CHECK (requirement_type IN ('training', 'certification', 'department_approval', 'membership')),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_resource ON public.resource_requirements(resource_id);

-- Enable RLS
ALTER TABLE public.resource_requirements ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4. SECURITY HELPERS & USER ONBOARDING TRIGGER
-- ----------------------------------------------------------------------------

-- Function to check if calling user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

-- Function to check if calling user is resource owner or admin
CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('owner', 'admin')
    );
$$;

-- Trigger: Automatically create profile on Supabase auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, institution, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Member'),
        COALESCE(NEW.raw_user_meta_data->>'institution', 'EquipX University'),
        -- Default to 'student'. Prevents frontend role-spoofing during registration
        'student'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Prevent non-admins from changing their own role in profiles
CREATE OR REPLACE FUNCTION public.protect_profile_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.role = OLD.role THEN
        NEW.updated_at = NOW();
        RETURN NEW;
    END IF;

    IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
        NEW.updated_at = NOW();
        RETURN NEW;
    END IF;

    IF public.is_admin() THEN
        NEW.updated_at = NOW();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Unauthorized: You cannot alter your assigned role.';
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_profile_roles ON public.profiles;
CREATE TRIGGER tr_protect_profile_roles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- PROFILES POLICIES
-- Anyone authenticated can view user profiles (needed to see resource owner info)
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Users can update only their own profile details (role changes are blocked by trigger)
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- RESOURCES POLICIES
-- All authenticated users can read all active resources
CREATE POLICY "Resources are readable by all authenticated users"
ON public.resources FOR SELECT
TO authenticated
USING (true);

-- Only users with role 'owner' or 'admin' can create listings
CREATE POLICY "Owners and admins can create resources"
ON public.resources FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = owner_id AND public.is_owner_or_admin()
);

-- Owners can edit their own listings; Admins can edit any listing
CREATE POLICY "Owners and admins can update resources"
ON public.resources FOR UPDATE
TO authenticated
USING (
    owner_id = auth.uid() OR public.is_admin()
)
WITH CHECK (
    owner_id = auth.uid() OR public.is_admin()
);

-- Owners can delete their own listings; Admins can delete any listing
CREATE POLICY "Owners and admins can delete resources"
ON public.resources FOR DELETE
TO authenticated
USING (
    owner_id = auth.uid() OR public.is_admin()
);

-- RESOURCE REQUIREMENTS POLICIES
-- Requirements are readable by anyone who can view resources
CREATE POLICY "Requirements are viewable by authenticated users"
ON public.resource_requirements FOR SELECT
TO authenticated
USING (true);

-- Only resource owner or admin can insert/modify requirements
CREATE POLICY "Owners can manage resource requirements"
ON public.resource_requirements FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.resources
        WHERE id = resource_requirements.resource_id
          AND (owner_id = auth.uid() OR public.is_admin())
    )
);