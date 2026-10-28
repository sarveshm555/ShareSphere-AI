import { supabase } from '../config/supabaseClient.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { validateUUID } from '../utils/validators.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Storage Service Module
 * Manages public listing images and private ProofLoop condition snapshots.
 */
export const storageService = {
  /**
   * Validate file buffer or Blob metadata before initiating network transfer.
   */
  validateFile(file) {
    if (!file) {
      throw new ValidationError('No file provided for upload.');
    }

    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new ValidationError(
        `Invalid file type "${file.type}". Allowed types: JPG, PNG, WEBP.`
      );
    }

    if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds the 5 MB limit.`
      );
    }
  },

  /**
   * Upload an equipment listing photo to the public 'resource-images' bucket.
   *
   * @param {Blob|Buffer|File} file - Raw image data
   * @param {string} fileName - File name with extension (e.g., 'oscilloscope.jpg')
   * @param {string} [resourceId] - Optional equipment UUID for path scoping
   * @returns {Promise<{ publicUrl: string, path: string }>}
   */
  async uploadResourceImage(file, fileName, resourceId = null) {
    this.validateFile(file);

    const ext = fileName.split('.').pop();
    const cleanId = resourceId || 'general';
    const filePath = `${cleanId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('resource-images')
      .upload(filePath, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new AppError(`Resource image upload failed: ${uploadError.message}`, 400, uploadError);
    }

    const { data: publicUrlData } = supabase.storage
      .from('resource-images')
      .getPublicUrl(filePath);

    return {
      path: filePath,
      publicUrl: publicUrlData.publicUrl,
    };
  },

  /**
   * Upload an inspection or incident evidence photo to the private 'condition-photos' bucket.
   *
   * @param {Blob|Buffer|File} file - Raw image data
   * @param {string} fileName - File name with extension
   * @param {string} bookingId - UUID of the associated booking
   * @param {'checkout'|'return'|'incident'} [stage='checkout'] - Lifecycle stage
   * @returns {Promise<{ path: string }>}
   */
  async uploadConditionPhoto(file, fileName, bookingId, stage = 'checkout') {
    validateUUID(bookingId, 'booking ID');
    this.validateFile(file);

    const ext = fileName.split('.').pop();
    const filePath = `${bookingId}/${stage}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('condition-photos')
      .upload(filePath, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw new AppError(`Condition photo upload failed: ${uploadError.message}`, 400, uploadError);
    }

    return {
      path: filePath,
    };
  },

  /**
   * Generate a secure, time-limited Signed URL to view a private condition photo.
   *
   * @param {string} path - Storage path stored in condition_reports.photo_paths
   * @param {number} [expiresIn=3600] - Lifespan in seconds (default: 1 hour)
   * @returns {Promise<string>} Temporary accessible signed URL
   */
  async getConditionPhotoSignedUrl(path, expiresIn = 3600) {
    if (!path) {
      throw new ValidationError('File storage path is required to generate a signed URL.');
    }

    const { data, error } = await supabase.storage
      .from('condition-photos')
      .createSignedUrl(path, expiresIn);

    if (error) {
      throw new AppError(`Failed to generate signed URL: ${error.message}`, 400, error);
    }

    return data.signedUrl;
  },

  /**
   * Batch resolve multiple private condition photo paths into signed URLs.
   */
  async getConditionPhotosSignedUrls(paths = [], expiresIn = 3600) {
    if (!Array.isArray(paths) || paths.length === 0) return [];

    const promises = paths.map(async (path) => {
      try {
        const signedUrl = await this.getConditionPhotoSignedUrl(path, expiresIn);
        return { path, signedUrl, error: null };
      } catch (err) {
        return { path, signedUrl: null, error: err.message };
      }
    });

    return Promise.all(promises);
  },
};