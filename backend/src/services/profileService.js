import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { validateUUID } from '../utils/validators.js';

/**
 * Profile & Role Management Service
 * Manages user metadata while preserving role security.
 */
export const profileService = {
  /**
   * Retrieve the profile of the currently authenticated user.
   */
  async getCurrentProfile() {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new AppError('No authenticated user session found.', 401);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to fetch profile: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError('User profile not found.');
    }

    return data;
  },

  /**
   * Retrieve any public user profile by UUID.
   */
  async getProfileById(userId) {
    validateUUID(userId, 'user ID');

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, institution, role, membership_status, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to retrieve profile: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(`Profile for user ${userId} not found.`);
    }

    return data;
  },

  /**
   * Update current user profile fields (e.g. full_name, institution).
   * Note: The database trigger 'tr_protect_profile_roles' blocks any attempt to edit 'role'.
   */
  async updateProfile(updates) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new AppError('You must be authenticated to update your profile.', 401);
    }

    // Explicitly whitelist client-editable fields
    const safePayload = {};
    if (updates.full_name !== undefined) safePayload.full_name = String(updates.full_name).trim();
    if (updates.institution !== undefined) safePayload.institution = String(updates.institution).trim();

    if (Object.keys(safePayload).length === 0) {
      throw new AppError('No valid profile fields provided for update.', 400);
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(safePayload)
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      throw new AppError(`Failed to update profile: ${error.message}`, 400, error);
    }

    return data;
  },
};