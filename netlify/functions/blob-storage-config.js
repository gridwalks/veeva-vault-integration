/**
 * Shared configuration for blob storage
 * Consolidates duplicate store name constants
 */

/**
 * Blob storage store names
 */
export const STORE_NAMES = {
  UPLOADS: 'chat-uploads',
  DOCUMENTS: 'documents'
};

/**
 * Default store name for backward compatibility
 */
export const DEFAULT_STORE_NAME = STORE_NAMES.UPLOADS;

