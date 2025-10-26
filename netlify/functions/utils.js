/**
 * Shared utility functions for netlify functions
 * Consolidates duplicate code to improve maintainability
 */

/**
 * Generate a safe filename for storage
 * Replaces invalid characters with hyphens and limits length
 * @param {string} fileName - Original filename
 * @returns {string} Safe filename
 */
export function generateSafeFileName(fileName) {
  if (!fileName) {
    return '';
  }

  const trimmed = fileName.trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const lastDotIndex = lower.lastIndexOf('.');
  let base = lower;
  let extension = '';

  if (lastDotIndex > 0 && lastDotIndex < lower.length - 1) {
    base = lower.substring(0, lastDotIndex);
    extension = lower.substring(lastDotIndex + 1);
  }

  const safeBase = base
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .substring(0, 96) || 'document';

  const safeExtension = extension.replace(/[^a-z0-9]+/g, '').substring(0, 16);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}

