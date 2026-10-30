import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { validateUUID } from '../utils/validators.js';

/**
 * ProofLoop Handover Service
 * Governs physical equipment checkout, return verification, and condition transitions.
 */
export const handoverService = {
  /**
   * Check out equipment to a borrower.
   * Atomically records handover timestamp, initial condition report, and marks booking 'checked_out'.
   */
  async checkoutBooking({ bookingId, conditionGrade = 'good', notes = null, photoPaths = [] }) {
    validateUUID(bookingId, 'booking ID');

    const validGrades = ['excellent', 'good', 'fair', 'damaged', 'unusable'];
    if (!validGrades.includes(conditionGrade)) {
      throw new ValidationError(`Invalid conditionGrade. Allowed: ${validGrades.join(', ')}`);
    }

    const { data, error } = await supabase.rpc('process_checkout_atomic', {
      p_booking_id: bookingId,
      p_condition_grade: conditionGrade,
      p_notes: notes ? String(notes).trim() : null,
      p_photo_paths: Array.isArray(photoPaths) ? photoPaths : [],
    });

    if (error) {
      throw new AppError(`Checkout failed: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Process equipment return from a borrower.
   * Atomically records return timestamp, final condition report, updates booking to 'returned',
   * and automatically logs an incident if damage is detected.
   */
  async returnBooking({
    bookingId,
    conditionGrade = 'good',
    notes = null,
    photoPaths = [],
    reportIncident = false,
    incidentDescription = null,
  }) {
    validateUUID(bookingId, 'booking ID');

    const validGrades = ['excellent', 'good', 'fair', 'damaged', 'unusable'];
    if (!validGrades.includes(conditionGrade)) {
      throw new ValidationError(`Invalid conditionGrade. Allowed: ${validGrades.join(', ')}`);
    }

    const { data, error } = await supabase.rpc('process_return_atomic', {
      p_booking_id: bookingId,
      p_condition_grade: conditionGrade,
      p_notes: notes ? String(notes).trim() : null,
      p_photo_paths: Array.isArray(photoPaths) ? photoPaths : [],
      p_report_incident: Boolean(reportIncident),
      p_incident_desc: incidentDescription ? String(incidentDescription).trim() : null,
    });

    if (error) {
      throw new AppError(`Return processing failed: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Retrieve active or past handover records for a specific booking.
   */
  async getHandoverRecord(bookingId) {
    validateUUID(bookingId, 'booking ID');

    const { data, error } = await supabase
      .from('handover_records')
      .select('*, profiles:borrower_id(full_name, institution), resources(name, location)')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to fetch handover record: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError(`No handover record found for booking ID ${bookingId}.`);
    }

    return data;
  },
};