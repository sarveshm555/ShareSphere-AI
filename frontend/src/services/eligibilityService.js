import { supabase } from '../config/supabaseClient.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { validateUUID, validateRequiredFields } from '../utils/validators.js';

/**
 * TrustPass Eligibility Verification Service
 * Evaluates whether students meet equipment training, certification, and membership criteria.
 */
export const eligibilityService = {
  /**
   * Retrieve active, non-expired verifications for a specific user.
   */
  async getUserVerifications(userId) {
    validateUUID(userId, 'user ID');

    const { data, error } = await supabase
      .from('eligibility_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'verified');

    if (error) {
      throw new AppError(`Failed to query verifications: ${error.message}`, 400, error);
    }

    const now = new Date();
    // Filter out records that have passed their expiration date
    return (data || []).filter((item) => {
      if (!item.expires_at) return true;
      return new Date(item.expires_at) > now;
    });
  },

  /**
   * Issue or grant a verification to a student.
   * Restricted by RLS to users with 'owner' or 'admin' roles.
   */
  async grantVerification({ userId, requirementType, title, expiresAt = null, notes = null }) {
    validateUUID(userId, 'user ID');
    validateRequiredFields({ requirementType, title }, ['requirementType', 'title']);

    const validTypes = ['training', 'certification', 'department_approval', 'membership'];
    if (!validTypes.includes(requirementType)) {
      throw new ValidationError(`Invalid requirementType. Allowed: ${validTypes.join(', ')}`);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      user_id: userId,
      requirement_type: requirementType,
      title: title.trim(),
      status: 'verified',
      issued_by: user?.id || null,
      expires_at: expiresAt,
      notes: notes ? notes.trim() : null,
    };

    const { data, error } = await supabase
      .from('eligibility_verifications')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new AppError(`Failed to grant verification: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Check whether a user is eligible to borrow a specific resource.
   * Compares all resource_requirements against the user's active, non-expired credentials.
   *
   * @param {string} userId - UUID of the student
   * @param {string} resourceId - UUID of the equipment
   * @returns {Promise<{ eligible: boolean, reason: string, missing: Array, passed: Array }>}
   */
  async checkResourceEligibility(userId, resourceId) {
    validateUUID(userId, 'user ID');
    validateUUID(resourceId, 'resource ID');

    // 1. Fetch mandatory requirements for the resource
    const { data: requirements, error: reqError } = await supabase
      .from('resource_requirements')
      .select('*')
      .eq('resource_id', resourceId);

    if (reqError) {
      throw new AppError(`Failed to fetch resource requirements: ${reqError.message}`, 400, reqError);
    }

    // If resource has no special requirements, student is eligible immediately
    if (!requirements || requirements.length === 0) {
      return {
        eligible: true,
        reason: 'This equipment has no restricted requirements.',
        missing: [],
        passed: [],
      };
    }

    // 2. Fetch the user's active verifications
    const activeVerifications = await this.getUserVerifications(userId);

    const missing = [];
    const passed = [];

    // 3. Match each requirement against active user verifications
    for (const req of requirements) {
      const match = activeVerifications.find(
        (v) =>
          v.requirement_type === req.requirement_type &&
          (v.title.toLowerCase().includes(req.description.toLowerCase()) ||
           req.description.toLowerCase().includes(v.title.toLowerCase()) ||
           v.requirement_type === 'department_approval')
      );

      if (match) {
        passed.push({ requirement: req, verification: match });
      } else {
        missing.push(req);
      }
    }

    const isEligible = missing.length === 0;

    return {
      eligible: isEligible,
      reason: isEligible
        ? 'User meets all safety, training, and authorization prerequisites.'
        : `User is missing ${missing.length} prerequisite(s) required to reserve this equipment.`,
      missing,
      passed,
    };
  },
};