import { supabase } from '../config/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { validateUUID } from '../utils/validators.js';

/**
 * Audit History Service
 * Provides queries against the immutable PostgreSQL event ledger.
 */
export const auditService = {
  /**
   * Retrieve audit logs with filtering and pagination.
   */
  async getAuditLogs(options = {}) {
    const {
      entityType,
      entityId,
      actorId,
      action,
      page = 1,
      limit = 25,
    } = options;

    let query = supabase
      .from('audit_logs')
      .select('*, profiles:actor_id(full_name, role, institution)', { count: 'exact' });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    if (entityId) {
      validateUUID(entityId, 'entityId');
      query = query.eq('entity_id', entityId);
    }

    if (actorId) {
      validateUUID(actorId, 'actorId');
      query = query.eq('actor_id', actorId);
    }

    if (action) {
      query = query.eq('action', action);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new AppError(`Failed to fetch audit records: ${error.message}`, 400, error);
    }

    return {
      logs: data || [],
      pagination: {
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
        limit,
      },
    };
  },

  /**
   * Manually record a custom security or administrative audit event.
   */
  async recordAuditEvent({ action, entityType, entityId = null, metadata = {} }) {
    if (!action || !entityType) {
      throw new AppError('Action and entityType are required for audit logging.', 400);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        {
          actor_id: user?.id || null,
          action: action.toUpperCase(),
          entity_type: entityType,
          entity_id: entityId,
          metadata,
        },
      ])
      .select('*')
      .single();

    if (error) {
      throw new AppError(`Failed to insert audit record: ${error.message}`, 400, error);
    }

    return data;
  },
};