/**
 * EquipX Backend Services — Unified Public Entry Point
 */

// Supabase Client Config
export { supabase, createAdminClient } from './config/supabaseClient.js';

// Domain Services
export { resourceService } from './services/resourceService.js';
export { profileService } from './services/profileService.js';
export { eligibilityService } from './services/eligibilityService.js';
export { bookingService } from './services/bookingService.js';
export { handoverService } from './services/handoverService.js';
export { conditionService } from './services/conditionService.js';
export { notificationService } from './services/notificationService.js';
export { auditService } from './services/auditService.js';
export { storageService } from './services/storageService.js';
export { aiMatchingService } from './services/aiMatchingService.js';

// Error Models
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} from './utils/errors.js';

// Validation Utilities
export {
  validateUUID,
  validateRequiredFields,
  validateResourceStatus,
} from './utils/validators.js';