import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { validateUUID, validateRequiredFields } from '../utils/validators.js';

/**
 * Condition & Incident Management Service
 * Handles equipment inspection reports, damage tickets, and incident resolution.
 */
export const conditionService = {
  /**
   * Retrieve all condition inspection reports for a booking (checkout and return snapshots).
   */
  async getConditionReports(bookingId) {
    validateUUID(bookingId, 'booking ID');

    const { data, error } = await supabase
      .from('condition_reports')
      .select('*, profiles:inspector_id(full_name, role)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new AppError(`Failed to fetch condition reports: ${error.message}`, 400, error);
    }

    return data || [];
  },

  /**
   * File an incident report regarding an equipment item or booking.
   */
  async reportIncident({ resourceId, bookingId = null, incidentType, severity = 'medium', description }) {
    validateUUID(resourceId, 'resource ID');
    if (bookingId) validateUUID(bookingId, 'booking ID');
    validateRequiredFields({ incidentType, description }, ['incidentType', 'description']);

    const validTypes = ['damage', 'missing_item', 'late_return', 'misuse', 'other'];
    if (!validTypes.includes(incidentType)) {
      throw new ValidationError(`Invalid incidentType. Allowed: ${validTypes.join(', ')}`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new AppError('You must be logged in to report an incident.', 401);
    }

    const payload = {
      resource_id: resourceId,
      booking_id: bookingId,
      reporter_id: user.id,
      incident_type: incidentType,
      severity,
      description: description.trim(),
      status: 'reported',
    };

    const { data, error } = await supabase
      .from('incidents')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      throw new AppError(`Failed to report incident: ${error.message}`, 400, error);
    }

    return data;
  },

  /**
   * Retrieve incidents with optional status or resource filters.
   */
  async getIncidents(filters = {}) {
    let query = supabase
      .from('incidents')
      .select('*, profiles:reporter_id(full_name), resources(name, location)')
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.resourceId) {
      validateUUID(filters.resourceId, 'resource ID');
      query = query.eq('resource_id', filters.resourceId);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(`Failed to retrieve incidents: ${error.message}`, 400, error);
    }

    return data || [];
  },

  /**
   * Resolve an open incident with resolution notes (restricted to owner or admin).
   */
  async resolveIncident(incidentId, { status = 'resolved', resolutionNotes }) {
    validateUUID(incidentId, 'incident ID');
    validateRequiredFields({ resolutionNotes }, ['resolutionNotes']);

    const validStatuses = ['under_review', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid resolution status. Allowed: ${validStatuses.join(', ')}`);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('incidents')
      .update({
        status,
        resolution_notes: resolutionNotes.trim(),
        resolved_by: user?.id || null,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to resolve incident: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError('Incident not found or you lack permission to resolve it.');
    }

    return data;
  },
};