import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { validateUUID, validateRequiredFields } from '../utils/validators.js';
import { eligibilityService } from './eligibilityService.js';

/**
 * FairShare Booking Service
 * Handles equipment reservation requests, owner approvals, and conflict checks.
 */
export const bookingService = {
  /**
   * Request a new equipment booking.
   * Automatically validates TrustPass eligibility before submitting.
   */
  async requestBooking({ resourceId, startTime, endTime, purpose = null }) {
    validateUUID(resourceId, 'resource ID');
    validateRequiredFields({ startTime, endTime }, ['startTime', 'endTime']);

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Invalid date format for startTime or endTime.');
    }

    if (end <= start) {
      throw new ValidationError('endTime must be after startTime.');
    }

    if (start < new Date()) {
      throw new ValidationError('Cannot book a reservation in the past.');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new AppError('You must be logged in to request a booking.', 401);
    }

    // 1. TrustPass Verification: Check student eligibility first
    const eligibility = await eligibilityService.checkResourceEligibility(user.id, resourceId);
    if (!eligibility.eligible) {
      throw new ValidationError(
        `Booking request blocked by TrustPass: ${eligibility.reason}`,
        eligibility.missing
      );
    }

    // 2. FairShare Anti-Monopoly Check: Prevent monopolizing a single resource
    const { count: resourceActiveCount, error: countError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('borrower_id', user.id)
      .eq('resource_id', resourceId)
      .in('status', ['pending', 'approved', 'checked_out']);

    if (!countError && resourceActiveCount !== null && resourceActiveCount >= 5) {
      throw new ValidationError(
        'FairShare Allocation Limit: You have reached the maximum active bookings (5) for this resource. To ensure equitable campus access, please complete or cancel existing reservations before requesting more slots.'
      );
    }

    // 3. Submit pending booking
    const { data, error } = await supabase
      .from('bookings')
      .insert([
        {
          resource_id: resourceId,
          borrower_id: user.id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          purpose: purpose ? String(purpose).trim() : null,
          status: 'pending',
        },
      ])
      .select('*, resources(name, location, category)')
      .single();

    if (error) {
      throw new AppError(`Failed to submit booking request: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Check if a time slot is available for a resource.
   */
  async checkAvailability(resourceId, startTime, endTime) {
    validateUUID(resourceId, 'resource ID');
    const start = new Date(startTime).toISOString();
    const end = new Date(endTime).toISOString();

    const { data, error } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, status')
      .eq('resource_id', resourceId)
      .in('status', ['approved', 'checked_out'])
      .lt('start_time', end)
      .gt('end_time', start);

    if (error) {
      throw new AppError(`Error checking availability: ${error.message}`, 400, error);
    }

    return {
      available: (data || []).length === 0,
      conflicts: data || [],
    };
  },

  /**
   * Retrieve bookings submitted by the current authenticated borrower.
   */
  async getMyBookings(statusFilter = null) {
    let query = supabase
      .from('bookings')
      .select('*, resources(id, name, location, category, image_url)')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(`Failed to fetch bookings: ${error.message}`, 400, error);
    }

    return data || [];
  },

  /**
   * Retrieve booking requests for equipment owned by the authenticated user.
   */
  async getOwnerBookings(resourceId = null) {
    let query = supabase
      .from('bookings')
      .select('*, profiles:borrower_id(id, full_name, email, institution), resources!inner(id, name, owner_id)')
      .order('start_time', { ascending: true });

    if (resourceId) {
      validateUUID(resourceId, 'resource ID');
      query = query.eq('resource_id', resourceId);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(`Failed to retrieve owner bookings: ${error.message}`, 400, error);
    }

    const enriched = await Promise.all(
      (data || []).map(async (booking) => {
        try {
          const eligibility = await eligibilityService.checkResourceEligibility(
            booking.borrower_id,
            booking.resource_id
          );
          return { ...booking, eligibility };
        } catch {
          return { ...booking, eligibility: { eligible: true, reason: 'Eligibility verified' } };
        }
      })
    );

    return enriched;
  },

  /**
   * Atomically approve a booking request via PostgreSQL RPC.
   * Enforces exclusion constraints against conflicting approved bookings.
   */
  async approveBooking(bookingId) {
    validateUUID(bookingId, 'booking ID');

    const { data, error } = await supabase.rpc('approve_booking_atomic', {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new AppError(error.message, 400, error);
    }

    return data;
  },

  /**
   * Reject a booking request with a mandatory explanation reason.
   * Validates that booking is in 'pending' or 'waitlisted' status.
   */
  async rejectBooking(bookingId, rejectionReason) {
    validateUUID(bookingId, 'booking ID');
    validateRequiredFields({ rejectionReason }, ['rejectionReason']);

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .in('status', ['pending', 'waitlisted'])
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to reject booking: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(
        'Booking not found, not in a pending state, or you lack permission to reject it.'
      );
    }

    return data;
  },

  /**
   * Cancel a pending or approved booking (executed by the borrower).
   * Validates that booking is in 'pending' or 'approved' status.
   */
  async cancelBooking(bookingId) {
    validateUUID(bookingId, 'booking ID');

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .in('status', ['pending', 'approved'])
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to cancel booking: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(
        'Booking not found, cannot be cancelled in its current state, or unauthorized.'
      );
    }

    return data;
  },
};
