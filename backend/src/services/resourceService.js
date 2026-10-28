import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { validateUUID, validateRequiredFields, validateResourceStatus } from '../utils/validators.js';

/**
 * Resource Management Service
 * Handles listing, discovery, search, and owner modifications for EquipX.
 */
export const resourceService = {
  /**
   * Create a new resource listing.
   * Requires authenticated user with 'owner' or 'admin' role.
   */
  async createResource(resourceData) {
    validateRequiredFields(resourceData, ['name', 'category', 'location']);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new AppError('You must be authenticated to create a resource listing.', 401);
    }

    const payload = {
      owner_id: user.id,
      name: resourceData.name.trim(),
      description: resourceData.description?.trim() || null,
      category: resourceData.category.trim(),
      location: resourceData.location.trim(),
      status: resourceData.status || 'available',
      usage_rules: resourceData.usage_rules?.trim() || null,
      image_url: resourceData.image_url?.trim() || null,
    };

    if (payload.status) {
      validateResourceStatus(payload.status);
    }

    const { data, error } = await supabase
      .from('resources')
      .insert([payload])
      .select('*, profiles:owner_id(id, full_name, institution)')
      .single();

    if (error) {
      throw new AppError(`Failed to create resource: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Retrieve active resources with optional filtering, keyword search, and pagination.
   */
  async getResources(options = {}) {
    const {
      category,
      location,
      status = 'available',
      search,
      ownerId,
      page = 1,
      limit = 20,
    } = options;

    let query = supabase
      .from('resources')
      .select('*, profiles:owner_id(id, full_name, institution), resource_requirements(*)', { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (location) {
      query = query.ilike('location', `%${location}%`);
    }

    if (ownerId) {
      validateUUID(ownerId, 'ownerId');
      query = query.eq('owner_id', ownerId);
    }

    if (search && search.trim() !== '') {
      const term = search.trim();
      // Case-insensitive full-text style search across name and description
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }

    // Pagination calculations
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new AppError(`Failed to retrieve resources: ${error.message}`, 400, error);
    }

    return {
      resources: data || [],
      pagination: {
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
        limit,
      },
    };
  },

  /**
   * Retrieve a single resource by its UUID, including owner info and prerequisites.
   */
  async getResourceById(id) {
    validateUUID(id, 'resource ID');

    const { data, error } = await supabase
      .from('resources')
      .select('*, profiles:owner_id(id, full_name, institution), resource_requirements(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new AppError(`Error fetching resource: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(`Resource with ID ${id} not found.`);
    }

    return data;
  },

  /**
   * Update an existing listing.
   * RLS restricts this to the owner or an admin.
   */
  async updateResource(id, updateData) {
    validateUUID(id, 'resource ID');

    if (updateData.status) {
      validateResourceStatus(updateData.status);
    }

    // Strip protected fields that must not be altered directly
    const { id: _id, owner_id: _owner, created_at: _ca, ...safeUpdates } = updateData;
    safeUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('resources')
      .update(safeUpdates)
      .eq('id', id)
      .select('*, profiles:owner_id(id, full_name, institution)')
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to update resource: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(`Resource not found or you lack permission to update it.`);
    }

    return data;
  },

  /**
   * Decommission a listing (sets status to 'decommissioned').
   */
  async decommissionResource(id) {
    return this.updateResource(id, { status: 'decommissioned' });
  },

  /**
   * Attach an eligibility requirement to an existing resource.
   */
  async addRequirement(resourceId, requirementData) {
    validateUUID(resourceId, 'resource ID');
    validateRequiredFields(requirementData, ['requirement_type', 'description']);

    const allowedTypes = ['training', 'certification', 'department_approval', 'membership'];
    if (!allowedTypes.includes(requirementData.requirement_type)) {
      throw new ValidationError(
        `Invalid requirement type: "${requirementData.requirement_type}". Allowed: ${allowedTypes.join(', ')}`
      );
    }

    const { data, error } = await supabase
      .from('resource_requirements')
      .insert([
        {
          resource_id: resourceId,
          requirement_type: requirementData.requirement_type,
          description: requirementData.description.trim(),
        },
      ])
      .select('*')
      .single();

    if (error) {
      throw new AppError(`Failed to attach requirement: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Retrieve all prerequisites for a given resource.
   */
  async getRequirements(resourceId) {
    validateUUID(resourceId, 'resource ID');

    const { data, error } = await supabase
      .from('resource_requirements')
      .select('*')
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new AppError(`Failed to retrieve requirements: ${error.message}`, 400, error);
    }

    return data || [];
  },
};