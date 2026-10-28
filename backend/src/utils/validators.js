import { ValidationError } from './errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a standard RFC 4122 UUID.
 */
export function validateUUID(id, fieldName = 'ID') {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid UUID.`);
  }
  return true;
}

/**
 * Validates that required string fields exist and are not empty.
 */
export function validateRequiredFields(data, requiredFields = []) {
  const missing = [];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
  return true;
}

/**
 * Validates resource status values.
 */
export function validateResourceStatus(status) {
  const allowed = ['available', 'maintenance', 'decommissioned'];
  if (!allowed.includes(status)) {
    throw new ValidationError(`Invalid status: "${status}". Allowed values: ${allowed.join(', ')}`);
  }
  return true;
}