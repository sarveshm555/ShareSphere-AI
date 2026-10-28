-- ============================================================================
-- EQUIPX DATABASE SETUP: PART 6 - STORAGE BUCKETS & RLS POLICIES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. BUCKET INITIALIZATION
-- ----------------------------------------------------------------------------

-- Create 'resource-images' bucket (PUBLIC)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'resource-images',
    'resource-images',
    true,
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Create 'condition-photos' bucket (STRICTLY PRIVATE)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'condition-photos',
    'condition-photos',
    false, -- Private bucket
    5242880, -- 5 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY ON storage.objects
-- ----------------------------------------------------------------------------

-- RESOURCE IMAGES: Anyone authenticated or anonymous can view/download
DROP POLICY IF EXISTS "Public can view resource images" ON storage.objects;
CREATE POLICY "Public can view resource images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resource-images');

-- RESOURCE IMAGES: Owners and Admins can upload equipment photos
DROP POLICY IF EXISTS "Owners and admins can upload resource images" ON storage.objects;
CREATE POLICY "Owners and admins can upload resource images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'resource-images' 
    AND public.is_owner_or_admin()
);

-- RESOURCE IMAGES: Owners and Admins can update/delete equipment photos
DROP POLICY IF EXISTS "Owners and admins can manage resource images" ON storage.objects;
CREATE POLICY "Owners and admins can manage resource images"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'resource-images' 
    AND public.is_owner_or_admin()
)
WITH CHECK (
    bucket_id = 'resource-images' 
    AND public.is_owner_or_admin()
);

-- CONDITION PHOTOS: Strictly private. Only authenticated users can access via signed URLs
DROP POLICY IF EXISTS "Authenticated users can view condition photos" ON storage.objects;
CREATE POLICY "Authenticated users can view condition photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'condition-photos'
);

-- CONDITION PHOTOS: Authenticated users (inspectors/borrowers/owners) can upload
DROP POLICY IF EXISTS "Authenticated users can upload condition photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload condition photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'condition-photos'
);