import { supabase } from '../config/supabaseClient.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { validateUUID } from '../utils/validators.js';

/**
 * In-App Notification Service
 * Manages user alerts, unread counters, and notification status updates.
 */
export const notificationService = {
  /**
   * Retrieve notifications for the currently authenticated user.
   */
  async getMyNotifications({ unreadOnly = false, limit = 20 } = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new AppError('You must be logged in to fetch notifications.', 401);
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      throw new AppError(`Failed to fetch notifications: ${error.message}`, 400, error);
    }

    return data || [];
  },

  /**
   * Retrieve total count of unread notifications.
   */
  async getUnreadCount() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      throw new AppError(`Failed to count unread notifications: ${error.message}`, 400, error);
    }

    return count || 0;
  },

  /**
   * Mark a specific notification as read.
   */
  async markAsRead(notificationId) {
    validateUUID(notificationId, 'notification ID');

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to mark notification as read: ${error.message}`, 400, error);
    }

    if (!data) {
      throw new NotFoundError('Notification not found or access denied.');
    }

    return data;
  },

  /**
   * Mark all notifications for the authenticated user as read.
   */
  async markAllAsRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      throw new AppError(`Failed to mark all as read: ${error.message}`, 400, error);
    }

    return { success: true };
  },

  /**
   * Delete or dismiss a notification.
   */
  async deleteNotification(notificationId) {
    validateUUID(notificationId, 'notification ID');

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      throw new AppError(`Failed to delete notification: ${error.message}`, 400, error);
    }

    return { success: true };
  },
};